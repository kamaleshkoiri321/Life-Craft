import { NextRequest, NextResponse } from 'next/server';
import { getNeonAuthCookieSecret } from '@/lib/auth/config';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  verifySignedGoogleOAuthState,
  verifySignedGoogleOAuthStateSignatureOnly,
} from '@/lib/calendar/google-calendar-crypto';
import {
  completeGoogleCalendarOAuthCallback,
  DEFAULT_CLOUD_RUN_ORIGIN,
  GOOGLE_OAUTH_STATE_COOKIE,
} from '@/lib/calendar/google-calendar';

export const dynamic = 'force-dynamic';

const GCAL_BROADCAST_CHANNEL = 'lifecraft_gcal_oauth_channel';
const GCAL_STORAGE_KEY = 'lifecraft_gcal_oauth_payload';

function resolveRequestOrigin(req: NextRequest): string {
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

function buildPopupOrRedirectHtmlResponse(params: {
  requestOrigin: string;
  status: 'connected' | 'error' | 'cancelled' | 'exchange';
  message: string;
  code?: string;
  state?: string;
  clearNonceCookie?: boolean;
}): NextResponse {
  const dest = new URL('/app/calendar', params.requestOrigin);
  if (params.status !== 'exchange') {
    dest.searchParams.set('gcal_status', params.status);
    if (params.message) {
      dest.searchParams.set('gcal_message', params.message);
    }
  }

  const res = NextResponse.redirect(dest);
  if (params.clearNonceCookie) {
    res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  }
  return res;
}

export async function GET(req: NextRequest) {
  const requestOrigin = resolveRequestOrigin(req);
  const { searchParams } = new URL(req.url);
  const oauthError = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state') || '';

  if (oauthError) {
    const isCancelled = oauthError === 'access_denied';
    return buildPopupOrRedirectHtmlResponse({
      requestOrigin,
      status: isCancelled ? 'cancelled' : 'error',
      message: isCancelled
        ? 'Google Calendar authorization was cancelled.'
        : `Google OAuth returned error: ${oauthError}`,
      clearNonceCookie: true,
    });
  }

  if (!code || !state) {
    return buildPopupOrRedirectHtmlResponse({
      requestOrigin,
      status: 'error',
      message: 'Missing authorization code or state from Google OAuth callback.',
      clearNonceCookie: true,
    });
  }

  const sigVerification = verifySignedGoogleOAuthStateSignatureOnly(
    state,
    getNeonAuthCookieSecret()
  );

  if (!sigVerification.valid) {
    return buildPopupOrRedirectHtmlResponse({
      requestOrigin,
      status: 'error',
      message: sigVerification.reason,
      clearNonceCookie: true,
    });
  }

  const statePayload = sigVerification.payload;
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const nonceCookie = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value || '';

  if (user && user.id !== statePayload.userId) {
    return buildPopupOrRedirectHtmlResponse({
      requestOrigin,
      status: 'error',
      message: 'OAuth state user mismatch.',
      clearNonceCookie: true,
    });
  }

  // If the nonce cookie is available in this window (or user session is active),
  // complete the token exchange immediately on the server.
  const canExchangeDirectly =
    (nonceCookie && nonceCookie === statePayload.nonce) || Boolean(user);

  if (!canExchangeDirectly) {
    return buildPopupOrRedirectHtmlResponse({
      requestOrigin,
      status: 'exchange',
      message:
        'Finalizing your Google Calendar connection with LifeCraft. This window will close automatically.',
      code,
      state,
      clearNonceCookie: false,
    });
  }

  const authUser = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: Boolean(user.emailVerified),
        image: user.image ?? null,
      }
    : {
        id: statePayload.userId,
        name: statePayload.userName ?? null,
        email: statePayload.userEmail || 'user@lifecraft.app',
        emailVerified: true,
        image: null,
      };

  const callbackResult = await completeGoogleCalendarOAuthCallback({
    authUser,
    code,
    requestOrigin,
    redirectUriOverride: statePayload.redirectUri,
  });

  if (callbackResult.status === 'error') {
    return buildPopupOrRedirectHtmlResponse({
      requestOrigin,
      status: 'error',
      message: callbackResult.message,
      clearNonceCookie: true,
    });
  }

  return buildPopupOrRedirectHtmlResponse({
    requestOrigin,
    status: 'connected',
    message: `Connected Google Calendar (${callbackResult.googleEmail}). You can return to LifeCraft.`,
    clearNonceCookie: true,
  });
}

export async function POST(req: NextRequest) {
  const requestOrigin = resolveRequestOrigin(req);
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      {
        status: 'unauthenticated',
        message: 'Please sign in to complete Google Calendar authorization.',
      },
      { status: 401 }
    );
  }

  let body: { code?: string; state?: string } = {};
  try {
    body = (await req.json()) as { code?: string; state?: string };
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Invalid callback request payload.',
      },
      { status: 400 }
    );
  }

  const code = body.code?.trim() || '';
  const state = body.state?.trim() || '';

  if (!code || !state) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Missing authorization code or state token.',
      },
      { status: 400 }
    );
  }

  const nonceCookie = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value || '';
  const signingSecret = getNeonAuthCookieSecret();

  const stateVerification = nonceCookie
    ? verifySignedGoogleOAuthState(state, user.id, nonceCookie, signingSecret)
    : verifySignedGoogleOAuthStateSignatureOnly(state, signingSecret);

  if (!stateVerification.valid) {
    return NextResponse.json(
      {
        status: 'error',
        message: stateVerification.reason,
      },
      { status: 400 }
    );
  }

  if (stateVerification.payload.userId !== user.id) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'OAuth state user mismatch.',
      },
      { status: 400 }
    );
  }

  const callbackResult = await completeGoogleCalendarOAuthCallback({
    authUser: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    code,
    requestOrigin,
    redirectUriOverride: stateVerification.payload.redirectUri,
  });

  const res = NextResponse.json(
    callbackResult.status === 'ok'
      ? {
          status: 'connected',
          googleEmail: callbackResult.googleEmail,
          message: `Connected Google Calendar (${callbackResult.googleEmail}).`,
        }
      : {
          status: 'error',
          message: callbackResult.message,
        },
    { status: callbackResult.status === 'ok' ? 200 : 400 }
  );

  res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return res;
}
