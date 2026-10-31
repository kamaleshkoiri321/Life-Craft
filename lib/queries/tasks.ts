import { and, desc, eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../db';
import { tasks } from '../db/schema';
import { ensureUserProfile, type AuthSessionUser } from './dashboard';
import { DEFAULT_TIMEZONE, resolveValidTimezone } from './timezone';
import {
  computeTaskSummaryMetrics,
  filterAndSortTasks,
  resolveCompletedAtForStatusChange,
  serializeTaskRow,
  validateTaskCreateInput,
  validateTaskUpdateInput,
  type SerializedTaskItem,
  type TaskListFilters,
  type TaskMutationInput,
  type TaskStatus,
  type TaskSummaryMetrics,
} from '../tasks/validation';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id.trim());
}

export type TaskListQueryResult =
  | {
      status: 'ok';
      timezone: string;
      summary: TaskSummaryMetrics;
      tasks: SerializedTaskItem[];
    }
  | {
      status: 'unconfigured' | 'error';
      message: string;
    };

export type TaskMutationQueryResult =
  | {
      status: 'ok';
      task: SerializedTaskItem;
    }
  | {
      status: 'validation_error';
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | {
      status: 'not_found';
      message: string;
    }
  | {
      status: 'unconfigured' | 'error';
      message: string;
    };

export type TaskDeleteQueryResult =
  | {
      status: 'ok';
      deletedTaskId: string;
    }
  | {
      status: 'not_found';
      message: string;
    }
  | {
      status: 'unconfigured' | 'error';
      message: string;
    };

export async function listTasksForUser(
  authUser: AuthSessionUser,
  filters: TaskListFilters = {}
): Promise<TaskListQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Task storage is not configured yet. Please check server settings.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(
      profile?.timezone ?? DEFAULT_TIMEZONE
    );

    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, authUser.id))
      .orderBy(desc(tasks.createdAt))
      .limit(500);

    const now = new Date();
    const serializedAll = rows.map((row) =>
      serializeTaskRow(row, {
        timezone,
        now,
      })
    );
    const summary = computeTaskSummaryMetrics(serializedAll);
    const filteredTasks = filterAndSortTasks(
      serializedAll,
      {
        ...filters,
        limit: filters.limit ?? 200,
      },
      { timezone, now }
    );

    return {
      status: 'ok',
      timezone,
      summary,
      tasks: filteredTasks,
    };
  } catch (err) {
    console.error('[LifeCraft Tasks] Failed to list tasks:', err);
    return {
      status: 'error',
      message:
        'We could not load your tasks right now. Please try again.',
    };
  }
}

export async function createTaskForUser(
  authUser: AuthSessionUser,
  input: TaskMutationInput
): Promise<TaskMutationQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Task storage is not configured yet. Please check server settings.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(
      profile?.timezone ?? DEFAULT_TIMEZONE
    );

    const validation = validateTaskCreateInput(input, timezone);
    if (!validation.valid) {
      return {
        status: 'validation_error',
        message: validation.error,
        fieldErrors: validation.fieldErrors,
      };
    }

    const now = new Date();
    const {
      title,
      description,
      priority,
      status,
      dueAt,
      scheduledStartAt,
      scheduledEndAt,
      isAllDay,
    } = validation.data;
    const completedAt = status === 'completed' ? now : null;

    const [inserted] = await db
      .insert(tasks)
      .values({
        userId: authUser.id,
        title,
        description,
        priority,
        status,
        dueAt,
        scheduledStartAt,
        scheduledEndAt,
        isAllDay,
        completedAt,
        updatedAt: now,
      })
      .returning();

    return {
      status: 'ok',
      task: serializeTaskRow(inserted, { timezone, now }),
    };
  } catch (err) {
    console.error('[LifeCraft Tasks] Failed to create task:', err);
    return {
      status: 'error',
      message: 'We could not save your task right now. Please try again.',
    };
  }
}

export async function updateTaskForUser(
  authUser: AuthSessionUser,
  taskId: string,
  input: TaskMutationInput
): Promise<TaskMutationQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Task storage is not configured yet. Please check server settings.',
    };
  }

  if (!isValidUuid(taskId)) {
    return {
      status: 'not_found',
      message: 'Task not found.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(
      profile?.timezone ?? DEFAULT_TIMEZONE
    );

    const validation = validateTaskUpdateInput(input, timezone);
    if (!validation.valid) {
      return {
        status: 'validation_error',
        message: validation.error,
        fieldErrors: validation.fieldErrors,
      };
    }

    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, authUser.id)))
      .limit(1);

    if (!existing) {
      return {
        status: 'not_found',
        message: 'Task not found or you do not have permission to modify it.',
      };
    }

    const now = new Date();
    const updatePayload: Partial<typeof tasks.$inferInsert> = {
      updatedAt: now,
    };

    if (validation.data.title !== undefined) {
      updatePayload.title = validation.data.title;
    }
    if (validation.data.description !== undefined) {
      updatePayload.description = validation.data.description;
    }
    if (validation.data.priority !== undefined) {
      updatePayload.priority = validation.data.priority;
    }
    if (validation.data.dueAt !== undefined) {
      updatePayload.dueAt = validation.data.dueAt;
    }
    if (validation.data.scheduledStartAt !== undefined) {
      updatePayload.scheduledStartAt = validation.data.scheduledStartAt;
    }
    if (validation.data.scheduledEndAt !== undefined) {
      updatePayload.scheduledEndAt = validation.data.scheduledEndAt;
    }
    if (validation.data.isAllDay !== undefined) {
      updatePayload.isAllDay = validation.data.isAllDay;
    }
    if (validation.data.status !== undefined) {
      const prevStatus = (existing.status as TaskStatus) || 'todo';
      const nextStatus = validation.data.status;
      updatePayload.status = nextStatus;
      updatePayload.completedAt = resolveCompletedAtForStatusChange(
        prevStatus,
        nextStatus,
        existing.completedAt ? new Date(existing.completedAt) : null,
        now
      );
    }

    const [updated] = await db
      .update(tasks)
      .set(updatePayload)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, authUser.id)))
      .returning();

    if (!updated) {
      return {
        status: 'not_found',
        message: 'Task not found.',
      };
    }

    return {
      status: 'ok',
      task: serializeTaskRow(updated, { timezone, now }),
    };
  } catch (err) {
    console.error('[LifeCraft Tasks] Failed to update task:', err);
    return {
      status: 'error',
      message: 'We could not update this task right now. Please try again.',
    };
  }
}

export async function deleteTaskForUser(
  authUser: AuthSessionUser,
  taskId: string
): Promise<TaskDeleteQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Task storage is not configured yet. Please check server settings.',
    };
  }

  if (!isValidUuid(taskId)) {
    return {
      status: 'not_found',
      message: 'Task not found.',
    };
  }

  try {
    const db = getDb();
    const deletedRows = await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, authUser.id)))
      .returning({ id: tasks.id });

    if (deletedRows.length === 0) {
      return {
        status: 'not_found',
        message: 'Task not found or you do not have permission to delete it.',
      };
    }

    return {
      status: 'ok',
      deletedTaskId: deletedRows[0].id,
    };
  } catch (err) {
    console.error('[LifeCraft Tasks] Failed to delete task:', err);
    return {
      status: 'error',
      message: 'We could not delete this task right now. Please try again.',
    };
  }
}
