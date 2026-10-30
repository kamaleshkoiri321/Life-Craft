import { createNeonAuth } from '@neondatabase/auth/next/server';
import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import {
  getDatabaseScopedNeonAuthBaseUrl,
  getNeonAuthBaseUrl,
  getNeonAuthCookieSecret,
} from './config';
import { getDb, isDatabaseConfigured } from '../db';

/**
 * Unified server-side Neon Managed Better Auth instance for Next.js App Router.
 * Handles API proxying, server session validation, and cookie signing.
 *
 * Uses SameSite='none' (with Secure=true enforced by @neondatabase/auth)
 * so session cookies persist across refreshes both in standard browser tabs
 * and inside the cross-origin AI Studio preview iframe.
 *
 * Sets logLevel='silent' so transient 3s cross-region timeouts inside
 * @neondatabase/auth's optional `mintSessionDataCookie` cache step do not
 * emit console.error and trigger the Next.js error overlay.
 */
export const auth = createNeonAuth({
  baseUrl: getNeonAuthBaseUrl(),
  logLevel: 'silent',
  cookies: {
    secret: getNeonAuthCookieSecret(),
    sessionDataTtl: 3600,
    sameSite: 'none',
  },
});

const scopedBaseUrl = getDatabaseScopedNeonAuthBaseUrl();

export const fallbackDatabaseAuth = scopedBaseUrl
  ? createNeonAuth({
      baseUrl: scopedBaseUrl,
      logLevel: 'silent',
      cookies: {
        secret: getNeonAuthCookieSecret(),
        sessionDataTtl: 3600,
        sameSite: 'none',
      },
    })
  : null;

export const SESSION_TOKEN_COOKIE_NAMES = [
  '__Secure-neon-auth.session_token',
  'neon-auth.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_token',
];

export async function clearSessionFromDatabase(
  tokenOrReq?: unknown
): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  try {
    const tokensToDelete = new Set<string>();

    if (typeof tokenOrReq === 'string' && tokenOrReq.trim()) {
      tokensToDelete.add(tokenOrReq.split('.')[0].trim());
    } else if (tokenOrReq && typeof tokenOrReq === 'object') {
      const obj = tokenOrReq as {
        cookies?: { get: (name: string) => { value?: string } | undefined };
        headers?: { get: (name: string) => string | null };
      };
      if (obj.cookies && typeof obj.cookies.get === 'function') {
        for (const name of SESSION_TOKEN_COOKIE_NAMES) {
          const val = obj.cookies.get(name)?.value;
          if (val) {
            tokensToDelete.add(decodeURIComponent(val).split('.')[0].trim());
          }
        }
      }
      if (obj.headers && typeof obj.headers.get === 'function') {
        const cookieHeader = obj.headers.get('cookie') || '';
        for (const name of SESSION_TOKEN_COOKIE_NAMES) {
          const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
          if (match && match[1]) {
            tokensToDelete.add(decodeURIComponent(match[1]).split('.')[0].trim());
          }
        }
      }
    }

    try {
      const cookieStore = await cookies();
      for (const name of SESSION_TOKEN_COOKIE_NAMES) {
        const found = cookieStore.get(name)?.value;
        if (found) {
          tokensToDelete.add(decodeURIComponent(found).split('.')[0].trim());
        }
      }
    } catch {
      // ignore
    }

    if (tokensToDelete.size === 0) {
      return;
    }

    const db = getDb();
    for (const t of tokensToDelete) {
      if (t.length >= 16 && t.length <= 128) {
        await db.execute(sql`
          DELETE FROM neon_auth.session WHERE token = ${t}
        `);
      }
    }
  } catch {
    // Silently continue if database deletion fails
  }
}

async function verifySessionFromDatabaseToken() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  try {
    const cookieStore = await cookies();
    let rawCookieVal: string | undefined;

    for (const name of SESSION_TOKEN_COOKIE_NAMES) {
      const found = cookieStore.get(name)?.value;
      if (found) {
        rawCookieVal = found;
        break;
      }
    }

    if (!rawCookieVal) {
      return null;
    }

    const decoded = decodeURIComponent(rawCookieVal).trim();
    const tokenPart = decoded.split('.')[0]?.trim();
    if (!tokenPart || tokenPart.length < 16 || tokenPart.length > 128) {
      return null;
    }

    const db = getDb();
    const res = await db.execute<{
      sessionId: string;
      sessionToken: string;
      sessionUserId: string;
      sessionExpiresAt: Date | string;
      sessionCreatedAt: Date | string;
      sessionUpdatedAt: Date | string;
      sessionIpAddress: string | null;
      sessionUserAgent: string | null;
      userId: string;
      userName: string | null;
      userEmail: string;
      userEmailVerified: boolean;
      userImage: string | null;
      userCreatedAt: Date | string;
      userUpdatedAt: Date | string;
      userBanned: boolean | null;
    }>(sql`
      SELECT
        s.id AS "sessionId",
        s.token AS "sessionToken",
        s."userId"::text AS "sessionUserId",
        s."expiresAt" AS "sessionExpiresAt",
        s."createdAt" AS "sessionCreatedAt",
        s."updatedAt" AS "sessionUpdatedAt",
        s."ipAddress" AS "sessionIpAddress",
        s."userAgent" AS "sessionUserAgent",
        u.id::text AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        COALESCE(u."emailVerified", false) AS "userEmailVerified",
        u.image AS "userImage",
        u."createdAt" AS "userCreatedAt",
        u."updatedAt" AS "userUpdatedAt",
        u.banned AS "userBanned"
      FROM neon_auth.session s
      INNER JOIN neon_auth."user" u ON u.id = s."userId"
      WHERE s.token = ${tokenPart}
        AND s."expiresAt" > now()
      LIMIT 1
    `);

    const row = res.rows[0];
    if (!row || row.userBanned) {
      return null;
    }

    return {
      data: {
        session: {
          id: row.sessionId,
          token: row.sessionToken,
          userId: row.sessionUserId,
          expiresAt: new Date(row.sessionExpiresAt),
          createdAt: new Date(row.sessionCreatedAt),
          updatedAt: new Date(row.sessionUpdatedAt),
          ipAddress: row.sessionIpAddress,
          userAgent: row.sessionUserAgent,
        },
        user: {
          id: row.userId,
          name: row.userName ?? '',
          email: row.userEmail,
          emailVerified: Boolean(row.userEmailVerified),
          image: row.userImage ?? null,
          createdAt: new Date(row.userCreatedAt),
          updatedAt: new Date(row.userUpdatedAt),
        },
      },
      error: null,
    };
  } catch {
    return null;
  }
}

export async function getResilientServerSession() {
  try {
    const { userId, sessionId } = await clerkAuth();
    if (userId) {
      const clerkUser = await clerkCurrentUser().catch(() => null);
      const email =
        clerkUser?.primaryEmailAddress?.emailAddress || `${userId}@clerk.local`;
      const name =
        clerkUser?.fullName ||
        clerkUser?.firstName ||
        clerkUser?.username ||
        email.split('@')[0];
      const isVerified = Boolean(
        clerkUser?.primaryEmailAddress?.verification?.status === 'verified'
      );
      return {
        data: {
          user: {
            id: userId,
            name,
            email,
            emailVerified: isVerified,
            image: clerkUser?.imageUrl ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          session: {
            id: sessionId || userId,
            token: sessionId || userId,
            userId,
            expiresAt: new Date(Date.now() + 86400000),
            createdAt: new Date(),
            updatedAt: new Date(),
            ipAddress: null,
            userAgent: null,
          },
        },
        error: null,
      };
    }
  } catch {
    // If Clerk auth is unavailable in the current context, fall through to DB verification
  }

  // Fast-path: check active session token directly against neon_auth.session in PostgreSQL first
  // so server components and API routes do not block or fail on cross-region HTTP calls to Neon Auth.
  const dbSession = await verifySessionFromDatabaseToken();
  if (dbSession?.data?.user && dbSession?.data?.session) {
    return dbSession;
  }

  try {
    const primaryResult = await auth.getSession();
    if (primaryResult?.data?.user && primaryResult?.data?.session) {
      return primaryResult;
    }
  } catch {
    // Fall through to database-scoped auth instance
  }

  if (fallbackDatabaseAuth) {
    try {
      return await fallbackDatabaseAuth.getSession();
    } catch {
      return null;
    }
  }

  return null;
}



