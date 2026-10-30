import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../db';
import * as schema from '../db/schema';
import { DEFAULT_TIMEZONE, resolveValidTimezone } from './timezone';
import { isValidUuid } from './tasks';
import { sanitizeServerErrorMessage } from '../security/api-guard';
import {
  buildFocusWorkspaceViewModel,
  computeElapsedActiveSeconds,
  validateStartFocusSessionInput,
  validateUpdateFocusSessionInput,
  type FocusSessionStatus,
  type FocusWorkspaceViewModel,
  type SerializedFocusSession,
} from '../focus/focus-utils';

export interface AuthenticatedFocusUser {
  id: string;
  name?: string | null;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
}

export type FocusWorkspaceResult =
  | { status: 'ok'; data: FocusWorkspaceViewModel }
  | { status: 'db_unconfigured'; message: string }
  | { status: 'db_error'; message: string };

export type FocusMutationResult =
  | {
      status: 'ok';
      session?: SerializedFocusSession;
      workspace: FocusWorkspaceViewModel;
    }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'db_unconfigured'; message: string }
  | { status: 'db_error'; message: string };

async function ensureUserProfileAndTimezone(
  user: AuthenticatedFocusUser
): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, user.id))
    .limit(1);

  if (existing) {
    return resolveValidTimezone(existing.timezone);
  }

  const fallbackName =
    user.name?.trim() || user.email.split('@')[0] || 'LifeCraft Member';

  const [created] = await db
    .insert(schema.userProfiles)
    .values({
      userId: user.id,
      displayName: fallbackName,
      timezone: DEFAULT_TIMEZONE,
    })
    .onConflictDoNothing()
    .returning();

  return resolveValidTimezone(created?.timezone ?? DEFAULT_TIMEZONE);
}

async function verifyOwnedTaskId(
  userId: string,
  taskId: string | null | undefined
): Promise<{ ok: true; taskId: string | null } | { ok: false; message: string }> {
  if (!taskId) {
    return { ok: true, taskId: null };
  }

  if (!isValidUuid(taskId)) {
    return {
      ok: false,
      message: 'Selected task was not found in your account.',
    };
  }

  const db = getDb();
  const [ownedTask] = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)))
    .limit(1);

  if (!ownedTask) {
    return {
      ok: false,
      message: 'Selected task was not found in your account.',
    };
  }

  return { ok: true, taskId: ownedTask.id };
}

export async function getFocusWorkspaceForUser(
  authUser: AuthenticatedFocusUser
): Promise<FocusWorkspaceResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message: 'Focus storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    const timezone = await ensureUserProfileAndTimezone(authUser);

    const [sessions, userTasks] = await Promise.all([
      db
        .select()
        .from(schema.focusSessions)
        .where(eq(schema.focusSessions.userId, authUser.id))
        .orderBy(desc(schema.focusSessions.startedAt))
        .limit(250),
      db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.userId, authUser.id))
        .orderBy(desc(schema.tasks.updatedAt))
        .limit(100),
    ]);

    const workspace = buildFocusWorkspaceViewModel({
      sessions,
      tasks: userTasks,
      timezone,
    });

    return {
      status: 'ok',
      data: workspace,
    };
  } catch (err) {
    console.error('[LifeCraft Focus] Failed to load focus workspace:', err);
    return {
      status: 'db_error',
      message: sanitizeServerErrorMessage(
        err,
        'Unable to load your Focus Studio workspace right now. Please try again.'
      ),
    };
  }
}

export async function startFocusSessionForUser(
  authUser: AuthenticatedFocusUser,
  rawInput: Record<string, unknown>
): Promise<FocusMutationResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message: 'Database is not configured.',
    };
  }

  const validation = validateStartFocusSessionInput(rawInput);
  if (!validation.ok) {
    return {
      status: 'validation_error',
      message: validation.message,
    };
  }

  try {
    const db = getDb();
    await ensureUserProfileAndTimezone(authUser);

    const taskCheck = await verifyOwnedTaskId(
      authUser.id,
      validation.value.taskId
    );
    if (!taskCheck.ok) {
      return {
        status: 'validation_error',
        message: taskCheck.message,
      };
    }

    const now = new Date();
    const nowMs = now.getTime();

    // Prevent duplicate running/paused sessions of the same category (countdown vs stopwatch)
    const targetTypes =
      validation.value.sessionType === 'stopwatch'
        ? ['stopwatch']
        : ['focus', 'short_break', 'long_break'];

    const existingOpen = await db
      .select()
      .from(schema.focusSessions)
      .where(
        and(
          eq(schema.focusSessions.userId, authUser.id),
          inArray(schema.focusSessions.status, ['running', 'paused']),
          inArray(schema.focusSessions.sessionType, targetTypes)
        )
      );

    for (const openRow of existingOpen) {
      const elapsed = computeElapsedActiveSeconds({
        status: openRow.status as FocusSessionStatus,
        actualDurationSeconds: openRow.actualDurationSeconds,
        lastResumedAt: openRow.lastResumedAt,
        nowMs,
      });

      await db
        .update(schema.focusSessions)
        .set({
          status: 'interrupted',
          actualDurationSeconds: Math.min(86400, elapsed),
          lastResumedAt: null,
          endedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.focusSessions.id, openRow.id),
            eq(schema.focusSessions.userId, authUser.id)
          )
        );
    }

    const [created] = await db
      .insert(schema.focusSessions)
      .values({
        userId: authUser.id,
        taskId: taskCheck.taskId,
        sessionType: validation.value.sessionType,
        presetId: validation.value.presetId,
        status: 'running',
        plannedDurationSeconds: validation.value.plannedDurationSeconds,
        actualDurationSeconds: 0,
        lapsJson: validation.value.sessionType === 'stopwatch' ? '[]' : null,
        startedAt: now,
        lastResumedAt: now,
        endedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const wsResult = await getFocusWorkspaceForUser(authUser);
    if (wsResult.status !== 'ok') {
      return wsResult;
    }

    const session =
      wsResult.data.activeCountdownSession?.id === created.id
        ? wsResult.data.activeCountdownSession
        : wsResult.data.activeStopwatchSession?.id === created.id
          ? wsResult.data.activeStopwatchSession
          : wsResult.data.recentSessions.find((s) => s.id === created.id);

    return {
      status: 'ok',
      session,
      workspace: wsResult.data,
    };
  } catch (err) {
    console.error('[LifeCraft Focus] Failed to start focus session:', err);
    return {
      status: 'db_error',
      message: sanitizeServerErrorMessage(
        err,
        'Could not start focus session. Please try again.'
      ),
    };
  }
}

export async function updateFocusSessionForUser(
  authUser: AuthenticatedFocusUser,
  sessionId: string,
  rawInput: Record<string, unknown>
): Promise<FocusMutationResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message: 'Database is not configured.',
    };
  }

  if (!isValidUuid(sessionId)) {
    return {
      status: 'not_found',
      message: 'Focus session not found.',
    };
  }

  const validation = validateUpdateFocusSessionInput(rawInput);
  if (!validation.ok) {
    return {
      status: 'validation_error',
      message: validation.message,
    };
  }

  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(schema.focusSessions)
      .where(
        and(
          eq(schema.focusSessions.id, sessionId),
          eq(schema.focusSessions.userId, authUser.id)
        )
      )
      .limit(1);

    if (!existing) {
      return {
        status: 'not_found',
        message: 'Focus session not found.',
      };
    }

    const { action, actualDurationSeconds, addSeconds, taskId, laps } =
      validation.value;

    // Idempotent guard: if already completed and action is complete, return current workspace without duplicating
    if (action === 'complete' && existing.status === 'completed') {
      const wsResult = await getFocusWorkspaceForUser(authUser);
      if (wsResult.status !== 'ok') return wsResult;
      const found = wsResult.data.recentSessions.find(
        (s) => s.id === existing.id
      );
      return {
        status: 'ok',
        session: found,
        workspace: wsResult.data,
      };
    }

    let verifiedTaskId = existing.taskId;
    if (taskId !== undefined) {
      const taskCheck = await verifyOwnedTaskId(authUser.id, taskId);
      if (!taskCheck.ok) {
        return {
          status: 'validation_error',
          message: taskCheck.message,
        };
      }
      verifiedTaskId = taskCheck.taskId;
    }

    const now = new Date();
    const nowMs = now.getTime();
    const computedElapsed = computeElapsedActiveSeconds({
      status: existing.status as FocusSessionStatus,
      actualDurationSeconds: existing.actualDurationSeconds,
      lastResumedAt: existing.lastResumedAt,
      nowMs,
    });

    const nextLapsJson =
      laps !== undefined ? JSON.stringify(laps) : existing.lapsJson;

    if (action === 'pause') {
      if (existing.status === 'running') {
        await db
          .update(schema.focusSessions)
          .set({
            status: 'paused',
            actualDurationSeconds: Math.min(86400, computedElapsed),
            lastResumedAt: null,
            taskId: verifiedTaskId,
            lapsJson: nextLapsJson,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.focusSessions.id, existing.id),
              eq(schema.focusSessions.userId, authUser.id)
            )
          );
      }
    } else if (action === 'resume') {
      if (existing.status === 'paused') {
        await db
          .update(schema.focusSessions)
          .set({
            status: 'running',
            lastResumedAt: now,
            taskId: verifiedTaskId,
            lapsJson: nextLapsJson,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.focusSessions.id, existing.id),
              eq(schema.focusSessions.userId, authUser.id)
            )
          );
      }
    } else if (action === 'complete') {
      let finalActualSeconds = computedElapsed;
      if (existing.sessionType !== 'stopwatch') {
        // For countdown sessions that reached zero, record plannedDurationSeconds
        // (or explicit actualDurationSeconds if provided within valid bounds)
        finalActualSeconds =
          actualDurationSeconds !== undefined && actualDurationSeconds > 0
            ? Math.min(existing.plannedDurationSeconds, actualDurationSeconds)
            : existing.plannedDurationSeconds;
      } else {
        // Stopwatch session: use verified elapsed or client-supplied positive duration
        finalActualSeconds = Math.max(
          1,
          actualDurationSeconds !== undefined
            ? Math.min(86400, actualDurationSeconds)
            : computedElapsed
        );
      }

      await db
        .update(schema.focusSessions)
        .set({
          status: 'completed',
          actualDurationSeconds: finalActualSeconds,
          lastResumedAt: null,
          endedAt: now,
          completedAt: now,
          taskId: verifiedTaskId,
          lapsJson: nextLapsJson,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.focusSessions.id, existing.id),
            eq(schema.focusSessions.userId, authUser.id)
          )
        );
    } else if (action === 'interrupt') {
      if (existing.status === 'running' || existing.status === 'paused') {
        await db
          .update(schema.focusSessions)
          .set({
            status: 'interrupted',
            actualDurationSeconds: Math.min(86400, computedElapsed),
            lastResumedAt: null,
            endedAt: now,
            taskId: verifiedTaskId,
            lapsJson: nextLapsJson,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.focusSessions.id, existing.id),
              eq(schema.focusSessions.userId, authUser.id)
            )
          );
      }
    } else if (action === 'extend') {
      if (existing.sessionType !== 'stopwatch') {
        const nextPlanned = Math.min(
          43200,
          existing.plannedDurationSeconds + (addSeconds ?? 300)
        );
        await db
          .update(schema.focusSessions)
          .set({
            plannedDurationSeconds: nextPlanned,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.focusSessions.id, existing.id),
              eq(schema.focusSessions.userId, authUser.id)
            )
          );
      }
    } else if (action === 'update_meta') {
      await db
        .update(schema.focusSessions)
        .set({
          taskId: verifiedTaskId,
          lapsJson: nextLapsJson,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.focusSessions.id, existing.id),
            eq(schema.focusSessions.userId, authUser.id)
          )
        );
    }

    const wsResult = await getFocusWorkspaceForUser(authUser);
    if (wsResult.status !== 'ok') {
      return wsResult;
    }

    const updatedSession =
      wsResult.data.activeCountdownSession?.id === existing.id
        ? wsResult.data.activeCountdownSession
        : wsResult.data.activeStopwatchSession?.id === existing.id
          ? wsResult.data.activeStopwatchSession
          : wsResult.data.recentSessions.find((s) => s.id === existing.id);

    return {
      status: 'ok',
      session: updatedSession,
      workspace: wsResult.data,
    };
  } catch (err) {
    console.error('[LifeCraft Focus] Failed to update focus session:', err);
    return {
      status: 'db_error',
      message: sanitizeServerErrorMessage(
        err,
        'Could not update focus session. Please try again.'
      ),
    };
  }
}

export async function deleteFocusSessionForUser(
  authUser: AuthenticatedFocusUser,
  sessionId: string
): Promise<FocusMutationResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message: 'Database is not configured.',
    };
  }

  if (!isValidUuid(sessionId)) {
    return {
      status: 'not_found',
      message: 'Focus session not found.',
    };
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(schema.focusSessions)
      .where(
        and(
          eq(schema.focusSessions.id, sessionId),
          eq(schema.focusSessions.userId, authUser.id)
        )
      )
      .returning({ id: schema.focusSessions.id });

    if (deleted.length === 0) {
      return {
        status: 'not_found',
        message: 'Focus session not found.',
      };
    }

    const wsResult = await getFocusWorkspaceForUser(authUser);
    if (wsResult.status !== 'ok') {
      return wsResult;
    }

    return {
      status: 'ok',
      workspace: wsResult.data,
    };
  } catch (err) {
    console.error('[LifeCraft Focus] Failed to delete focus session:', err);
    return {
      status: 'db_error',
      message: sanitizeServerErrorMessage(
        err,
        'Could not delete focus session. Please try again.'
      ),
    };
  }
}
