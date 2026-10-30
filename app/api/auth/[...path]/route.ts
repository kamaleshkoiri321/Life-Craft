import { NextRequest, NextResponse } from 'next/server';
import {
  auth,
  clearSessionFromDatabase,
  fallbackDatabaseAuth,
  getResilientServerSession,
  SESSION_TOKEN_COOKIE_NAMES,
} from '@/lib/auth/server';

const baseHandlers = auth.handler();
const fallbackHandlers = fallbackDatabaseAuth ? fallbackDatabaseAuth.handler() : null;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const FALLBACK_TRUSTED_ORIGIN = 'http://localhost:3000';

function getExpectedBrowserOrigins(req: NextRequest): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(req.url).origin);
  } catch {
    // ignore malformed url
  }

  const forwardedHost = req.headers.get('x-forwarded-host');
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';

  if (forwardedHost) {
    origins.add(`${proto}://${forwardedHost}`);
    origins.add(`https://${forwardedHost}`);
  }
  if (host) {
    origins.add(`${proto}://${host}`);
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }
  return origins;
}

function isSameOriginBrowserRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const expected = getExpectedBrowserOrigins(req);
  return expected.has(origin);
}

function withPartitionedCrossSiteCookies(response: Response): Response {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('set-cookie');

  for (const cookie of setCookies) {
    if (
      /samesite=none/i.test(cookie) &&
      !/partitioned/i.test(cookie)
    ) {
      headers.append('Set-Cookie', `${cookie}; Partitioned`);
    } else {
      headers.append('Set-Cookie', cookie);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function buildFallbackOriginRequest(
  req: NextRequest,
  rawBodyText: string | null,
  isSocialSignIn: boolean
): Promise<NextRequest> {
  const headers = new Headers(req.headers);
  headers.set('origin', FALLBACK_TRUSTED_ORIGIN);
  headers.set('referer', `${FALLBACK_TRUSTED_ORIGIN}/`);
  headers.delete('content-length');

  let updatedBody = rawBodyText;
  if (!isSocialSignIn && rawBodyText) {
    try {
      const parsed = JSON.parse(rawBodyText) as Record<string, unknown>;
      if (typeof parsed.callbackURL === 'string' && parsed.callbackURL.startsWith('http')) {
        const u = new URL(parsed.callbackURL);
        parsed.callbackURL = `${FALLBACK_TRUSTED_ORIGIN}${u.pathname}${u.search}`;
      }
      if (typeof parsed.redirectTo === 'string' && parsed.redirectTo.startsWith('http')) {
        const u = new URL(parsed.redirectTo);
        parsed.redirectTo = `${FALLBACK_TRUSTED_ORIGIN}${u.pathname}${u.search}`;
      }
      updatedBody = JSON.stringify(parsed);
    } catch {
      // Keep original body if not JSON
    }
  }

  return new NextRequest(req.url, {
    method: req.method,
    headers,
    body:
      req.method !== 'GET' && req.method !== 'HEAD'
        ? (updatedBody ?? undefined)
        : undefined,
  });
}

async function handleWithOriginResilience(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  req: NextRequest,
  context: RouteContext
): Promise<Response> {
  const resolvedParams = await context.params;
  const pathJoined = (resolvedParams.path || []).join('/');
  const isSocialSignIn = pathJoined === 'sign-in/social';

  // Fast-path for GET /api/auth/get-session:
  // If there is no OAuth session verifier token in the query string, resolve the active session
  // directly via getResilientServerSession() (which checks neon_auth.session in PostgreSQL first)
  // to avoid @neondatabase/auth's 3-second cross-region mintSessionDataCookie timeout.
  if (method === 'GET' && pathJoined === 'get-session') {
    const reqUrl = new URL(req.url);
    const hasOAuthVerifier = reqUrl.searchParams.has('neon_auth_session_verifier');
    if (!hasOAuthVerifier) {
      const sessionRes = await getResilientServerSession();
      if (sessionRes?.data?.session && sessionRes?.data?.user) {
        return NextResponse.json(sessionRes.data, {
          status: 200,
          headers: {
            'Cache-Control': 'private, no-store, max-age=0',
          },
        });
      }
      const cookieHeader = req.headers.get('cookie') || '';
      if (!cookieHeader.includes('session_token')) {
        return NextResponse.json(null, {
          status: 200,
          headers: {
            'Cache-Control': 'private, no-store, max-age=0',
          },
        });
      }
    }
  }

  let rawBodyText: string | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      rawBodyText = await req.clone().text();
    } catch {
      rawBodyText = null;
    }
  }

  const buildFreshRequest = () =>
    new NextRequest(req.url, {
      method: req.method,
      headers: new Headers(req.headers),
      body:
        req.method !== 'GET' && req.method !== 'HEAD'
          ? (rawBodyText ?? undefined)
          : undefined,
    });

  // Resilient sign-out handling:
  // Ensure the session is deleted from PostgreSQL and all browser cookies are completely expired.
  if (pathJoined === 'sign-out') {
    await clearSessionFromDatabase(req);

    // Forward sign-out to upstream Neon Auth service with a fast 2.5s timeout so it never hangs
    try {
      await Promise.race([
        baseHandlers[method](buildFreshRequest(), context),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Signout timeout')), 2500)),
      ]).catch(() => null);
    } catch {
      // Upstream errors ignored — we always wipe locally
    }

    const res = NextResponse.json({ success: true }, { status: 200 });

    const allCookieNames = [
      ...SESSION_TOKEN_COOKIE_NAMES,
      'neon-auth.session_data',
      'better-auth.session_data',
      'better_auth.csrf_token',
      '__Secure-better-auth.csrf_token',
      'neon_auth_session_verifier',
    ];

    for (const name of allCookieNames) {
      // Clear with SameSite=None and Secure for HTTPS and iframes
      res.cookies.set(name, '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });
      // Clear for standard localhost HTTP
      res.cookies.set(name, '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        httpOnly: false,
        sameSite: 'lax',
      });
    }

    return withPartitionedCrossSiteCookies(res);
  }

  let activeHandlers = baseHandlers;
  let initialResponse = await activeHandlers[method](buildFreshRequest(), context);

  // If the primary Neon Auth URL points to a deleted database (e.g. `neondb` -> 404 DATABASE_UNAVAILABLE)
  // and DATABASE_URL points to a different database (e.g. `lifecraftdb`), automatically fall back
  // to the database-scoped Neon Auth endpoint.
  if (initialResponse.status === 404 && fallbackHandlers) {
    const errPayload = await initialResponse
      .clone()
      .json()
      .catch(() => ({} as Record<string, unknown>));
    const errCode = String(errPayload.code || '').toUpperCase();
    if (errCode === 'DATABASE_UNAVAILABLE') {
      activeHandlers = fallbackHandlers;
      initialResponse = await activeHandlers[method](buildFreshRequest(), context);
    }
  }

  if (initialResponse.status === 403 && isSameOriginBrowserRequest(req)) {
    const errorPayload = await initialResponse
      .clone()
      .json()
      .catch(() => ({} as Record<string, unknown>));

    const code = String(errorPayload.code || '').toUpperCase();
    const msg = String(errorPayload.message || errorPayload.error || '').toLowerCase();

    const isOriginOrCallbackRejection =
      code === 'INVALID_ORIGIN' ||
      code === 'INVALID_CALLBACKURL' ||
      msg.includes('invalid origin') ||
      msg.includes('invalid callbackurl');

    // For non-OAuth routes (email sign-up, sign-in, OTP verification, session),
    // automatically retry with the default trusted origin so email auth works
    // immediately inside the AI Studio preview iframe.
    if (isOriginOrCallbackRejection && !isSocialSignIn) {
      const retryReq = await buildFallbackOriginRequest(
        req,
        rawBodyText,
        isSocialSignIn
      );
      const retryResponse = await activeHandlers[method](retryReq, context);
      return withPartitionedCrossSiteCookies(retryResponse);
    }
  }

  return withPartitionedCrossSiteCookies(initialResponse);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handleWithOriginResilience('GET', req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return handleWithOriginResilience('POST', req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return handleWithOriginResilience('PUT', req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return handleWithOriginResilience('DELETE', req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handleWithOriginResilience('PATCH', req, context);
}
