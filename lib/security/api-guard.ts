export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  nowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitBucket {
  timestamps: number[];
  expiresAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 5000;

function pruneExpiredBuckets(nowMs: number) {
  if (rateLimitStore.size < MAX_BUCKETS) return;
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.expiresAt <= nowMs) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Sliding-window in-memory rate limiter keyed by user ID or client IP + route action.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const nowMs = options.nowMs ?? Date.now();
  const windowStart = nowMs - options.windowMs;

  pruneExpiredBuckets(nowMs);

  const existing = rateLimitStore.get(key);
  const activeTimestamps = existing
    ? existing.timestamps.filter((ts) => ts > windowStart)
    : [];

  if (activeTimestamps.length >= options.limit) {
    const oldestInWindow = activeTimestamps[0] ?? nowMs;
    const retryAfterMs = Math.max(1000, oldestInWindow + options.windowMs - nowMs);
    rateLimitStore.set(key, {
      timestamps: activeTimestamps,
      expiresAt: nowMs + options.windowMs,
    });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  activeTimestamps.push(nowMs);
  rateLimitStore.set(key, {
    timestamps: activeTimestamps,
    expiresAt: nowMs + options.windowMs,
  });

  return {
    allowed: true,
    remaining: Math.max(0, options.limit - activeTimestamps.length),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitStoreForTests(): void {
  rateLimitStore.clear();
}

export interface OriginCheckRequestLike {
  headers: {
    get(name: string): string | null;
  };
  url?: string;
}

/**
 * Defense-in-depth CSRF / Same-Origin verification for state-changing API requests.
 * Rejects cross-site browser requests where Sec-Fetch-Site is 'cross-site' or Origin host mismatches target host.
 */
export function verifySameOriginMutation(
  req: OriginCheckRequestLike
): { ok: true } | { ok: false; message: string } {
  const secFetchSite = req.headers.get('sec-fetch-site')?.toLowerCase().trim();
  if (secFetchSite === 'cross-site') {
    return {
      ok: false,
      message: 'Cross-site state-changing requests are not permitted.',
    };
  }

  const originHeader = req.headers.get('origin')?.trim();
  if (!originHeader) {
    // Same-origin fetch/non-CORS or server-side call without Origin header
    return { ok: true };
  }

  if (originHeader === 'null') {
    return {
      ok: false,
      message: 'Requests from sandboxed null origins are not permitted.',
    };
  }

  let originHost: string;
  try {
    originHost = new URL(originHeader).host.toLowerCase();
  } catch {
    return {
      ok: false,
      message: 'Malformed Origin header.',
    };
  }

  const forwardedHost = req.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  const hostHeader = req.headers.get('host')?.trim().toLowerCase();

  let urlHost: string | undefined;
  if (req.url) {
    try {
      urlHost = new URL(req.url).host.toLowerCase();
    } catch {
      urlHost = undefined;
    }
  }

  const allowedHosts = new Set(
    [forwardedHost, hostHeader, urlHost].filter(
      (h): h is string => Boolean(h && h.length > 0)
    )
  );

  if (allowedHosts.size > 0 && !allowedHosts.has(originHost)) {
    return {
      ok: false,
      message: 'Origin does not match application host.',
    };
  }

  return { ok: true };
}

const INTERNAL_ERROR_PATTERNS = [
  /relation\s+["']?[\w.]+["']?\s+does not exist/i,
  /duplicate key value violates unique constraint/i,
  /violates foreign key constraint/i,
  /violates check constraint/i,
  /invalid input syntax for type/i,
  /syntax error at or near/i,
  /neon\.tech/i,
  /postgres(ql)?/i,
  /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
  /password authentication failed/i,
  /connection terminated/i,
  /drizzle/i,
];

/**
 * Sanitizes caught server/database errors so raw SQL, schema names, or connection details
 * are never exposed to client responses.
 */
export function sanitizeServerErrorMessage(
  err: unknown,
  fallbackMessage: string
): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (!raw || raw.trim().length === 0) {
    return fallbackMessage;
  }

  for (const pattern of INTERNAL_ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return fallbackMessage;
    }
  }

  if (raw.length > 180 || raw.includes('\n')) {
    return fallbackMessage;
  }

  return fallbackMessage;
}
