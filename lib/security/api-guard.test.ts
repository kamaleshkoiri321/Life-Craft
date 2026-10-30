import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRateLimit,
  resetRateLimitStoreForTests,
  sanitizeServerErrorMessage,
  verifySameOriginMutation,
} from './api-guard';

test('checkRateLimit enforces sliding window limits and resets after window expires', () => {
  resetRateLimitStoreForTests();
  const key = 'user-1:settings:patch';
  const baseTime = 1_700_000_000_000;

  const r1 = checkRateLimit(key, { limit: 3, windowMs: 60_000, nowMs: baseTime });
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = checkRateLimit(key, {
    limit: 3,
    windowMs: 60_000,
    nowMs: baseTime + 1_000,
  });
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = checkRateLimit(key, {
    limit: 3,
    windowMs: 60_000,
    nowMs: baseTime + 2_000,
  });
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  const r4 = checkRateLimit(key, {
    limit: 3,
    windowMs: 60_000,
    nowMs: baseTime + 3_000,
  });
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.retryAfterSeconds >= 57);

  // After 61 seconds, window has slid past the initial requests
  const r5 = checkRateLimit(key, {
    limit: 3,
    windowMs: 60_000,
    nowMs: baseTime + 61_000,
  });
  assert.equal(r5.allowed, true);
});

test('verifySameOriginMutation allows same-origin requests and blocks cross-site CSRF', () => {
  const makeReq = (headers: Record<string, string>, url = 'https://lifecraft.app/api/settings') => ({
    url,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  });

  // Same-origin request
  assert.deepEqual(
    verifySameOriginMutation(
      makeReq({
        host: 'lifecraft.app',
        origin: 'https://lifecraft.app',
        'sec-fetch-site': 'same-origin',
      })
    ),
    { ok: true }
  );

  // Cross-site Sec-Fetch-Site header blocked
  const crossSiteFetch = verifySameOriginMutation(
    makeReq({
      host: 'lifecraft.app',
      'sec-fetch-site': 'cross-site',
    })
  );
  assert.equal(crossSiteFetch.ok, false);

  // Mismatched Origin host blocked
  const mismatchedOrigin = verifySameOriginMutation(
    makeReq({
      host: 'lifecraft.app',
      origin: 'https://evil.example.com',
    })
  );
  assert.equal(mismatchedOrigin.ok, false);

  // Null origin blocked
  const nullOrigin = verifySameOriginMutation(
    makeReq({
      host: 'lifecraft.app',
      origin: 'null',
    })
  );
  assert.equal(nullOrigin.ok, false);
});

test('sanitizeServerErrorMessage hides raw SQL and internal infrastructure details', () => {
  const fallback = 'Unable to save your changes right now.';

  assert.equal(
    sanitizeServerErrorMessage(
      new Error('duplicate key value violates unique constraint "user_profiles_pkey"'),
      fallback
    ),
    fallback
  );

  assert.equal(
    sanitizeServerErrorMessage(
      new Error('invalid input syntax for type uuid: "abc"'),
      fallback
    ),
    fallback
  );

  assert.equal(
    sanitizeServerErrorMessage(
      new Error('connect ECONNREFUSED ep-gentle-sound.us-east-2.aws.neon.tech:5432'),
      fallback
    ),
    fallback
  );
});
