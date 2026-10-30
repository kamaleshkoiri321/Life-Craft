import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskRow } from '../db/schema';
import {
  combineLocalDateAndTimeToUtc,
  computeTaskSummaryMetrics,
  extractLocalDateAndTime,
  filterAndSortTasks,
  resolveCompletedAtForStatusChange,
  serializeTaskRow,
  validateTaskCreateInput,
  validateTaskUpdateInput,
} from './validation';

const SAMPLE_NOW = new Date('2025-10-27T06:00:00.000Z'); // 11:45 AM in Asia/Kathmandu (UTC+05:45)

test('combineLocalDateAndTimeToUtc and extractLocalDateAndTime round-trip accurately in Asia/Kathmandu', () => {
  const utc = combineLocalDateAndTimeToUtc(
    '2025-10-27',
    '14:30',
    'Asia/Kathmandu'
  );
  assert.ok(utc);
  // 14:30 in UTC+05:45 is 08:45 UTC
  assert.equal(utc.toISOString(), '2025-10-27T08:45:00.000Z');

  const extracted = extractLocalDateAndTime(utc, 'Asia/Kathmandu');
  assert.equal(extracted.dueDate, '2025-10-27');
  assert.equal(extracted.dueTime, '14:30');
});

test('combineLocalDateAndTimeToUtc defaults to 23:59 local time when dueTime is omitted', () => {
  const utc = combineLocalDateAndTimeToUtc(
    '2025-10-27',
    null,
    'Asia/Kathmandu'
  );
  assert.ok(utc);
  // 23:59 in UTC+05:45 is 18:14 UTC
  assert.equal(utc.toISOString(), '2025-10-27T18:14:00.000Z');

  const extracted = extractLocalDateAndTime(utc, 'Asia/Kathmandu');
  assert.equal(extracted.dueDate, '2025-10-27');
  assert.equal(extracted.dueTime, null);
});

test('validateTaskCreateInput enforces required title and valid priority/status/dueDate', () => {
  const emptyTitle = validateTaskCreateInput({ title: '   ' });
  assert.equal(emptyTitle.valid, false);
  if (!emptyTitle.valid) {
    assert.match(emptyTitle.error, /title/i);
  }

  const timeWithoutDate = validateTaskCreateInput({
    title: 'Read 20 pages',
    dueTime: '09:00',
  });
  assert.equal(timeWithoutDate.valid, false);

  const validInput = validateTaskCreateInput(
    {
      title: '  Review project brief  ',
      description: '  Prepare notes for team sync ',
      priority: 'high',
      status: 'todo',
      dueDate: '2025-10-27',
      dueTime: '09:30',
    },
    'Asia/Kathmandu'
  );
  assert.equal(validInput.valid, true);
  if (validInput.valid) {
    assert.equal(validInput.data.title, 'Review project brief');
    assert.equal(validInput.data.description, 'Prepare notes for team sync');
    assert.equal(validInput.data.priority, 'high');
    assert.equal(validInput.data.status, 'todo');
    assert.ok(validInput.data.dueAt);
    // Deadline-only task must NOT be assigned an arbitrary scheduled time slot
    assert.equal(validInput.data.scheduledStartAt, null);
    assert.equal(validInput.data.scheduledEndAt, null);
    assert.equal(validInput.data.isAllDay, false);
  }
});

test('validateTaskCreateInput supports hourly scheduled tasks, duration defaults, all-day tasks, and rejects end <= start', () => {
  // 1. Timed task with duration default (60m) and no due deadline required
  const timedDefaultDuration = validateTaskCreateInput(
    {
      title: 'Deep work block',
      scheduledDate: '2025-10-27',
      scheduledStartTime: '09:00',
    },
    'Asia/Kathmandu'
  );
  assert.equal(timedDefaultDuration.valid, true);
  if (timedDefaultDuration.valid) {
    assert.equal(timedDefaultDuration.data.dueAt, null);
    assert.equal(timedDefaultDuration.data.isAllDay, false);
    assert.equal(
      timedDefaultDuration.data.scheduledStartAt?.toISOString(),
      '2025-10-27T03:15:00.000Z'
    );
    assert.equal(
      timedDefaultDuration.data.scheduledEndAt?.toISOString(),
      '2025-10-27T04:15:00.000Z'
    );
  }

  // 2. Rejects scheduled end time <= start time
  const invalidRange = validateTaskCreateInput(
    {
      title: 'Invalid meeting',
      scheduledDate: '2025-10-27',
      scheduledStartTime: '14:00',
      scheduledEndTime: '13:00',
    },
    'Asia/Kathmandu'
  );
  assert.equal(invalidRange.valid, false);
  if (!invalidRange.valid) {
    assert.match(invalidRange.error, /after the start time/i);
  }

  // 3. Supports tasks spanning midnight when scheduledEndDate is next day
  const overnightTask = validateTaskCreateInput(
    {
      title: 'Night deployment',
      scheduledDate: '2025-10-27',
      scheduledEndDate: '2025-10-28',
      scheduledStartTime: '23:00',
      scheduledEndTime: '01:00',
    },
    'Asia/Kathmandu'
  );
  assert.equal(overnightTask.valid, true);
  if (overnightTask.valid) {
    assert.ok(
      overnightTask.data.scheduledEndAt!.getTime() >
        overnightTask.data.scheduledStartAt!.getTime()
    );
  }

  // 4. All-day task uses local day boundaries
  const allDayTask = validateTaskCreateInput(
    {
      title: 'Company retreat',
      scheduledDate: '2025-10-27',
      isAllDay: true,
    },
    'Asia/Kathmandu'
  );
  assert.equal(allDayTask.valid, true);
  if (allDayTask.valid) {
    assert.equal(allDayTask.data.isAllDay, true);
    // 2025-10-27 00:00 Asia/Kathmandu is 2025-10-26T18:15:00.000Z
    assert.equal(
      allDayTask.data.scheduledStartAt?.toISOString(),
      '2025-10-26T18:15:00.000Z'
    );
    assert.equal(
      allDayTask.data.scheduledEndAt?.toISOString(),
      '2025-10-27T18:15:00.000Z'
    );
  }
});

test('validateTaskUpdateInput allows partial updates, rescheduling, and clearing dueDate or schedule', () => {
  const clearDue = validateTaskUpdateInput({
    title: 'Updated title',
    dueDate: '',
    dueTime: '',
  });
  assert.equal(clearDue.valid, true);
  if (clearDue.valid) {
    assert.equal(clearDue.data.title, 'Updated title');
    assert.equal(clearDue.data.dueAt, null);
  }

  const clearSchedule = validateTaskUpdateInput({
    scheduledDate: '',
  });
  assert.equal(clearSchedule.valid, true);
  if (clearSchedule.valid) {
    assert.equal(clearSchedule.data.scheduledStartAt, null);
    assert.equal(clearSchedule.data.scheduledEndAt, null);
    assert.equal(clearSchedule.data.isAllDay, false);
  }

  const emptyPayload = validateTaskUpdateInput({});
  assert.equal(emptyPayload.valid, false);
});

test('resolveCompletedAtForStatusChange sets and clears completedAt appropriately', () => {
  const now = new Date('2025-10-27T10:00:00.000Z');

  // Marking todo -> completed sets completedAt = now
  const completedAt = resolveCompletedAtForStatusChange(
    'todo',
    'completed',
    null,
    now
  );
  assert.equal(completedAt?.toISOString(), now.toISOString());

  // Reopening completed -> todo clears completedAt = null
  const reopenedAt = resolveCompletedAtForStatusChange(
    'completed',
    'todo',
    now,
    new Date('2025-10-27T11:00:00.000Z')
  );
  assert.equal(reopenedAt, null);

  // Reopening completed -> in_progress clears completedAt = null
  const inProgressAt = resolveCompletedAtForStatusChange(
    'completed',
    'in_progress',
    now,
    new Date('2025-10-27T11:00:00.000Z')
  );
  assert.equal(inProgressAt, null);

  // Archiving preserves previous completedAt
  const archivedAt = resolveCompletedAtForStatusChange(
    'completed',
    'archived',
    now,
    new Date('2025-10-27T11:00:00.000Z')
  );
  assert.equal(archivedAt?.toISOString(), now.toISOString());
});

test('filterAndSortTasks and computeTaskSummaryMetrics handle search, status, priority, schedule, and sorting', () => {
  const sampleRows: TaskRow[] = [
    {
      id: '1',
      userId: 'user-1',
      title: 'Overdue high task',
      description: 'Missed yesterday',
      status: 'todo',
      priority: 'high',
      dueAt: new Date('2025-10-26T08:00:00.000Z'),
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      completedAt: null,
      sortOrder: 0,
      createdAt: new Date('2025-10-25T08:00:00.000Z'),
      updatedAt: new Date('2025-10-25T08:00:00.000Z'),
    },
    {
      id: '2',
      userId: 'user-1',
      title: 'Due today medium task',
      description: 'Finish afternoon report',
      status: 'in_progress',
      priority: 'medium',
      dueAt: new Date('2025-10-27T10:00:00.000Z'), // 15:45 local today
      scheduledStartAt: new Date('2025-10-27T08:15:00.000Z'), // 14:00 local today
      scheduledEndAt: new Date('2025-10-27T09:15:00.000Z'), // 15:00 local today
      isAllDay: false,
      completedAt: null,
      sortOrder: 1,
      createdAt: new Date('2025-10-26T08:00:00.000Z'),
      updatedAt: new Date('2025-10-26T08:00:00.000Z'),
    },
    {
      id: '3',
      userId: 'user-1',
      title: 'Completed today task',
      description: 'Morning workout',
      status: 'completed',
      priority: 'low',
      dueAt: new Date('2025-10-27T03:00:00.000Z'),
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      completedAt: new Date('2025-10-27T04:00:00.000Z'),
      sortOrder: 2,
      createdAt: new Date('2025-10-27T02:00:00.000Z'),
      updatedAt: new Date('2025-10-27T04:00:00.000Z'),
    },
    {
      id: '4',
      userId: 'user-1',
      title: 'Upcoming low task',
      description: 'Next week planning',
      status: 'todo',
      priority: 'low',
      dueAt: new Date('2025-10-30T08:00:00.000Z'),
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      completedAt: null,
      sortOrder: 3,
      createdAt: new Date('2025-10-27T05:00:00.000Z'),
      updatedAt: new Date('2025-10-27T05:00:00.000Z'),
    },
    {
      id: '5',
      userId: 'user-1',
      title: 'Archived task',
      description: 'Old notes',
      status: 'archived',
      priority: 'medium',
      dueAt: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isAllDay: false,
      completedAt: null,
      sortOrder: 4,
      createdAt: new Date('2025-10-20T08:00:00.000Z'),
      updatedAt: new Date('2025-10-20T08:00:00.000Z'),
    },
  ];

  const serialized = sampleRows.map((r) =>
    serializeTaskRow(r, { timezone: 'Asia/Kathmandu', now: SAMPLE_NOW })
  );

  // Check serialized schedule fields on task 2
  assert.equal(serialized[1].scheduledDate, '2025-10-27');
  assert.equal(serialized[1].scheduledStartTime, '14:00');
  assert.equal(serialized[1].scheduledEndTime, '15:00');
  assert.equal(serialized[1].durationMinutes, 60);

  const metrics = computeTaskSummaryMetrics(serialized);
  assert.equal(metrics.totalActiveCount, 3); // ids 1, 2, 4
  assert.equal(metrics.completedCount, 1); // id 3
  assert.equal(metrics.overdueCount, 1); // id 1
  assert.equal(metrics.dueTodayCount, 2); // ids 2, 3
  assert.equal(metrics.archivedCount, 1); // id 5

  // Default 'all' excludes archived
  const allNonArchived = filterAndSortTasks(
    serialized,
    { status: 'all', sortBy: 'due_date' },
    { timezone: 'Asia/Kathmandu', now: SAMPLE_NOW }
  );
  assert.deepEqual(
    allNonArchived.map((t) => t.id),
    ['1', '2', '4', '3'] // incomplete sorted by due date first, then completed
  );

  // Overdue schedule filter
  const overdueOnly = filterAndSortTasks(
    serialized,
    { schedule: 'overdue' },
    { timezone: 'Asia/Kathmandu', now: SAMPLE_NOW }
  );
  assert.deepEqual(overdueOnly.map((t) => t.id), ['1']);

  // Upcoming schedule filter
  const upcomingOnly = filterAndSortTasks(
    serialized,
    { schedule: 'upcoming' },
    { timezone: 'Asia/Kathmandu', now: SAMPLE_NOW }
  );
  assert.deepEqual(upcomingOnly.map((t) => t.id), ['4']);

  // Search filter
  const searchResult = filterAndSortTasks(
    serialized,
    { search: 'afternoon' },
    { timezone: 'Asia/Kathmandu', now: SAMPLE_NOW }
  );
  assert.deepEqual(searchResult.map((t) => t.id), ['2']);

  // Archived status filter
  const archivedOnly = filterAndSortTasks(
    serialized,
    { status: 'archived' },
    { timezone: 'Asia/Kathmandu', now: SAMPLE_NOW }
  );
  assert.deepEqual(archivedOnly.map((t) => t.id), ['5']);
});
