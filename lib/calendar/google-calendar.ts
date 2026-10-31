import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../db';
import {
  googleCalendarConnections,
  googleCalendarEventMappings,
  tasks,
} from '../db/schema';
import { ensureUserProfile, type AuthSessionUser } from '../queries/dashboard';
import { DEFAULT_TIMEZONE, resolveValidTimezone } from '../queries/timezone';
import { isValidUuid } from '../queries/tasks';
import { serializeTaskRow } from '../tasks/validation';
import type { ExternalGoogleCalendarEvent } from './calendar-utils';
import {
  buildGoogleCalendarEventResource,
  decryptGoogleToken,
  encryptGoogleToken,
  isGoogleTokenEncryptionConfigured,
} from './google-calendar-crypto';

export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

export const GOOGLE_OAUTH_STATE_COOKIE = 'lifecraft_gcal_oauth_nonce';

const PLACEHOLDER_VALUES = new Set([
  'your-google-oauth-client-id.apps.googleusercontent.com',
  'your-google-oauth-client-secret',
  'MY_GOOGLE_CALENDAR_CLIENT_ID',
  'MY_GOOGLE_CALENDAR_CLIENT_SECRET',
]);

let gcalEnvLoaded = false;

function hasValidEnvValue(raw: string | undefined): boolean {
  const trimmed = (raw ?? '').trim();
  return trimmed.length > 0 && !PLACEHOLDER_VALUES.has(trimmed);
}

function ensureGoogleCalendarEnvLoaded(): void {
  if (
    hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_ID) &&
    hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
  ) {
    return;
  }

  if (!gcalEnvLoaded) {
    gcalEnvLoaded = true;
    try {
      dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true });
      dotenv.config({ quiet: true });
    } catch {
      // Ignore dotenv errors
    }
  }

  if (
    hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_ID) &&
    hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
  ) {
    return;
  }

  // Fallback 1: persisted server-only credentials in /.aistudio/server-credentials.json
  try {
    const serverCredsPath = path.join(
      process.cwd(),
      '.aistudio',
      'server-credentials.json'
    );
    if (fs.existsSync(serverCredsPath)) {
      const parsed = JSON.parse(fs.readFileSync(serverCredsPath, 'utf8')) as {
        googleOAuth?: {
          clientId?: string;
          clientSecret?: string;
          redirectUris?: string[];
        };
      };
      const oauth = parsed.googleOAuth;
      if (oauth?.clientId && !hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_ID)) {
        process.env.GOOGLE_CALENDAR_CLIENT_ID = oauth.clientId.trim();
      }
      if (
        oauth?.clientSecret &&
        !hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
      ) {
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET = oauth.clientSecret.trim();
      }
      if (
        oauth?.redirectUris?.[0] &&
        !process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()
      ) {
        process.env.GOOGLE_CALENDAR_REDIRECT_URI = oauth.redirectUris[0].trim();
      }
    }
  } catch {
    // Ignore file read errors
  }

  // Fallback 2: persisted Google OAuth client JSON in /.aistudio/google-oauth-client.json
  if (
    !hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_ID) ||
    !hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
  ) {
    try {
      const oauthJsonPath = path.join(
        process.cwd(),
        '.aistudio',
        'google-oauth-client.json'
      );
      if (fs.existsSync(oauthJsonPath)) {
        const parsed = JSON.parse(fs.readFileSync(oauthJsonPath, 'utf8')) as {
          web?: {
            client_id?: string;
            client_secret?: string;
            redirect_uris?: string[];
          };
        };
        const web = parsed.web;
        if (web?.client_id && !hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_ID)) {
          process.env.GOOGLE_CALENDAR_CLIENT_ID = web.client_id.trim();
        }
        if (
          web?.client_secret &&
          !hasValidEnvValue(process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
        ) {
          process.env.GOOGLE_CALENDAR_CLIENT_SECRET = web.client_secret.trim();
        }
        if (
          web?.redirect_uris?.[0] &&
          !process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()
        ) {
          process.env.GOOGLE_CALENDAR_REDIRECT_URI = web.redirect_uris[0].trim();
        }
      }
    } catch {
      // Ignore file read errors
    }
  }
}

export interface GoogleCalendarConfigStatus {
  isConfigured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasEncryptionKey: boolean;
  missingEnvVars: string[];
  redirectUri: string;
  requiredScopes: string[];
}

export interface GoogleCalendarConnectionSummary {
  connected: boolean;
  status: 'disconnected' | 'connected' | 'expired' | 'revoked' | 'error';
  googleEmail: string | null;
  googleAccountId: string | null;
  calendarId: string | null;
  grantedScopes: string[];
  connectedAt: string | null;
  lastError: string | null;
}

export const DEFAULT_CLOUD_RUN_ORIGIN =
  process.env.APP_URL?.trim() || 'http://localhost:3000';

export function resolveGoogleCalendarRedirectUri(
  requestOrigin?: string
): string {
  ensureGoogleCalendarEnvLoaded();

  const configuredRedirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (
    configuredRedirect &&
    configuredRedirect.startsWith('http') &&
    !configuredRedirect.includes('<your-app-origin>')
  ) {
    if (configuredRedirect.includes('/api/calendar/google/callback')) {
      return configuredRedirect;
    }
    return `${configuredRedirect.replace(/\/+$/, '')}/api/calendar/google/callback`;
  }

  const baseOrigin = (() => {
    if (requestOrigin && requestOrigin.startsWith('http')) {
      return requestOrigin.replace(/\/+$/, '');
    }
    const appUrl = process.env.APP_URL?.trim();
    if (appUrl && appUrl.startsWith('http') && appUrl !== 'MY_APP_URL') {
      return appUrl.replace(/\/+$/, '');
    }
    return DEFAULT_CLOUD_RUN_ORIGIN;
  })();

  return `${baseOrigin}/api/calendar/google/callback`;
}

export function getGoogleCalendarConfigStatus(
  requestOrigin?: string
): GoogleCalendarConfigStatus {
  ensureGoogleCalendarEnvLoaded();

  const rawClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ?? '';
  const rawClientSecret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ?? '';

  const hasClientId =
    rawClientId.length > 0 && !PLACEHOLDER_VALUES.has(rawClientId);
  const hasClientSecret =
    rawClientSecret.length > 0 && !PLACEHOLDER_VALUES.has(rawClientSecret);
  const hasEncryptionKey = isGoogleTokenEncryptionConfigured();

  const missingEnvVars: string[] = [];
  if (!hasClientId) missingEnvVars.push('GOOGLE_CALENDAR_CLIENT_ID');
  if (!hasClientSecret) missingEnvVars.push('GOOGLE_CALENDAR_CLIENT_SECRET');
  if (!hasEncryptionKey) {
    missingEnvVars.push('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY');
  }

  return {
    isConfigured: hasClientId && hasClientSecret && hasEncryptionKey,
    hasClientId,
    hasClientSecret,
    hasEncryptionKey,
    missingEnvVars,
    redirectUri: resolveGoogleCalendarRedirectUri(requestOrigin),
    requiredScopes: [...GOOGLE_CALENDAR_OAUTH_SCOPES],
  };
}

export function buildGoogleCalendarAuthorizeUrl(params: {
  stateToken: string;
  requestOrigin?: string;
  redirectUriOverride?: string;
}): string {
  const config = getGoogleCalendarConfigStatus(params.requestOrigin);
  if (!config.isConfigured) {
    throw new Error(
      `Missing Google Calendar OAuth configuration: ${config.missingEnvVars.join(', ')}`
    );
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim();
  const redirectUri = (
    params.redirectUriOverride || config.redirectUri
  ).replace(/\/+$/, '');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_CALENDAR_OAUTH_SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', params.stateToken);

  return authUrl.toString();
}

export async function getGoogleCalendarConnectionSummary(
  userId: string
): Promise<GoogleCalendarConnectionSummary> {
  if (!isDatabaseConfigured()) {
    return {
      connected: false,
      status: 'disconnected',
      googleEmail: null,
      googleAccountId: null,
      calendarId: null,
      grantedScopes: [],
      connectedAt: null,
      lastError: null,
    };
  }

  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId))
      .limit(1);

    if (!row) {
      return {
        connected: false,
        status: 'disconnected',
        googleEmail: null,
        googleAccountId: null,
        calendarId: null,
        grantedScopes: [],
        connectedAt: null,
        lastError: null,
      };
    }

    const status =
      row.status === 'expired' ||
      row.status === 'revoked' ||
      row.status === 'error'
        ? row.status
        : 'connected';

    return {
      connected: status === 'connected',
      status,
      googleEmail: row.googleEmail,
      googleAccountId: row.googleAccountId,
      calendarId: row.calendarId,
      grantedScopes: row.grantedScopes
        ? row.grantedScopes.split(/\s+/).filter(Boolean)
        : [],
      connectedAt: row.connectedAt
        ? new Date(row.connectedAt).toISOString()
        : null,
      lastError: row.lastError ?? null,
    };
  } catch {
    return {
      connected: false,
      status: 'disconnected',
      googleEmail: null,
      googleAccountId: null,
      calendarId: null,
      grantedScopes: [],
      connectedAt: null,
      lastError: null,
    };
  }
}

export async function completeGoogleCalendarOAuthCallback(params: {
  authUser: AuthSessionUser;
  code: string;
  requestOrigin?: string;
  redirectUriOverride?: string;
}): Promise<
  | { status: 'ok'; googleEmail: string }
  | { status: 'error'; message: string }
> {
  const config = getGoogleCalendarConfigStatus(params.requestOrigin);
  if (!config.isConfigured) {
    return {
      status: 'error',
      message: `Google Calendar OAuth is missing server configuration: ${config.missingEnvVars.join(', ')}`,
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: 'error',
      message: 'PostgreSQL database is not configured.',
    };
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!.trim();
  const redirectUri = (
    params.redirectUriOverride || config.redirectUri
  ).replace(/\/+$/, '');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: params.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      cache: 'no-store',
    });

    const tokenData = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      return {
        status: 'error',
        message:
          tokenData.error_description ||
          'Google rejected the authorization code exchange. Verify your Client ID, Client Secret, and Redirect URI.',
      };
    }

    // Fetch Google user profile to identify the connected account
    const userInfoRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        cache: 'no-store',
      }
    );

    const userInfo = (await userInfoRes.json().catch(() => ({}))) as {
      sub?: string;
      email?: string;
    };

    const googleAccountId = userInfo.sub || params.authUser.id;
    const googleEmail = userInfo.email || params.authUser.email;

    const db = getDb();
    await ensureUserProfile(params.authUser);

    const [existing] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, params.authUser.id))
      .limit(1);

    const encryptedAccessToken = encryptGoogleToken(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token
      ? encryptGoogleToken(tokenData.refresh_token)
      : existing?.encryptedRefreshToken ?? null;

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : new Date(Date.now() + 3500 * 1000);

    const grantedScopes =
      tokenData.scope || GOOGLE_CALENDAR_OAUTH_SCOPES.join(' ');
    const now = new Date();

    if (existing) {
      await db
        .update(googleCalendarConnections)
        .set({
          googleAccountId,
          googleEmail,
          grantedScopes,
          encryptedAccessToken,
          encryptedRefreshToken,
          accessTokenExpiresAt: expiresAt,
          status: 'connected',
          lastError: null,
          updatedAt: now,
        })
        .where(eq(googleCalendarConnections.userId, params.authUser.id));
    } else {
      await db.insert(googleCalendarConnections).values({
        userId: params.authUser.id,
        googleAccountId,
        googleEmail,
        calendarId: 'primary',
        grantedScopes,
        encryptedAccessToken,
        encryptedRefreshToken,
        accessTokenExpiresAt: expiresAt,
        status: 'connected',
        lastError: null,
        connectedAt: now,
        updatedAt: now,
      });
    }

    return {
      status: 'ok',
      googleEmail,
    };
  } catch (err) {
    console.error('[LifeCraft Google Calendar] OAuth callback failed:', err);
    return {
      status: 'error',
      message:
        'Could not complete Google Calendar connection. Please try again.',
    };
  }
}

async function getValidGoogleAccessTokenForUser(
  userId: string
): Promise<
  | { ok: true; accessToken: string; calendarId: string }
  | { ok: false; status: 'disconnected' | 'expired' | 'revoked' | 'error'; message: string }
> {
  const config = getGoogleCalendarConfigStatus();
  if (!config.isConfigured) {
    return {
      ok: false,
      status: 'error',
      message: `Google Calendar server configuration is incomplete (${config.missingEnvVars.join(', ')}).`,
    };
  }

  const db = getDb();
  const [conn] = await db
    .select()
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, userId))
    .limit(1);

  if (!conn) {
    return {
      ok: false,
      status: 'disconnected',
      message: 'Google Calendar is not connected.',
    };
  }

  if (conn.status === 'revoked' || conn.status === 'expired') {
    return {
      ok: false,
      status: conn.status,
      message:
        conn.lastError ||
        'Your Google Calendar authorization has expired or was revoked. Please reconnect.',
    };
  }

  const nowMs = Date.now();
  const expiresAtMs = conn.accessTokenExpiresAt
    ? new Date(conn.accessTokenExpiresAt).getTime()
    : 0;

  if (conn.encryptedAccessToken && expiresAtMs > nowMs + 60_000) {
    try {
      const accessToken = decryptGoogleToken(conn.encryptedAccessToken);
      return {
        ok: true,
        accessToken,
        calendarId: conn.calendarId || 'primary',
      };
    } catch {
      // Fall through to refresh token
    }
  }

  if (!conn.encryptedRefreshToken) {
    await db
      .update(googleCalendarConnections)
      .set({
        status: 'expired',
        lastError:
          'Google Calendar access token expired and no refresh token is stored. Please reconnect Google Calendar.',
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.userId, userId));

    return {
      ok: false,
      status: 'expired',
      message:
        'Your Google Calendar session has expired. Please reconnect your Google account.',
    };
  }

  try {
    const refreshToken = decryptGoogleToken(conn.encryptedRefreshToken);
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim();
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!.trim();

    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      cache: 'no-store',
    });

    const refreshData = (await refreshRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!refreshRes.ok || !refreshData.access_token) {
      const isRevoked = refreshData.error === 'invalid_grant';
      const nextStatus = isRevoked ? 'revoked' : 'error';
      const errMsg = isRevoked
        ? 'Google Calendar access was revoked or expired. Please reconnect your Google account.'
        : refreshData.error_description ||
          'Failed to refresh Google Calendar access token.';

      await db
        .update(googleCalendarConnections)
        .set({
          status: nextStatus,
          lastError: errMsg,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.userId, userId));

      return {
        ok: false,
        status: nextStatus,
        message: errMsg,
      };
    }

    const newEncryptedAccess = encryptGoogleToken(refreshData.access_token);
    const newEncryptedRefresh = refreshData.refresh_token
      ? encryptGoogleToken(refreshData.refresh_token)
      : conn.encryptedRefreshToken;
    const newExpiresAt = refreshData.expires_in
      ? new Date(Date.now() + refreshData.expires_in * 1000)
      : new Date(Date.now() + 3500 * 1000);

    await db
      .update(googleCalendarConnections)
      .set({
        encryptedAccessToken: newEncryptedAccess,
        encryptedRefreshToken: newEncryptedRefresh,
        accessTokenExpiresAt: newExpiresAt,
        status: 'connected',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.userId, userId));

    return {
      ok: true,
      accessToken: refreshData.access_token,
      calendarId: conn.calendarId || 'primary',
    };
  } catch (err) {
    console.error('[LifeCraft Google Calendar] Token refresh failed:', err);
    return {
      ok: false,
      status: 'error',
      message: 'Could not refresh Google Calendar authorization.',
    };
  }
}

export async function fetchGoogleCalendarEventsForRange(params: {
  userId: string;
  startUtc: Date;
  endUtc: Date;
}): Promise<{
  events: ExternalGoogleCalendarEvent[];
  warningMessage: string | null;
}> {
  const tokenResult = await getValidGoogleAccessTokenForUser(params.userId);
  if (!tokenResult.ok) {
    if (tokenResult.status === 'disconnected') {
      return { events: [], warningMessage: null };
    }
    return {
      events: [],
      warningMessage: tokenResult.message,
    };
  }

  try {
    const db = getDb();
    const mappings = await db
      .select()
      .from(googleCalendarEventMappings)
      .where(eq(googleCalendarEventMappings.userId, params.userId));
    const eventToTaskMap = new Map<string, string>();
    for (const m of mappings) {
      eventToTaskMap.set(m.googleEventId, m.taskId);
    }

    const events: ExternalGoogleCalendarEvent[] = [];
    let pageToken: string | undefined = undefined;
    let pagesFetched = 0;

    while (pagesFetched < 2) {
      const apiUrl = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          tokenResult.calendarId
        )}/events`
      );
      apiUrl.searchParams.set('timeMin', params.startUtc.toISOString());
      apiUrl.searchParams.set('timeMax', params.endUtc.toISOString());
      apiUrl.searchParams.set('singleEvents', 'true');
      apiUrl.searchParams.set('orderBy', 'startTime');
      apiUrl.searchParams.set('maxResults', '250');
      if (pageToken) {
        apiUrl.searchParams.set('pageToken', pageToken);
      }

      const res = await fetch(apiUrl.toString(), {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
        },
        cache: 'no-store',
      });

      if (res.status === 401 || res.status === 403) {
        const errMsg =
          res.status === 401
            ? 'Google Calendar authorization expired. Please reconnect your Google account.'
            : 'Google Calendar permission was denied. Verify Calendar API is enabled and scopes are granted.';
        await db
          .update(googleCalendarConnections)
          .set({
            status: res.status === 401 ? 'expired' : 'error',
            lastError: errMsg,
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarConnections.userId, params.userId));
        return { events: [], warningMessage: errMsg };
      }

      if (!res.ok) {
        return {
          events,
          warningMessage:
            'Could not load external events from Google Calendar right now.',
        };
      }

      const payload = (await res.json()) as {
        items?: Array<{
          id?: string;
          status?: string;
          summary?: string;
          description?: string;
          htmlLink?: string;
          location?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
          extendedProperties?: {
            private?: { lifecraftTaskId?: string };
          };
        }>;
        nextPageToken?: string;
      };

      for (const item of payload.items ?? []) {
        if (!item.id || item.status === 'cancelled') continue;
        const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
        const linkedTaskId =
          item.extendedProperties?.private?.lifecraftTaskId ||
          eventToTaskMap.get(item.id) ||
          null;

        events.push({
          id: item.id,
          title: item.summary?.trim() || '(Untitled Google event)',
          description: item.description ?? null,
          isAllDay,
          startIso: item.start?.dateTime
            ? new Date(item.start.dateTime).toISOString()
            : null,
          endIso: item.end?.dateTime
            ? new Date(item.end.dateTime).toISOString()
            : null,
          startDate: item.start?.date ?? null,
          endDate: item.end?.date ?? null,
          htmlLink: item.htmlLink ?? null,
          location: item.location ?? null,
          status: item.status || 'confirmed',
          linkedTaskId,
        });
      }

      pagesFetched += 1;
      if (!payload.nextPageToken) break;
      pageToken = payload.nextPageToken;
    }

    return { events, warningMessage: null };
  } catch (err) {
    console.error('[LifeCraft Google Calendar] Failed to list events:', err);
    return {
      events: [],
      warningMessage:
        'Could not reach Google Calendar API right now. Your internal LifeCraft schedule is still active.',
    };
  }
}

export async function exportTaskToGoogleCalendarForUser(
  authUser: AuthSessionUser,
  taskId: string
): Promise<
  | {
      status: 'ok' | 'already_exported';
      googleEventId: string;
      googleHtmlLink: string | null;
      message: string;
    }
  | {
      status: 'not_found' | 'validation_error' | 'auth_error' | 'error';
      message: string;
    }
> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'error',
      message: 'PostgreSQL database is not configured.',
    };
  }

  if (!isValidUuid(taskId)) {
    return {
      status: 'not_found',
      message: 'Task not found.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(
      profile?.timezone ?? DEFAULT_TIMEZONE
    );

    const [taskRow] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, authUser.id)))
      .limit(1);

    if (!taskRow) {
      return {
        status: 'not_found',
        message: 'Task not found or you do not have permission to export it.',
      };
    }

    // Check existing mapping to prevent duplicate event creation on retry
    const [existingMapping] = await db
      .select()
      .from(googleCalendarEventMappings)
      .where(
        and(
          eq(googleCalendarEventMappings.userId, authUser.id),
          eq(googleCalendarEventMappings.taskId, taskId)
        )
      )
      .limit(1);

    if (existingMapping) {
      return {
        status: 'already_exported',
        googleEventId: existingMapping.googleEventId,
        googleHtmlLink: existingMapping.googleHtmlLink ?? null,
        message:
          'This task is already linked to a Google Calendar event. Duplicate creation was prevented.',
      };
    }

    const serialized = serializeTaskRow(taskRow, { timezone });
    const eventResource = buildGoogleCalendarEventResource(
      serialized,
      timezone
    );

    if (!eventResource) {
      return {
        status: 'validation_error',
        message:
          'Please schedule a start and end time (or mark the task as all-day on a date) before exporting to Google Calendar.',
      };
    }

    const tokenResult = await getValidGoogleAccessTokenForUser(authUser.id);
    if (!tokenResult.ok) {
      return {
        status: 'auth_error',
        message: tokenResult.message,
      };
    }

    const insertRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        tokenResult.calendarId
      )}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventResource),
        cache: 'no-store',
      }
    );

    const createdEvent = (await insertRes.json().catch(() => ({}))) as {
      id?: string;
      htmlLink?: string;
      error?: { message?: string };
    };

    if (!insertRes.ok || !createdEvent.id) {
      return {
        status: 'error',
        message:
          createdEvent.error?.message ||
          'Google Calendar rejected the event creation request.',
      };
    }

    await db
      .insert(googleCalendarEventMappings)
      .values({
        userId: authUser.id,
        taskId: taskRow.id,
        googleCalendarId: tokenResult.calendarId,
        googleEventId: createdEvent.id,
        googleHtmlLink: createdEvent.htmlLink ?? null,
        exportedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    return {
      status: 'ok',
      googleEventId: createdEvent.id,
      googleHtmlLink: createdEvent.htmlLink ?? null,
      message: 'Task exported to your Google Calendar.',
    };
  } catch (err) {
    console.error('[LifeCraft Google Calendar] Failed to export task:', err);
    return {
      status: 'error',
      message: 'Could not export this task to Google Calendar right now.',
    };
  }
}

export async function disconnectGoogleCalendarForUser(
  authUser: AuthSessionUser
): Promise<{ status: 'ok' | 'error'; message: string }> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'error',
      message: 'PostgreSQL database is not configured.',
    };
  }

  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, authUser.id))
      .limit(1);

    if (existing) {
      // Best-effort token revocation with Google OAuth endpoint
      const encryptedToken =
        existing.encryptedRefreshToken || existing.encryptedAccessToken;
      if (encryptedToken && isGoogleTokenEncryptionConfigured()) {
        try {
          const token = decryptGoogleToken(encryptedToken);
          await fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              cache: 'no-store',
            }
          );
        } catch {
          // Continue with local disconnection even if upstream revocation fails
        }
      }

      await db
        .delete(googleCalendarConnections)
        .where(eq(googleCalendarConnections.userId, authUser.id));
    }

    return {
      status: 'ok',
      message:
        'Google Calendar has been disconnected. Your LifeCraft tasks remain intact.',
    };
  } catch (err) {
    console.error('[LifeCraft Google Calendar] Failed to disconnect:', err);
    return {
      status: 'error',
      message: 'Could not disconnect Google Calendar right now.',
    };
  }
}
