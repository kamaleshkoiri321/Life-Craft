import type {
  GoalRow,
  HabitLogRow,
  HabitRow,
  NoteRow,
  TaskRow,
  UserPreferenceRow,
  UserProfileRow,
} from '../db/schema';

export const DEFAULT_TIMEZONE = 'Asia/Kathmandu';

export function resolveValidTimezone(timezone?: string | null): string {
  const candidate = timezone?.trim() || DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Returns `YYYY-MM-DD` in the target IANA timezone for a given Date.
 */
export function getLocalDateString(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const tz = resolveValidTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Returns the local hour (0..23) in the target IANA timezone.
 */
export function getLocalHour(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): number {
  const tz = resolveValidTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const rawHour = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const parsed = Number.parseInt(rawHour, 10);
  return Number.isNaN(parsed) ? 0 : parsed % 24;
}

export function getTimeOfDayGreeting(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): 'Good morning' | 'Good afternoon' | 'Good evening' {
  const hour = getLocalHour(date, timezone);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Computes the UTC offset (in milliseconds) of `timezone` at the instant `utcDate`.
 * Works accurately for all IANA timezones including 30-min and 45-min offsets
 * such as Asia/Kathmandu (UTC+05:45).
 */
export function getTimezoneOffsetMs(utcDate: Date, timezone: string): number {
  const tz = resolveValidTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  const year = Number(parts.find((p) => p.type === 'year')?.value ?? 1970);
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? 1);
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 1);
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const second = Number(parts.find((p) => p.type === 'second')?.value ?? 0);

  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const truncatedInstantMs =
    Math.floor(utcDate.getTime() / 1000) * 1000;
  return asUtcMs - truncatedInstantMs;
}

/**
 * Converts a local calendar date (`YYYY-MM-DD`) in `timezone` into its exact
 * `[startOfDayUtc, endOfDayExclusiveUtc]` UTC Date bounds.
 */
export function getLocalDayUtcBounds(
  localDateStr: string,
  timezone: string = DEFAULT_TIMEZONE
): { startUtc: Date; endUtc: Date } {
  const tz = resolveValidTimezone(timezone);
  const [yearStr, monthStr, dayStr] = localDateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const midnightNaiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstGuessOffset = getTimezoneOffsetMs(new Date(midnightNaiveUtc), tz);
  const refinedStartMs = midnightNaiveUtc - firstGuessOffset;
  const secondGuessOffset = getTimezoneOffsetMs(new Date(refinedStartMs), tz);
  const startUtc = new Date(midnightNaiveUtc - secondGuessOffset);

  const nextDayNaiveUtc = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0);
  const nextFirstOffset = getTimezoneOffsetMs(new Date(nextDayNaiveUtc), tz);
  const nextRefinedMs = nextDayNaiveUtc - nextFirstOffset;
  const nextSecondOffset = getTimezoneOffsetMs(new Date(nextRefinedMs), tz);
  const endUtc = new Date(nextDayNaiveUtc - nextSecondOffset);

  return { startUtc, endUtc };
}

export function shiftLocalDateString(
  localDateStr: string,
  deltaDays: number
): string {
  const [yearStr, monthStr, dayStr] = localDateStr.split('-');
  const d = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + deltaDays)
  );
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DayWindowSlot {
  dateKey: string;
  dayLabel: string;
  fullDateLabel: string;
  startUtc: Date;
  endUtc: Date;
  isToday: boolean;
}

export function getSevenDayWindow(
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): DayWindowSlot[] {
  const tz = resolveValidTimezone(timezone);
  const todayKey = getLocalDateString(now, tz);
  const slots: DayWindowSlot[] = [];

  for (let offset = -6; offset <= 0; offset += 1) {
    const dateKey = shiftLocalDateString(todayKey, offset);
    const { startUtc, endUtc } = getLocalDayUtcBounds(dateKey, tz);
    const midpoint = new Date((startUtc.getTime() + endUtc.getTime()) / 2);

    const dayLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    }).format(midpoint);

    const fullDateLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(midpoint);

    slots.push({
      dateKey,
      dayLabel,
      fullDateLabel,
      startUtc,
      endUtc,
      isToday: offset === 0,
    });
  }

  return slots;
}

export function formatDashboardDate(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const tz = resolveValidTimezone(timezone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatLocalTime(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): string | null {
  if (!date) return null;
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;
  const tz = resolveValidTimezone(timezone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
}

export function formatShortDate(
  dateStr: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): string | null {
  if (!dateStr) return null;
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(utcNoon);
  }
  const parsed = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(parsed.getTime())) return null;
  const tz = resolveValidTimezone(timezone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export interface DashboardTaskItem {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high';
  dueTimeLabel: string | null;
  isCompleted: boolean;
}

export interface WeeklyActivityPoint {
  dateKey: string;
  dayLabel: string;
  fullDateLabel: string;
  completedCount: number;
  dueCount: number;
  isToday: boolean;
}

export interface DashboardGoalItem {
  id: string;
  title: string;
  description: string | null;
  targetDateLabel: string | null;
  progressPercent: number;
}

export interface DashboardHabitItem {
  id: string;
  title: string;
  description: string | null;
  targetPerWeek: number;
  scheduledDays: number[] | null;
  completedToday: boolean;
  skippedToday?: boolean;
  isDueToday?: boolean;
  completedDaysLast7: number;
}

export interface DashboardNoteItem {
  id: string;
  title: string;
  excerpt: string;
  isPinned: boolean;
  updatedAtLabel: string;
}

export interface DashboardSummaryMetrics {
  tasksTodayCount: number;
  highPriorityTodayCount: number;
  completedTodayCount: number;
  activeHabitsCount: number;
  completedHabitsTodayCount: number;
  dueHabitsTodayCount?: number;
  activeGoalsCount: number;
}

export interface DashboardDataPayload {
  user: {
    id: string;
    displayName: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    timezone: string;
  };
  preferences: {
    theme: 'light' | 'dark' | 'system';
    weekStartsOn: number;
  };
  greeting: string;
  formattedDate: string;
  todayLocalDate: string;
  summary: DashboardSummaryMetrics;
  todaysFocus: DashboardTaskItem[];
  weeklyActivity: {
    days: WeeklyActivityPoint[];
    totalCompletedLast7Days: number;
  };
  activeGoals: DashboardGoalItem[];
  dailyHabits: DashboardHabitItem[];
  recentNotes: DashboardNoteItem[];
}

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function resolveDisplayName(
  profileDisplayName: string | null | undefined,
  authUserName: string | null | undefined,
  authUserEmail: string
): string {
  const fromProfile = profileDisplayName?.trim();
  if (fromProfile) return fromProfile;
  const fromAuth = authUserName?.trim();
  if (fromAuth) return fromAuth;
  const emailPrefix = authUserEmail.split('@')[0]?.trim();
  return emailPrefix || 'Friend';
}

export function buildDashboardPayload(params: {
  authUser: {
    id: string;
    name?: string | null;
    email: string;
    emailVerified: boolean;
    image?: string | null;
  };
  profile: UserProfileRow | null;
  preferences: UserPreferenceRow | null;
  userTasks: TaskRow[];
  userHabits: HabitRow[];
  userHabitLogs: HabitLogRow[];
  userGoals: GoalRow[];
  userNotes: NoteRow[];
  now?: Date;
}): DashboardDataPayload {
  const now = params.now ?? new Date();
  const timezone = resolveValidTimezone(params.profile?.timezone);
  const todayLocalDate = getLocalDateString(now, timezone);
  const { startUtc: todayStartUtc, endUtc: todayEndUtc } =
    getLocalDayUtcBounds(todayLocalDate, timezone);
  const sevenDaySlots = getSevenDayWindow(now, timezone);

  const displayName = resolveDisplayName(
    params.profile?.displayName,
    params.authUser.name,
    params.authUser.email
  );

  // Filter non-archived tasks
  const activeTasks = params.userTasks.filter((t) => t.status !== 'archived');

  // Tasks due today or scheduled today in user's local timezone
  const tasksDueToday = activeTasks.filter((t) => {
    const startMs = todayStartUtc.getTime();
    const endMs = todayEndUtc.getTime();
    if (t.scheduledStartAt && t.scheduledEndAt) {
      const sStart = new Date(t.scheduledStartAt).getTime();
      const sEnd = new Date(t.scheduledEndAt).getTime();
      if (sStart < endMs && sEnd > startMs) return true;
    }
    if (!t.dueAt) return false;
    const dueMs = new Date(t.dueAt).getTime();
    return dueMs >= startMs && dueMs < endMs;
  });

  // Tasks completed today in user's local timezone
  const tasksCompletedToday = activeTasks.filter((t) => {
    if (t.status !== 'completed' || !t.completedAt) return false;
    const completedMs = new Date(t.completedAt).getTime();
    return (
      completedMs >= todayStartUtc.getTime() &&
      completedMs < todayEndUtc.getTime()
    );
  });

  const sortedFocusTasks = [...tasksDueToday].sort((a, b) => {
    const aDone = a.status === 'completed' ? 1 : 0;
    const bDone = b.status === 'completed' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    const aPrio = PRIORITY_WEIGHT[a.priority] ?? 1;
    const bPrio = PRIORITY_WEIGHT[b.priority] ?? 1;
    if (aPrio !== bPrio) return aPrio - bPrio;

    const aTime = a.scheduledStartAt
      ? new Date(a.scheduledStartAt).getTime()
      : a.dueAt
        ? new Date(a.dueAt).getTime()
        : Number.MAX_SAFE_INTEGER;
    const bTime = b.scheduledStartAt
      ? new Date(b.scheduledStartAt).getTime()
      : b.dueAt
        ? new Date(b.dueAt).getTime()
        : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;

    return a.sortOrder - b.sortOrder;
  });

  const todaysFocus: DashboardTaskItem[] = sortedFocusTasks.map((t) => {
    let timeLabel = formatLocalTime(t.dueAt, timezone);
    if (t.scheduledStartAt && t.scheduledEndAt) {
      if (t.isAllDay) {
        timeLabel = 'All day';
      } else {
        const sLabel = formatLocalTime(t.scheduledStartAt, timezone);
        const eLabel = formatLocalTime(t.scheduledEndAt, timezone);
        if (sLabel && eLabel) {
          timeLabel = `${sLabel} – ${eLabel}`;
        }
      }
    }
    return {
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      status: (t.status as DashboardTaskItem['status']) || 'todo',
      priority: (t.priority as DashboardTaskItem['priority']) || 'medium',
      dueTimeLabel: timeLabel,
      isCompleted: t.status === 'completed',
    };
  });

  const highPriorityTodayCount = tasksDueToday.filter(
    (t) => t.priority === 'high' && t.status !== 'completed'
  ).length;

  // 7-day weekly activity calculation
  const weeklyDays: WeeklyActivityPoint[] = sevenDaySlots.map((slot) => {
    const startMs = slot.startUtc.getTime();
    const endMs = slot.endUtc.getTime();

    const completedCount = activeTasks.filter((t) => {
      if (t.status !== 'completed' || !t.completedAt) return false;
      const ms = new Date(t.completedAt).getTime();
      return ms >= startMs && ms < endMs;
    }).length;

    const dueCount = activeTasks.filter((t) => {
      if (t.scheduledStartAt && t.scheduledEndAt) {
        const sStart = new Date(t.scheduledStartAt).getTime();
        const sEnd = new Date(t.scheduledEndAt).getTime();
        if (sStart < endMs && sEnd > startMs) return true;
      }
      if (!t.dueAt) return false;
      const ms = new Date(t.dueAt).getTime();
      return ms >= startMs && ms < endMs;
    }).length;

    return {
      dateKey: slot.dateKey,
      dayLabel: slot.dayLabel,
      fullDateLabel: slot.fullDateLabel,
      completedCount,
      dueCount: Math.max(dueCount, completedCount),
      isToday: slot.isToday,
    };
  });

  const totalCompletedLast7Days = weeklyDays.reduce(
    (acc, d) => acc + d.completedCount,
    0
  );

  // Active habits & habit logs
  const [ty, tm, td] = todayLocalDate.split('-').map(Number);
  const todayUtcDay = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0)).getUTCDay();
  const todayIsoWeekday = todayUtcDay === 0 ? 7 : todayUtcDay;
  const currentWeekMonday = shiftLocalDateString(
    todayLocalDate,
    -(todayIsoWeekday - 1)
  );
  const currentIsoWeekKeys = new Set<string>();
  for (let i = 0; i < 7; i += 1) {
    currentIsoWeekKeys.add(shiftLocalDateString(currentWeekMonday, i));
  }

  const activeHabitsRows = params.userHabits.filter((h) => h.isActive);

  const dailyHabits: DashboardHabitItem[] = activeHabitsRows.map((habit) => {
    const allLogsForHabit = params.userHabitLogs.filter(
      (log) => log.habitId === habit.id
    );
    const completedLogs = allLogsForHabit.filter(
      (log) => log.status === 'completed'
    );
    const completedToday = completedLogs.some(
      (log) => log.completedOn === todayLocalDate
    );
    const skippedToday = allLogsForHabit.some(
      (log) =>
        log.completedOn === todayLocalDate && log.status === 'skipped'
    );
    const completedDaysThisWeek = completedLogs.filter((log) =>
      currentIsoWeekKeys.has(log.completedOn)
    ).length;

    const hasCustomSchedule =
      Array.isArray(habit.scheduledDays) && habit.scheduledDays.length > 0;
    const effectiveTarget = hasCustomSchedule
      ? Math.min(habit.targetPerWeek, habit.scheduledDays!.length)
      : habit.targetPerWeek;

    let isDueToday = true;
    if (hasCustomSchedule) {
      isDueToday = habit.scheduledDays!.includes(todayIsoWeekday);
    } else if (!completedToday) {
      isDueToday = completedDaysThisWeek < effectiveTarget;
    }

    return {
      id: habit.id,
      title: habit.title,
      description: habit.description ?? null,
      targetPerWeek: effectiveTarget,
      scheduledDays: habit.scheduledDays ?? null,
      completedToday,
      skippedToday,
      isDueToday,
      completedDaysLast7: completedDaysThisWeek,
    };
  });

  const completedHabitsTodayCount = dailyHabits.filter(
    (h) => h.completedToday
  ).length;
  const dueHabitsTodayCount = dailyHabits.filter(
    (h) => h.isDueToday
  ).length;

  // Active goals
  const activeGoalsRows = params.userGoals
    .filter((g) => g.status === 'active')
    .sort((a, b) => {
      if (a.targetDate && b.targetDate) {
        return a.targetDate.localeCompare(b.targetDate);
      }
      if (a.targetDate) return -1;
      if (b.targetDate) return 1;
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });

  const activeGoals: DashboardGoalItem[] = activeGoalsRows.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description ?? null,
    targetDateLabel: formatShortDate(g.targetDate, timezone),
    progressPercent: Math.min(100, Math.max(0, g.progressPercent)),
  }));

  // Recent notes
  const sortedNotes = [...params.userNotes]
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    })
    .slice(0, 4);

  const recentNotes: DashboardNoteItem[] = sortedNotes.map((n) => {
    const trimmed = n.content.trim();
    const excerpt =
      trimmed.length > 96 ? `${trimmed.slice(0, 96).trimEnd()}...` : trimmed;
    return {
      id: n.id,
      title: n.title,
      excerpt,
      isPinned: n.isPinned,
      updatedAtLabel: formatShortDate(n.updatedAt, timezone) || 'Recently',
    };
  });

  const rawTheme = params.preferences?.theme;
  const theme: 'light' | 'dark' | 'system' =
    rawTheme === 'dark' || rawTheme === 'system' ? rawTheme : 'light';

  return {
    user: {
      id: params.authUser.id,
      displayName,
      email: params.authUser.email,
      emailVerified: params.authUser.emailVerified,
      image: params.authUser.image ?? null,
      timezone,
    },
    preferences: {
      theme,
      weekStartsOn: params.preferences?.weekStartsOn ?? 1,
    },
    greeting: getTimeOfDayGreeting(now, timezone),
    formattedDate: formatDashboardDate(now, timezone),
    todayLocalDate,
    summary: {
      tasksTodayCount: tasksDueToday.length,
      highPriorityTodayCount,
      completedTodayCount: tasksCompletedToday.length,
      activeHabitsCount: dailyHabits.length,
      completedHabitsTodayCount,
      dueHabitsTodayCount,
      activeGoalsCount: activeGoals.length,
    },
    todaysFocus,
    weeklyActivity: {
      days: weeklyDays,
      totalCompletedLast7Days,
    },
    activeGoals,
    dailyHabits,
    recentNotes,
  };
}
