import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEmailConfigStatus,
  sendEmail,
} from './email-service';
import { buildReminderEmail } from './templates/reminder-template';
import { buildNotificationIdempotencyKey } from '../calendar/reminder-scheduler';

test('getEmailConfigStatus accurately reports missing SMTP credentials and test mode', () => {
  const originalUser = process.env.SMTP_USER;
  const originalPass = process.env.SMTP_APP_PASSWORD;
  const originalTestMode = process.env.EMAIL_TEST_MODE;

  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_APP_PASSWORD;
    process.env.EMAIL_TEST_MODE = 'true';
    process.env.EMAIL_TEST_RECIPIENT = 'tester@gmail.com';

    const status = getEmailConfigStatus();
    assert.equal(status.isConfigured, false);
    assert.equal(status.userConfigured, false);
    assert.equal(status.passConfigured, false);
    assert.equal(status.fromName, 'LifeCraft');
    assert.equal(status.testMode, true);
    assert.equal(status.testRecipient, 'tester@gmail.com');
  } finally {
    if (originalUser) process.env.SMTP_USER = originalUser;
    if (originalPass) process.env.SMTP_APP_PASSWORD = originalPass;
    if (originalTestMode) process.env.EMAIL_TEST_MODE = originalTestMode;
  }
});

test('buildReminderEmail generates safe, responsive HTML and plain-text templates', () => {
  const email = buildReminderEmail({
    recipientName: 'Kamalesh',
    eventTitle: 'Sprint <Planning> & Review',
    category: 'Work',
    color: '#5938B5',
    formattedDate: '2026-11-05',
    formattedTime: '10:00 AM – 11:00 AM',
    timezone: 'Asia/Kathmandu',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    meetingLabel: 'Join Google Meet',
    description: 'Review Q4 blockers <script>alert(1)</script> & goals',
    notes: 'Prepare sprint metrics',
    reminderLabel: '15 minutes before',
    appUrl: 'https://lifecraft.test',
    eventId: 'ev-12345',
  });

  // Verify Subject
  assert.equal(email.subject, 'Reminder: Sprint <Planning> & Review starts 15 minutes before');

  // Verify HTML escaping prevents script injection
  assert.ok(!email.html.includes('<script>alert(1)</script>'));
  assert.ok(email.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(email.html.includes('Sprint &lt;Planning&gt; &amp; Review'));

  // Verify meeting link and LifeCraft branding
  assert.ok(email.html.includes('https://meet.google.com/abc-defg-hij'));
  assert.ok(email.html.includes('Join Google Meet'));
  assert.ok(email.html.includes('LifeCraft'));
  assert.ok(email.html.includes('https://lifecraft.test/app/calendar?eventId=ev-12345'));

  // Verify Plain-text alternative
  assert.ok(email.text.includes('Hello Kamalesh,'));
  assert.ok(email.text.includes('Event: Sprint <Planning> & Review'));
  assert.ok(email.text.includes('Meeting Link: https://meet.google.com/abc-defg-hij'));
  assert.ok(email.text.includes('View in LifeCraft: https://lifecraft.test/app/calendar?eventId=ev-12345'));
});

test('buildNotificationIdempotencyKey generates consistent and deterministic keys', () => {
  const scheduled = new Date('2026-11-05T04:15:00.000Z');
  const key1 = buildNotificationIdempotencyKey('event-abc', 15, scheduled);
  const key2 = buildNotificationIdempotencyKey('event-abc', 15, scheduled);
  const key3 = buildNotificationIdempotencyKey('event-abc', 30, scheduled);

  assert.equal(key1, 'event-abc:15:2026-11-05T04:15:00.000Z');
  assert.equal(key1, key2);
  assert.notEqual(key1, key3);
});

test('sendEmail rejects delivery when SMTP credentials are not configured', async () => {
  const originalUser = process.env.SMTP_USER;
  const originalPass = process.env.SMTP_APP_PASSWORD;

  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_APP_PASSWORD;

    const res = await sendEmail({
      to: 'recipient@example.com',
      subject: 'Test Event',
      html: '<p>Test</p>',
    });

    assert.equal(res.ok, false);
    assert.ok(res.error?.includes('Missing SMTP_USER or SMTP_APP_PASSWORD'));
  } finally {
    if (originalUser) process.env.SMTP_USER = originalUser;
    if (originalPass) process.env.SMTP_APP_PASSWORD = originalPass;
  }
});

