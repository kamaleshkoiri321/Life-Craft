import { and, asc, eq, gte } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, schema } from '../db';
import {
  ensureUserProfile,
  type AuthenticatedUserIdentity,
} from './dashboard';
import { isValidUuid } from './tasks';
import {
  DEFAULT_TIMEZONE,
  getLocalDateString,
  resolveValidTimezone,
  shiftLocalDateString,
} from './timezone';
import {
  buildHabitsViewModel,
  validateHabitCheckInInput,
  validateHabitCreateInput,
  validateHabitUpdateInput,
  type HabitsSummaryMetrics,
  type SerializedHabitItem,
  type WeeklyHabitChartBar,
} from '../habits/habit-utils';

export interface HabitsViewData {
  todayLocalDate: string;
  timezone: string;
  selectedDate: string;
  selectedDateLabel: string;
  weekStartDate: string;
  weekEndDate: string;
  weekRangeLabel: string;
  isCurrentWeek: boolean;
  summary: HabitsSummaryMetrics;
  habits: SerializedHabitItem[];
  weeklyChart: WeeklyHabitChartBar[];
}

export type HabitsQueryResult =
  | { status: 'ok'; data: HabitsViewData }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string };

export async function getHabitsForUser(
  authUser: AuthenticatedUserIdentity,
  options?: {
    selectedDate?: string;
    weekAnchorDate?: string;
  }
): Promise<HabitsQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Habit storage is not configured yet. Please check server settings.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE);
    const todayLocalDate = getLocalDateString(new Date(), timezone);
    const lookbackDate = shiftLocalDateString(todayLocalDate, -370);

    const [userHabits, userHabitLogs] = await Promise.all([
      db
        .select()
        .from(schema.habits)
        .where(eq(schema.habits.userId, authUser.id))
        .orderBy(asc(schema.habits.createdAt)),
      db
        .select()
        .from(schema.habitLogs)
        .where(
          and(
            eq(schema.habitLogs.userId, authUser.id),
            gte(schema.habitLogs.completedOn, lookbackDate)
          )
        ),
    ]);

    const vm = buildHabitsViewModel({
      habits: userHabits,
      logs: userHabitLogs,
      selectedDate: options?.selectedDate || todayLocalDate,
      weekAnchorDate: options?.weekAnchorDate,
      todayLocalDate,
      timezone,
    });

    return {
      status: 'ok',
      data: {
        todayLocalDate,
        timezone,
        ...vm,
      },
    };
  } catch (err) {
    console.error('[LifeCraft Habits] Failed to load habits:', err);
    return {
      status: 'error',
      message: 'Unable to load your habits right now. Please try again.',
    };
  }
}

export async function createHabitForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; habitId: string }
  | { status: 'validation_error'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  const validated = validateHabitCreateInput(rawInput);
  if (!validated.valid) {
    return {
      status: 'validation_error',
      message: validated.error,
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message: 'Storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    await ensureUserProfile(authUser);
    const now = new Date();

    const [inserted] = await db
      .insert(schema.habits)
      .values({
        userId: authUser.id,
        title: validated.data.title,
        description: validated.data.description,
        targetPerWeek: validated.data.targetPerWeek,
        scheduledDays: validated.data.scheduledDays,
        isActive: validated.data.isActive,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.habits.id });

    return {
      status: 'ok',
      habitId: inserted.id,
    };
  } catch (err) {
    console.error('[LifeCraft Habits] Failed to create habit:', err);
    return {
      status: 'error',
      message: 'Could not save your habit. Please try again.',
    };
  }
}

export async function updateHabitForUser(
  authUser: AuthenticatedUserIdentity,
  habitId: string,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; habitId: string }
  | { status: 'not_found'; message: string }
  | { status: 'validation_error'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(habitId)) {
    return {
      status: 'not_found',
      message: 'Habit not found.',
    };
  }

  const validated = validateHabitUpdateInput(rawInput);
  if (!validated.valid) {
    return {
      status: 'validation_error',
      message: validated.error,
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message: 'Storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(schema.habits)
      .where(
        and(
          eq(schema.habits.id, habitId),
          eq(schema.habits.userId, authUser.id)
        )
      )
      .limit(1);

    if (!existing) {
      return {
        status: 'not_found',
        message: 'Habit not found or you do not have permission to edit it.',
      };
    }

    const nextScheduledDays =
      validated.data.scheduledDays !== undefined
        ? validated.data.scheduledDays
        : existing.scheduledDays;

    let nextTargetPerWeek =
      validated.data.targetPerWeek !== undefined
        ? validated.data.targetPerWeek
        : existing.targetPerWeek;

    if (
      nextScheduledDays &&
      nextScheduledDays.length > 0 &&
      nextTargetPerWeek > nextScheduledDays.length
    ) {
      nextTargetPerWeek = nextScheduledDays.length;
    }

    const [updated] = await db
      .update(schema.habits)
      .set({
        ...(validated.data.title !== undefined
          ? { title: validated.data.title }
          : {}),
        ...(validated.data.description !== undefined
          ? { description: validated.data.description }
          : {}),
        targetPerWeek: nextTargetPerWeek,
        scheduledDays: nextScheduledDays,
        ...(validated.data.isActive !== undefined
          ? { isActive: validated.data.isActive }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.habits.id, habitId),
          eq(schema.habits.userId, authUser.id)
        )
      )
      .returning({ id: schema.habits.id });

    if (!updated) {
      return {
        status: 'not_found',
        message: 'Habit not found.',
      };
    }

    return {
      status: 'ok',
      habitId: updated.id,
    };
  } catch (err) {
    console.error('[LifeCraft Habits] Failed to update habit:', err);
    return {
      status: 'error',
      message: 'Could not update your habit. Please try again.',
    };
  }
}

export async function deleteHabitForUser(
  authUser: AuthenticatedUserIdentity,
  habitId: string
): Promise<
  | { status: 'ok' }
  | { status: 'not_found'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(habitId)) {
    return {
      status: 'not_found',
      message: 'Habit not found.',
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message: 'Storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(schema.habits)
      .where(
        and(
          eq(schema.habits.id, habitId),
          eq(schema.habits.userId, authUser.id)
        )
      )
      .returning({ id: schema.habits.id });

    if (deleted.length === 0) {
      return {
        status: 'not_found',
        message: 'Habit not found or you do not have permission to delete it.',
      };
    }

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Habits] Failed to delete habit:', err);
    return {
      status: 'error',
      message: 'Could not delete your habit. Please try again.',
    };
  }
}

export async function recordHabitCheckInForUser(
  authUser: AuthenticatedUserIdentity,
  habitId: string,
  rawInput: Record<string, unknown>
): Promise<
  | {
      status: 'ok';
      date: string;
      recordedStatus: 'completed' | 'skipped' | null;
    }
  | { status: 'not_found'; message: string }
  | { status: 'validation_error'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(habitId)) {
    return {
      status: 'not_found',
      message: 'Habit not found.',
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message: 'Storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE);
    const todayLocalDate = getLocalDateString(new Date(), timezone);

    const validated = validateHabitCheckInInput(rawInput, todayLocalDate);
    if (!validated.valid) {
      return {
        status: 'validation_error',
        message: validated.error,
      };
    }

    const [ownedHabit] = await db
      .select({ id: schema.habits.id })
      .from(schema.habits)
      .where(
        and(
          eq(schema.habits.id, habitId),
          eq(schema.habits.userId, authUser.id)
        )
      )
      .limit(1);

    if (!ownedHabit) {
      return {
        status: 'not_found',
        message: 'Habit not found or you do not have permission to log it.',
      };
    }

    const { date, action } = validated.data;
    const now = new Date();

    if (action === 'undo') {
      await db
        .delete(schema.habitLogs)
        .where(
          and(
            eq(schema.habitLogs.habitId, habitId),
            eq(schema.habitLogs.userId, authUser.id),
            eq(schema.habitLogs.completedOn, date)
          )
        );

      return {
        status: 'ok',
        date,
        recordedStatus: null,
      };
    }

    await db
      .insert(schema.habitLogs)
      .values({
        habitId,
        userId: authUser.id,
        completedOn: date,
        status: action,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.habitLogs.habitId, schema.habitLogs.completedOn],
        set: {
          status: action,
          updatedAt: now,
        },
      });

    return {
      status: 'ok',
      date,
      recordedStatus: action,
    };
  } catch (err) {
    console.error('[LifeCraft Habits] Failed to record habit check-in:', err);
    return {
      status: 'error',
      message: 'Could not save your habit check-in. Please try again.',
    };
  }
}
