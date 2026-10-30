import type { TaskRow } from '../db/schema';
import {
  DEFAULT_TIMEZONE,
  formatDashboardDate,
  formatLocalTime,
  formatShortDate,
  getLocalDateString,
  getLocalDayUtcBounds,
  getTimezoneOffsetMs,
  resolveValidTimezone,
  shiftLocalDateString,
} from '../queries/timezone';

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'completed',
  'archived',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_SCHEDULE_FILTERS = [
  'all',
  'overdue',
  'due_today',
  'upcoming',
  'completed',
] as const;
export type TaskScheduleFilter = (typeof TASK_SCHEDULE_FILTERS)[number];

export const TASK_SORT_FIELDS = ['due_date', 'created_at', 'priority'] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export const DEFAULT_SCHEDULE_DURATION_MINUTES = 60;

export interface TaskMutationInput {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  status?: unknown;
  dueDate?: unknown; // YYYY-MM-DD or '' or null
  dueTime?: unknown; // HH:mm or '' or null
  dueAt?: unknown; // Optional ISO string fallback
  scheduledDate?: unknown; // YYYY-MM-DD or '' or null
  scheduledEndDate?: unknown; // YYYY-MM-DD or '' or null (for tasks spanning midnight)
  scheduledStartTime?: unknown; // HH:mm or '' or null
  scheduledEndTime?: unknown; // HH:mm or '' or null
  durationMinutes?: unknown; // Optional duration in minutes (default 60)
  scheduledStartAt?: unknown; // Optional ISO string
  scheduledEndAt?: unknown; // Optional ISO string
  isAllDay?: unknown; // boolean
}

export interface ValidatedTaskCreateData {
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: Date | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  isAllDay: boolean;
}

export interface ValidatedTaskUpdateData {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: Date | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  isAllDay?: boolean;
}

export type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string; fieldErrors?: Record<string, string> };

export interface SerializedTaskItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  dueDate: string | null; // YYYY-MM-DD in user's timezone
  dueTime: string | null; // HH:mm (24h) in user's timezone for form editing
  dueDateLabel: string | null; // e.g. "Today", "Tomorrow", "Oct 28"
  dueFullDateLabel: string | null; // e.g. "Mon, Oct 27, 2026"
  dueTimeLabel: string | null; // e.g. "5:00 PM"
  dueDisplayLabel: string | null; // e.g. "Today, 5:00 PM" or "Oct 28, 5:30 PM"
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  isAllDay: boolean;
  scheduledDate: string | null; // YYYY-MM-DD in user's timezone
  scheduledEndDate: string | null; // YYYY-MM-DD in user's timezone
  scheduledStartTime: string | null; // HH:mm (24h) in user's timezone (null if all-day)
  scheduledEndTime: string | null; // HH:mm (24h) in user's timezone (null if all-day)
  durationMinutes: number | null;
  scheduleDisplayLabel: string | null; // e.g. "Today · 9:00 AM – 10:00 AM" or "Oct 28 · All day"
  googleEventId?: string | null;
  googleHtmlLink?: string | null;
  isOverdue: boolean;
  isDueToday: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdAtLabel: string;
  updatedAtLabel: string;
}

export type SerializedTask = SerializedTaskItem;

export interface TaskSummaryMetrics {
  totalCount: number; // active + completed (all non-archived)
  totalActiveCount: number; // todo + in_progress
  todoCount: number;
  inProgressCount: number;
  completedCount: number;
  overdueCount: number;
  dueTodayCount: number;
  archivedCount: number;
  completionRatePercent: number;
}

export interface TaskListFilters {
  search?: string;
  status?: 'all' | TaskStatus;
  priority?: 'all' | TaskPriority;
  schedule?: TaskScheduleFilter;
  sortBy?: TaskSortField;
  limit?: number;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidLocalDateString(dateStr: string): boolean {
  const trimmed = dateStr.trim();
  if (!DATE_REGEX.test(trimmed)) return false;
  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const checkDate = new Date(Date.UTC(year, month - 1, day));
  return (
    checkDate.getUTCFullYear() === year &&
    checkDate.getUTCMonth() + 1 === month &&
    checkDate.getUTCDate() === day
  );
}

export function isValidTaskStatus(val: unknown): val is TaskStatus {
  return (
    typeof val === 'string' &&
    (TASK_STATUSES as readonly string[]).includes(val)
  );
}

export function isValidTaskPriority(val: unknown): val is TaskPriority {
  return (
    typeof val === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(val)
  );
}

/**
 * Converts a local calendar date (`YYYY-MM-DD`) and optional 24-hour time (`HH:mm`)
 * in the user's IANA timezone into a UTC `Date` object.
 * When `dueTime` is omitted, defaults to `23:59:00` local time on that date.
 */
export function combineLocalDateAndTimeToUtc(
  dueDate: string,
  dueTime: string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): Date | null {
  const trimmedDate = dueDate.trim();
  if (!isValidLocalDateString(trimmedDate)) return null;

  const [yearStr, monthStr, dayStr] = trimmedDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  let hours = 23;
  let minutes = 59;

  if (dueTime && dueTime.trim().length > 0) {
    const trimmedTime = dueTime.trim();
    const match = TIME_REGEX.exec(trimmedTime);
    if (!match) return null;
    hours = Number(match[1]);
    minutes = Number(match[2]);
  }

  const tz = resolveValidTimezone(timezone);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const firstOffset = getTimezoneOffsetMs(new Date(naiveUtcMs), tz);
  const refinedMs = naiveUtcMs - firstOffset;
  const secondOffset = getTimezoneOffsetMs(new Date(refinedMs), tz);
  return new Date(naiveUtcMs - secondOffset);
}

export function extractLocalDateAndExactTime(
  instant: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): { localDate: string | null; localTime: string | null } {
  if (!instant) return { localDate: null, localTime: null };
  const parsed = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(parsed.getTime())) {
    return { localDate: null, localTime: null };
  }

  const tz = resolveValidTimezone(timezone);
  const localDate = getLocalDateString(parsed, tz);

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(parsed);

  const rawHour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const hour = rawHour === '24' ? '00' : rawHour.padStart(2, '0');
  const minute = (
    parts.find((p) => p.type === 'minute')?.value ?? '00'
  ).padStart(2, '0');

  return {
    localDate,
    localTime: `${hour}:${minute}`,
  };
}

export function extractLocalDateAndTime(
  dueAt: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): { dueDate: string | null; dueTime: string | null } {
  const { localDate, localTime } = extractLocalDateAndExactTime(
    dueAt,
    timezone
  );
  if (!localDate || !localTime) {
    return { dueDate: null, dueTime: null };
  }
  return {
    dueDate: localDate,
    dueTime: localTime === '23:59' ? null : localTime,
  };
}

function formatDateTimeTimestamp(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return '';
  const tz = resolveValidTimezone(timezone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
}

function formatMonthDayShort(
  localDateStr: string,
  currentYear: string
): string {
  const [y, m, d] = localDateStr.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (String(y) === currentYear) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    }).format(utcNoon);
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcNoon);
}

interface ParsedScheduleBlock {
  hasScheduleInput: boolean;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  isAllDay: boolean;
  fieldErrors: Record<string, string>;
}

function parseScheduleBlockFromInput(
  input: TaskMutationInput,
  timezone: string
): ParsedScheduleBlock {
  const fieldErrors: Record<string, string> = {};
  const tz = resolveValidTimezone(timezone);

  const hasScheduleKeys =
    input.scheduledDate !== undefined ||
    input.scheduledEndDate !== undefined ||
    input.scheduledStartTime !== undefined ||
    input.scheduledEndTime !== undefined ||
    input.durationMinutes !== undefined ||
    input.scheduledStartAt !== undefined ||
    input.scheduledEndAt !== undefined ||
    input.isAllDay !== undefined;

  if (!hasScheduleKeys) {
    return {
      hasScheduleInput: false,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  const isAllDay = Boolean(input.isAllDay);
  const rawScheduledDate =
    typeof input.scheduledDate === 'string' ? input.scheduledDate.trim() : '';
  const rawScheduledEndDate =
    typeof input.scheduledEndDate === 'string'
      ? input.scheduledEndDate.trim()
      : '';
  const rawStartTime =
    typeof input.scheduledStartTime === 'string'
      ? input.scheduledStartTime.trim()
      : '';
  const rawEndTime =
    typeof input.scheduledEndTime === 'string'
      ? input.scheduledEndTime.trim()
      : '';
  const rawStartAt =
    typeof input.scheduledStartAt === 'string'
      ? input.scheduledStartAt.trim()
      : '';
  const rawEndAt =
    typeof input.scheduledEndAt === 'string' ? input.scheduledEndAt.trim() : '';

  // Explicit clear: empty scheduledDate and null/empty scheduledStartAt
  const isExplicitClear =
    !isAllDay &&
    !rawScheduledDate &&
    !rawStartTime &&
    !rawEndTime &&
    !rawStartAt &&
    !rawEndAt &&
    (input.scheduledDate === '' ||
      input.scheduledDate === null ||
      input.scheduledStartAt === null ||
      input.scheduledStartAt === '');

  if (isExplicitClear) {
    return {
      hasScheduleInput: true,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  // Case 1: Direct ISO timestamps (scheduledStartAt & scheduledEndAt)
  if (rawStartAt || rawEndAt) {
    if (!rawStartAt || !rawEndAt) {
      fieldErrors.scheduledStartTime =
        'Both scheduled start and end times are required.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay,
        fieldErrors,
      };
    }

    const parsedStart = new Date(rawStartAt);
    const parsedEnd = new Date(rawEndAt);
    if (
      Number.isNaN(parsedStart.getTime()) ||
      Number.isNaN(parsedEnd.getTime())
    ) {
      fieldErrors.scheduledStartTime =
        'Please provide valid scheduled start and end timestamps.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay,
        fieldErrors,
      };
    }

    if (parsedEnd.getTime() <= parsedStart.getTime()) {
      fieldErrors.scheduledEndTime =
        'Scheduled end time must be after the start time.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay,
        fieldErrors,
      };
    }

    return {
      hasScheduleInput: true,
      scheduledStartAt: parsedStart,
      scheduledEndAt: parsedEnd,
      isAllDay,
      fieldErrors,
    };
  }

  // Case 2: All-day task scheduled on a local date
  if (isAllDay) {
    if (!rawScheduledDate) {
      fieldErrors.scheduledDate =
        'Please select a scheduled date for this all-day task.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: true,
        fieldErrors,
      };
    }

    if (!isValidLocalDateString(rawScheduledDate)) {
      fieldErrors.scheduledDate = 'Please provide a valid scheduled date.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: true,
        fieldErrors,
      };
    }

    const effectiveEndDate = rawScheduledEndDate || rawScheduledDate;
    if (!isValidLocalDateString(effectiveEndDate)) {
      fieldErrors.scheduledDate = 'Please provide a valid scheduled end date.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: true,
        fieldErrors,
      };
    }

    if (effectiveEndDate < rawScheduledDate) {
      fieldErrors.scheduledEndTime =
        'Scheduled end date cannot be before the start date.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: true,
        fieldErrors,
      };
    }

    const { startUtc } = getLocalDayUtcBounds(rawScheduledDate, tz);
    const { endUtc } = getLocalDayUtcBounds(effectiveEndDate, tz);

    return {
      hasScheduleInput: true,
      scheduledStartAt: startUtc,
      scheduledEndAt: endUtc,
      isAllDay: true,
      fieldErrors,
    };
  }

  // Case 3: Timed task on calendar grid (scheduledDate + scheduledStartTime + optional scheduledEndTime or durationMinutes)
  if (!rawScheduledDate && !rawStartTime && !rawEndTime) {
    return {
      hasScheduleInput: false,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  if (!rawScheduledDate) {
    fieldErrors.scheduledDate =
      'Please select a scheduled date when setting a scheduled time.';
    return {
      hasScheduleInput: true,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  if (!isValidLocalDateString(rawScheduledDate)) {
    fieldErrors.scheduledDate = 'Please provide a valid scheduled date.';
    return {
      hasScheduleInput: true,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  if (!rawStartTime) {
    fieldErrors.scheduledStartTime =
      'Please select a start time or mark the task as all-day.';
    return {
      hasScheduleInput: true,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  if (!TIME_REGEX.test(rawStartTime)) {
    fieldErrors.scheduledStartTime =
      'Please provide a valid start time (HH:mm).';
    return {
      hasScheduleInput: true,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  const startUtc = combineLocalDateAndTimeToUtc(
    rawScheduledDate,
    rawStartTime,
    tz
  );
  if (!startUtc) {
    fieldErrors.scheduledStartTime =
      'Please provide a valid scheduled start date and time.';
    return {
      hasScheduleInput: true,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      fieldErrors,
    };
  }

  if (rawEndTime) {
    if (!TIME_REGEX.test(rawEndTime)) {
      fieldErrors.scheduledEndTime = 'Please provide a valid end time (HH:mm).';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        fieldErrors,
      };
    }

    const effectiveEndDate = rawScheduledEndDate || rawScheduledDate;
    if (!isValidLocalDateString(effectiveEndDate)) {
      fieldErrors.scheduledEndTime =
        'Please provide a valid scheduled end date.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        fieldErrors,
      };
    }

    const endUtc = combineLocalDateAndTimeToUtc(
      effectiveEndDate,
      rawEndTime,
      tz
    );
    if (!endUtc) {
      fieldErrors.scheduledEndTime =
        'Please provide a valid scheduled end date and time.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        fieldErrors,
      };
    }

    if (endUtc.getTime() <= startUtc.getTime()) {
      fieldErrors.scheduledEndTime =
        'Scheduled end time must be after the start time.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        fieldErrors,
      };
    }

    return {
      hasScheduleInput: true,
      scheduledStartAt: startUtc,
      scheduledEndAt: endUtc,
      isAllDay: false,
      fieldErrors,
    };
  }

  // Fallback to durationMinutes (default 60 minutes)
  let durationMinutes = DEFAULT_SCHEDULE_DURATION_MINUTES;
  if (
    input.durationMinutes !== undefined &&
    input.durationMinutes !== null &&
    input.durationMinutes !== ''
  ) {
    const parsedDuration = Number(input.durationMinutes);
    if (
      !Number.isFinite(parsedDuration) ||
      parsedDuration < 5 ||
      parsedDuration > 1440
    ) {
      fieldErrors.scheduledEndTime =
        'Duration must be between 5 minutes and 24 hours.';
      return {
        hasScheduleInput: true,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        fieldErrors,
      };
    }
    durationMinutes = Math.round(parsedDuration);
  }

  const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000);
  return {
    hasScheduleInput: true,
    scheduledStartAt: startUtc,
    scheduledEndAt: endUtc,
    isAllDay: false,
    fieldErrors,
  };
}

export function validateTaskCreateInput(
  input: TaskMutationInput,
  timezone: string = DEFAULT_TIMEZONE
): ValidationResult<ValidatedTaskCreateData> {
  const fieldErrors: Record<string, string> = {};

  const rawTitle = typeof input.title === 'string' ? input.title.trim() : '';
  if (!rawTitle) {
    fieldErrors.title = 'Please enter a task title.';
  } else if (rawTitle.length > 200) {
    fieldErrors.title = 'Task title must be 200 characters or fewer.';
  }

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') {
      fieldErrors.description = 'Description must be text.';
    } else {
      const trimmedDesc = input.description.trim();
      if (trimmedDesc.length > 2000) {
        fieldErrors.description =
          'Description must be 2,000 characters or fewer.';
      } else {
        description = trimmedDesc.length > 0 ? trimmedDesc : null;
      }
    }
  }

  const rawPriority = input.priority ?? 'medium';
  if (!isValidTaskPriority(rawPriority)) {
    fieldErrors.priority = 'Priority must be Low, Medium, or High.';
  }

  const rawStatus = input.status ?? 'todo';
  if (!isValidTaskStatus(rawStatus)) {
    fieldErrors.status =
      'Status must be To do, In progress, Completed, or Archived.';
  }

  let dueAt: Date | null = null;
  const hasDueDate =
    typeof input.dueDate === 'string' && input.dueDate.trim().length > 0;
  const hasDueTime =
    typeof input.dueTime === 'string' && input.dueTime.trim().length > 0;

  if (hasDueTime && !hasDueDate) {
    fieldErrors.dueDate = 'Please select a due date when setting a due time.';
  } else if (hasDueDate) {
    const combined = combineLocalDateAndTimeToUtc(
      (input.dueDate as string).trim(),
      hasDueTime ? (input.dueTime as string).trim() : null,
      timezone
    );
    if (!combined) {
      fieldErrors.dueDate = 'Please provide a valid due date and time.';
    } else {
      dueAt = combined;
    }
  } else if (typeof input.dueAt === 'string' && input.dueAt.trim().length > 0) {
    const parsed = new Date(input.dueAt);
    if (Number.isNaN(parsed.getTime())) {
      fieldErrors.dueDate = 'Please provide a valid due date.';
    } else {
      dueAt = parsed;
    }
  }

  const parsedSchedule = parseScheduleBlockFromInput(input, timezone);
  Object.assign(fieldErrors, parsedSchedule.fieldErrors);

  if (Object.keys(fieldErrors).length > 0) {
    const firstError =
      Object.values(fieldErrors)[0] || 'Please check your task details.';
    return {
      valid: false,
      error: firstError,
      fieldErrors,
    };
  }

  return {
    valid: true,
    data: {
      title: rawTitle,
      description,
      priority: rawPriority as TaskPriority,
      status: rawStatus as TaskStatus,
      dueAt,
      scheduledStartAt: parsedSchedule.scheduledStartAt,
      scheduledEndAt: parsedSchedule.scheduledEndAt,
      isAllDay: parsedSchedule.isAllDay,
    },
  };
}

export function validateTaskUpdateInput(
  input: TaskMutationInput,
  timezone: string = DEFAULT_TIMEZONE
): ValidationResult<ValidatedTaskUpdateData> {
  const fieldErrors: Record<string, string> = {};
  const data: ValidatedTaskUpdateData = {};

  if (input.title !== undefined) {
    const rawTitle = typeof input.title === 'string' ? input.title.trim() : '';
    if (!rawTitle) {
      fieldErrors.title = 'Please enter a task title.';
    } else if (rawTitle.length > 200) {
      fieldErrors.title = 'Task title must be 200 characters or fewer.';
    } else {
      data.title = rawTitle;
    }
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      data.description = null;
    } else if (typeof input.description !== 'string') {
      fieldErrors.description = 'Description must be text.';
    } else {
      const trimmedDesc = input.description.trim();
      if (trimmedDesc.length > 2000) {
        fieldErrors.description =
          'Description must be 2,000 characters or fewer.';
      } else {
        data.description = trimmedDesc.length > 0 ? trimmedDesc : null;
      }
    }
  }

  if (input.priority !== undefined) {
    if (!isValidTaskPriority(input.priority)) {
      fieldErrors.priority = 'Priority must be Low, Medium, or High.';
    } else {
      data.priority = input.priority;
    }
  }

  if (input.status !== undefined) {
    if (!isValidTaskStatus(input.status)) {
      fieldErrors.status =
        'Status must be To do, In progress, Completed, or Archived.';
    } else {
      data.status = input.status;
    }
  }

  if (input.dueDate !== undefined || input.dueTime !== undefined) {
    const rawDate =
      typeof input.dueDate === 'string' ? input.dueDate.trim() : '';
    const rawTime =
      typeof input.dueTime === 'string' ? input.dueTime.trim() : '';

    if (!rawDate && !rawTime) {
      data.dueAt = null;
    } else if (rawTime && !rawDate) {
      fieldErrors.dueDate = 'Please select a due date when setting a due time.';
    } else {
      const combined = combineLocalDateAndTimeToUtc(
        rawDate,
        rawTime || null,
        timezone
      );
      if (!combined) {
        fieldErrors.dueDate = 'Please provide a valid due date and time.';
      } else {
        data.dueAt = combined;
      }
    }
  } else if (input.dueAt !== undefined) {
    if (input.dueAt === null || input.dueAt === '') {
      data.dueAt = null;
    } else if (typeof input.dueAt === 'string') {
      const parsed = new Date(input.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        fieldErrors.dueDate = 'Please provide a valid due date.';
      } else {
        data.dueAt = parsed;
      }
    }
  }

  const parsedSchedule = parseScheduleBlockFromInput(input, timezone);
  Object.assign(fieldErrors, parsedSchedule.fieldErrors);
  if (
    parsedSchedule.hasScheduleInput &&
    Object.keys(parsedSchedule.fieldErrors).length === 0
  ) {
    data.scheduledStartAt = parsedSchedule.scheduledStartAt;
    data.scheduledEndAt = parsedSchedule.scheduledEndAt;
    data.isAllDay = parsedSchedule.isAllDay;
  }

  if (Object.keys(fieldErrors).length > 0) {
    const firstError =
      Object.values(fieldErrors)[0] || 'Please check your task details.';
    return {
      valid: false,
      error: firstError,
      fieldErrors,
    };
  }

  if (Object.keys(data).length === 0) {
    return {
      valid: false,
      error: 'No task fields were provided to update.',
    };
  }

  return {
    valid: true,
    data,
  };
}

export function resolveCompletedAtForStatusChange(
  previousStatus: TaskStatus,
  nextStatus: TaskStatus,
  previousCompletedAt: Date | null,
  now: Date = new Date()
): Date | null {
  if (nextStatus === 'completed') {
    return previousStatus === 'completed' && previousCompletedAt
      ? previousCompletedAt
      : now;
  }
  if (nextStatus === 'todo' || nextStatus === 'in_progress') {
    return null;
  }
  return previousCompletedAt;
}

export function serializeTaskRow(
  row: TaskRow,
  options?: {
    timezone?: string;
    now?: Date;
    googleMapping?: {
      googleEventId: string;
      googleHtmlLink?: string | null;
    } | null;
  }
): SerializedTaskItem {
  const tz = resolveValidTimezone(options?.timezone);
  const now = options?.now ?? new Date();
  const todayLocalDate = getLocalDateString(now, tz);
  const tomorrowLocalDate = shiftLocalDateString(todayLocalDate, 1);
  const currentYear = todayLocalDate.split('-')[0] ?? '2026';
  const { startUtc: todayStartUtc, endUtc: todayEndUtc } =
    getLocalDayUtcBounds(todayLocalDate, tz);

  const status: TaskStatus = isValidTaskStatus(row.status)
    ? row.status
    : 'todo';
  const priority: TaskPriority = isValidTaskPriority(row.priority)
    ? row.priority
    : 'medium';

  const { dueDate, dueTime } = extractLocalDateAndTime(row.dueAt, tz);
  const dueMs = row.dueAt ? new Date(row.dueAt).getTime() : null;
  const nowMs = now.getTime();

  const isDueToday =
    dueMs !== null &&
    dueMs >= todayStartUtc.getTime() &&
    dueMs < todayEndUtc.getTime();

  const isOverdue =
    dueMs !== null &&
    dueMs < nowMs &&
    status !== 'completed' &&
    status !== 'archived';

  let dueDateLabel: string | null = null;
  let dueFullDateLabel: string | null = null;
  if (row.dueAt && dueDate) {
    if (dueDate === todayLocalDate) {
      dueDateLabel = 'Today';
    } else if (dueDate === tomorrowLocalDate) {
      dueDateLabel = 'Tomorrow';
    } else {
      dueDateLabel = formatMonthDayShort(dueDate, currentYear);
    }
    dueFullDateLabel =
      formatDashboardDate(new Date(row.dueAt), tz) ||
      formatShortDate(dueDate, tz);
  }

  const dueTimeLabel =
    row.dueAt && dueTime ? formatLocalTime(row.dueAt, tz) : null;

  const dueDisplayLabel = dueDateLabel
    ? dueTimeLabel
      ? `${dueDateLabel}, ${dueTimeLabel}`
      : dueDateLabel
    : null;

  // Scheduled time fields (Phase 4B)
  const isAllDay = Boolean(row.isAllDay);
  const scheduledStartDateObj = row.scheduledStartAt
    ? new Date(row.scheduledStartAt)
    : null;
  const scheduledEndDateObj = row.scheduledEndAt
    ? new Date(row.scheduledEndAt)
    : null;

  let scheduledDate: string | null = null;
  let scheduledEndDate: string | null = null;
  let scheduledStartTime: string | null = null;
  let scheduledEndTime: string | null = null;
  let durationMinutes: number | null = null;
  let scheduleDisplayLabel: string | null = null;

  if (
    scheduledStartDateObj &&
    scheduledEndDateObj &&
    !Number.isNaN(scheduledStartDateObj.getTime()) &&
    !Number.isNaN(scheduledEndDateObj.getTime())
  ) {
    const extractedStart = extractLocalDateAndExactTime(
      scheduledStartDateObj,
      tz
    );
    scheduledDate = extractedStart.localDate;

    if (isAllDay) {
      // For all-day events, scheduledEndAt is the exclusive start of the next local day
      const inclusiveEndMs = Math.max(
        scheduledStartDateObj.getTime(),
        scheduledEndDateObj.getTime() - 60_000
      );
      scheduledEndDate = getLocalDateString(new Date(inclusiveEndMs), tz);
      const dayBadge =
        scheduledDate === todayLocalDate
          ? 'Today'
          : scheduledDate === tomorrowLocalDate
            ? 'Tomorrow'
            : scheduledDate
              ? formatMonthDayShort(scheduledDate, currentYear)
              : '';
      scheduleDisplayLabel = dayBadge ? `${dayBadge} · All day` : 'All day';
    } else {
      const extractedEnd = extractLocalDateAndExactTime(
        scheduledEndDateObj,
        tz
      );
      scheduledEndDate = extractedEnd.localDate;
      scheduledStartTime = extractedStart.localTime;
      scheduledEndTime = extractedEnd.localTime;
      durationMinutes = Math.max(
        5,
        Math.round(
          (scheduledEndDateObj.getTime() - scheduledStartDateObj.getTime()) /
            60_000
        )
      );

      const startLabel = formatLocalTime(scheduledStartDateObj, tz);
      const endLabel = formatLocalTime(scheduledEndDateObj, tz);
      const dayBadge =
        scheduledDate === todayLocalDate
          ? 'Today'
          : scheduledDate === tomorrowLocalDate
            ? 'Tomorrow'
            : scheduledDate
              ? formatMonthDayShort(scheduledDate, currentYear)
              : '';

      if (dayBadge && startLabel && endLabel) {
        scheduleDisplayLabel = `${dayBadge} · ${startLabel} – ${endLabel}`;
      } else if (startLabel && endLabel) {
        scheduleDisplayLabel = `${startLabel} – ${endLabel}`;
      }
    }
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status,
    priority,
    dueAt: row.dueAt ? new Date(row.dueAt).toISOString() : null,
    dueDate,
    dueTime,
    dueDateLabel,
    dueFullDateLabel,
    dueTimeLabel,
    dueDisplayLabel,
    scheduledStartAt: scheduledStartDateObj
      ? scheduledStartDateObj.toISOString()
      : null,
    scheduledEndAt: scheduledEndDateObj
      ? scheduledEndDateObj.toISOString()
      : null,
    isAllDay,
    scheduledDate,
    scheduledEndDate,
    scheduledStartTime,
    scheduledEndTime,
    durationMinutes,
    scheduleDisplayLabel,
    googleEventId: options?.googleMapping?.googleEventId ?? null,
    googleHtmlLink: options?.googleMapping?.googleHtmlLink ?? null,
    isOverdue,
    isDueToday,
    completedAt: row.completedAt
      ? new Date(row.completedAt).toISOString()
      : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    createdAtLabel: formatDateTimeTimestamp(row.createdAt, tz),
    updatedAtLabel: formatDateTimeTimestamp(row.updatedAt, tz),
  };
}

export function computeTaskSummaryMetrics(
  items: SerializedTaskItem[]
): TaskSummaryMetrics {
  let todoCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;
  let overdueCount = 0;
  let dueTodayCount = 0;
  let archivedCount = 0;

  for (const item of items) {
    if (item.status === 'archived') {
      archivedCount += 1;
      continue;
    }
    if (item.status === 'completed') {
      completedCount += 1;
    } else if (item.status === 'in_progress') {
      inProgressCount += 1;
      if (item.isOverdue) overdueCount += 1;
    } else {
      todoCount += 1;
      if (item.isOverdue) overdueCount += 1;
    }

    if (item.isDueToday) {
      dueTodayCount += 1;
    }
  }

  const totalActiveCount = todoCount + inProgressCount;
  const totalCount = totalActiveCount + completedCount;
  const completionRatePercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    totalCount,
    totalActiveCount,
    todoCount,
    inProgressCount,
    completedCount,
    overdueCount,
    dueTodayCount,
    archivedCount,
    completionRatePercent,
  };
}

const PRIORITY_SORT_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function filterAndSortTasks(
  items: SerializedTaskItem[],
  filters: TaskListFilters = {},
  options?: {
    timezone?: string;
    now?: Date;
  }
): SerializedTaskItem[] {
  const tz = resolveValidTimezone(options?.timezone);
  const now = options?.now ?? new Date();
  const todayLocalDate = getLocalDateString(now, tz);
  const { endUtc: todayEndUtc } = getLocalDayUtcBounds(todayLocalDate, tz);

  const searchQuery = (filters.search ?? '').trim().toLowerCase();
  const statusFilter = filters.status ?? 'all';
  const priorityFilter = filters.priority ?? 'all';
  const scheduleFilter = filters.schedule ?? 'all';
  const sortBy = filters.sortBy ?? 'due_date';

  const filtered = items.filter((item) => {
    if (statusFilter === 'archived') {
      if (item.status !== 'archived') return false;
    } else if (statusFilter === 'all') {
      if (item.status === 'archived') return false;
    } else {
      if (item.status !== statusFilter) return false;
    }

    if (priorityFilter !== 'all' && item.priority !== priorityFilter) {
      return false;
    }

    if (searchQuery.length > 0) {
      const matchesTitle = item.title.toLowerCase().includes(searchQuery);
      const matchesDesc =
        item.description?.toLowerCase().includes(searchQuery) ?? false;
      if (!matchesTitle && !matchesDesc) return false;
    }

    if (scheduleFilter === 'overdue') {
      if (!item.isOverdue) return false;
    } else if (scheduleFilter === 'due_today') {
      if (!item.isDueToday || item.status === 'archived') return false;
    } else if (scheduleFilter === 'upcoming') {
      if (item.status === 'completed' || item.status === 'archived') {
        return false;
      }
      if (!item.dueAt) return false;
      const dueMs = new Date(item.dueAt).getTime();
      if (dueMs < todayEndUtc.getTime()) return false;
    } else if (scheduleFilter === 'completed') {
      if (item.status !== 'completed') return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (statusFilter === 'all' && scheduleFilter !== 'completed') {
      const aDone = a.status === 'completed' ? 1 : 0;
      const bDone = b.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
    }

    if (sortBy === 'priority') {
      const pDiff =
        PRIORITY_SORT_RANK[a.priority] - PRIORITY_SORT_RANK[b.priority];
      if (pDiff !== 0) return pDiff;
      const aDue = a.dueAt
        ? new Date(a.dueAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueAt
        ? new Date(b.dueAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    if (sortBy === 'created_at') {
      const cDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (cDiff !== 0) return cDiff;
      return PRIORITY_SORT_RANK[a.priority] - PRIORITY_SORT_RANK[b.priority];
    }

    const aDue = a.dueAt
      ? new Date(a.dueAt).getTime()
      : a.scheduledStartAt
        ? new Date(a.scheduledStartAt).getTime()
        : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt
      ? new Date(b.dueAt).getTime()
      : b.scheduledStartAt
        ? new Date(b.scheduledStartAt).getTime()
        : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;

    const pDiff =
      PRIORITY_SORT_RANK[a.priority] - PRIORITY_SORT_RANK[b.priority];
    if (pDiff !== 0) return pDiff;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (filters.limit && filters.limit > 0) {
    return sorted.slice(0, filters.limit);
  }

  return sorted;
}
