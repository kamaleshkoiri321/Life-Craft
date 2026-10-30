import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { getNeonAuthCookieSecret } from '../auth/config';
import {
  DEFAULT_TIMEZONE,
  resolveValidTimezone,
  shiftLocalDateString,
} from '../queries/timezone';
import type { SerializedTaskItem } from '../tasks/validation';

const PLACEHOLDER_SECRETS = new Set([
  'replace-with-at-least-32-character-token-encryption-key',
  'replace-with-at-least-32-character-secret-key',
  'your-google-oauth-client-id.apps.googleusercontent.com',
  'your-google-oauth-client-secret',
]);

export function getGoogleTokenEncryptionSecret(
  overrideSecret?: string
): string | null {
  if (overrideSecret !== undefined) {
    const trimmed = overrideSecret.trim();
    if (!trimmed || trimmed.length < 32 || PLACEHOLDER_SECRETS.has(trimmed)) {
      return null;
    }
    return trimmed;
  }

  const candidates = [
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY,
    process.env.NEON_AUTH_COOKIE_SECRET,
    getNeonAuthCookieSecret(),
  ];

  for (const raw of candidates) {
    const trimmed = (raw ?? '').trim();
    if (trimmed.length >= 32 && !PLACEHOLDER_SECRETS.has(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

export function isGoogleTokenEncryptionConfigured(
  overrideSecret?: string
): boolean {
  return getGoogleTokenEncryptionSecret(overrideSecret) !== null;
}

function deriveAes256Key(rawSecret: string): Buffer {
  return createHash('sha256')
    .update(`lifecraft-google-calendar-token-v1:${rawSecret}`, 'utf8')
    .digest();
}

/**
 * Encrypts sensitive OAuth tokens at rest using AES-256-GCM with a random 12-byte IV
 * and 16-byte authentication tag. Never stores plaintext tokens.
 */
export function encryptGoogleToken(
  plaintext: string,
  overrideSecret?: string
): string {
  const secret = getGoogleTokenEncryptionSecret(overrideSecret);
  if (!secret) {
    throw new Error(
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY (minimum 32 characters) is required to encrypt Google Calendar OAuth tokens at rest.'
    );
  }

  const key = deriveAes256Key(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptGoogleToken(
  encryptedPayload: string,
  overrideSecret?: string
): string {
  const secret = getGoogleTokenEncryptionSecret(overrideSecret);
  if (!secret) {
    throw new Error(
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured to decrypt stored OAuth tokens.'
    );
  }

  const parts = encryptedPayload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted Google OAuth token payload.');
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(tagB64, 'base64url');
  const encrypted = Buffer.from(dataB64, 'base64url');

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error('Invalid IV or authentication tag length.');
  }

  const key = deriveAes256Key(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export interface SignedGoogleOAuthStatePayload {
  userId: string;
  userEmail?: string;
  userName?: string | null;
  redirectUri?: string;
  nonce: string;
  returnTo: string;
  expiresAtMs: number;
}

export function createSignedGoogleOAuthState(
  params: {
    userId: string;
    userEmail?: string;
    userName?: string | null;
    redirectUri?: string;
    returnTo?: string;
    nowMs?: number;
    ttlMs?: number;
  },
  signingSecret: string
): { stateToken: string; nonce: string } {
  const nowMs = params.nowMs ?? Date.now();
  const ttlMs = params.ttlMs ?? 10 * 60 * 1000; // 10 minutes
  const nonce = randomBytes(16).toString('base64url');
  const safeReturnTo =
    params.returnTo && params.returnTo.startsWith('/app')
      ? params.returnTo
      : '/app/calendar';

  const payload: SignedGoogleOAuthStatePayload = {
    userId: params.userId,
    ...(params.userEmail ? { userEmail: params.userEmail } : {}),
    ...(params.userName !== undefined ? { userName: params.userName } : {}),
    ...(params.redirectUri ? { redirectUri: params.redirectUri } : {}),
    nonce,
    returnTo: safeReturnTo,
    expiresAtMs: nowMs + ttlMs,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const signature = createHmac('sha256', signingSecret)
    .update(encodedPayload, 'utf8')
    .digest('base64url');

  return {
    stateToken: `${encodedPayload}.${signature}`,
    nonce,
  };
}

export function verifySignedGoogleOAuthStateSignatureOnly(
  stateToken: string,
  signingSecret: string,
  nowMs: number = Date.now()
):
  | { valid: true; payload: SignedGoogleOAuthStatePayload }
  | { valid: false; reason: string } {
  if (!stateToken) {
    return { valid: false, reason: 'Missing OAuth state token.' };
  }

  const parts = stateToken.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Malformed OAuth state parameter.' };
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = createHmac('sha256', signingSecret)
    .update(encodedPayload, 'utf8')
    .digest('base64url');

  const sigBufA = Buffer.from(providedSignature, 'utf8');
  const sigBufB = Buffer.from(expectedSignature, 'utf8');
  if (sigBufA.length !== sigBufB.length || !timingSafeEqual(sigBufA, sigBufB)) {
    return { valid: false, reason: 'Invalid OAuth state signature.' };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SignedGoogleOAuthStatePayload;

    if (!decoded.userId || !decoded.nonce) {
      return { valid: false, reason: 'Incomplete OAuth state payload.' };
    }

    if (nowMs > decoded.expiresAtMs) {
      return {
        valid: false,
        reason:
          'OAuth authorization session expired. Please try connecting again.',
      };
    }

    return { valid: true, payload: decoded };
  } catch {
    return { valid: false, reason: 'Could not parse OAuth state payload.' };
  }
}

export function verifySignedGoogleOAuthState(
  stateToken: string,
  expectedUserId: string,
  expectedNonceCookie: string,
  signingSecret: string,
  nowMs: number = Date.now()
):
  | { valid: true; payload: SignedGoogleOAuthStatePayload }
  | { valid: false; reason: string } {
  if (!stateToken || !expectedNonceCookie) {
    return { valid: false, reason: 'Missing OAuth state token or state cookie.' };
  }

  const sigVerified = verifySignedGoogleOAuthStateSignatureOnly(
    stateToken,
    signingSecret,
    nowMs
  );
  if (!sigVerified.valid) {
    return sigVerified;
  }

  const decoded = sigVerified.payload;
  if (decoded.userId !== expectedUserId) {
    return {
      valid: false,
      reason: 'OAuth state user mismatch.',
    };
  }

  if (decoded.nonce !== expectedNonceCookie) {
    return {
      valid: false,
      reason: 'OAuth state nonce mismatch.',
    };
  }

  return { valid: true, payload: decoded };
}

export interface GoogleCalendarInsertEventResource {
  summary: string;
  description?: string;
  start:
    | { date: string; dateTime?: never; timeZone?: never }
    | { dateTime: string; timeZone: string; date?: never };
  end:
    | { date: string; dateTime?: never; timeZone?: never }
    | { dateTime: string; timeZone: string; date?: never };
  extendedProperties: {
    private: {
      lifecraftTaskId: string;
    };
  };
}

/**
 * Formats a scheduled LifeCraft task into a Google Calendar API v3 Event resource.
 * Uses pure date strings (`YYYY-MM-DD`) for all-day tasks and ISO timestamps + IANA
 * timezone for timed tasks.
 */
export function buildGoogleCalendarEventResource(
  task: SerializedTaskItem,
  timezone: string = DEFAULT_TIMEZONE
): GoogleCalendarInsertEventResource | null {
  const tz = resolveValidTimezone(timezone);

  if (task.isAllDay && task.scheduledDate) {
    const startDate = task.scheduledDate;
    const inclusiveEnd = task.scheduledEndDate || task.scheduledDate;
    const exclusiveEndDate = shiftLocalDateString(inclusiveEnd, 1);

    return {
      summary: task.title,
      ...(task.description ? { description: task.description } : {}),
      start: { date: startDate },
      end: { date: exclusiveEndDate },
      extendedProperties: {
        private: {
          lifecraftTaskId: task.id,
        },
      },
    };
  }

  if (task.scheduledStartAt && task.scheduledEndAt) {
    const sDate = new Date(task.scheduledStartAt);
    const eDate = new Date(task.scheduledEndAt);
    if (
      Number.isNaN(sDate.getTime()) ||
      Number.isNaN(eDate.getTime()) ||
      eDate.getTime() <= sDate.getTime()
    ) {
      return null;
    }

    return {
      summary: task.title,
      ...(task.description ? { description: task.description } : {}),
      start: {
        dateTime: sDate.toISOString(),
        timeZone: tz,
      },
      end: {
        dateTime: eDate.toISOString(),
        timeZone: tz,
      },
      extendedProperties: {
        private: {
          lifecraftTaskId: task.id,
        },
      },
    };
  }

  return null;
}
