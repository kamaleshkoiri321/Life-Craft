import test from 'node:test';
import assert from 'node:assert/strict';
import type { FocusSessionRow, TaskRow } from '@/lib/db/schema';
import {
  FOCUS_PRESETS,
  buildFocusWorkspaceViewModel,
  computeCountdownState,
  computeElapsedActiveSeconds,
  computeNextBreakType,
  computeNextStopwatchLap,
  formatCountdownDisplay,
  formatStopwatchDisplay,
  parseStopwatchLaps,
  validateStartFocusSessionInput,
  validateUpdateFocusSessionInput,
} from './focus-utils';

test('FOCUS_PRESETS match required Pomodoro, Deep Focus, Extended Focus, and long-break specifications', () => {
  assert.equal(FOCUS_PRESETS.pomodoro.focusMinutes, 25);
  assert.equal(FOCUS_PRESETS.pomodoro.shortBreakMinutes, 5);
  assert.equal(FOCUS_PRESETS.pomodoro.longBreakMinutes, 20);
  assert.equal(FOCUS_PRESETS.pomodoro.longBreakInterval, 4);

  assert.equal(FOCUS_PRESETS.deep_focus.focusMinutes, 50);
  assert.equal(FOCUS_PRESETS.deep_focus.shortBreakMinutes, 10);

  assert.equal(FOCUS_PRESETS.extended_focus.focusMinutes, 90);
  assert.equal(FOCUS_PRESETS.extended_focus.shortBreakMinutes, 20);

  assert.equal(computeNextBreakType(1, 4), 'short_break');
  assert.equal(computeNextBreakType(2, 4), 'short_break');
  assert.equal(computeNextBreakType(3, 4), 'short_break');
  assert.equal(computeNextBreakType(4, 4), 'long_break');
  assert.equal(computeNextBreakType(8, 4), 'long_break');
});

test('computeElapsedActiveSeconds and computeCountdownState derive remaining time from timestamps and exclude paused time', () => {
  const t0 = Date.parse('2026-10-29T10:00:00.000Z');
  const tAfter10Min = Date.parse('2026-10-29T10:10:00.000Z');

  // Running session after 10 minutes in background tab
  const runningState = computeCountdownState({
    plannedDurationSeconds: 1500, // 25 min
    status: 'running',
    actualDurationSeconds: 0,
    lastResumedAt: new Date(t0).toISOString(),
    nowMs: tAfter10Min,
  });

  assert.equal(runningState.elapsedSeconds, 600);
  assert.equal(runningState.remainingSeconds, 900);
  assert.equal(formatCountdownDisplay(runningState.remainingSeconds), '15:00');
  assert.equal(runningState.isReachedZero, false);

  // Paused session: 30 minutes pass while paused -> elapsed remains 600s!
  const tAfter40MinWhilePaused = Date.parse('2026-10-29T10:40:00.000Z');
  const pausedElapsed = computeElapsedActiveSeconds({
    status: 'paused',
    actualDurationSeconds: 600,
    lastResumedAt: null,
    nowMs: tAfter40MinWhilePaused,
  });
  assert.equal(pausedElapsed, 600);

  const pausedState = computeCountdownState({
    plannedDurationSeconds: 1500,
    status: 'paused',
    actualDurationSeconds: 600,
    lastResumedAt: null,
    nowMs: tAfter40MinWhilePaused,
  });
  assert.equal(pausedState.remainingSeconds, 900);

  // Resumed at 10:40:00Z, checked 15 minutes later at 10:55:00Z -> reaches 0
  const tAfterResume15Min = Date.parse('2026-10-29T10:55:00.000Z');
  const finishedState = computeCountdownState({
    plannedDurationSeconds: 1500,
    status: 'running',
    actualDurationSeconds: 600,
    lastResumedAt: new Date(tAfter40MinWhilePaused).toISOString(),
    nowMs: tAfterResume15Min,
  });
  assert.equal(finishedState.elapsedSeconds, 1500);
  assert.equal(finishedState.remainingSeconds, 0);
  assert.equal(finishedState.isReachedZero, true);
});

test('Stopwatch formatting and lap calculations compute individual splits and cumulative totals accurately', () => {
  assert.equal(formatStopwatchDisplay(0), '00:00:00');
  assert.equal(formatStopwatchDisplay(876), '00:14:36');
  assert.equal(formatStopwatchDisplay(3665), '01:01:05');

  const lap1 = computeNextStopwatchLap([], 876); // 14m 36s
  assert.deepEqual(lap1, {
    lapNumber: 1,
    splitSeconds: 876,
    totalSeconds: 876,
  });

  const lap2 = computeNextStopwatchLap([lap1], 1966); // +18m 10s (1090s)
  assert.deepEqual(lap2, {
    lapNumber: 2,
    splitSeconds: 1090,
    totalSeconds: 1966,
  });

  const parsed = parseStopwatchLaps(JSON.stringify([lap1, lap2]));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].splitSeconds, 1090);
});

test('validateStartFocusSessionInput and validateUpdateFocusSessionInput enforce session types, durations, and task UUIDs', () => {
  const validPomodoro = validateStartFocusSessionInput({
    sessionType: 'focus',
    presetId: 'pomodoro',
    plannedDurationSeconds: 1500,
    taskId: '11111111-2222-3333-4444-555555555555',
  });
  assert.equal(validPomodoro.ok, true);

  const validStopwatch = validateStartFocusSessionInput({
    sessionType: 'stopwatch',
    presetId: 'stopwatch',
    plannedDurationSeconds: 0,
  });
  assert.equal(validStopwatch.ok, true);

  const invalidDuration = validateStartFocusSessionInput({
    sessionType: 'focus',
    presetId: 'pomodoro',
    plannedDurationSeconds: 10, // < 60s
  });
  assert.equal(invalidDuration.ok, false);

  const invalidTask = validateStartFocusSessionInput({
    sessionType: 'focus',
    presetId: 'pomodoro',
    plannedDurationSeconds: 1500,
    taskId: 'not-a-uuid',
  });
  assert.equal(invalidTask.ok, false);

  const validComplete = validateUpdateFocusSessionInput({
    action: 'complete',
    actualDurationSeconds: 1500,
  });
  assert.equal(validComplete.ok, true);
});

test('buildFocusWorkspaceViewModel computes real statistics, excludes breaks and interrupted sessions from focused totals, and handles empty state without NaN', () => {
  const now = new Date('2026-10-29T12:00:00.000Z');
  const emptyVm = buildFocusWorkspaceViewModel({
    sessions: [],
    tasks: [],
    timezone: 'UTC',
    now,
  });
  assert.equal(emptyVm.summary.completedFocusSessionsToday, 0);
  assert.equal(emptyVm.summary.focusedMinutesToday, 0);
  assert.equal(emptyVm.summary.focusStreakDays, 0);
  assert.equal(Number.isNaN(emptyVm.summary.focusedMinutesToday), false);

  const tasks: TaskRow[] = [
    {
      id: '11111111-2222-3333-4444-555555555555',
      userId: 'user-1',
      title: 'Research Project',
      description: null,
      status: 'todo',
      priority: 'high',
      dueAt: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      completedAt: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const sessions: FocusSessionRow[] = [
    // 1. Completed 25-min focus session today
    {
      id: 's-1',
      userId: 'user-1',
      taskId: '11111111-2222-3333-4444-555555555555',
      sessionType: 'focus',
      presetId: 'pomodoro',
      status: 'completed',
      plannedDurationSeconds: 1500,
      actualDurationSeconds: 1500,
      lapsJson: null,
      startedAt: new Date('2026-10-29T09:00:00.000Z'),
      lastResumedAt: null,
      endedAt: new Date('2026-10-29T09:25:00.000Z'),
      completedAt: new Date('2026-10-29T09:25:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
    // 2. Completed 5-min short break today (must NOT count as focused time!)
    {
      id: 's-2',
      userId: 'user-1',
      taskId: null,
      sessionType: 'short_break',
      presetId: 'pomodoro',
      status: 'completed',
      plannedDurationSeconds: 300,
      actualDurationSeconds: 300,
      lapsJson: null,
      startedAt: new Date('2026-10-29T09:26:00.000Z'),
      lastResumedAt: null,
      endedAt: new Date('2026-10-29T09:31:00.000Z'),
      completedAt: new Date('2026-10-29T09:31:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
    // 3. Interrupted focus session today (must NOT count as completed focus session!)
    {
      id: 's-3',
      userId: 'user-1',
      taskId: null,
      sessionType: 'focus',
      presetId: 'pomodoro',
      status: 'interrupted',
      plannedDurationSeconds: 1500,
      actualDurationSeconds: 400,
      lapsJson: null,
      startedAt: new Date('2026-10-29T10:00:00.000Z'),
      lastResumedAt: null,
      endedAt: new Date('2026-10-29T10:06:40.000Z'),
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    // 4. Completed 25-min focus session yesterday (contributes to streak & weekly total)
    {
      id: 's-4',
      userId: 'user-1',
      taskId: null,
      sessionType: 'focus',
      presetId: 'pomodoro',
      status: 'completed',
      plannedDurationSeconds: 1500,
      actualDurationSeconds: 1500,
      lapsJson: null,
      startedAt: new Date('2026-10-28T10:00:00.000Z'),
      lastResumedAt: null,
      endedAt: new Date('2026-10-28T10:25:00.000Z'),
      completedAt: new Date('2026-10-28T10:25:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
  ];

  const vm = buildFocusWorkspaceViewModel({
    sessions,
    tasks,
    timezone: 'UTC',
    now,
  });

  assert.equal(vm.summary.completedFocusSessionsToday, 1);
  assert.equal(vm.summary.focusedMinutesToday, 25); // Break (5m) and interrupted (6m40s) excluded!
  assert.equal(vm.summary.interruptedSessionsToday, 1);
  assert.equal(vm.summary.focusStreakDays, 2); // Oct 28 + Oct 29
  assert.equal(vm.summary.weeklyFocusedMinutes, 50); // 25m today + 25m yesterday
  const s1 = vm.recentSessions.find((s) => s.id === 's-1');
  assert.equal(s1?.taskTitle, 'Research Project');
});
