/**
 * Neon Managed Better Auth configuration.
 *
 * The Neon Auth Base URL is a public authentication endpoint (not a secret).
 * Private secrets (cookie signing secret, OAuth client secrets, SMTP keys)
 * must never be exposed in client-side code or NEXT_PUBLIC_ variables.
 */

/**
 * Neon Auth Base URL resolved from environment variables.
 * No hardcoded fallback — NEON_AUTH_BASE_URL or NEXT_PUBLIC_NEON_AUTH_URL must be set.
 */
function getDefaultNeonAuthUrl(): string {
  const url =
    process.env.NEON_AUTH_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_NEON_AUTH_URL?.trim() ||
    '';
  if (!url) {
    throw new Error(
      '[LifeCraft] NEON_AUTH_BASE_URL or NEXT_PUBLIC_NEON_AUTH_URL must be configured in environment variables.'
    );
  }
  return url;
}

export const OAUTH_BROADCAST_CHANNEL = 'lifecraft_neon_oauth_channel';
export const OAUTH_STORAGE_KEY = 'lifecraft_neon_oauth_payload';

function resolveActiveDatabaseName(): string | null {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl || dbUrl === 'MY_DATABASE_URL' || dbUrl.includes('<password>')) {
    return null;
  }
  try {
    const parsedDb = new URL(dbUrl);
    const dbName = parsedDb.pathname.replace(/^\/+/, '').split('/')[0]?.trim();
    return dbName || null;
  } catch {
    return null;
  }
}

export function getNeonAuthBaseUrl(): string {
  const configuredUrl = getDefaultNeonAuthUrl().replace(/\/+$/, '');

  const match = configuredUrl.match(/^(https?:\/\/[^/]+)\/([^/]+)\/auth$/i);
  if (match) {
    const [, origin, authDbName] = match;
    const activeDbName = resolveActiveDatabaseName();
    if (activeDbName && authDbName !== activeDbName) {
      return `${origin}/${activeDbName}/auth`;
    }
  }

  return configuredUrl;
}

/**
 * If DATABASE_URL targets a different database (e.g. `lifecraftdb`) than the
 * database path segment in NEON_AUTH_BASE_URL (e.g. `/neondb/auth`), returns
 * the Neon Auth Base URL adjusted to match the active database name.
 */
export function getDatabaseScopedNeonAuthBaseUrl(): string | null {
  const primary = getNeonAuthBaseUrl();
  const activeDbName = resolveActiveDatabaseName();
  if (!activeDbName) return null;

  const match = primary.match(/^(https?:\/\/[^/]+)\/([^/]+)\/auth$/i);
  if (!match) return null;

  const [, origin, authDbName] = match;
  if (authDbName === activeDbName) return null;

  return `${origin}/${activeDbName}/auth`;
}

export function getGoogleCallbackUri(): string {
  return `${getNeonAuthBaseUrl()}/callback/google`;
}

let hasWarnedMissingCookieSecret = false;

/**
 * Server-only cookie secret getter.
 * Uses NEON_AUTH_COOKIE_SECRET when configured, with a >=32-character
 * development fallback so local builds and previews do not crash before
 * production secrets are injected.
 */
export function getNeonAuthCookieSecret(): string {
  const envSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }

  if (process.env.NODE_ENV === 'production' && !hasWarnedMissingCookieSecret) {
    hasWarnedMissingCookieSecret = true;
    console.warn(
      '[LifeCraft Security] NEON_AUTH_COOKIE_SECRET is missing or shorter than 32 characters in production. Configure a strong 32+ character secret in your production environment.'
    );
  }

  throw new Error(
    '[LifeCraft] NEON_AUTH_COOKIE_SECRET must be set in environment variables (minimum 32 characters).'
  );
}
