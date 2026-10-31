import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMeetingPlatform,
  formatReminderLabel,
  formatRecurrenceLabel,
  validateCalendarEventInput,
  expandRecurringInstances,
  type CalendarEventCreateInput,
  type CalendarEventRow,
} from './event-validation';
import {
  buildDayScheduleData,
  buildCalendarDayDescriptor,
  CALENDAR_VIEWS,
} from './calendar-utils';

test('detectMeetingPlatform identifies Google Meet, Zoom, Teams, Webex, and custom links', () => {
  // Google Meet
  const meet = detectMeetingPlatform('https://meet.google.com/abc-defg-hij');
  assert.equal(meet?.platform, 'google_meet');
  assert.equal(meet?.label, 'Google Meet');

  // Zoom
  const zoom = detectMeetingPlatform('https://zoom.us/j/1234567890?pwd=abc');
  assert.equal(zoom?.platform, 'zoom');
  assert.equal(zoom?.label, 'Zoom');

  // Teams
  const teams = detectMeetingPlatform('https://teams.microsoft.com/l/meetup-join/19%3ameeting');
  assert.equal(teams?.platform, 'teams');
  assert.equal(teams?.label, 'Microsoft Teams');

  // Webex
  const webex = detectMeetingPlatform('https://mycompany.webex.com/meet/user');
  assert.equal(webex?.platform, 'webex');
  assert.equal(webex?.label, 'Cisco Webex');

  // Custom valid URL
  const custom = detectMeetingPlatform('https://company.internal/video/room-1');
  assert.equal(custom?.platform, 'custom');
  assert.equal(custom?.label, 'Online Meeting');

  // Invalid or null
  assert.equal(detectMeetingPlatform(''), null);
  assert.equal(detectMeetingPlatform('not a url'), null);
  assert.equal(detectMeetingPlatform('javascript:alert(1)'), null);
  assert.equal(detectMeetingPlatform(null), null);
  assert.equal(detectMeetingPlatform(undefined), null);
});

test('formatReminderLabel formats standard presets and custom intervals', () => {
  assert.equal(formatReminderLabel(0), 'At start time');
  assert.equal(formatReminderLabel(5), '5 minutes before');
  assert.equal(formatReminderLabel(8), '8 minutes before');
  assert.equal(formatReminderLabel(15), '15 minutes before');
  assert.equal(formatReminderLabel(60), '1 hour before');
  assert.equal(formatReminderLabel(90), '1h 30m before');
  assert.equal(formatReminderLabel(120), '2 hours before');
  assert.equal(formatReminderLabel(1440), '1 day before');
  assert.equal(formatReminderLabel(2880), '2 days before');
  assert.equal(formatReminderLabel(10080), '1 week before');
});

test('formatRecurrenceLabel formats recurrence patterns accurately', () => {
  assert.equal(
    formatRecurrenceLabel({ frequency: 'daily', interval: 1, endType: 'never' }),
    'Repeats daily'
  );

  assert.equal(
    formatRecurrenceLabel({
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1, 3, 5],
      endType: 'never',
    }),
    'Repeats weekly on Mon, Wed, Fri'
  );

  assert.equal(
    formatRecurrenceLabel({
      frequency: 'weekly',
      interval: 2,
      daysOfWeek: [2],
      endType: 'count',
      count: 10,
    }),
    'Repeats every 2 weeks on Tue (10 occurrences)'
  );

  assert.equal(
    formatRecurrenceLabel({
      frequency: 'monthly',
      interval: 1,
      endType: 'until',
      endDate: '2026-12-31',
    }),
    'Repeats monthly until 2026-12-31'
  );
});

test('validateCalendarEventInput validates required fields and normalizes dates', () => {
  // Empty title failure
  const invalidTitle = validateCalendarEventInput({
    title: '   ',
    startDate: '2026-11-05',
    startTime: '10:00',
    endTime: '11:00',
  });
  assert.equal(invalidTitle.ok, false);
  assert.ok(invalidTitle.errors?.title);

  // End time before start time failure
  const invalidTime = validateCalendarEventInput({
    title: 'Sprint Planning',
    startDate: '2026-11-05',
    startTime: '14:00',
    endDate: '2026-11-05',
    endTime: '13:00',
  });
  assert.equal(invalidTime.ok, false);
  assert.ok(invalidTime.errors?.endTime);

  // Valid event with full details
  const valid = validateCalendarEventInput({
    title: 'Product Review Meeting',
    category: 'Work',
    color: '#5938B5',
    startDate: '2026-11-05',
    startTime: '10:00',
    endDate: '2026-11-05',
    endTime: '11:00',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    description: 'Review project progress and blockers.',
    notes: 'Prepare model performance slides.',
    reminders: [
      { minutesBefore: 30, channel: 'email' },
      { minutesBefore: 8, channel: 'in_app' },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.cleaned?.title, 'Product Review Meeting');
  assert.equal(valid.cleaned?.category, 'Work');
  assert.equal(valid.cleaned?.color, '#5938B5');
  assert.equal(valid.cleaned?.reminders.length, 2);
  assert.equal(valid.cleaned?.meetingUrl, 'https://meet.google.com/abc-defg-hij');
});

test('expandRecurringInstances correctly generates occurrences within period window', () => {
  const baseRow: CalendarEventRow = {
    id: 'base-1',
    userId: 'user-123',
    title: 'Weekly Standup',
    description: null,
    notes: null,
    category: 'Meeting',
    color: '#2563EB',
    startAt: new Date('2026-11-02T09:00:00.000Z'), // Monday
    endAt: new Date('2026-11-02T10:00:00.000Z'),
    isAllDay: false,
    timezone: 'UTC',
    meetingUrl: 'https://zoom.us/j/12345678',
    recurrenceRule: {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1], // Monday
      endType: 'count',
      count: 4,
    },
    recurringEventId: null,
    reminders: [{ minutesBefore: 15, channel: 'email' }],
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  };

  const periodStart = new Date('2026-11-01T00:00:00.000Z');
  const periodEnd = new Date('2026-11-30T00:00:00.000Z');

  const instances = expandRecurringInstances(baseRow, periodStart, periodEnd);

  // 4 weekly Mondays in November: Nov 2, Nov 9, Nov 16, Nov 23
  assert.equal(instances.length, 4);
  assert.equal(instances[0].startIso, '2026-11-02T09:00:00.000Z');
  assert.equal(instances[1].startIso, '2026-11-09T09:00:00.000Z');
  assert.equal(instances[2].startIso, '2026-11-16T09:00:00.000Z');
  assert.equal(instances[3].startIso, '2026-11-23T09:00:00.000Z');
});

test('buildDayScheduleData clusters side-by-side tasks and calendar events with conflict detection', () => {
  const day = buildCalendarDayDescriptor('2026-11-05', {
    timezone: 'UTC',
    todayLocalDate: '2026-11-05',
    referenceMonthPrefix: '2026-11',
  });

  const schedule = buildDayScheduleData({
    day,
    tasks: [],
    events: [
      {
        id: 'ev-1',
        userId: 'u1',
        title: 'Team Sync',
        description: 'Sync details',
        notes: null,
        category: 'Meeting',
        color: '#5938B5',
        isAllDay: false,
        timezone: 'UTC',
        startDate: '2026-11-05',
        startTime: '10:00',
        endDate: '2026-11-05',
        endTime: '11:00',
        startIso: '2026-11-05T10:00:00.000Z',
        endIso: '2026-11-05T11:00:00.000Z',
        durationMinutes: 60,
        displayTimeLabel: '10:00 – 11:00',
        meetingUrl: 'https://meet.google.com/test',
        meetingPlatform: 'google_meet',
        meetingLabel: 'Google Meet',
        recurrenceRule: null,
        recurrenceLabel: null,
        isRecurring: false,
        recurringEventId: null,
        reminders: [],
        reminderLabels: [],
        attachments: [],
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'ev-2',
        userId: 'u1',
        title: 'Interview',
        description: null,
        notes: null,
        category: 'Work',
        color: '#2563EB',
        isAllDay: false,
        timezone: 'UTC',
        startDate: '2026-11-05',
        startTime: '10:30', // Overlaps with Team Sync!
        endDate: '2026-11-05',
        endTime: '11:30',
        startIso: '2026-11-05T10:30:00.000Z',
        endIso: '2026-11-05T11:30:00.000Z',
        durationMinutes: 60,
        displayTimeLabel: '10:30 – 11:30',
        meetingUrl: null,
        meetingPlatform: null,
        meetingLabel: null,
        recurrenceRule: null,
        recurrenceLabel: null,
        isRecurring: false,
        recurringEventId: null,
        reminders: [],
        reminderLabels: [],
        attachments: [],
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    timezone: 'UTC',
  });

  assert.equal(schedule.timedItems.length, 2);
  // Conflict should be detected between ev-1 (10-11) and ev-2 (10:30-11:30)
  assert.equal(schedule.conflictCount, 2);
  assert.equal(schedule.timedItems[0].hasConflict, true);
  assert.equal(schedule.timedItems[1].hasConflict, true);
  // Side-by-side columns: totalColumns = 2, assigned to col 0 and 1
  assert.equal(schedule.timedItems[0].totalColumns, 2);
  assert.equal(schedule.timedItems[1].totalColumns, 2);
  assert.notEqual(schedule.timedItems[0].columnIndex, schedule.timedItems[1].columnIndex);
});
