import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server';

export interface ServerSessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerSessionData {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ServerSessionResult {
  data: {
    user: ServerSessionUser;
    session: ServerSessionData;
  } | null;
  error: null;
}

/**
 * Server-only session helper utilizing Clerk's verified server-side session.
 * Used across App Router server components and API route handlers.
 */
export async function getResilientServerSession(): Promise<ServerSessionResult> {
  try {
    const { userId, sessionId } = await clerkAuth();
    if (!userId) {
      return { data: null, error: null };
    }

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
  } catch (err) {
    console.error('[LifeCraft Auth] Clerk server session resolution error:', err);
    return { data: null, error: null };
  }
}
