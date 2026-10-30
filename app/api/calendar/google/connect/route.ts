import { NextRequest, NextResponse } from 'next/server';
import { getNeonAuthCookieSecret } from '@/lib/auth/config';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  createSignedGoogleOAuthState,
  verifySignedGoogleOAuthStateSignatureOnly,
} from '@/lib/calendar/google-calendar-crypto';
import {
  buildGoogleCalendarAuthorizeUrl,
  DEFAULT_CLOUD_RUN_ORIGIN,
  getGoogleCalendarConfigStatus,
  GOOGLE_OAUTH_STATE_COOKIE,
} from '@/lib/calendar/google-calendar';

export const dynamic = 'force-dynamic';

function parseValidOrigin(candidate?: string | null): string | null {
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin.replace(/\/+$/, '');
    }
  } catch {
    // Ignore invalid URLs
  }
  return null;
}

function resolveRequestOrigin(req: NextRequest): string {
  const { searchParams } = new URL(req.url);
  const explicitOrigin = parseValidOrigin(searchParams.get('origin'));
  if (explicitOrigin) {
    return explicitOrigin;
  }

  const headerOrigin =
    parseValidOrigin(req.headers.get('origin')) ||
    parseValidOrigin(req.headers.get('referer'));
  if (headerOrigin && !headerOrigin.includes('accounts.google.com')) {
    return headerOrigin;
  }

  const forwardedHost = req.headers.get('x-forwarded-host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost && !forwardedHost.startsWith('localhost')) {
    return `${proto}://${forwardedHost}`.replace(/\/+$/, '');
  }

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && appUrl.startsWith('http') && appUrl !== 'MY_APP_URL') {
    return appUrl.replace(/\/+$/, '');
  }

  const host = req.headers.get('host');
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  return DEFAULT_CLOUD_RUN_ORIGIN;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wantsJson = searchParams.get('format') === 'json';
  const launchState = searchParams.get('launch_state')?.trim() || '';
  const requestOrigin = resolveRequestOrigin(req);

  // Top-level popup launch step: verify HMAC-signed state token, seed the
  // nonce cookie in the top-level popup's cookie jar, and redirect to Google.
  if (launchState) {
    const verified = verifySignedGoogleOAuthStateSignatureOnly(
      launchState,
      getNeonAuthCookieSecret()
    );
    if (!verified.valid) {
      return NextResponse.json(
        { status: 'error', message: verified.reason },
        { status: 400 }
      );
    }

    const authorizeUrl = buildGoogleCalendarAuthorizeUrl({
      stateToken: launchState,
      requestOrigin,
      redirectUriOverride: verified.payload.redirectUri,
    });

    const redirectRes = NextResponse.redirect(authorizeUrl);
    const isHttps = requestOrigin.startsWith('https://');
    redirectRes.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, verified.payload.nonce, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return redirectRes;
  }

  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    if (wantsJson) {
      return NextResponse.json(
        {
          status: 'unauthenticated',
          message: 'Please sign in before connecting Google Calendar.',
        },
        { status: 401 }
      );
    }
    return NextResponse.redirect(
      new URL('/sign-in?redirect=%2Fapp%2Fcalendar', requestOrigin)
    );
  }

  const config = getGoogleCalendarConfigStatus(requestOrigin);
  if (!config.isConfigured) {
    const missingMsg = `Missing server configuration: ${config.missingEnvVars.join(', ')}`;
    if (wantsJson) {
      return NextResponse.json(
        {
          status: 'unconfigured',
          message: missingMsg,
          missingEnvVars: config.missingEnvVars,
          redirectUri: config.redirectUri,
        },
        { status: 400 }
      );
    }
    const targetUrl = new URL('/app/calendar', requestOrigin);
    targetUrl.searchParams.set('gcal_status', 'unconfigured');
    targetUrl.searchParams.set('gcal_message', missingMsg);
    return NextResponse.redirect(targetUrl);
  }

  const { stateToken, nonce } = createSignedGoogleOAuthState(
    {
      userId: user.id,
      userEmail: user.email,
      userName: user.name ?? null,
      redirectUri: config.redirectUri,
      returnTo: '/app/calendar',
    },
    getNeonAuthCookieSecret()
  );

  const authorizeUrl = buildGoogleCalendarAuthorizeUrl({
    stateToken,
    requestOrigin,
    redirectUriOverride: config.redirectUri,
  });

  const launchUrl = `/api/calendar/google/connect?launch_state=${encodeURIComponent(
    stateToken
  )}&origin=${encodeURIComponent(requestOrigin)}`;

  const isHttps = requestOrigin.startsWith('https://');

  if (wantsJson) {
    const jsonRes = NextResponse.json({
      status: 'ok',
      authorizeUrl,
      launchUrl,
      redirectUri: config.redirectUri,
    });
    jsonRes.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: isHttps,
      sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
      maxAge: 600,
      path: '/',
    });
    return jsonRes;
  }

  const redirectRes = NextResponse.redirect(authorizeUrl);
  redirectRes.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 600,
    path: '/',
  });
  return redirectRes;
}
