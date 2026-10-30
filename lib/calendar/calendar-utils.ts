import {
  DEFAULT_TIMEZONE,
  formatLocalTime,
  getLocalDateString,
  getLocalDayUtcBounds,
  resolveValidTimezone,
  shiftLocalDateString,
} from '../queries/timezone';
import {
  extractLocalDateAndExactTime,
  isValidLocalDateString,
  type SerializedTaskItem,
} from '../tasks/validation';

export const CALENDAR_VIEWS = ['month', 'week', 'day'] as const;
export type CalendarViewMode = (typeof CALENDAR_VIEWS)[number];

export const INITIAL_VISIBLE_START_HOUR = 6; // 6:00 AM
export const INITIAL_VISIBLE_END_HOUR = 23; // 11:00 PM
export const MINUTES_IN_DAY = 1440;

export interface HourRowDescriptor {
  hour: number; // 0..23
  time24: string; // "06:00"
  label: string; // "6 AM"
  isInitialVisibleRange: boolean; // true for 6..23
}

export const HOUR_ROWS: HourRowDescriptor[] = Array.from(
  { length: 24 },
  (_, hour) => {
    const time24 = `${String(hour).padStart(2, '0')}:00`;
    const period = hour < 12 ? 'AM' : 'PM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return {
      hour,
      time24,
      label: `${hour12} ${period}`,
      isInitialVisibleRange:
        hour >= INITIAL_VISIBLE_START_HOUR && hour <= INITIAL_VISIBLE_END_HOUR,
    };
  }
);

export interface ExternalGoogleCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  isAllDay: boolean;
  startIso: string | null; // UTC ISO string for timed events
  endIso: string | null; // UTC ISO string for timed events
  startDate: string | null; // YYYY-MM-DD for all-day events
  endDate: string | null; // YYYY-MM-DD (exclusive) for all-day events
  htmlLink: string | null;
  location: string | null;
  status: string;
  linkedTaskId: string | null;
}

export interface CalendarDayDescriptor {
  dateKey: string; // YYYY-MM-DD
  dayOfMonth: number;
  weekdayIndex: number; // 0 (Sun) .. 6 (Sat)
  weekdayShort: string; // "Mon"
  weekdayLong: string; // "Monday"
  monthShort: string; // "Oct"
  fullLabel: string; // "Monday, Oct 27, 2026"
  isCurrentMonth: boolean;
  isToday: boolean;
  startUtc: Date;
  endUtc: Date;
}

export interface CalendarPeriodRange {
  view: CalendarViewMode;
  anchorDate: string;
  startDateKey: string;
  endDateKey: string;
  startUtc: Date;
  endUtc: Date;
  headingLabel: string;
  days: CalendarDayDescriptor[];
}

export interface CalendarTimedLayoutItem {
  id: string;
  source: 'lifecraft_task' | 'google_calendar';
  title: string;
  timeRangeLabel: string;
  startUtcMs: number;
  endUtcMs: number;
  startMinutes: number; // 0..1440 within the specific local day
  endMinutes: number; // 0..1440 within the specific local day
  visualDurationMinutes: number; // Clamped >= 25m for readable rendering
  topPercent: number; // 0..100
  heightPercent: number; // 0..100
  columnIndex: number;
  totalColumns: number;
  hasConflict: boolean;
  conflictingIds: string[];
  conflictingTitles: string[];
  spansMidnightBefore: boolean;
  spansMidnightAfter: boolean;
  task?: SerializedTaskItem;
  externalEvent?: ExternalGoogleCalendarEvent;
}

export interface CalendarDayScheduleData {
  dateKey: string;
  allDayTasks: SerializedTaskItem[];
  allDayExternalEvents: ExternalGoogleCalendarEvent[];
  deadlineOnlyTasks: SerializedTaskItem[];
  timedItems: CalendarTimedLayoutItem[];
  conflictCount: number;
}

export function isValidCalendarView(val: unknown): val is CalendarViewMode {
  return (
    typeof val === 'string' &&
    (CALENDAR_VIEWS as readonly string[]).includes(val)
  );
}

function getUtcNoonForDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function buildCalendarDayDescriptor(
  dateKey: string,
  options: {
    timezone: string;
    todayLocalDate: string;
    referenceMonthPrefix: string; // "YYYY-MM"
  }
): CalendarDayDescriptor {
  const tz = resolveValidTimezone(options.timezone);
  const utcNoon = getUtcNoonForDateKey(dateKey);
  const dayOfMonth = utcNoon.getUTCDate();
  const weekdayIndex = utcNoon.getUTCDay();

  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(utcNoon);

  const weekdayLong = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(utcNoon);

  const monthShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
  }).format(utcNoon);

  const fullLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcNoon);

  const { startUtc, endUtc } = getLocalDayUtcBounds(dateKey, tz);

  return {
    dateKey,
    dayOfMonth,
    weekdayIndex,
    weekdayShort,
    weekdayLong,
    monthShort,
    fullLabel,
    isCurrentMonth: dateKey.startsWith(options.referenceMonthPrefix),
    isToday: dateKey === options.todayLocalDate,
    startUtc,
    endUtc,
  };
}

export function getStartOfWeekDateKey(
  dateKey: string,
  weekStartsOn: number = 1
): string {
  const normalizedStart = ((weekStartsOn % 7) + 7) % 7;
  const utcNoon = getUtcNoonForDateKey(dateKey);
  const currentWeekday = utcNoon.getUTCDay(); // 0..6
  const diff = (currentWeekday - normalizedStart + 7) % 7;
  return shiftLocalDateString(dateKey, -diff);
}

export function shiftCalendarAnchorDate(
  anchorDate: string,
  view: CalendarViewMode,
  direction: -1 | 1
): string {
  if (!isValidLocalDateString(anchorDate)) {
    return anchorDate;
  }

  if (view === 'day') {
    return shiftLocalDateString(anchorDate, direction);
  }

  if (view === 'week') {
    return shiftLocalDateString(anchorDate, direction * 7);
  }

  // Month shift: preserve day-of-month where possible, clamping to last day of target month
  const [y, m, d] = anchorDate.split('-').map(Number);
  const targetFirst = new Date(Date.UTC(y, m - 1 + direction, 1, 12, 0, 0));
  const targetYear = targetFirst.getUTCFullYear();
  const targetMonthIndex = targetFirst.getUTCMonth(); // 0..11
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0)
  ).getUTCDate();
  const clampedDay = Math.min(d, daysInTargetMonth);
  const monthStr = String(targetMonthIndex + 1).padStart(2, '0');
  const dayStr = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${monthStr}-${dayStr}`;
}

export function getCalendarPeriodRange(params: {
  anchorDate: string;
  view: CalendarViewMode;
  timezone?: string;
  weekStartsOn?: number;
  todayLocalDate?: string;
}): CalendarPeriodRange {
  const tz = resolveValidTimezone(params.timezone ?? DEFAULT_TIMEZONE);
  const todayLocalDate =
    params.todayLocalDate && isValidLocalDateString(params.todayLocalDate)
      ? params.todayLocalDate
      : getLocalDateString(new Date(), tz);
  const anchorDate = isValidLocalDateString(params.anchorDate)
    ? params.anchorDate
    : todayLocalDate;
  const weekStartsOn = params.weekStartsOn ?? 1;
  const referenceMonthPrefix = anchorDate.slice(0, 7);

  if (params.view === 'day') {
    const dayDesc = buildCalendarDayDescriptor(anchorDate, {
      timezone: tz,
      todayLocalDate,
      referenceMonthPrefix,
    });
    return {
      view: 'day',
      anchorDate,
      startDateKey: anchorDate,
      endDateKey: anchorDate,
      startUtc: dayDesc.startUtc,
      endUtc: dayDesc.endUtc,
      headingLabel: dayDesc.fullLabel,
      days: [dayDesc],
    };
  }

  if (params.view === 'week') {
    const weekStartKey = getStartOfWeekDateKey(anchorDate, weekStartsOn);
    const days: CalendarDayDescriptor[] = [];
    for (let i = 0; i < 7; i += 1) {
      const dateKey = shiftLocalDateString(weekStartKey, i);
      days.push(
        buildCalendarDayDescriptor(dateKey, {
          timezone: tz,
          todayLocalDate,
          referenceMonthPrefix,
        })
      );
    }

    const firstDay = days[0];
    const lastDay = days[6];
    const firstYear = firstDay.dateKey.slice(0, 4);
    const lastYear = lastDay.dateKey.slice(0, 4);

    let headingLabel = '';
    if (firstYear !== lastYear) {
      headingLabel = `${firstDay.monthShort} ${firstDay.dayOfMonth}, ${firstYear} – ${lastDay.monthShort} ${lastDay.dayOfMonth}, ${lastYear}`;
    } else if (firstDay.monthShort !== lastDay.monthShort) {
      headingLabel = `${firstDay.monthShort} ${firstDay.dayOfMonth} – ${lastDay.monthShort} ${lastDay.dayOfMonth}, ${lastYear}`;
    } else {
      headingLabel = `${firstDay.monthShort} ${firstDay.dayOfMonth} – ${lastDay.dayOfMonth}, ${lastYear}`;
    }

    return {
      view: 'week',
      anchorDate,
      startDateKey: firstDay.dateKey,
      endDateKey: lastDay.dateKey,
      startUtc: firstDay.startUtc,
      endUtc: lastDay.endUtc,
      headingLabel,
      days,
    };
  }

  // Month view: 42 days (6 full weeks) starting from the week of the 1st of the month
  const firstOfMonthKey = `${referenceMonthPrefix}-01`;
  const gridStartKey = getStartOfWeekDateKey(firstOfMonthKey, weekStartsOn);
  const days: CalendarDayDescriptor[] = [];
  for (let i = 0; i < 42; i += 1) {
    const dateKey = shiftLocalDateString(gridStartKey, i);
    days.push(
      buildCalendarDayDescriptor(dateKey, {
        timezone: tz,
        todayLocalDate,
        referenceMonthPrefix,
      })
    );
  }

  const anchorNoon = getUtcNoonForDateKey(firstOfMonthKey);
  const headingLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(anchorNoon);

  return {
    view: 'month',
    anchorDate,
    startDateKey: days[0].dateKey,
    endDateKey: days[days.length - 1].dateKey,
    startUtc: days[0].startUtc,
    endUtc: days[days.length - 1].endUtc,
    headingLabel,
    days,
  };
}

export function formatMinutesToTimeInput(minutesFromMidnight: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutesFromMidnight)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getLocalMinutesSinceMidnight(
  instantUtcMs: number,
  dateKey: string,
  dayStartUtcMs: number,
  dayEndUtcMs: number,
  timezone: string
): number {
  if (instantUtcMs <= dayStartUtcMs) return 0;
  if (instantUtcMs >= dayEndUtcMs) return MINUTES_IN_DAY;

  const { localDate, localTime } = extractLocalDateAndExactTime(
    new Date(instantUtcMs),
    timezone
  );
  if (localDate === dateKey && localTime) {
    const [hStr, mStr] = localTime.split(':');
    const minutes = Number(hStr) * 60 + Number(mStr);
    if (Number.isFinite(minutes)) {
      return Math.max(0, Math.min(MINUTES_IN_DAY, minutes));
    }
  }

  // Fallback proportional calculation (handles rare DST boundary edge cases)
  const dayDurationMs = Math.max(1, dayEndUtcMs - dayStartUtcMs);
  return Math.max(
    0,
    Math.min(
      MINUTES_IN_DAY,
      Math.round(((instantUtcMs - dayStartUtcMs) / dayDurationMs) * MINUTES_IN_DAY)
    )
  );
}

/**
 * Computes non-destructive side-by-side column assignments and conflict metadata
 * for all timed events (LifeCraft scheduled tasks + external Google Calendar events)
 * occurring on a given local day.
 */
export function buildDayScheduleData(params: {
  day: CalendarDayDescriptor;
  tasks: SerializedTaskItem[];
  externalEvents?: ExternalGoogleCalendarEvent[];
  timezone?: string;
}): CalendarDayScheduleData {
  const tz = resolveValidTimezone(params.timezone ?? DEFAULT_TIMEZONE);
  const { dateKey, startUtc, endUtc } = params.day;
  const dayStartMs = startUtc.getTime();
  const dayEndMs = endUtc.getTime();

  const activeTasks = params.tasks.filter((t) => t.status !== 'archived');
  const externalEvents = params.externalEvents ?? [];

  // Track task IDs that are already represented to avoid duplicating linked Google events
  const scheduledTaskIds = new Set(
    activeTasks
      .filter((t) => Boolean(t.scheduledStartAt && t.scheduledEndAt))
      .map((t) => t.id)
  );
  const exportedGoogleEventIds = new Set(
    activeTasks
      .map((t) => t.googleEventId)
      .filter((id): id is string => Boolean(id))
  );

  // 1. All-day LifeCraft tasks overlapping this local day
  const allDayTasks = activeTasks.filter((t) => {
    if (!t.isAllDay || !t.scheduledStartAt || !t.scheduledEndAt) return false;
    const sMs = new Date(t.scheduledStartAt).getTime();
    const eMs = new Date(t.scheduledEndAt).getTime();
    return sMs < dayEndMs && eMs > dayStartMs;
  });

  // 2. All-day external Google Calendar events overlapping this local day
  const allDayExternalEvents = externalEvents.filter((ev) => {
    if (!ev.isAllDay || !ev.startDate) return false;
    if (ev.linkedTaskId && scheduledTaskIds.has(ev.linkedTaskId)) return false;
    if (exportedGoogleEventIds.has(ev.id)) return false;
    const endDate = ev.endDate || shiftLocalDateString(ev.startDate, 1);
    return ev.startDate <= dateKey && endDate > dateKey;
  });

  // 3. Tasks with a deadline on this local day that do NOT have a scheduled time slot
  const deadlineOnlyTasks = activeTasks.filter((t) => {
    if (t.scheduledStartAt && t.scheduledEndAt) return false;
    return t.dueDate === dateKey;
  });

  // 4. Timed items (LifeCraft scheduled timed tasks + timed Google Calendar events)
  interface RawTimedCandidate {
    id: string;
    source: 'lifecraft_task' | 'google_calendar';
    title: string;
    timeRangeLabel: string;
    startUtcMs: number;
    endUtcMs: number;
    startMinutes: number;
    endMinutes: number;
    visualDurationMinutes: number;
    spansMidnightBefore: boolean;
    spansMidnightAfter: boolean;
    task?: SerializedTaskItem;
    externalEvent?: ExternalGoogleCalendarEvent;
  }

  const rawTimed: RawTimedCandidate[] = [];

  for (const t of activeTasks) {
    if (t.isAllDay || !t.scheduledStartAt || !t.scheduledEndAt) continue;
    const sMs = new Date(t.scheduledStartAt).getTime();
    const eMs = new Date(t.scheduledEndAt).getTime();
    if (Number.isNaN(sMs) || Number.isNaN(eMs) || eMs <= sMs) continue;
    if (sMs >= dayEndMs || eMs <= dayStartMs) continue;

    const spansMidnightBefore = sMs < dayStartMs;
    const spansMidnightAfter = eMs > dayEndMs;

    const startMinutes = getLocalMinutesSinceMidnight(
      Math.max(sMs, dayStartMs),
      dateKey,
      dayStartMs,
      dayEndMs,
      tz
    );
    const rawEndMinutes = getLocalMinutesSinceMidnight(
      Math.min(eMs, dayEndMs),
      dateKey,
      dayStartMs,
      dayEndMs,
      tz
    );
    const endMinutes = Math.max(startMinutes + 5, rawEndMinutes);
    const visualDurationMinutes = Math.max(25, endMinutes - startMinutes);

    const sLabel = formatLocalTime(new Date(sMs), tz) ?? '';
    const eLabel = formatLocalTime(new Date(eMs), tz) ?? '';

    rawTimed.push({
      id: `task:${t.id}`,
      source: 'lifecraft_task',
      title: t.title,
      timeRangeLabel:
        sLabel && eLabel ? `${sLabel} – ${eLabel}` : t.scheduleDisplayLabel ?? '',
      startUtcMs: sMs,
      endUtcMs: eMs,
      startMinutes,
      endMinutes,
      visualDurationMinutes,
      spansMidnightBefore,
      spansMidnightAfter,
      task: t,
    });
  }

  for (const ev of externalEvents) {
    if (ev.isAllDay || !ev.startIso || !ev.endIso) continue;
    if (ev.linkedTaskId && scheduledTaskIds.has(ev.linkedTaskId)) continue;
    if (exportedGoogleEventIds.has(ev.id)) continue;

    const sMs = new Date(ev.startIso).getTime();
    const eMs = new Date(ev.endIso).getTime();
    if (Number.isNaN(sMs) || Number.isNaN(eMs) || eMs <= sMs) continue;
    if (sMs >= dayEndMs || eMs <= dayStartMs) continue;

    const spansMidnightBefore = sMs < dayStartMs;
    const spansMidnightAfter = eMs > dayEndMs;

    const startMinutes = getLocalMinutesSinceMidnight(
      Math.max(sMs, dayStartMs),
      dateKey,
      dayStartMs,
      dayEndMs,
      tz
    );
    const rawEndMinutes = getLocalMinutesSinceMidnight(
      Math.min(eMs, dayEndMs),
      dateKey,
      dayStartMs,
      dayEndMs,
      tz
    );
    const endMinutes = Math.max(startMinutes + 5, rawEndMinutes);
    const visualDurationMinutes = Math.max(25, endMinutes - startMinutes);

    const sLabel = formatLocalTime(new Date(sMs), tz) ?? '';
    const eLabel = formatLocalTime(new Date(eMs), tz) ?? '';

    rawTimed.push({
      id: `gcal:${ev.id}`,
      source: 'google_calendar',
      title: ev.title,
      timeRangeLabel: sLabel && eLabel ? `${sLabel} – ${eLabel}` : '',
      startUtcMs: sMs,
      endUtcMs: eMs,
      startMinutes,
      endMinutes,
      visualDurationMinutes,
      spansMidnightBefore,
      spansMidnightAfter,
      externalEvent: ev,
    });
  }

  // Sort by startMinutes ASC, then longer duration first, then id
  rawTimed.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) {
      return a.startMinutes - b.startMinutes;
    }
    const aDur = a.endMinutes - a.startMinutes;
    const bDur = b.endMinutes - b.startMinutes;
    if (aDur !== bDur) return bDur - aDur;
    return a.id.localeCompare(b.id);
  });

  // Compute true time overlaps (conflicts)
  const conflictMap = new Map<
    string,
    { ids: string[]; titles: string[] }
  >();
  for (const item of rawTimed) {
    conflictMap.set(item.id, { ids: [], titles: [] });
  }

  for (let i = 0; i < rawTimed.length; i += 1) {
    for (let j = i + 1; j < rawTimed.length; j += 1) {
      const a = rawTimed[i];
      const b = rawTimed[j];
      // Actual scheduled interval overlap check
      if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
        conflictMap.get(a.id)?.ids.push(b.id);
        conflictMap.get(a.id)?.titles.push(b.title);
        conflictMap.get(b.id)?.ids.push(a.id);
        conflictMap.get(b.id)?.titles.push(a.title);
      }
    }
  }

  // Partition into connected visual clusters to assign side-by-side columns
  const timedItems: CalendarTimedLayoutItem[] = [];
  let cluster: RawTimedCandidate[] = [];
  let clusterMaxEnd = -1;

  const flushCluster = (itemsInCluster: RawTimedCandidate[]) => {
    if (itemsInCluster.length === 0) return;
    const columnEndMinutes: number[] = [];
    const assignedColumns: number[] = [];

    for (const item of itemsInCluster) {
      const visualEnd = Math.min(
        MINUTES_IN_DAY,
        item.startMinutes + item.visualDurationMinutes
      );
      let placedCol = -1;
      for (let c = 0; c < columnEndMinutes.length; c += 1) {
        if (columnEndMinutes[c] <= item.startMinutes) {
          placedCol = c;
          columnEndMinutes[c] = visualEnd;
          break;
        }
      }
      if (placedCol === -1) {
        placedCol = columnEndMinutes.length;
        columnEndMinutes.push(visualEnd);
      }
      assignedColumns.push(placedCol);
    }

    const totalColumns = Math.max(1, columnEndMinutes.length);

    for (let idx = 0; idx < itemsInCluster.length; idx += 1) {
      const item = itemsInCluster[idx];
      const conflicts = conflictMap.get(item.id) ?? { ids: [], titles: [] };
      const topPercent = (item.startMinutes / MINUTES_IN_DAY) * 100;
      const clampedDuration = Math.min(
        MINUTES_IN_DAY - item.startMinutes,
        item.visualDurationMinutes
      );
      const heightPercent = (clampedDuration / MINUTES_IN_DAY) * 100;

      timedItems.push({
        ...item,
        topPercent,
        heightPercent,
        columnIndex: assignedColumns[idx],
        totalColumns,
        hasConflict: conflicts.ids.length > 0,
        conflictingIds: conflicts.ids,
        conflictingTitles: conflicts.titles,
      });
    }
  };

  for (const item of rawTimed) {
    const visualEnd = Math.min(
      MINUTES_IN_DAY,
      item.startMinutes + item.visualDurationMinutes
    );
    if (cluster.length === 0) {
      cluster.push(item);
      clusterMaxEnd = visualEnd;
    } else if (item.startMinutes < clusterMaxEnd) {
      cluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, visualEnd);
    } else {
      flushCluster(cluster);
      cluster = [item];
      clusterMaxEnd = visualEnd;
    }
  }
  flushCluster(cluster);

  const conflictCount = timedItems.filter((item) => item.hasConflict).length;

  return {
    dateKey,
    allDayTasks,
    allDayExternalEvents,
    deadlineOnlyTasks,
    timedItems,
    conflictCount,
  };
}
