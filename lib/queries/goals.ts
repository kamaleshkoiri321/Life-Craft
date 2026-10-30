import { and, asc, desc, eq } from 'drizzle-orm';
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
} from './timezone';
import {
  buildGoalsViewModel,
  resolveGoalStatusAndProgressOnMutation,
  validateGoalCreateInput,
  validateGoalUpdateInput,
  validateMilestoneCreateInput,
  validateMilestoneUpdateInput,
  type GoalCategoryBreakdownItem,
  type GoalsSummaryMetrics,
  type GoalStatus,
  type RecentMilestoneFeedItem,
  type SerializedGoalItem,
  type UpcomingGoalDeadlineItem,
} from '../goals/goal-utils';

export interface GoalsViewData {
  todayLocalDate: string;
  timezone: string;
  summary: GoalsSummaryMetrics;
  goals: SerializedGoalItem[];
  upcomingDeadlines: UpcomingGoalDeadlineItem[];
  recentMilestones: RecentMilestoneFeedItem[];
  categoryBreakdown: GoalCategoryBreakdownItem[];
}

export type GoalsQueryResult =
  | { status: 'ok'; data: GoalsViewData }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string };

export async function getGoalsForUser(
  authUser: AuthenticatedUserIdentity
): Promise<GoalsQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Goal storage is not configured yet. Please check server settings.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE);
    const todayLocalDate = getLocalDateString(new Date(), timezone);

    const [userGoals, userMilestones, userProgressEntries] = await Promise.all([
      db
        .select()
        .from(schema.goals)
        .where(eq(schema.goals.userId, authUser.id))
        .orderBy(desc(schema.goals.updatedAt)),
      db
        .select()
        .from(schema.goalMilestones)
        .where(eq(schema.goalMilestones.userId, authUser.id))
        .orderBy(
          asc(schema.goalMilestones.sortOrder),
          asc(schema.goalMilestones.createdAt)
        ),
      db
        .select()
        .from(schema.goalProgressEntries)
        .where(eq(schema.goalProgressEntries.userId, authUser.id))
        .orderBy(desc(schema.goalProgressEntries.createdAt)),
    ]);

    const vm = buildGoalsViewModel({
      goals: userGoals,
      milestones: userMilestones,
      progressEntries: userProgressEntries,
      todayLocalDate,
      timezone,
    });

    return {
      status: 'ok',
      data: vm,
    };
  } catch (err) {
    console.error('[LifeCraft Goals] Failed to load goals:', err);
    return {
      status: 'error',
      message: 'Unable to load your goals right now. Please try again.',
    };
  }
}

export async function createGoalForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; goalId: string }
  | {
      status: 'validation_error';
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  const now = new Date();
  const validated = validateGoalCreateInput(rawInput, now);
  if (!validated.valid) {
    return {
      status: 'validation_error',
      message: validated.error,
      fieldErrors: validated.fieldErrors,
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

    const inserted = await db
      .insert(schema.goals)
      .values({
        userId: authUser.id,
        title: validated.data.title,
        description: validated.data.description,
        category: validated.data.category,
        status: validated.data.status,
        targetDate: validated.data.targetDate,
        progressPercent: validated.data.progressPercent,
        completedAt: validated.data.completedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.goals.id });

    const goalId = inserted[0]?.id;
    if (!goalId) {
      return {
        status: 'error',
        message: 'Failed to create goal.',
      };
    }

    // Record initial progress entry when created with non-zero progress
    if (validated.data.progressPercent > 0) {
      await db.insert(schema.goalProgressEntries).values({
        goalId,
        userId: authUser.id,
        progressPercent: validated.data.progressPercent,
        note:
          validated.data.progressPercent === 100
            ? 'Goal created as completed'
            : 'Initial goal progress',
        createdAt: now,
      });
    }

    // Insert optional initial milestones
    if (validated.data.initialMilestones.length > 0) {
      await db.insert(schema.goalMilestones).values(
        validated.data.initialMilestones.map((m, idx) => ({
          goalId,
          userId: authUser.id,
          title: m.title,
          description: null,
          targetDate: m.targetDate,
          status: 'pending' as const,
          completedAt: null,
          sortOrder: idx,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    return {
      status: 'ok',
      goalId,
    };
  } catch (err) {
    console.error('[LifeCraft Goals] Failed to create goal:', err);
    return {
      status: 'error',
      message: 'Unable to create goal right now. Please try again.',
    };
  }
}

export async function updateGoalForUser(
  authUser: AuthenticatedUserIdentity,
  goalId: string,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok' }
  | {
      status: 'validation_error';
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | { status: 'not_found'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(goalId)) {
    return {
      status: 'not_found',
      message: 'Goal not found.',
    };
  }

  const validated = validateGoalUpdateInput(rawInput);
  if (!validated.valid) {
    return {
      status: 'validation_error',
      message: validated.error,
      fieldErrors: validated.fieldErrors,
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
    const existingRows = await db
      .select()
      .from(schema.goals)
      .where(
        and(eq(schema.goals.id, goalId), eq(schema.goals.userId, authUser.id))
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return {
        status: 'not_found',
        message: 'Goal not found.',
      };
    }

    const now = new Date();
    const resolved = resolveGoalStatusAndProgressOnMutation({
      existingStatus: (existing.status as GoalStatus) || 'active',
      existingProgress: existing.progressPercent,
      existingCompletedAt: existing.completedAt ?? null,
      requestedStatus: validated.data.status,
      requestedProgress: validated.data.progressPercent,
      now,
    });

    const updateValues: Partial<typeof schema.goals.$inferInsert> = {
      status: resolved.status,
      progressPercent: resolved.progressPercent,
      completedAt: resolved.completedAt,
      updatedAt: now,
    };

    if (validated.data.title !== undefined) {
      updateValues.title = validated.data.title;
    }
    if (validated.data.description !== undefined) {
      updateValues.description = validated.data.description;
    }
    if (validated.data.category !== undefined) {
      updateValues.category = validated.data.category;
    }
    if (validated.data.targetDate !== undefined) {
      updateValues.targetDate = validated.data.targetDate;
    }

    await db
      .update(schema.goals)
      .set(updateValues)
      .where(
        and(eq(schema.goals.id, goalId), eq(schema.goals.userId, authUser.id))
      );

    // Record progress entry ONLY when progress genuinely changed or a note was explicitly logged
    const progressChanged =
      resolved.progressPercent !== existing.progressPercent;
    const hasProgressNote = Boolean(validated.data.progressNote);

    if (progressChanged || hasProgressNote) {
      let note = validated.data.progressNote ?? null;
      if (!note && progressChanged) {
        if (resolved.status === 'completed' && existing.status !== 'completed') {
          note = 'Marked goal as completed (100%)';
        } else if (
          existing.status === 'completed' &&
          resolved.status !== 'completed'
        ) {
          note = `Reopened goal (${resolved.progressPercent}%)`;
        } else {
          note = `Updated progress from ${existing.progressPercent}% to ${resolved.progressPercent}%`;
        }
      }

      await db.insert(schema.goalProgressEntries).values({
        goalId,
        userId: authUser.id,
        progressPercent: resolved.progressPercent,
        note,
        createdAt: now,
      });
    }

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Goals] Failed to update goal:', err);
    return {
      status: 'error',
      message: 'Unable to update goal right now. Please try again.',
    };
  }
}

export async function deleteGoalForUser(
  authUser: AuthenticatedUserIdentity,
  goalId: string
): Promise<
  | { status: 'ok' }
  | { status: 'not_found'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(goalId)) {
    return {
      status: 'not_found',
      message: 'Goal not found.',
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
      .delete(schema.goals)
      .where(
        and(eq(schema.goals.id, goalId), eq(schema.goals.userId, authUser.id))
      )
      .returning({ id: schema.goals.id });

    if (deleted.length === 0) {
      return {
        status: 'not_found',
        message: 'Goal not found.',
      };
    }

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Goals] Failed to delete goal:', err);
    return {
      status: 'error',
      message: 'Unable to delete goal right now. Please try again.',
    };
  }
}

export async function createMilestoneForUser(
  authUser: AuthenticatedUserIdentity,
  goalId: string,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; milestoneId: string }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(goalId)) {
    return {
      status: 'not_found',
      message: 'Goal not found.',
    };
  }

  const validated = validateMilestoneCreateInput(rawInput);
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

    // Verify parent goal belongs to authenticated user
    const parentRows = await db
      .select({ id: schema.goals.id })
      .from(schema.goals)
      .where(
        and(eq(schema.goals.id, goalId), eq(schema.goals.userId, authUser.id))
      )
      .limit(1);

    if (parentRows.length === 0) {
      return {
        status: 'not_found',
        message: 'Goal not found.',
      };
    }

    const existingMilestones = await db
      .select({ sortOrder: schema.goalMilestones.sortOrder })
      .from(schema.goalMilestones)
      .where(
        and(
          eq(schema.goalMilestones.goalId, goalId),
          eq(schema.goalMilestones.userId, authUser.id)
        )
      );

    const maxOrder = existingMilestones.reduce(
      (max, m) => Math.max(max, m.sortOrder),
      -1
    );
    const now = new Date();

    const inserted = await db
      .insert(schema.goalMilestones)
      .values({
        goalId,
        userId: authUser.id,
        title: validated.data.title,
        description: validated.data.description,
        targetDate: validated.data.targetDate,
        status: validated.data.status,
        completedAt: validated.data.status === 'completed' ? now : null,
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.goalMilestones.id });

    // Touch parent goal updatedAt
    await db
      .update(schema.goals)
      .set({ updatedAt: now })
      .where(
        and(eq(schema.goals.id, goalId), eq(schema.goals.userId, authUser.id))
      );

    return {
      status: 'ok',
      milestoneId: inserted[0]?.id ?? '',
    };
  } catch (err) {
    console.error('[LifeCraft Goals] Failed to create milestone:', err);
    return {
      status: 'error',
      message: 'Unable to add milestone right now. Please try again.',
    };
  }
}

export async function updateMilestoneForUser(
  authUser: AuthenticatedUserIdentity,
  goalId: string,
  milestoneId: string,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok' }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(goalId) || !isValidUuid(milestoneId)) {
    return {
      status: 'not_found',
      message: 'Milestone not found.',
    };
  }

  const validated = validateMilestoneUpdateInput(rawInput);
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
    const existingRows = await db
      .select()
      .from(schema.goalMilestones)
      .where(
        and(
          eq(schema.goalMilestones.id, milestoneId),
          eq(schema.goalMilestones.goalId, goalId),
          eq(schema.goalMilestones.userId, authUser.id)
        )
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return {
        status: 'not_found',
        message: 'Milestone not found.',
      };
    }

    const now = new Date();
    const updateValues: Partial<typeof schema.goalMilestones.$inferInsert> = {
      updatedAt: now,
    };

    if (validated.data.title !== undefined) {
      updateValues.title = validated.data.title;
    }
    if (validated.data.description !== undefined) {
      updateValues.description = validated.data.description;
    }
    if (validated.data.targetDate !== undefined) {
      updateValues.targetDate = validated.data.targetDate;
    }
    if (validated.data.sortOrder !== undefined) {
      updateValues.sortOrder = validated.data.sortOrder;
    }
    if (validated.data.status !== undefined) {
      updateValues.status = validated.data.status;
      updateValues.completedAt =
        validated.data.status === 'completed'
          ? existing.completedAt ?? now
          : null;
    }

    await db
      .update(schema.goalMilestones)
      .set(updateValues)
      .where(
        and(
          eq(schema.goalMilestones.id, milestoneId),
          eq(schema.goalMilestones.goalId, goalId),
          eq(schema.goalMilestones.userId, authUser.id)
        )
      );

    // Touch parent goal updatedAt without modifying goals.progressPercent
    await db
      .update(schema.goals)
      .set({ updatedAt: now })
      .where(
        and(eq(schema.goals.id, goalId), eq(schema.goals.userId, authUser.id))
      );

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Goals] Failed to update milestone:', err);
    return {
      status: 'error',
      message: 'Unable to update milestone right now. Please try again.',
    };
  }
}

export async function deleteMilestoneForUser(
  authUser: AuthenticatedUserIdentity,
  goalId: string,
  milestoneId: string
): Promise<
  | { status: 'ok' }
  | { status: 'not_found'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(goalId) || !isValidUuid(milestoneId)) {
    return {
      status: 'not_found',
      message: 'Milestone not found.',
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
      .delete(schema.goalMilestones)
      .where(
        and(
          eq(schema.goalMilestones.id, milestoneId),
          eq(schema.goalMilestones.goalId, goalId),
          eq(schema.goalMilestones.userId, authUser.id)
        )
      )
      .returning({ id: schema.goalMilestones.id });

    if (deleted.length === 0) {
      return {
        status: 'not_found',
        message: 'Milestone not found.',
      };
    }

    await db
      .update(schema.goals)
      .set({ updatedAt: new Date() })
      .where(
        and(eq(schema.goals.id, goalId), eq(schema.goals.userId, authUser.id))
      );

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Goals] Failed to delete milestone:', err);
    return {
      status: 'error',
      message: 'Unable to delete milestone right now. Please try again.',
    };
  }
}
