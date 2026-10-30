import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, schema } from '../db';
import {
  buildDashboardPayload,
  DEFAULT_TIMEZONE,
  getSevenDayWindow,
  resolveValidTimezone,
  type DashboardDataPayload,
} from './timezone';
import { shiftDateKeyByDays } from '../habits/habit-utils';

export interface AuthenticatedUserIdentity {
  id: string;
  name?: string | null;
  email: string;
  emailVerified: boolean;
  image?: string | null;
}

export type AuthSessionUser = AuthenticatedUserIdentity;

export type DashboardQueryStatus =
  | 'ok'
  | 'db_unconfigured'
  | 'schema_not_migrated'
  | 'db_error';

export interface DashboardQueryResult {
  status: DashboardQueryStatus;
  message?: string;
  data: DashboardDataPayload;
}

/**
 * Idempotently initializes `user_profiles` and `user_preferences` for an
 * authenticated user on their first dashboard visit without overwriting
 * existing custom profile fields or preferences.
 */
export async function ensureUserProfile(
  authUser: AuthenticatedUserIdentity
): Promise<{
  profile: typeof schema.userProfiles.$inferSelect;
  preferences: typeof schema.userPreferences.$inferSelect;
}> {
  const db = getDb();
  const initialDisplayName =
    authUser.name?.trim() || authUser.email.split('@')[0]?.trim() || 'Friend';

  await db
    .insert(schema.userProfiles)
    .values({
      userId: authUser.id,
      displayName: initialDisplayName,
      timezone: DEFAULT_TIMEZONE,
    })
    .onConflictDoNothing({ target: schema.userProfiles.userId });

  await db
    .insert(schema.userPreferences)
    .values({
      userId: authUser.id,
      theme: 'light',
      weekStartsOn: 1,
    })
    .onConflictDoNothing({ target: schema.userPreferences.userId });

  const [profileRows, preferenceRows] = await Promise.all([
    db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, authUser.id))
      .limit(1),
    db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, authUser.id))
      .limit(1),
  ]);

  let profile = profileRows[0];
  const preferences = preferenceRows[0];

  // If existing profile has an empty display_name and authUser now has a name, populate it
  if (profile && !profile.displayName && authUser.name?.trim()) {
    const updated = await db
      .update(schema.userProfiles)
      .set({
        displayName: authUser.name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(schema.userProfiles.userId, authUser.id))
      .returning();
    if (updated[0]) {
      profile = updated[0];
    }
  }

  const now = new Date();
  return {
    profile: profile ?? {
      userId: authUser.id,
      displayName: initialDisplayName,
      timezone: DEFAULT_TIMEZONE,
      createdAt: now,
      updatedAt: now,
    },
    preferences: preferences ?? {
      userId: authUser.id,
      theme: 'light',
      weekStartsOn: 1,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Fetches all Phase 3 dashboard data scoped strictly to `authUser.id`.
 * Never fabricates sample data on empty state or database error.
 */
export async function fetchDashboardDataForUser(
  authUser: AuthenticatedUserIdentity
): Promise<DashboardQueryResult> {
  const now = new Date();

  const emptyPayload = buildDashboardPayload({
    authUser,
    profile: null,
    preferences: null,
    userTasks: [],
    userHabits: [],
    userHabitLogs: [],
    userGoals: [],
    userNotes: [],
    now,
  });

  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message:
        'Workspace storage is not configured yet. Please contact support or check server settings.',
      data: emptyPayload,
    };
  }

  try {
    const db = getDb();
    const { profile, preferences } = await ensureUserProfile(authUser);

    const timezone = resolveValidTimezone(profile.timezone);
    const sevenDaySlots = getSevenDayWindow(now, timezone);
    const todaySlotDateKey =
      sevenDaySlots[sevenDaySlots.length - 1]?.dateKey ?? '1970-01-01';
    const oldestSlotDateKey = shiftDateKeyByDays(todaySlotDateKey, -14);

    const [userTasks, userHabits, userHabitLogs, userGoals, userNotes, authUserRowRes] =
      await Promise.all([
        db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.userId, authUser.id))
          .orderBy(desc(schema.tasks.updatedAt))
          .limit(500),
        db
          .select()
          .from(schema.habits)
          .where(eq(schema.habits.userId, authUser.id))
          .limit(200),
        db
          .select()
          .from(schema.habitLogs)
          .where(
            and(
              eq(schema.habitLogs.userId, authUser.id),
              gte(schema.habitLogs.completedOn, oldestSlotDateKey)
            )
          ),
        db
          .select()
          .from(schema.goals)
          .where(eq(schema.goals.userId, authUser.id))
          .orderBy(desc(schema.goals.updatedAt))
          .limit(200),
        db
          .select()
          .from(schema.notes)
          .where(
            and(
              eq(schema.notes.userId, authUser.id),
              isNull(schema.notes.archivedAt),
              isNull(schema.notes.trashedAt)
            )
          )
          .orderBy(desc(schema.notes.isPinned), desc(schema.notes.updatedAt))
          .limit(6),
        db
          .execute<{ name: string | null; image: string | null }>(sql`
            SELECT name, image
            FROM neon_auth."user"
            WHERE id::text = ${authUser.id}
            LIMIT 1
          `)
          .catch(() => null),
      ]);

    const latestAuthRow = authUserRowRes?.rows?.[0];
    const effectiveAuthUser = latestAuthRow
      ? {
          ...authUser,
          name: latestAuthRow.name ?? authUser.name,
          image: latestAuthRow.image ?? null,
        }
      : authUser;

    const payload = buildDashboardPayload({
      authUser: effectiveAuthUser,
      profile,
      preferences,
      userTasks,
      userHabits,
      userHabitLogs,
      userGoals,
      userNotes,
      now,
    });

    return {
      status: 'ok',
      data: payload,
    };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const isMissingTable =
      rawMessage.includes('42P01') ||
      (rawMessage.includes('relation') &&
        rawMessage.includes('does not exist'));

    if (isMissingTable) {
      return {
        status: 'schema_not_migrated',
        message:
          'The workspace is currently undergoing maintenance. Please try again shortly.',
        data: emptyPayload,
      };
    }

    return {
      status: 'db_error',
      message:
        'Unable to reach the workspace service right now. Please check your connection and try again.',
      data: emptyPayload,
    };
  }
}
