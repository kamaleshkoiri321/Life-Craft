import {
  DEFAULT_TIMEZONE,
  getLocalDateString,
  resolveValidTimezone,
  shiftLocalDateString,
} from '../queries/timezone';
import type { HabitLogRow, HabitRow } from '../db/schema';

export type HabitLogStatus = 'completed' | 'skipped';
export type HabitCheckInAction = 'completed' | 'skipped' | 'undo';

export const HABIT_TITLE_MAX_LENGTH = 100;
export const HABIT_DESCRIPTION_MAX_LENGTH = 500;

export type HabitFilterTab = 'all' | 'due_today' | 'completed' | 'archived';

export type HabitIconKey =
  | 'water'
  | 'exercise'
  | 'book'
  | 'journal'
  | 'code'
  | 'leaf';

export interface WeekdayMeta {
  isoDay: number; // 1 = Mon ... 7 = Sun
  shortLabel: string; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  fullLabel: string;
}

export const ISO_WEEKDAYS: WeekdayMeta[] = [
  { isoDay: 1, shortLabel: 'Mon', fullLabel: 'Monday' },
  { isoDay: 2, shortLabel: 'Tue', fullLabel: 'Tuesday' },
  { isoDay: 3, shortLabel: 'Wed', fullLabel: 'Wednesday' },
  { isoDay: 4, shortLabel: 'Thu', fullLabel: 'Thursday' },
  { isoDay: 5, shortLabel: 'Fri', fullLabel: 'Friday' },
  { isoDay: 6, shortLabel: 'Sat', fullLabel: 'Saturday' },
  { isoDay: 7, shortLabel: 'Sun', fullLabel: 'Sunday' },
];

export function isValidLocalDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Returns the ISO weekday (1 = Monday ... 7 = Sunday) for a local calendar date `YYYY-MM-DD`.
 * Uses UTC noon so timezone offsets never shift the calendar day.
 */
export function getIsoWeekday(localDateStr: string): number {
  const [y, m, d] = localDateStr.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

/**
 * Returns the Monday..Sunday date keys (`YYYY-MM-DD`) for the ISO week containing `anchorDateStr`.
 */
export function getIsoWeekDateKeys(anchorDateStr: string): string[] {
  const isoDay = getIsoWeekday(anchorDateStr);
  const mondayDateStr = shiftLocalDateString(anchorDateStr, -(isoDay - 1));
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(shiftLocalDateString(mondayDateStr, i));
  }
  return days;
}

/**
 * Normalizes an optional list of ISO weekday numbers (1..7) into a sorted, unique array,
 * or null if empty / not provided.
 */
export function normalizeScheduledDays(
  input: unknown
): { valid: true; days: number[] | null } | { valid: false; error: string } {
  if (input === null || input === undefined) {
    return { valid: true, days: null };
  }
  if (!Array.isArray(input)) {
    return {
      valid: false,
      error: 'Schedule weekdays must be an array of weekday numbers (1–7).',
    };
  }
  if (input.length === 0) {
    return { valid: true, days: null };
  }

  const uniqueSet = new Set<number>();
  for (const item of input) {
    const num = typeof item === 'number' ? item : Number(item);
    if (!Number.isInteger(num) || num < 1 || num > 7) {
      return {
        valid: false,
        error: 'Each scheduled weekday must be an integer between 1 (Mon) and 7 (Sun).',
      };
    }
    uniqueSet.add(num);
  }

  const sorted = Array.from(uniqueSet).sort((a, b) => a - b);
  return { valid: true, days: sorted };
}

export interface ValidatedHabitCreateInput {
  title: string;
  description: string | null;
  targetPerWeek: number;
  scheduledDays: number[] | null;
  isActive: boolean;
}

export function validateHabitCreateInput(
  raw: Record<string, unknown>
):
  | { valid: true; data: ValidatedHabitCreateInput }
  | { valid: false; error: string } {
  const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!rawTitle) {
    return { valid: false, error: 'Habit name is required.' };
  }
  if (rawTitle.length > 100) {
    return {
      valid: false,
      error: 'Habit name must be 100 characters or fewer.',
    };
  }

  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== 'string') {
      return { valid: false, error: 'Description must be text.' };
    }
    const trimmedDesc = raw.description.trim();
    if (trimmedDesc.length > 500) {
      return {
        valid: false,
        error: 'Description must be 500 characters or fewer.',
      };
    }
    description = trimmedDesc.length > 0 ? trimmedDesc : null;
  }

  const scheduleCheck = normalizeScheduledDays(raw.scheduledDays);
  if (!scheduleCheck.valid) {
    return { valid: false, error: scheduleCheck.error };
  }
  const scheduledDays = scheduleCheck.days;

  let targetPerWeek = 5;
  if (raw.targetPerWeek !== undefined && raw.targetPerWeek !== null) {
    const parsedTarget =
      typeof raw.targetPerWeek === 'number'
        ? raw.targetPerWeek
        : Number(raw.targetPerWeek);
    if (
      !Number.isInteger(parsedTarget) ||
      parsedTarget < 1 ||
      parsedTarget > 7
    ) {
      return {
        valid: false,
        error: 'Weekly target must be an integer from 1 to 7 days per week.',
      };
    }
    targetPerWeek = parsedTarget;
  } else if (scheduledDays && scheduledDays.length > 0) {
    targetPerWeek = scheduledDays.length;
  }

  // If specific weekdays are selected and targetPerWeek exceeds the number of selected weekdays,
  // align targetPerWeek to the selected weekday count so weekly targets remain achievable.
  if (scheduledDays && scheduledDays.length > 0 && targetPerWeek > scheduledDays.length) {
    targetPerWeek = scheduledDays.length;
  }

  const isActive =
    typeof raw.isActive === 'boolean' ? raw.isActive : true;

  return {
    valid: true,
    data: {
      title: rawTitle,
      description,
      targetPerWeek,
      scheduledDays,
      isActive,
    },
  };
}

export interface ValidatedHabitUpdateInput {
  title?: string;
  description?: string | null;
  targetPerWeek?: number;
  scheduledDays?: number[] | null;
  isActive?: boolean;
}

export function validateHabitUpdateInput(
  raw: Record<string, unknown>
):
  | { valid: true; data: ValidatedHabitUpdateInput }
  | { valid: false; error: string } {
  const data: ValidatedHabitUpdateInput = {};

  if ('title' in raw) {
    const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!rawTitle) {
      return { valid: false, error: 'Habit name cannot be empty.' };
    }
    if (rawTitle.length > 100) {
      return {
        valid: false,
        error: 'Habit name must be 100 characters or fewer.',
      };
    }
    data.title = rawTitle;
  }

  if ('description' in raw) {
    if (raw.description === null || raw.description === '') {
      data.description = null;
    } else if (typeof raw.description === 'string') {
      const trimmed = raw.description.trim();
      if (trimmed.length > 500) {
        return {
          valid: false,
          error: 'Description must be 500 characters or fewer.',
        };
      }
      data.description = trimmed.length > 0 ? trimmed : null;
    } else {
      return { valid: false, error: 'Description must be text.' };
    }
  }

  if ('scheduledDays' in raw) {
    const scheduleCheck = normalizeScheduledDays(raw.scheduledDays);
    if (!scheduleCheck.valid) {
      return { valid: false, error: scheduleCheck.error };
    }
    data.scheduledDays = scheduleCheck.days;
  }

  if ('targetPerWeek' in raw) {
    const parsedTarget =
      typeof raw.targetPerWeek === 'number'
        ? raw.targetPerWeek
        : Number(raw.targetPerWeek);
    if (
      !Number.isInteger(parsedTarget) ||
      parsedTarget < 1 ||
      parsedTarget > 7
    ) {
      return {
        valid: false,
        error: 'Weekly target must be an integer from 1 to 7 days per week.',
      };
    }
    data.targetPerWeek = parsedTarget;
  }

  if (
    data.scheduledDays &&
    data.scheduledDays.length > 0 &&
    data.targetPerWeek !== undefined &&
    data.targetPerWeek > data.scheduledDays.length
  ) {
    data.targetPerWeek = data.scheduledDays.length;
  }

  if ('isActive' in raw) {
    if (typeof raw.isActive !== 'boolean') {
      return { valid: false, error: 'isActive must be a boolean.' };
    }
    data.isActive = raw.isActive;
  }

  if (Object.keys(data).length === 0) {
    return { valid: false, error: 'No valid habit fields provided to update.' };
  }

  return { valid: true, data };
}

export function shiftDateKeyByDays(
  localDateStr: string,
  deltaDays: number
): string {
  return shiftLocalDateString(localDateStr, deltaDays);
}

export function validateHabitCheckInInput(
  raw: Record<string, unknown>,
  defaultDateStr: string
):
  | {
      valid: true;
      data: {
        date: string;
        action: 'completed' | 'skipped' | 'undo';
      };
    }
  | { valid: false; error: string } {
  const dateStr =
    typeof raw.date === 'string' && raw.date.trim()
      ? raw.date.trim()
      : typeof raw.dateKey === 'string' && raw.dateKey.trim()
        ? raw.dateKey.trim()
        : defaultDateStr;

  if (!isValidLocalDateString(dateStr)) {
    return {
      valid: false,
      error: 'Check-in date must be a valid YYYY-MM-DD local calendar date.',
    };
  }

  const rawAction =
    typeof raw.status === 'string'
      ? raw.status.trim().toLowerCase()
      : typeof raw.action === 'string'
        ? raw.action.trim().toLowerCase()
        : 'completed';

  if (
    rawAction !== 'completed' &&
    rawAction !== 'skipped' &&
    rawAction !== 'undo'
  ) {
    return {
      valid: false,
      error: "Check-in status must be 'completed', 'skipped', or 'undo'.",
    };
  }

  return {
    valid: true,
    data: {
      date: dateStr,
      action: rawAction,
    },
  };
}

/**
 * Infers a tasteful icon key for a habit from its title so each habit row
 * displays an intuitive domain icon (water, exercise, book, journal, code, leaf).
 */
export function resolveHabitIconKey(title: string): HabitIconKey {
  const lower = title.toLowerCase();
  if (
    lower.includes('water') ||
    lower.includes('hydrat') ||
    lower.includes('drink')
  ) {
    return 'water';
  }
  if (
    lower.includes('exercise') ||
    lower.includes('workout') ||
    lower.includes('gym') ||
    lower.includes('run') ||
    lower.includes('walk') ||
    lower.includes('stretch') ||
    lower.includes('yoga')
  ) {
    return 'exercise';
  }
  if (
    lower.includes('read') ||
    lower.includes('book') ||
    lower.includes('study') ||
    lower.includes('learn')
  ) {
    return 'book';
  }
  if (
    lower.includes('journal') ||
    lower.includes('write') ||
    lower.includes('reflect') ||
    lower.includes('diary') ||
    lower.includes('meditat')
  ) {
    return 'journal';
  }
  if (
    lower.includes('code') ||
    lower.includes('python') ||
    lower.includes('typescript') ||
    lower.includes('program') ||
    lower.includes('leetcode') ||
    lower.includes('practise') ||
    lower.includes('practice')
  ) {
    return 'code';
  }
  return 'leaf';
}

/**
 * Determines whether a habit is scheduled on a specific ISO weekday (1=Mon..7=Sun).
 * If `scheduledDays` is null or empty, the habit is flexible across all 7 weekdays
 * up to `targetPerWeek`.
 */
export function isHabitScheduledOnWeekday(
  habit: Pick<HabitRow, 'scheduledDays' | 'targetPerWeek'>,
  isoWeekday: number
): boolean {
  if (habit.scheduledDays && habit.scheduledDays.length > 0) {
    return habit.scheduledDays.includes(isoWeekday);
  }
  return true;
}

/**
 * Determines whether an active habit is due on `targetDateStr` (`YYYY-MM-DD`).
 *
 * Rules:
 * - Archived/paused habits (`!isActive`) are not due.
 * - If specific weekdays (`scheduledDays`) are configured, the habit is due on
 *   `targetDateStr` if and only if `getIsoWeekday(targetDateStr)` is in `scheduledDays`.
 * - If no specific weekdays are configured (flexible weekly target `targetPerWeek`),
 *   the habit is due on `targetDateStr` if it was already logged on `targetDateStr`
 *   OR if the number of completed logs in the same ISO week (excluding `targetDateStr`)
 *   is still less than `targetPerWeek`.
 */
export function isHabitDueOnDate(
  habit: Pick<HabitRow, 'isActive' | 'scheduledDays' | 'targetPerWeek'>,
  targetDateStr: string,
  logsByDate: ReadonlyMap<string, HabitLogStatus>
): boolean {
  if (!habit.isActive) return false;

  const isoWeekday = getIsoWeekday(targetDateStr);
  if (habit.scheduledDays && habit.scheduledDays.length > 0) {
    return habit.scheduledDays.includes(isoWeekday);
  }

  // Flexible weekly target mode
  if (logsByDate.get(targetDateStr) === 'completed') {
    return true;
  }

  const weekDates = getIsoWeekDateKeys(targetDateStr);
  let completedOtherDaysThisWeek = 0;
  for (const d of weekDates) {
    if (d !== targetDateStr && logsByDate.get(d) === 'completed') {
      completedOtherDaysThisWeek += 1;
    }
  }

  return completedOtherDaysThisWeek < habit.targetPerWeek;
}

export interface HabitStreakResult {
  currentStreak: number;
  bestStreak: number;
  completionRate30d: number | null;
  totalCompletedCount: number;
}

/**
 * Calculates genuine `currentStreak`, `bestStreak`, and 30-day completion rate
 * from real habit schedule and `habit_logs` records.
 *
 * Definitions:
 * 1. **Weekday-Specific Habits (`scheduledDays` has 1–7 weekdays)**:
 *    - Evaluates each scheduled calendar occurrence from `startDateKey` (the earlier of
 *      the habit's creation local date or its earliest log date, capped at 365 days back)
 *      up to `todayLocalDate`.
 *    - Only scheduled occurrences with `status === 'completed'` increment the streak.
 *    - Unscheduled weekdays are ignored and never break a streak.
 *    - Any past scheduled occurrence (`date < todayLocalDate`) without `'completed'`
 *      (including `'skipped'` or unlogged) breaks the streak (`streak = 0`).
 *    - On `todayLocalDate`:
 *      - If `'completed'`, increments the streak by 1.
 *      - If `'skipped'`, resets `currentStreak` to 0.
 *      - If unlogged (incomplete habit due later today), preserves the streak accrued
 *        through the previous scheduled occurrence without breaking it prematurely.
 * 2. **Flexible Weekly-Target Habits (`scheduledDays` is null)**:
 *    - Evaluates consecutive completed days up to `todayLocalDate`, where unscheduled
 *      buffer days within an ISO week (up to `7 - targetPerWeek` rest days per week)
 *      do not break the streak as long as the weekly target or remaining days in the
 *      week can still meet `targetPerWeek`, while explicit `'skipped'` days do not
 *      count as completed and break the consecutive day chain if no completion occurs.
 */
export function calculateHabitStreaksAndRate(params: {
  habit: Pick<
    HabitRow,
    'scheduledDays' | 'targetPerWeek' | 'createdAt'
  >;
  logs: Array<Pick<HabitLogRow, 'completedOn' | 'status'>>;
  todayLocalDate: string;
  timezone?: string;
}): HabitStreakResult {
  const tz = resolveValidTimezone(params.timezone || DEFAULT_TIMEZONE);
  const { habit, logs, todayLocalDate } = params;

  const logsByDate = new Map<string, HabitLogStatus>();
  let earliestLogDate: string | null = null;
  let totalCompletedCount = 0;

  for (const log of logs) {
    const status: HabitLogStatus =
      log.status === 'skipped' ? 'skipped' : 'completed';
    logsByDate.set(log.completedOn, status);
    if (status === 'completed') {
      totalCompletedCount += 1;
    }
    if (!earliestLogDate || log.completedOn < earliestLogDate) {
      earliestLogDate = log.completedOn;
    }
  }

  const createdLocalDate = habit.createdAt
    ? getLocalDateString(new Date(habit.createdAt), tz)
    : todayLocalDate;

  const minLookbackDate = shiftLocalDateString(todayLocalDate, -365);
  let startDateKey =
    earliestLogDate && earliestLogDate < createdLocalDate
      ? earliestLogDate
      : createdLocalDate;
  if (startDateKey < minLookbackDate) {
    startDateKey = minLookbackDate;
  }
  if (startDateKey > todayLocalDate) {
    startDateKey = todayLocalDate;
  }

  const hasSpecificWeekdays =
    Array.isArray(habit.scheduledDays) && habit.scheduledDays.length > 0;
  const scheduledSet = new Set<number>(
    hasSpecificWeekdays ? habit.scheduledDays! : [1, 2, 3, 4, 5, 6, 7]
  );
  const allowedRestDaysPerWeek = hasSpecificWeekdays
    ? 0
    : Math.max(0, 7 - habit.targetPerWeek);

  let runningStreak = 0;
  let bestStreak = 0;

  // Track rest days used per ISO week Monday key when in flexible weekly mode
  const restDaysUsedByWeek = new Map<string, number>();

  let cursor = startDateKey;
  while (cursor <= todayLocalDate) {
    const isoDay = getIsoWeekday(cursor);
    const isScheduledWeekday = scheduledSet.has(isoDay);
    const status = logsByDate.get(cursor);

    if (status === 'completed') {
      // Completed on scheduled day (or any day in flexible mode)
      if (isScheduledWeekday || !hasSpecificWeekdays) {
        runningStreak += 1;
        if (runningStreak > bestStreak) {
          bestStreak = runningStreak;
        }
      }
    } else if (status === 'skipped') {
      // Explicitly skipped scheduled day does not count as completed and breaks consecutive streak
      if (isScheduledWeekday) {
        runningStreak = 0;
      }
    } else {
      // Unlogged day
      if (cursor === todayLocalDate) {
        // Incomplete habit due later today does not immediately break existing streak
      } else if (isScheduledWeekday) {
        if (!hasSpecificWeekdays && allowedRestDaysPerWeek > 0) {
          const weekMonday = shiftLocalDateString(cursor, -(isoDay - 1));
          const usedRest = restDaysUsedByWeek.get(weekMonday) ?? 0;
          if (usedRest < allowedRestDaysPerWeek) {
            restDaysUsedByWeek.set(weekMonday, usedRest + 1);
          } else {
            runningStreak = 0;
          }
        } else {
          runningStreak = 0;
        }
      }
    }

    cursor = shiftLocalDateString(cursor, 1);
  }

  const currentStreak = runningStreak;

  // Calculate 30-day completion rate over eligible scheduled occurrences up to todayLocalDate
  const window30Start = shiftLocalDateString(todayLocalDate, -29);
  const effectiveRateStart =
    startDateKey > window30Start ? startDateKey : window30Start;

  let eligibleCount = 0;
  let completedEligibleCount = 0;
  let rateCursor = effectiveRateStart;

  while (rateCursor <= todayLocalDate) {
    const isoDay = getIsoWeekday(rateCursor);
    const isScheduled = scheduledSet.has(isoDay);
    const status = logsByDate.get(rateCursor);

    if (isScheduled) {
      if (rateCursor < todayLocalDate || status === 'completed' || status === 'skipped') {
        eligibleCount += 1;
        if (status === 'completed') {
          completedEligibleCount += 1;
        }
      }
    } else if (status === 'completed') {
      eligibleCount += 1;
      completedEligibleCount += 1;
    }

    rateCursor = shiftLocalDateString(rateCursor, 1);
  }

  const completionRate30d =
    eligibleCount > 0
      ? Math.min(100, Math.round((completedEligibleCount / eligibleCount) * 100))
      : null;

  return {
    currentStreak,
    bestStreak,
    completionRate30d,
    totalCompletedCount,
  };
}

export interface HabitWeekDayCell {
  dateKey: string;
  isoWeekday: number;
  shortLabel: string;
  isScheduled: boolean;
  isToday: boolean;
  isSelectedDate: boolean;
  status: HabitLogStatus | null;
}

export interface HabitHeatmapCell {
  dateKey: string;
  isoWeekday: number;
  shortLabel: string;
  formattedDate: string;
  state: 'completed' | 'skipped' | 'missed' | 'upcoming' | 'not_scheduled';
}

export interface HabitHistoryEntry {
  dateKey: string;
  formattedDate: string;
  weekdayLabel: string;
  isScheduled: boolean;
  status: HabitLogStatus | null;
  updatedAtLabel: string | null;
}

export interface SerializedHabitItem {
  id: string;
  title: string;
  description: string | null;
  iconKey: HabitIconKey;
  targetPerWeek: number;
  scheduledDays: number[]; // Always 1..7 array for UI rendering (if DB null, [1..7])
  hasCustomSchedule: boolean;
  isActive: boolean;
  isDueOnSelectedDate: boolean;
  selectedDateStatus: HabitLogStatus | null;
  selectedDateCompletedAtLabel: string | null;
  completedThisWeek: number;
  scheduledThisWeek: number;
  remainingThisWeek: number;
  weeklyProgressPercent: number;
  currentStreak: number;
  bestStreak: number;
  completionRate30d: number | null;
  totalCompletedCount: number;
  weekDays: HabitWeekDayCell[];
  heatmapWeeks: HabitHeatmapCell[][]; // 12 columns (weeks), each with 7 cells (Mon..Sun)
  recentHistory: HabitHistoryEntry[]; // Last 14 days up to todayLocalDate
  createdAt: string;
  updatedAt: string;
}

export interface HabitsSummaryMetrics {
  activeHabitsCount: number;
  archivedHabitsCount: number;
  dueOnSelectedDateCount: number;
  completedOnSelectedDateCount: number;
  remainingOnSelectedDateCount: number;
  topCurrentStreak: number;
  topBestStreak: number;
}

export interface WeeklyHabitChartBar {
  dateKey: string;
  isoWeekday: number;
  dayLabel: string;
  fullDateLabel: string;
  completedCount: number;
  targetCount: number;
  isToday: boolean;
  isSelected: boolean;
}

export type HabitViewItem = SerializedHabitItem;

export function formatHabitDateHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dt);
}

function formatReadableDateLabel(dateKey: string): string {
  return formatHabitDateHeader(dateKey);
}

/**
 * Builds the complete `SerializedHabitItem` list, summary metrics, and 7-day
 * weekly progress chart for the Habits & Routines view.
 */
export function buildHabitsViewModel(params: {
  habits: HabitRow[];
  logs: HabitLogRow[];
  selectedDate: string;
  weekAnchorDate?: string;
  todayLocalDate: string;
  timezone?: string;
}): {
  selectedDate: string;
  selectedDateLabel: string;
  weekStartDate: string;
  weekEndDate: string;
  weekRangeLabel: string;
  isCurrentWeek: boolean;
  summary: HabitsSummaryMetrics;
  habits: SerializedHabitItem[];
  weeklyChart: WeeklyHabitChartBar[];
} {
  const tz = resolveValidTimezone(params.timezone || DEFAULT_TIMEZONE);
  const todayLocalDate = params.todayLocalDate;
  const selectedDate = isValidLocalDateString(params.selectedDate)
    ? params.selectedDate
    : todayLocalDate;
  const weekAnchor = isValidLocalDateString(params.weekAnchorDate)
    ? params.weekAnchorDate!
    : selectedDate;

  const weekDateKeys = getIsoWeekDateKeys(weekAnchor);
  const weekStartDate = weekDateKeys[0];
  const weekEndDate = weekDateKeys[6];
  const todayWeekKeys = getIsoWeekDateKeys(todayLocalDate);
  const isCurrentWeek = weekStartDate === todayWeekKeys[0];

  // Group logs by habitId
  const logsByHabitId = new Map<string, HabitLogRow[]>();
  for (const log of params.logs) {
    const list = logsByHabitId.get(log.habitId) ?? [];
    list.push(log);
    logsByHabitId.set(log.habitId, list);
  }

  // Build 12-week heatmap Monday start (11 weeks before current week's Monday)
  const currentWeekMonday = todayWeekKeys[0];
  const heatmapStartMonday = shiftLocalDateString(currentWeekMonday, -11 * 7);

  const serializedHabits: SerializedHabitItem[] = params.habits.map((habit) => {
    const habitLogsList = logsByHabitId.get(habit.id) ?? [];
    const logsByDate = new Map<string, HabitLogStatus>();
    const logRowByDate = new Map<string, HabitLogRow>();

    for (const l of habitLogsList) {
      const st: HabitLogStatus =
        l.status === 'skipped' ? 'skipped' : 'completed';
      logsByDate.set(l.completedOn, st);
      logRowByDate.set(l.completedOn, l);
    }

    const hasCustomSchedule =
      Array.isArray(habit.scheduledDays) && habit.scheduledDays.length > 0;
    const effectiveScheduledDays = hasCustomSchedule
      ? [...habit.scheduledDays!].sort((a, b) => a - b)
      : [1, 2, 3, 4, 5, 6, 7];

    const isDueOnSelectedDate = isHabitDueOnDate(
      habit,
      selectedDate,
      logsByDate
    );
    const selectedDateStatus = logsByDate.get(selectedDate) ?? null;
    const selectedLogRow = logRowByDate.get(selectedDate);
    const selectedDateCompletedAtLabel = selectedLogRow
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(selectedLogRow.updatedAt || selectedLogRow.createdAt))
      : null;

    // Weekly cells for the selected week (Mon..Sun)
    const weekDays: HabitWeekDayCell[] = weekDateKeys.map((dateKey, idx) => {
      const meta = ISO_WEEKDAYS[idx];
      const isScheduled = effectiveScheduledDays.includes(meta.isoDay);
      return {
        dateKey,
        isoWeekday: meta.isoDay,
        shortLabel: meta.shortLabel,
        isScheduled,
        isToday: dateKey === todayLocalDate,
        isSelectedDate: dateKey === selectedDate,
        status: logsByDate.get(dateKey) ?? null,
      };
    });

    const completedThisWeek = weekDays.filter(
      (d) => d.status === 'completed'
    ).length;
    const scheduledThisWeek = hasCustomSchedule
      ? Math.min(habit.targetPerWeek, effectiveScheduledDays.length)
      : habit.targetPerWeek;
    const remainingThisWeek = Math.max(
      0,
      scheduledThisWeek - completedThisWeek
    );
    const weeklyProgressPercent = Math.min(
      100,
      Math.round(
        (completedThisWeek / Math.max(1, scheduledThisWeek)) * 100
      )
    );

    const streakStats = calculateHabitStreaksAndRate({
      habit,
      logs: habitLogsList,
      todayLocalDate,
      timezone: tz,
    });

    const habitCreatedDateKey = habit.createdAt
      ? getLocalDateString(new Date(habit.createdAt), tz)
      : todayLocalDate;
    let earliestLogDateKey = habitCreatedDateKey;
    for (const l of habitLogsList) {
      if (l.completedOn < earliestLogDateKey) {
        earliestLogDateKey = l.completedOn;
      }
    }

    // 12-week consistency heatmap (12 weeks x 7 days Mon..Sun)
    const heatmapWeeks: HabitHeatmapCell[][] = [];
    for (let w = 0; w < 12; w += 1) {
      const weekCol: HabitHeatmapCell[] = [];
      for (let d = 0; d < 7; d += 1) {
        const cellDateKey = shiftLocalDateString(
          heatmapStartMonday,
          w * 7 + d
        );
        const meta = ISO_WEEKDAYS[d];
        const isScheduled = effectiveScheduledDays.includes(meta.isoDay);
        const logStatus = logsByDate.get(cellDateKey);

        let state: HabitHeatmapCell['state'] = 'not_scheduled';
        if (logStatus === 'completed') {
          state = 'completed';
        } else if (logStatus === 'skipped') {
          state = 'skipped';
        } else if (!isScheduled || cellDateKey < earliestLogDateKey) {
          state = 'not_scheduled';
        } else if (cellDateKey >= todayLocalDate) {
          state = 'upcoming';
        } else {
          state = 'missed';
        }

        weekCol.push({
          dateKey: cellDateKey,
          isoWeekday: meta.isoDay,
          shortLabel: meta.shortLabel,
          formattedDate: formatReadableDateLabel(cellDateKey),
          state,
        });
      }
      heatmapWeeks.push(weekCol);
    }

    // Recent 14-day history (newest first, starting from selectedDate or todayLocalDate)
    const historyAnchor =
      selectedDate <= todayLocalDate ? todayLocalDate : selectedDate;
    const recentHistory: HabitHistoryEntry[] = [];
    for (let offset = 0; offset < 14; offset += 1) {
      const dateKey = shiftLocalDateString(historyAnchor, -offset);
      const isoDay = getIsoWeekday(dateKey);
      const weekdayMeta = ISO_WEEKDAYS[isoDay - 1];
      const isScheduled = effectiveScheduledDays.includes(isoDay);
      const logRow = logRowByDate.get(dateKey);
      const status = logsByDate.get(dateKey) ?? null;

      recentHistory.push({
        dateKey,
        formattedDate: formatReadableDateLabel(dateKey),
        weekdayLabel: weekdayMeta.shortLabel,
        isScheduled,
        status,
        updatedAtLabel: logRow
          ? new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date(logRow.updatedAt || logRow.createdAt))
          : null,
      });
    }

    return {
      id: habit.id,
      title: habit.title,
      description: habit.description ?? null,
      iconKey: resolveHabitIconKey(habit.title),
      targetPerWeek: habit.targetPerWeek,
      scheduledDays: effectiveScheduledDays,
      hasCustomSchedule,
      isActive: habit.isActive,
      isDueOnSelectedDate,
      selectedDateStatus,
      selectedDateCompletedAtLabel,
      completedThisWeek,
      scheduledThisWeek,
      remainingThisWeek,
      weeklyProgressPercent,
      currentStreak: streakStats.currentStreak,
      bestStreak: streakStats.bestStreak,
      completionRate30d: streakStats.completionRate30d,
      totalCompletedCount: streakStats.totalCompletedCount,
      weekDays,
      heatmapWeeks,
      recentHistory,
      createdAt: new Date(habit.createdAt).toISOString(),
      updatedAt: new Date(habit.updatedAt).toISOString(),
    };
  });

  const activeHabits = serializedHabits.filter((h) => h.isActive);
  const archivedHabits = serializedHabits.filter((h) => !h.isActive);

  const dueOnSelectedDateCount = activeHabits.filter(
    (h) => h.isDueOnSelectedDate
  ).length;
  const completedOnSelectedDateCount = activeHabits.filter(
    (h) => h.selectedDateStatus === 'completed'
  ).length;
  const remainingOnSelectedDateCount = activeHabits.filter(
    (h) => h.isDueOnSelectedDate && h.selectedDateStatus !== 'completed'
  ).length;

  const topCurrentStreak = activeHabits.reduce(
    (max, h) => Math.max(max, h.currentStreak),
    0
  );
  const topBestStreak = serializedHabits.reduce(
    (max, h) => Math.max(max, h.bestStreak),
    0
  );

  // Build 7-day weekly progress chart bars for the selected week (Mon..Sun)
  const weeklyChart: WeeklyHabitChartBar[] = weekDateKeys.map(
    (dateKey, idx) => {
      const meta = ISO_WEEKDAYS[idx];
      let completedCount = 0;
      let targetCount = 0;

      for (const h of activeHabits) {
        const dayCell = h.weekDays[idx];
        if (dayCell?.isScheduled) {
          targetCount += 1;
        }
        if (dayCell?.status === 'completed') {
          completedCount += 1;
        }
      }

      return {
        dateKey,
        isoWeekday: meta.isoDay,
        dayLabel: meta.shortLabel,
        fullDateLabel: formatReadableDateLabel(dateKey),
        completedCount,
        targetCount: Math.max(targetCount, completedCount),
        isToday: dateKey === todayLocalDate,
        isSelected: dateKey === selectedDate,
      };
    }
  );

  const [sY, sM, sD] = weekStartDate.split('-').map(Number);
  const [eY, eM, eD] = weekEndDate.split('-').map(Number);
  const sFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(sY, sM - 1, sD, 12, 0, 0)));
  const eFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(eY, eM - 1, eD, 12, 0, 0)));

  return {
    selectedDate,
    selectedDateLabel: formatReadableDateLabel(selectedDate),
    weekStartDate,
    weekEndDate,
    weekRangeLabel: `${sFmt} – ${eFmt}`,
    isCurrentWeek,
    summary: {
      activeHabitsCount: activeHabits.length,
      archivedHabitsCount: archivedHabits.length,
      dueOnSelectedDateCount,
      completedOnSelectedDateCount,
      remainingOnSelectedDateCount,
      topCurrentStreak,
      topBestStreak,
    },
    habits: serializedHabits,
    weeklyChart,
  };
}

export type HabitsViewModel = ReturnType<typeof buildHabitsViewModel>;

