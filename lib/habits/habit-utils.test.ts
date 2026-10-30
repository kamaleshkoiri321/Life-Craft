import test from 'node:test';
import assert from 'node:assert/strict';
import type { HabitLogRow, HabitRow } from '../db/schema';
import {
  buildHabitsViewModel,
  calculateHabitStreaksAndRate,
  getIsoWeekday,
  getIsoWeekDateKeys,
  isHabitDueOnDate,
  validateHabitCheckInInput,
  validateHabitCreateInput,
  validateHabitUpdateInput,
} from './habit-utils';

test('validateHabitCreateInput enforces required name, target range 1..7, and normalizes scheduledDays', () => {
  const emptyName = validateHabitCreateInput({ title: '   ' });
  assert.equal(emptyName.valid, false);

  const invalidTarget = validateHabitCreateInput({
    title: 'Read 20 pages',
    targetPerWeek: 9,
  });
  assert.equal(invalidTarget.valid, false);

  const valid = validateHabitCreateInput({
    title: '  Read for 20 minutes  ',
    description: '  Grow knowledge  ',
    targetPerWeek: 5,
    scheduledDays: [5, 1, 3, 2, 4, 1],
  });
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.data.title, 'Read for 20 minutes');
    assert.equal(valid.data.description, 'Grow knowledge');
    assert.equal(valid.data.targetPerWeek, 5);
    assert.deepEqual(valid.data.scheduledDays, [1, 2, 3, 4, 5]);
  }
});

test('validateHabitUpdateInput and validateHabitCheckInInput validate fields and check-in actions', () => {
  const updateRes = validateHabitUpdateInput({
    title: 'Drink 8 glasses of water',
    isActive: false,
  });
  assert.equal(updateRes.valid, true);

  const checkInComplete = validateHabitCheckInInput(
    { date: '2026-10-27', status: 'completed' },
    '2026-10-27'
  );
  assert.equal(checkInComplete.valid, true);

  const checkInSkip = validateHabitCheckInInput(
    { date: '2026-10-27', status: 'skipped' },
    '2026-10-27'
  );
  assert.equal(checkInSkip.valid, true);

  const checkInInvalidDate = validateHabitCheckInInput(
    { date: '2026-02-31', status: 'completed' },
    '2026-10-27'
  );
  assert.equal(checkInInvalidDate.valid, false);
});

test('getIsoWeekday and getIsoWeekDateKeys compute Monday-to-Sunday weeks without timezone drift', () => {
  // 2026-10-27 is a Tuesday (ISO weekday 2)
  assert.equal(getIsoWeekday('2026-10-27'), 2);
  const weekKeys = getIsoWeekDateKeys('2026-10-27');
  assert.deepEqual(weekKeys, [
    '2026-10-26', // Mon
    '2026-10-27', // Tue
    '2026-10-28', // Wed
    '2026-10-29', // Thu
    '2026-10-30', // Fri
    '2026-10-31', // Sat
    '2026-11-01', // Sun
  ]);
});

test('calculateHabitStreaksAndRate handles weekday-specific schedules, unscheduled days, incomplete today, and skipped days', () => {
  // Habit scheduled on Mon (1), Wed (3), Fri (5)
  const habit = {
    scheduledDays: [1, 3, 5],
    targetPerWeek: 3,
    createdAt: new Date('2026-10-12T00:00:00.000Z'), // Mon Oct 12, 2026
  };

  // Completed Mon Oct 19, Wed Oct 21, Fri Oct 23, Mon Oct 26.
  // Today is Wed Oct 28 (not yet logged). Streak should still be 4!
  const logs = [
    { completedOn: '2026-10-12', status: 'completed' }, // Mon
    { completedOn: '2026-10-14', status: 'completed' }, // Wed
    { completedOn: '2026-10-16', status: 'skipped' }, // Fri skipped -> breaks streak
    { completedOn: '2026-10-19', status: 'completed' }, // Mon (1)
    { completedOn: '2026-10-21', status: 'completed' }, // Wed (2)
    { completedOn: '2026-10-23', status: 'completed' }, // Fri (3)
    { completedOn: '2026-10-26', status: 'completed' }, // Mon (4)
  ];

  const beforeTodayDone = calculateHabitStreaksAndRate({
    habit,
    logs,
    todayLocalDate: '2026-10-28', // Wed
    timezone: 'Asia/Kathmandu',
  });
  assert.equal(beforeTodayDone.currentStreak, 4);
  assert.equal(beforeTodayDone.bestStreak, 4);

  // When Wed Oct 28 is completed, streak increments to 5
  const afterTodayDone = calculateHabitStreaksAndRate({
    habit,
    logs: [...logs, { completedOn: '2026-10-28', status: 'completed' }],
    todayLocalDate: '2026-10-28',
    timezone: 'Asia/Kathmandu',
  });
  assert.equal(afterTodayDone.currentStreak, 5);
  assert.equal(afterTodayDone.bestStreak, 5);

  // If Wed Oct 28 is explicitly skipped, current streak resets to 0 while bestStreak remains 4
  const afterTodaySkipped = calculateHabitStreaksAndRate({
    habit,
    logs: [...logs, { completedOn: '2026-10-28', status: 'skipped' }],
    todayLocalDate: '2026-10-28',
    timezone: 'Asia/Kathmandu',
  });
  assert.equal(afterTodaySkipped.currentStreak, 0);
  assert.equal(afterTodaySkipped.bestStreak, 4);
});

test('buildHabitsViewModel produces accurate summary cards, weekly progress, and 12-week heatmap states', () => {
  const habits: HabitRow[] = [
    {
      id: '00000000-0000-4000-8000-000000000101',
      userId: 'user-1',
      title: 'Drink 8 glasses of water',
      description: 'Stay hydrated and healthy',
      targetPerWeek: 5,
      scheduledDays: [1, 2, 3, 4, 5],
      isActive: true,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      userId: 'user-1',
      title: 'Weekend hike',
      description: 'Outdoor trail walk',
      targetPerWeek: 2,
      scheduledDays: [6, 7], // Sat, Sun only
      isActive: true,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    },
  ];

  const logs: HabitLogRow[] = [
    {
      id: '00000000-0000-4000-8000-000000000201',
      habitId: '00000000-0000-4000-8000-000000000101',
      userId: 'user-1',
      completedOn: '2026-10-26', // Mon
      status: 'completed',
      createdAt: new Date('2026-10-26T08:00:00.000Z'),
      updatedAt: new Date('2026-10-26T08:00:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      habitId: '00000000-0000-4000-8000-000000000101',
      userId: 'user-1',
      completedOn: '2026-10-27', // Tue
      status: 'completed',
      createdAt: new Date('2026-10-27T08:00:00.000Z'),
      updatedAt: new Date('2026-10-27T08:00:00.000Z'),
    },
  ];

  const vm = buildHabitsViewModel({
    habits,
    logs,
    selectedDate: '2026-10-27', // Tuesday
    todayLocalDate: '2026-10-27',
    timezone: 'Asia/Kathmandu',
  });

  assert.equal(vm.summary.activeHabitsCount, 2);
  // Only 'Drink 8 glasses of water' is due on Tuesday (Weekend hike is Sat/Sun)
  assert.equal(vm.summary.dueOnSelectedDateCount, 1);
  assert.equal(vm.summary.completedOnSelectedDateCount, 1);
  assert.equal(vm.summary.remainingOnSelectedDateCount, 0);
  assert.equal(vm.habits[0].completedThisWeek, 2);
  assert.equal(vm.habits[0].scheduledThisWeek, 5);
  assert.equal(vm.habits[0].heatmapWeeks.length, 12);
  assert.equal(vm.habits[0].heatmapWeeks[0].length, 7);

  // Verify isHabitDueOnDate for flexible weekly habit once weekly target is reached
  const flexibleHabit = {
    isActive: true,
    scheduledDays: null,
    targetPerWeek: 2,
  };
  const flexLogs = new Map<'completed' | 'skipped', string>();
  const logMap = new Map<string, 'completed' | 'skipped'>([
    ['2026-10-26', 'completed'],
    ['2026-10-27', 'completed'],
  ]);
  void flexLogs;
  // Since 2/2 days are already completed on Mon & Tue, Wed (2026-10-28) is no longer due
  assert.equal(isHabitDueOnDate(flexibleHabit, '2026-10-28', logMap), false);
});
