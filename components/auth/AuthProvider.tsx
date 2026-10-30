'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useClerk,
} from '@clerk/nextjs';
import type { FriendlyAuthError } from '@/lib/auth/validation';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date | string;
}

export interface SignInResult {
  success: boolean;
  error?: FriendlyAuthError;
}

export interface SignUpResult {
  success: boolean;
  requiresEmailVerification?: boolean;
  hasActiveSession?: boolean;
  error?: FriendlyAuthError;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshSession: () => Promise<void>;
  signInWithEmail: (params: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => Promise<SignInResult>;
  signUpWithEmail: (params: {
    name: string;
    email: string;
    password: string;
  }) => Promise<SignUpResult>;
  signInWithGoogle: (redirectTo?: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const clerkAuth = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const clerk = useClerk();

  const user: AuthUser | null = useMemo(() => {
    if (!clerkAuth.isSignedIn || !clerkUser) return null;
    return {
      id: clerkUser.id,
      name:
        clerkUser.fullName ||
        clerkUser.firstName ||
        clerkUser.username ||
        clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0] ||
        'LifeCraft Member',
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      emailVerified: Boolean(
        clerkUser.primaryEmailAddress?.verification?.status === 'verified'
      ),
      image: clerkUser.imageUrl ?? null,
    };
  }, [clerkAuth.isSignedIn, clerkUser]);

  const session: AuthSession | null = useMemo(() => {
    if (!clerkAuth.isSignedIn || !clerkAuth.sessionId) return null;
    return {
      id: clerkAuth.sessionId,
      userId: clerkAuth.userId || clerkUser?.id || '',
      expiresAt: new Date(Date.now() + 86400000),
    };
  }, [clerkAuth.isSignedIn, clerkAuth.sessionId, clerkAuth.userId, clerkUser?.id]);

  const signOut = useCallback(async () => {
    try {
      await clerk.signOut({ redirectUrl: '/sign-in' });
    } catch {
      router.push('/sign-in');
    }
  }, [clerk, router]);

  const refreshSession = useCallback(async () => {
    router.refresh();
  }, [router]);

  const signInWithEmail = useCallback(
    async (): Promise<SignInResult> => {
      router.push('/sign-in');
      return { success: true };
    },
    [router]
  );

  const signUpWithEmail = useCallback(
    async (): Promise<SignUpResult> => {
      router.push('/sign-up');
      return { success: true };
    },
    [router]
  );

  const signInWithGoogle = useCallback(
    async (redirectTo?: string): Promise<SignInResult> => {
      const path = redirectTo
        ? `/sign-in?redirect_url=${encodeURIComponent(redirectTo)}`
        : '/sign-in';
      router.push(path);
      return { success: true };
    },
    [router]
  );

  const isAuthenticated = Boolean(clerkAuth.isSignedIn && clerkUser);
  const isLoading = !clerkAuth.isLoaded;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated,
      refreshSession,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [
      user,
      session,
      isLoading,
      isAuthenticated,
      refreshSession,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
