import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskRow } from '../db/schema';
import { serializeTaskRow } from '../tasks/validation';
import {
  buildGoogleCalendarEventResource,
  createSignedGoogleOAuthState,
  decryptGoogleToken,
  encryptGoogleToken,
  verifySignedGoogleOAuthState,
  verifySignedGoogleOAuthStateSignatureOnly,
} from './google-calendar-crypto';

const TEST_SECRET = 'lifecraft-test-encryption-key-with-at-least-32-chars!!';

test('encryptGoogleToken and decryptGoogleToken round-trip with AES-256-GCM and reject tampered ciphertexts', () => {
  const rawRefreshToken = '1//0gAbCdEfGhIjKlMnOpQrStUvWxYz-987654321';
  const encrypted = encryptGoogleToken(rawRefreshToken, TEST_SECRET);

  assert.notEqual(encrypted, rawRefreshToken);
  assert.ok(encrypted.startsWith('v1.'));

  const decrypted = decryptGoogleToken(encrypted, TEST_SECRET);
  assert.equal(decrypted, rawRefreshToken);

  // Tamper with ciphertext
  const parts = encrypted.split('.');
  parts[3] = parts[3].slice(0, -2) + 'AA';
  const tampered = parts.join('.');
  assert.throws(() => decryptGoogleToken(tampered, TEST_SECRET));

  // Missing or short encryption key throws instead of storing plaintext
  assert.throws(() => encryptGoogleToken(rawRefreshToken, 'too-short'));
});

test('createSignedGoogleOAuthState and verifySignedGoogleOAuthState validate userId, redirectUri, nonce, signature, and expiry', () => {
  const nowMs = 1_760_000_000_000;
  const { stateToken, nonce } = createSignedGoogleOAuthState(
    {
      userId: 'user-abc',
      userEmail: 'kamalesh@example.com',
      redirectUri:
        'https://example-app.test',
      returnTo: '/app/calendar',
      nowMs,
    },
    TEST_SECRET
  );

  // Signature-only verification (for popup launch / partitioned cookie handoff)
  const sigOnly = verifySignedGoogleOAuthStateSignatureOnly(
    stateToken,
    TEST_SECRET,
    nowMs + 30_000
  );
  assert.equal(sigOnly.valid, true);
  if (sigOnly.valid) {
    assert.equal(sigOnly.payload.userId, 'user-abc');
    assert.equal(sigOnly.payload.userEmail, 'kamalesh@example.com');
    assert.equal(
      sigOnly.payload.redirectUri,
      'https://example-app.test'
    );
  }

  // Valid full verification
  const verified = verifySignedGoogleOAuthState(
    stateToken,
    'user-abc',
    nonce,
    TEST_SECRET,
    nowMs + 30_000
  );
  assert.equal(verified.valid, true);
  if (verified.valid) {
    assert.equal(verified.payload.userId, 'user-abc');
    assert.equal(verified.payload.returnTo, '/app/calendar');
  }

  // Wrong user fails
  const wrongUser = verifySignedGoogleOAuthState(
    stateToken,
    'user-other',
    nonce,
    TEST_SECRET,
    nowMs + 30_000
  );
  assert.equal(wrongUser.valid, false);

  // Expired state fails
  const expired = verifySignedGoogleOAuthState(
    stateToken,
    'user-abc',
    nonce,
    TEST_SECRET,
    nowMs + 15 * 60_000
  );
  assert.equal(expired.valid, false);
});

test('buildGoogleCalendarEventResource formats timed and all-day tasks properly without fabricating clock times', () => {
  const baseRow: TaskRow = {
    id: '00000000-0000-4000-8000-000000000010',
    userId: 'user-1',
    title: 'Quarterly Planning',
    description: 'Review Q4 milestones',
    status: 'todo',
    priority: 'high',
    dueAt: null,
    scheduledStartAt: new Date('2026-10-27T03:15:00.000Z'), // 09:00 Asia/Kathmandu
    scheduledEndAt: new Date('2026-10-27T04:15:00.000Z'), // 10:00 Asia/Kathmandu
    isAllDay: false,
    completedAt: null,
    sortOrder: 0,
    createdAt: new Date('2026-10-27T01:00:00.000Z'),
    updatedAt: new Date('2026-10-27T01:00:00.000Z'),
  };

  const timedSerialized = serializeTaskRow(baseRow, {
    timezone: 'Asia/Kathmandu',
  });
  const timedResource = buildGoogleCalendarEventResource(
    timedSerialized,
    'Asia/Kathmandu'
  );
  assert.ok(timedResource);
  assert.equal(timedResource.summary, 'Quarterly Planning');
  assert.equal(timedResource.start.dateTime, '2026-10-27T03:15:00.000Z');
  assert.equal(timedResource.start.timeZone, 'Asia/Kathmandu');
  assert.equal(timedResource.end.dateTime, '2026-10-27T04:15:00.000Z');
  assert.equal(timedResource.start.date, undefined);

  // All-day task uses date values rather than fabricated clock times
  const allDayRow: TaskRow = {
    ...baseRow,
    id: '00000000-0000-4000-8000-000000000011',
    title: 'Annual Offsite',
    scheduledStartAt: new Date('2026-10-26T18:15:00.000Z'), // 00:00 Oct 27 Asia/Kathmandu
    scheduledEndAt: new Date('2026-10-27T18:15:00.000Z'), // 00:00 Oct 28 Asia/Kathmandu
    isAllDay: true,
  };
  const allDaySerialized = serializeTaskRow(allDayRow, {
    timezone: 'Asia/Kathmandu',
  });
  const allDayResource = buildGoogleCalendarEventResource(
    allDaySerialized,
    'Asia/Kathmandu'
  );
  assert.ok(allDayResource);
  assert.equal(allDayResource.start.date, '2026-10-27');
  assert.equal(allDayResource.end.date, '2026-10-28');
  assert.equal(allDayResource.start.dateTime, undefined);
});
