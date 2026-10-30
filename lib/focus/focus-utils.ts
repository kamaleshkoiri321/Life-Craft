import type { FocusSessionRow, TaskRow } from '@/lib/db/schema';
import {
  DEFAULT_TIMEZONE,
  getLocalDateString,
  resolveValidTimezone,
  shiftLocalDateString,
} from '@/lib/queries/timezone';

export const FOCUS_SESSION_TYPES = [
  'focus',
  'short_break',
  'long_break',
  'stopwatch',
] as const;
export type FocusSessionType = (typeof FOCUS_SESSION_TYPES)[number];

export const FOCUS_PRESET_IDS = [
  'pomodoro',
  'deep_focus',
  'extended_focus',
  'custom',
  'stopwatch',
] as const;
export type FocusPresetId = (typeof FOCUS_PRESET_IDS)[number];

export const FOCUS_SESSION_STATUSES = [
  'running',
  'paused',
  'completed',
  'interrupted',
] as const;
export type FocusSessionStatus = (typeof FOCUS_SESSION_STATUSES)[number];

export const ALARM_SOUND_IDS = ['bell', 'digital', 'chime', 'soft'] as const;
export type AlarmSoundId = (typeof ALARM_SOUND_IDS)[number];

export interface FocusPresetConfig {
  id: FocusPresetId;
  label: string;
  sublabel: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
}

export const FOCUS_PRESETS: Record<FocusPresetId, FocusPresetConfig> = {
  pomodoro: {
    id: 'pomodoro',
    label: 'Pomodoro',
    sublabel: '25 min / 5 min',
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 20,
    longBreakInterval: 4,
  },
  deep_focus: {
    id: 'deep_focus',
    label: 'Deep Focus',
    sublabel: '50 min / 10 min',
    focusMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 20,
    longBreakInterval: 4,
  },
  extended_focus: {
    id: 'extended_focus',
    label: 'Extended Focus',
    sublabel: '90 min / 20 min',
    focusMinutes: 90,
    shortBreakMinutes: 20,
    longBreakMinutes: 20,
    longBreakInterval: 4,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    sublabel: 'Set your own',
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 20,
    longBreakInterval: 4,
  },
  stopwatch: {
    id: 'stopwatch',
    label: 'Stopwatch',
    sublabel: 'Manual timer',
    focusMinutes: 0,
    shortBreakMinutes: 0,
    longBreakMinutes: 0,
    longBreakInterval: 4,
  },
};

export const ALARM_SOUND_OPTIONS: {
  id: AlarmSoundId;
  label: string;
  description: string;
}[] = [
  {
    id: 'bell',
    label: 'Bell Alarm (Default)',
    description: 'Warm resonant bell with natural decay',
  },
  {
    id: 'digital',
    label: 'Digital Beep',
    description: 'Crisp studio double-beep cadence',
  },
  {
    id: 'chime',
    label: 'Gentle Chime',
    description: 'Ascending pentatonic harmonic chime',
  },
  {
    id: 'soft',
    label: 'Soft Alarm',
    description: 'Calm mellow chord pulse',
  },
];

export interface StopwatchLapItem {
  lapNumber: number;
  splitSeconds: number;
  totalSeconds: number;
}

export interface SerializedFocusTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export interface SerializedFocusSession {
  id: string;
  userId: string;
  taskId: string | null;
  taskTitle: string | null;
  sessionType: FocusSessionType;
  presetId: FocusPresetId;
  status: FocusSessionStatus;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  elapsedActiveSeconds: number;
  remainingSeconds: number;
  laps: StopwatchLapItem[];
  startedAt: string;
  lastResumedAt: string | null;
  endedAt: string | null;
  completedAt: string | null;
  localDateKey: string;
  formattedTimeLabel: string;
  durationSummaryLabel: string;
}

export interface FocusWeeklyDayBar {
  dateKey: string;
  dayShortLabel: string;
  focusedSeconds: number;
  focusedMinutes: number;
  completedSessionsCount: number;
  isToday: boolean;
}

export interface FocusSummaryMetrics {
  todayLocalDate: string;
  todayFormattedDate: string;
  completedFocusSessionsToday: number;
  focusedSecondsToday: number;
  focusedMinutesToday: number;
  focusedTodayFormatted: string;
  interruptedSessionsToday: number;
  focusStreakDays: number;
  weeklyFocusedSeconds: number;
  weeklyFocusedMinutes: number;
  weeklyTotalFormatted: string;
  totalCompletedFocusSessions: number;
  totalInterruptedSessions: number;
  completedCyclesInSet: number;
  nextRecommendedBreakType: 'short_break' | 'long_break';
}

export interface FocusWorkspaceViewModel {
  timezone: string;
  summary: FocusSummaryMetrics;
  weeklyDays: FocusWeeklyDayBar[];
  activeCountdownSession: SerializedFocusSession | null;
  activeStopwatchSession: SerializedFocusSession | null;
  recentSessions: SerializedFocusSession[];
  linkableTasks: SerializedFocusTask[];
}

/**
 * Pure timestamp-derived active duration calculation.
 * Never counts paused duration: only adds (nowMs - lastResumedAtMs) when status === 'running'.
 */
export function computeElapsedActiveSeconds(params: {
  status: FocusSessionStatus;
  actualDurationSeconds: number;
  lastResumedAt: string | Date | null;
  nowMs?: number;
}): number {
  const baseSeconds = Math.max(0, Math.floor(params.actualDurationSeconds || 0));
  if (params.status !== 'running' || !params.lastResumedAt) {
    return baseSeconds;
  }

  const resumedMs =
    params.lastResumedAt instanceof Date
      ? params.lastResumedAt.getTime()
      : Date.parse(params.lastResumedAt);

  if (!Number.isFinite(resumedMs)) {
    return baseSeconds;
  }

  const currentMs = params.nowMs ?? Date.now();
  const deltaSeconds = Math.max(0, Math.floor((currentMs - resumedMs) / 1000));
  return Math.min(86400, baseSeconds + deltaSeconds);
}

/**
 * Derives countdown remaining time, elapsed time, and completion state from timestamps.
 */
export function computeCountdownState(params: {
  plannedDurationSeconds: number;
  status: FocusSessionStatus;
  actualDurationSeconds: number;
  lastResumedAt: string | Date | null;
  nowMs?: number;
}): {
  elapsedSeconds: number;
  remainingSeconds: number;
  progressRatio: number;
  isReachedZero: boolean;
} {
  const planned = Math.max(60, Math.floor(params.plannedDurationSeconds || 1500));
  const rawElapsed = computeElapsedActiveSeconds({
    status: params.status,
    actualDurationSeconds: params.actualDurationSeconds,
    lastResumedAt: params.lastResumedAt,
    nowMs: params.nowMs,
  });

  if (params.status === 'completed') {
    return {
      elapsedSeconds: Math.min(planned, Math.max(1, rawElapsed)),
      remainingSeconds: 0,
      progressRatio: 1,
      isReachedZero: true,
    };
  }

  const clampedElapsed = Math.min(planned, rawElapsed);
  const remainingSeconds = Math.max(0, planned - clampedElapsed);
  const progressRatio = Math.min(1, Math.max(0, clampedElapsed / planned));

  return {
    elapsedSeconds: clampedElapsed,
    remainingSeconds,
    progressRatio,
    isReachedZero: remainingSeconds === 0,
  };
}

/**
 * Formats countdown seconds as MM:SS (or HH:MM:SS if >= 60 minutes).
 */
export function formatCountdownDisplay(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats stopwatch seconds as HH:MM:SS starting at 00:00:00.
 */
export function formatStopwatchDisplay(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats duration in a concise human-readable summary ("25 min", "3h 45m", "14m 36s").
 */
export function formatDurationSummary(
  seconds: number,
  includeSecondsForSubMinute = true
): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  if (safe === 0) return '0 min';

  if (safe < 60 && includeSecondsForSubMinute) {
    return `${safe}s`;
  }

  const totalMinutes = Math.floor(safe / 60);
  const remSeconds = safe % 60;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  if (totalMinutes < 10 && remSeconds > 0 && includeSecondsForSubMinute) {
    return `${totalMinutes}m ${remSeconds}s`;
  }

  return `${Math.max(1, Math.round(safe / 60))} min`;
}

/**
 * Determines whether the next break after completing a focus session should be
 * a short break or a long break (default every 4 completed focus sessions).
 */
export function computeNextBreakType(
  completedFocusCount: number,
  longBreakInterval = 4
): 'short_break' | 'long_break' {
  const safeInterval = Math.max(2, Math.min(12, Math.floor(longBreakInterval || 4)));
  const safeCount = Math.max(0, Math.floor(completedFocusCount || 0));
  if (safeCount > 0 && safeCount % safeInterval === 0) {
    return 'long_break';
  }
  return 'short_break';
}

/**
 * Computes the next stopwatch lap entry from existing laps and current total elapsed seconds.
 */
export function computeNextStopwatchLap(
  existingLaps: StopwatchLapItem[],
  currentTotalElapsedSeconds: number
): StopwatchLapItem {
  const totalSeconds = Math.max(1, Math.floor(currentTotalElapsedSeconds || 0));
  const previousTotal =
    existingLaps.length > 0
      ? existingLaps[existingLaps.length - 1].totalSeconds
      : 0;
  const splitSeconds = Math.max(1, totalSeconds - previousTotal);

  return {
    lapNumber: existingLaps.length + 1,
    splitSeconds,
    totalSeconds,
  };
}

/**
 * Safely parses stopwatch laps JSON stored in focus_sessions.laps_json.
 */
export function parseStopwatchLaps(
  lapsJson: string | null | undefined
): StopwatchLapItem[] {
  if (!lapsJson) return [];
  try {
    const parsed = JSON.parse(lapsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid: StopwatchLapItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const lapNumber = Number(rec.lapNumber);
      const splitSeconds = Number(rec.splitSeconds);
      const totalSeconds = Number(rec.totalSeconds);
      if (
        Number.isFinite(lapNumber) &&
        lapNumber >= 1 &&
        Number.isFinite(splitSeconds) &&
        splitSeconds >= 0 &&
        Number.isFinite(totalSeconds) &&
        totalSeconds >= 0
      ) {
        valid.push({
          lapNumber: Math.floor(lapNumber),
          splitSeconds: Math.floor(splitSeconds),
          totalSeconds: Math.floor(totalSeconds),
        });
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export function validateStartFocusSessionInput(input: Record<string, unknown>):
  | {
      ok: true;
      value: {
        sessionType: FocusSessionType;
        presetId: FocusPresetId;
        plannedDurationSeconds: number;
        taskId: string | null;
      };
    }
  | { ok: false; message: string } {
  const rawType =
    typeof input.sessionType === 'string' ? input.sessionType.trim() : 'focus';
  if (!FOCUS_SESSION_TYPES.includes(rawType as FocusSessionType)) {
    return {
      ok: false,
      message: 'Session type must be focus, short_break, long_break, or stopwatch.',
    };
  }
  const sessionType = rawType as FocusSessionType;

  const rawPreset =
    typeof input.presetId === 'string'
      ? input.presetId.trim()
      : sessionType === 'stopwatch'
        ? 'stopwatch'
        : 'pomodoro';
  if (!FOCUS_PRESET_IDS.includes(rawPreset as FocusPresetId)) {
    return {
      ok: false,
      message: 'Invalid focus preset selected.',
    };
  }
  const presetId = rawPreset as FocusPresetId;

  let plannedDurationSeconds = 0;
  if (sessionType === 'stopwatch') {
    plannedDurationSeconds = 0;
  } else {
    const numPlanned = Number(input.plannedDurationSeconds);
    if (
      !Number.isFinite(numPlanned) ||
      numPlanned < 60 ||
      numPlanned > 43200
    ) {
      return {
        ok: false,
        message: 'Countdown duration must be between 1 minute and 12 hours.',
      };
    }
    plannedDurationSeconds = Math.round(numPlanned);
  }

  let taskId: string | null = null;
  if (typeof input.taskId === 'string' && input.taskId.trim()) {
    const candidate = input.taskId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
      return { ok: false, message: 'Invalid linked task ID.' };
    }
    taskId = candidate;
  }

  return {
    ok: true,
    value: {
      sessionType,
      presetId,
      plannedDurationSeconds,
      taskId,
    },
  };
}

export type FocusSessionPatchAction =
  | 'pause'
  | 'resume'
  | 'complete'
  | 'interrupt'
  | 'extend'
  | 'update_meta';

export function validateUpdateFocusSessionInput(
  input: Record<string, unknown>
):
  | {
      ok: true;
      value: {
        action: FocusSessionPatchAction;
        actualDurationSeconds?: number;
        addSeconds?: number;
        taskId?: string | null;
        laps?: StopwatchLapItem[];
      };
    }
  | { ok: false; message: string } {
  const rawAction =
    typeof input.action === 'string' ? input.action.trim() : '';
  const allowedActions: FocusSessionPatchAction[] = [
    'pause',
    'resume',
    'complete',
    'interrupt',
    'extend',
    'update_meta',
  ];
  if (!allowedActions.includes(rawAction as FocusSessionPatchAction)) {
    return {
      ok: false,
      message: 'Unsupported focus session update action.',
    };
  }
  const action = rawAction as FocusSessionPatchAction;

  let actualDurationSeconds: number | undefined;
  if (input.actualDurationSeconds !== undefined) {
    const parsed = Number(input.actualDurationSeconds);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 86400) {
      return {
        ok: false,
        message: 'Actual duration must be between 0 and 86,400 seconds.',
      };
    }
    actualDurationSeconds = Math.floor(parsed);
  }

  let addSeconds: number | undefined;
  if (action === 'extend') {
    const parsedAdd = Number(input.addSeconds ?? 300);
    if (!Number.isFinite(parsedAdd) || parsedAdd < 60 || parsedAdd > 7200) {
      return {
        ok: false,
        message: 'Extension must be between 1 minute and 120 minutes.',
      };
    }
    addSeconds = Math.floor(parsedAdd);
  }

  let taskId: string | null | undefined = undefined;
  if ('taskId' in input) {
    if (input.taskId === null || input.taskId === '') {
      taskId = null;
    } else if (typeof input.taskId === 'string') {
      const candidate = input.taskId.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
        return { ok: false, message: 'Invalid linked task ID.' };
      }
      taskId = candidate;
    }
  }

  let laps: StopwatchLapItem[] | undefined;
  if (Array.isArray(input.laps)) {
    laps = parseStopwatchLaps(JSON.stringify(input.laps));
  }

  return {
    ok: true,
    value: {
      action,
      actualDurationSeconds,
      addSeconds,
      taskId,
      laps,
    },
  };
}

function formatTimeInTimezone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
}

function formatShortDateHeader(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }
}

function getShortWeekdayInTimezone(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(dt);
}

/**
 * Builds the complete Focus Studio view model and real database statistics.
 * Never fabricates sessions or counts break durations as focused time.
 */
export function buildFocusWorkspaceViewModel(params: {
  sessions: FocusSessionRow[];
  tasks: TaskRow[];
  timezone?: string | null;
  now?: Date;
}): FocusWorkspaceViewModel {
  const safeTz = resolveValidTimezone(params.timezone);
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const todayLocalDate = getLocalDateString(now, safeTz);
  const todayFormattedDate = formatShortDateHeader(now, safeTz);

  const taskTitleById = new Map<string, string>();
  const linkableTasks: SerializedFocusTask[] = [];
  for (const t of params.tasks) {
    taskTitleById.set(t.id, t.title);
    if (t.status !== 'archived' && t.status !== 'completed') {
      linkableTasks.push({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
      });
    }
  }

  let activeCountdownSession: SerializedFocusSession | null = null;
  let activeStopwatchSession: SerializedFocusSession | null = null;
  const serializedSessions: SerializedFocusSession[] = [];

  // Sort newest first by startedAt
  const sortedRows = [...params.sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  for (const row of sortedRows) {
    const sessionType = (
      FOCUS_SESSION_TYPES.includes(row.sessionType as FocusSessionType)
        ? row.sessionType
        : 'focus'
    ) as FocusSessionType;
    const presetId = (
      FOCUS_PRESET_IDS.includes(row.presetId as FocusPresetId)
        ? row.presetId
        : 'pomodoro'
    ) as FocusPresetId;
    const status = (
      FOCUS_SESSION_STATUSES.includes(row.status as FocusSessionStatus)
        ? row.status
        : 'interrupted'
    ) as FocusSessionStatus;

    const elapsedActiveSeconds = computeElapsedActiveSeconds({
      status,
      actualDurationSeconds: row.actualDurationSeconds,
      lastResumedAt: row.lastResumedAt,
      nowMs,
    });

    const remainingSeconds =
      sessionType === 'stopwatch'
        ? 0
        : Math.max(0, row.plannedDurationSeconds - elapsedActiveSeconds);

    const referenceTimestamp = row.completedAt ?? row.endedAt ?? row.startedAt;
    const localDateKey = getLocalDateString(
      new Date(referenceTimestamp),
      safeTz
    );

    const effectiveDurationForDisplay =
      status === 'running' || status === 'paused'
        ? elapsedActiveSeconds
        : row.actualDurationSeconds;

    const serialized: SerializedFocusSession = {
      id: row.id,
      userId: row.userId,
      taskId: row.taskId ?? null,
      taskTitle: row.taskId ? (taskTitleById.get(row.taskId) ?? null) : null,
      sessionType,
      presetId,
      status,
      plannedDurationSeconds: row.plannedDurationSeconds,
      actualDurationSeconds: row.actualDurationSeconds,
      elapsedActiveSeconds,
      remainingSeconds,
      laps: parseStopwatchLaps(row.lapsJson),
      startedAt: new Date(row.startedAt).toISOString(),
      lastResumedAt: row.lastResumedAt
        ? new Date(row.lastResumedAt).toISOString()
        : null,
      endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
      completedAt: row.completedAt
        ? new Date(row.completedAt).toISOString()
        : null,
      localDateKey,
      formattedTimeLabel: formatTimeInTimezone(
        new Date(referenceTimestamp),
        safeTz
      ),
      durationSummaryLabel: formatDurationSummary(effectiveDurationForDisplay),
    };

    if (status === 'running' || status === 'paused') {
      if (sessionType === 'stopwatch') {
        if (!activeStopwatchSession) {
          activeStopwatchSession = serialized;
        }
      } else if (!activeCountdownSession) {
        activeCountdownSession = serialized;
      }
    } else {
      serializedSessions.push(serialized);
    }
  }

  // Compute statistics strictly from completed / interrupted records
  let completedFocusSessionsToday = 0;
  let focusedSecondsToday = 0;
  let interruptedSessionsToday = 0;
  let totalCompletedFocusSessions = 0;
  let totalInterruptedSessions = 0;

  const focusedSecondsByDate = new Map<string, number>();
  const completedCountByDate = new Map<string, number>();
  const datesWithCompletedFocus = new Set<string>();

  for (const s of serializedSessions) {
    const isFocusOrStopwatch =
      s.sessionType === 'focus' || s.sessionType === 'stopwatch';

    if (s.status === 'completed') {
      if (isFocusOrStopwatch && s.actualDurationSeconds > 0) {
        totalCompletedFocusSessions += 1;
        if (s.localDateKey === todayLocalDate) {
          completedFocusSessionsToday += 1;
        }
      }

      // Break sessions NEVER count as focused time
      if (isFocusOrStopwatch && s.actualDurationSeconds > 0) {
        datesWithCompletedFocus.add(s.localDateKey);
        focusedSecondsByDate.set(
          s.localDateKey,
          (focusedSecondsByDate.get(s.localDateKey) ?? 0) +
            s.actualDurationSeconds
        );
        completedCountByDate.set(
          s.localDateKey,
          (completedCountByDate.get(s.localDateKey) ?? 0) + 1
        );

        if (s.localDateKey === todayLocalDate) {
          focusedSecondsToday += s.actualDurationSeconds;
        }
      }
    } else if (s.status === 'interrupted') {
      totalInterruptedSessions += 1;
      if (s.localDateKey === todayLocalDate) {
        interruptedSessionsToday += 1;
      }
    }
  }

  // Calculate consecutive day focus streak
  let focusStreakDays = 0;
  let cursorDate = datesWithCompletedFocus.has(todayLocalDate)
    ? todayLocalDate
    : shiftLocalDateString(todayLocalDate, -1);

  while (datesWithCompletedFocus.has(cursorDate)) {
    focusStreakDays += 1;
    cursorDate = shiftLocalDateString(cursorDate, -1);
  }

  // Last 7 days bar chart (oldest -> today)
  const last7Keys: string[] = [];
  let walkDate = todayLocalDate;
  for (let i = 0; i < 7; i++) {
    last7Keys.unshift(walkDate);
    walkDate = shiftLocalDateString(walkDate, -1);
  }

  let weeklyFocusedSeconds = 0;
  const weeklyDays: FocusWeeklyDayBar[] = last7Keys.map((dateKey) => {
    const secs = focusedSecondsByDate.get(dateKey) ?? 0;
    weeklyFocusedSeconds += secs;
    return {
      dateKey,
      dayShortLabel: getShortWeekdayInTimezone(dateKey),
      focusedSeconds: secs,
      focusedMinutes: Math.round(secs / 60),
      completedSessionsCount: completedCountByDate.get(dateKey) ?? 0,
      isToday: dateKey === todayLocalDate,
    };
  });

  const focusedMinutesToday = Math.round(focusedSecondsToday / 60);
  const weeklyFocusedMinutes = Math.round(weeklyFocusedSeconds / 60);

  const completedCyclesInSet = completedFocusSessionsToday % 4;
  const nextRecommendedBreakType = computeNextBreakType(
    completedFocusSessionsToday,
    4
  );

  return {
    timezone: safeTz,
    summary: {
      todayLocalDate,
      todayFormattedDate,
      completedFocusSessionsToday,
      focusedSecondsToday,
      focusedMinutesToday,
      focusedTodayFormatted:
        focusedSecondsToday > 0 && focusedSecondsToday < 60
          ? `${focusedSecondsToday}s`
          : `${focusedMinutesToday} min`,
      interruptedSessionsToday,
      focusStreakDays,
      weeklyFocusedSeconds,
      weeklyFocusedMinutes,
      weeklyTotalFormatted: formatDurationSummary(weeklyFocusedSeconds, false),
      totalCompletedFocusSessions,
      totalInterruptedSessions,
      completedCyclesInSet,
      nextRecommendedBreakType,
    },
    weeklyDays,
    activeCountdownSession,
    activeStopwatchSession,
    recentSessions: serializedSessions.slice(0, 30),
    linkableTasks,
  };
}
