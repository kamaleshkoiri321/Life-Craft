import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskRow } from '../db/schema';
import { serializeTaskRow } from '../tasks/validation';
import {
  buildDayScheduleData,
  getCalendarPeriodRange,
  HOUR_ROWS,
  shiftCalendarAnchorDate,
} from './calendar-utils';

const SAMPLE_NOW = new Date('2026-10-27T04:15:00.000Z'); // 10:00 AM Asia/Kathmandu

function makeTaskRow(overrides: Partial<TaskRow> & { id: string; title: string }): TaskRow {
  return {
    id: overrides.id,
    userId: overrides.userId ?? 'user-1',
    title: overrides.title,
    description: overrides.description ?? null,
    status: overrides.status ?? 'todo',
    priority: overrides.priority ?? 'medium',
    dueAt: overrides.dueAt ?? null,
    scheduledStartAt: overrides.scheduledStartAt ?? null,
    scheduledEndAt: overrides.scheduledEndAt ?? null,
    isAllDay: overrides.isAllDay ?? false,
    completedAt: overrides.completedAt ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt ?? SAMPLE_NOW,
    updatedAt: overrides.updatedAt ?? SAMPLE_NOW,
  };
}

test('HOUR_ROWS defines 24 hourly labels with 6 AM–11 PM marked as initial visible range', () => {
  assert.equal(HOUR_ROWS.length, 24);
  assert.equal(HOUR_ROWS[0].label, '12 AM');
  assert.equal(HOUR_ROWS[0].isInitialVisibleRange, false);
  assert.equal(HOUR_ROWS[6].label, '6 AM');
  assert.equal(HOUR_ROWS[6].isInitialVisibleRange, true);
  assert.equal(HOUR_ROWS[23].label, '11 PM');
  assert.equal(HOUR_ROWS[23].isInitialVisibleRange, true);
});

test('getCalendarPeriodRange and shiftCalendarAnchorDate work for Day, Week, and Month views', () => {
  // Day view
  const dayRange = getCalendarPeriodRange({
    anchorDate: '2026-10-27',
    view: 'day',
    timezone: 'Asia/Kathmandu',
    weekStartsOn: 1,
    todayLocalDate: '2026-10-27',
  });
  assert.equal(dayRange.days.length, 1);
  assert.equal(dayRange.days[0].dateKey, '2026-10-27');
  assert.equal(dayRange.days[0].isToday, true);

  // Week view (Monday start: Oct 26 – Nov 1, 2026)
  const weekRange = getCalendarPeriodRange({
    anchorDate: '2026-10-27',
    view: 'week',
    timezone: 'Asia/Kathmandu',
    weekStartsOn: 1,
    todayLocalDate: '2026-10-27',
  });
  assert.equal(weekRange.days.length, 7);
  assert.equal(weekRange.startDateKey, '2026-10-26');
  assert.equal(weekRange.endDateKey, '2026-11-01');
  assert.equal(weekRange.headingLabel, 'Oct 26 – Nov 1, 2026');

  // Month view (42 days / 6 weeks)
  const monthRange = getCalendarPeriodRange({
    anchorDate: '2026-10-27',
    view: 'month',
    timezone: 'Asia/Kathmandu',
    weekStartsOn: 1,
    todayLocalDate: '2026-10-27',
  });
  assert.equal(monthRange.days.length, 42);
  assert.equal(monthRange.headingLabel, 'October 2026');
  assert.equal(monthRange.days[0].dateKey, '2026-09-28');

  // Navigation shifts
  assert.equal(shiftCalendarAnchorDate('2026-10-27', 'day', 1), '2026-10-28');
  assert.equal(shiftCalendarAnchorDate('2026-10-27', 'week', -1), '2026-10-20');
  assert.equal(shiftCalendarAnchorDate('2026-01-31', 'month', 1), '2026-02-28');
});

test('buildDayScheduleData separates deadline-only, all-day, overlapping timed tasks, and midnight-spanning tasks', () => {
  const dayRange = getCalendarPeriodRange({
    anchorDate: '2026-10-27',
    view: 'day',
    timezone: 'Asia/Kathmandu',
    todayLocalDate: '2026-10-27',
  });
  const day = dayRange.days[0];

  const rows: TaskRow[] = [
    // 1. Deadline-only task (must NOT be placed in hourly timed grid)
    makeTaskRow({
      id: 't-deadline',
      title: 'Submit tax form',
      dueAt: new Date('2026-10-27T11:15:00.000Z'), // 5:00 PM local deadline
    }),
    // 2. All-day scheduled task
    makeTaskRow({
      id: 't-allday',
      title: 'Design sprint day',
      scheduledStartAt: new Date('2026-10-26T18:15:00.000Z'), // 00:00 Oct 27 Asia/Kathmandu
      scheduledEndAt: new Date('2026-10-27T18:15:00.000Z'), // 00:00 Oct 28 Asia/Kathmandu
      isAllDay: true,
    }),
    // 3. Timed task A: 9:00 AM – 10:30 AM (03:15 UTC – 04:45 UTC)
    makeTaskRow({
      id: 't-timed-a',
      title: 'Architecture review',
      scheduledStartAt: new Date('2026-10-27T03:15:00.000Z'),
      scheduledEndAt: new Date('2026-10-27T04:45:00.000Z'),
      isAllDay: false,
    }),
    // 4. Timed task B overlapping A: 10:00 AM – 11:00 AM (04:15 UTC – 05:15 UTC)
    makeTaskRow({
      id: 't-timed-b',
      title: 'Product sync',
      scheduledStartAt: new Date('2026-10-27T04:15:00.000Z'),
      scheduledEndAt: new Date('2026-10-27T05:15:00.000Z'),
      isAllDay: false,
    }),
    // 5. Overnight task spanning midnight into Oct 28: 11:00 PM Oct 27 – 1:00 AM Oct 28 (17:15 UTC – 19:15 UTC)
    makeTaskRow({
      id: 't-overnight',
      title: 'Database maintenance',
      scheduledStartAt: new Date('2026-10-27T17:15:00.000Z'),
      scheduledEndAt: new Date('2026-10-27T19:15:00.000Z'),
      isAllDay: false,
    }),
  ];

  const serialized = rows.map((r) =>
    serializeTaskRow(r, { timezone: 'Asia/Kathmandu', now: SAMPLE_NOW })
  );

  const schedule = buildDayScheduleData({
    day,
    tasks: serialized,
    timezone: 'Asia/Kathmandu',
  });

  // Deadline-only task is kept in deadlineOnlyTasks, not timedItems
  assert.equal(schedule.deadlineOnlyTasks.length, 1);
  assert.equal(schedule.deadlineOnlyTasks[0].id, 't-deadline');

  // All-day task is in allDayTasks
  assert.equal(schedule.allDayTasks.length, 1);
  assert.equal(schedule.allDayTasks[0].id, 't-allday');

  // Timed items: A, B, and Overnight
  assert.equal(schedule.timedItems.length, 3);
  assert.equal(schedule.conflictCount, 2);

  const itemA = schedule.timedItems.find((i) => i.task?.id === 't-timed-a')!;
  const itemB = schedule.timedItems.find((i) => i.task?.id === 't-timed-b')!;
  const itemOvernight = schedule.timedItems.find(
    (i) => i.task?.id === 't-overnight'
  )!;

  assert.equal(itemA.hasConflict, true);
  assert.equal(itemB.hasConflict, true);
  assert.equal(itemA.totalColumns, 2);
  assert.equal(itemB.totalColumns, 2);
  assert.notEqual(itemA.columnIndex, itemB.columnIndex);

  assert.equal(itemOvernight.spansMidnightAfter, true);
  assert.equal(itemOvernight.spansMidnightBefore, false);
  assert.equal(itemOvernight.startMinutes, 23 * 60);
  assert.equal(itemOvernight.endMinutes, 24 * 60);
});
