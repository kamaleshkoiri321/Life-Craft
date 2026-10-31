import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardPayload,
  getLocalDateString,
  getLocalDayUtcBounds,
  getSevenDayWindow,
  getTimeOfDayGreeting,
  resolveDisplayName,
  resolveValidTimezone,
} from './timezone';

test('resolveValidTimezone falls back to Asia/Kathmandu for invalid timezones', () => {
  assert.equal(resolveValidTimezone('Asia/Kathmandu'), 'Asia/Kathmandu');
  assert.equal(resolveValidTimezone('America/New_York'), 'America/New_York');
  assert.equal(resolveValidTimezone('Invalid/Timezone_Name'), 'Asia/Kathmandu');
  assert.equal(resolveValidTimezone(''), 'Asia/Kathmandu');
  assert.equal(resolveValidTimezone(null), 'Asia/Kathmandu');
});

test('getLocalDateString and getLocalDayUtcBounds handle Asia/Kathmandu (+05:45) accurately', () => {
  // 2026-10-26T18:30:00.000Z is 2026-10-27 00:15:00 in Asia/Kathmandu (+05:45)
  const instant = new Date('2026-10-26T18:30:00.000Z');
  const localDate = getLocalDateString(instant, 'Asia/Kathmandu');
  assert.equal(localDate, '2026-10-27');

  const { startUtc, endUtc } = getLocalDayUtcBounds(
    '2026-10-27',
    'Asia/Kathmandu'
  );
  assert.equal(startUtc.toISOString(), '2026-10-26T18:15:00.000Z');
  assert.equal(endUtc.toISOString(), '2026-10-27T18:15:00.000Z');
});

test('getTimeOfDayGreeting returns morning, afternoon, or evening in target timezone', () => {
  // 03:15 UTC = 09:00 Asia/Kathmandu (Morning)
  assert.equal(
    getTimeOfDayGreeting(new Date('2026-10-27T03:15:00.000Z'), 'Asia/Kathmandu'),
    'Good morning'
  );
  // 08:15 UTC = 14:00 Asia/Kathmandu (Afternoon)
  assert.equal(
    getTimeOfDayGreeting(new Date('2026-10-27T08:15:00.000Z'), 'Asia/Kathmandu'),
    'Good afternoon'
  );
  // 14:15 UTC = 20:00 Asia/Kathmandu (Evening)
  assert.equal(
    getTimeOfDayGreeting(new Date('2026-10-27T14:15:00.000Z'), 'Asia/Kathmandu'),
    'Good evening'
  );
});

test('getSevenDayWindow produces 7 ordered local calendar days ending on today', () => {
  const now = new Date('2026-10-27T04:00:00.000Z');
  const slots = getSevenDayWindow(now, 'Asia/Kathmandu');
  assert.equal(slots.length, 7);
  assert.equal(slots[0].dateKey, '2026-10-21');
  assert.equal(slots[6].dateKey, '2026-10-27');
  assert.equal(slots[6].isToday, true);
  assert.equal(slots[5].isToday, false);
});

test('resolveDisplayName prioritizes profile display_name over auth name and email prefix', () => {
  assert.equal(
    resolveDisplayName('Maya Lin', 'Maya', 'maya@example.com'),
    'Maya Lin'
  );
  assert.equal(resolveDisplayName(null, 'Maya', 'maya@example.com'), 'Maya');
  assert.equal(resolveDisplayName('  ', '', 'maya@example.com'), 'maya');
});

test('buildDashboardPayload returns honest zero states for a new user with no records', () => {
  const now = new Date('2026-10-27T03:15:00.000Z');
  const payload = buildDashboardPayload({
    authUser: {
      id: 'user-123',
      name: 'Alex Rivera',
      email: 'alex@example.com',
      emailVerified: true,
    },
    profile: null,
    preferences: null,
    userTasks: [],
    userHabits: [],
    userHabitLogs: [],
    userGoals: [],
    userNotes: [],
    now,
  });

  assert.equal(payload.user.displayName, 'Alex Rivera');
  assert.equal(payload.user.timezone, 'Asia/Kathmandu');
  assert.equal(payload.greeting, 'Good morning');
  assert.deepEqual(payload.summary, {
    tasksTodayCount: 0,
    highPriorityTodayCount: 0,
    completedTodayCount: 0,
    activeHabitsCount: 0,
    completedHabitsTodayCount: 0,
    dueHabitsTodayCount: 0,
    activeGoalsCount: 0,
  });
  assert.equal(payload.todaysFocus.length, 0);
  assert.equal(payload.weeklyActivity.totalCompletedLast7Days, 0);
  assert.equal(payload.weeklyActivity.days.length, 7);
  assert.equal(payload.activeGoals.length, 0);
  assert.equal(payload.dailyHabits.length, 0);
  assert.equal(payload.recentNotes.length, 0);
});

test('buildDashboardPayload aggregates today tasks, habits, goals, notes, and 7-day completions accurately', () => {
  // 2026-10-27 09:00 in Asia/Kathmandu
  const now = new Date('2026-10-27T03:15:00.000Z');
  const todayMorning = new Date('2026-10-27T03:30:00.000Z');
  const todayAfternoon = new Date('2026-10-27T08:30:00.000Z');
  const yesterdayAfternoon = new Date('2026-10-26T08:30:00.000Z');

  const payload = buildDashboardPayload({
    authUser: {
      id: 'user-123',
      name: 'Alex',
      email: 'alex@example.com',
      emailVerified: true,
    },
    profile: {
      userId: 'user-123',
      displayName: 'Alex',
      timezone: 'Asia/Kathmandu',
      createdAt: now,
      updatedAt: now,
    },
    preferences: {
      userId: 'user-123',
      theme: 'light',
      weekStartsOn: 1,
      emailNotificationsEnabled: true,
      defaultReminderMinutes: 15,
      createdAt: now,
      updatedAt: now,
    },
    userTasks: [
      {
        id: 't-1',
        userId: 'user-123',
        title: 'Low priority task today',
        description: null,
        status: 'todo',
        priority: 'low',
        dueAt: todayAfternoon,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        completedAt: null,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 't-2',
        userId: 'user-123',
        title: 'High priority task today',
        description: 'Important deliverable',
        status: 'todo',
        priority: 'high',
        dueAt: todayMorning,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        completedAt: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 't-3',
        userId: 'user-123',
        title: 'Completed task today',
        description: null,
        status: 'completed',
        priority: 'medium',
        dueAt: todayMorning,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        completedAt: todayMorning,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 't-4',
        userId: 'user-123',
        title: 'Completed task yesterday',
        description: null,
        status: 'completed',
        priority: 'medium',
        dueAt: yesterdayAfternoon,
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
        completedAt: yesterdayAfternoon,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    userHabits: [
      {
        id: 'h-1',
        userId: 'user-123',
        title: 'Read 20 pages',
        description: null,
        targetPerWeek: 7,
        scheduledDays: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'h-2',
        userId: 'user-123',
        title: 'Inactive habit',
        description: null,
        targetPerWeek: 3,
        scheduledDays: null,
        isActive: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    userHabitLogs: [
      {
        id: 'hl-1',
        habitId: 'h-1',
        userId: 'user-123',
        completedOn: '2026-10-27',
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'hl-2',
        habitId: 'h-1',
        userId: 'user-123',
        completedOn: '2026-10-26',
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      },
    ],
    userGoals: [
      {
        id: 'g-1',
        userId: 'user-123',
        title: 'Learn TypeScript',
        description: 'Build a real project',
        status: 'active',
        category: 'Personal',
        completedAt: null,
        targetDate: '2026-12-01',
        progressPercent: 70,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'g-2',
        userId: 'user-123',
        title: 'Completed goal',
        description: null,
        status: 'completed',
        category: 'Personal',
        completedAt: now,
        targetDate: '2026-10-01',
        progressPercent: 100,
        createdAt: now,
        updatedAt: now,
      },
    ],
    userNotes: [
      {
        id: 'n-1',
        userId: 'user-123',
        title: 'Pinned reflection',
        content: 'Stay consistent with small daily habits.',
        folderId: null,
        entryType: 'note',
        journalDate: null,
        mood: null,
        iconStyle: 'document',
        archivedAt: null,
        trashedAt: null,
        isPinned: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    now,
  });

  assert.equal(payload.summary.tasksTodayCount, 3);
  assert.equal(payload.summary.highPriorityTodayCount, 1);
  assert.equal(payload.summary.completedTodayCount, 1);
  assert.equal(payload.summary.activeHabitsCount, 1);
  assert.equal(payload.summary.completedHabitsTodayCount, 1);
  assert.equal(payload.summary.activeGoalsCount, 1);

  // Incomplete high-priority first, incomplete low-priority second, completed last
  assert.deepEqual(
    payload.todaysFocus.map((t) => t.id),
    ['t-2', 't-1', 't-3']
  );

  // 2 tasks completed across the 7-day window (1 yesterday, 1 today)
  assert.equal(payload.weeklyActivity.totalCompletedLast7Days, 2);
  assert.equal(payload.dailyHabits[0].completedToday, true);
  assert.equal(payload.dailyHabits[0].completedDaysLast7, 2);
  assert.equal(payload.activeGoals[0].progressPercent, 70);
  assert.equal(payload.recentNotes[0].title, 'Pinned reflection');
});
