'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useClerk,
} from '@clerk/nextjs';
import { authClient } from '@/lib/auth/client';
import {
  OAUTH_BROADCAST_CHANNEL,
  OAUTH_STORAGE_KEY,
} from '@/lib/auth/config';
import {
  formatAuthError,
  sanitizeRedirectPath,
  type FriendlyAuthError,
} from '@/lib/auth/validation';

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

interface OAuthPopupCompletionPayload {
  type?: string;
  verifier?: string | null;
  error?: string | null;
  originalCallback?: string;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const clerkAuth = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const clerk = useClerk();
  const sessionState = authClient.useSession();

  const [isExplicitlySignedOut, setIsExplicitlySignedOut] = useState(false);

  const user: AuthUser | null = useMemo(() => {
    if (isExplicitlySignedOut) return null;
    if (clerkAuth.isSignedIn && clerkUser) {
      return {
        id: clerkUser.id,
        name:
          clerkUser.fullName ||
          clerkUser.firstName ||
          clerkUser.username ||
          '',
        email: clerkUser.primaryEmailAddress?.emailAddress || '',
        emailVerified: Boolean(
          clerkUser.primaryEmailAddress?.verification?.status === 'verified'
        ),
        image: clerkUser.imageUrl ?? null,
      };
    }
    const rawUser = sessionState.data?.user;
    if (!rawUser) return null;
    return {
      id: rawUser.id,
      name: rawUser.name || '',
      email: rawUser.email || '',
      emailVerified: Boolean(rawUser.emailVerified),
      image: rawUser.image ?? null,
    };
  }, [
    isExplicitlySignedOut,
    clerkAuth.isSignedIn,
    clerkUser,
    sessionState.data?.user,
  ]);

  const session: AuthSession | null = useMemo(() => {
    if (isExplicitlySignedOut) return null;
    if (clerkAuth.isSignedIn && clerkAuth.sessionId) {
      return {
        id: clerkAuth.sessionId,
        userId: clerkAuth.userId || '',
        expiresAt: new Date(Date.now() + 86400000),
      };
    }
    const rawSession = sessionState.data?.session;
    if (!rawSession) return null;
    return {
      id: rawSession.id,
      userId: rawSession.userId,
      expiresAt: rawSession.expiresAt,
    };
  }, [
    isExplicitlySignedOut,
    clerkAuth.isSignedIn,
    clerkAuth.sessionId,
    clerkAuth.userId,
    sessionState.data?.session,
  ]);

  const refreshSession = useCallback(async () => {
    if (isExplicitlySignedOut) return;
    try {
      await sessionState.refetch();
      router.refresh();
    } catch {
      // Handled gracefully by session state
    }
  }, [isExplicitlySignedOut, router, sessionState]);

  const signInWithEmail = useCallback(
    async ({
      email,
      password,
      rememberMe = true,
    }: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }): Promise<SignInResult> => {
      try {
        setIsExplicitlySignedOut(false);
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          rememberMe,
        });

        if (result.error) {
          return {
            success: false,
            error: formatAuthError(result.error),
          };
        }

        await sessionState.refetch();
        router.refresh();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: formatAuthError(err),
        };
      }
    },
    [router, sessionState]
  );

  const signUpWithEmail = useCallback(
    async ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }): Promise<SignUpResult> => {
      try {
        setIsExplicitlySignedOut(false);
        const trimmedEmail = email.trim();
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: trimmedEmail,
          password,
        });

        if (result.error) {
          return {
            success: false,
            error: formatAuthError(result.error),
          };
        }

        const createdUser = result.data?.user;
        const hasToken = Boolean(result.data?.token);
        const isVerified = Boolean(createdUser?.emailVerified);

        if (hasToken) {
          await sessionState.refetch();
          router.refresh();
        }

        return {
          success: true,
          requiresEmailVerification: !isVerified,
          hasActiveSession: hasToken,
        };
      } catch (err) {
        return {
          success: false,
          error: formatAuthError(err),
        };
      }
    },
    [router, sessionState]
  );

  const signInWithGoogle = useCallback(
    async (redirectTo = '/app'): Promise<SignInResult> => {
      try {
        setIsExplicitlySignedOut(false);
        const safeDestination = sanitizeRedirectPath(redirectTo, '/app');
        if (typeof window === 'undefined') {
          return { success: false };
        }

        // Open the popup synchronously on user click to prevent popup blockers,
        // and communicate completion via BroadcastChannel + storage + postMessage
        // so Google's Cross-Origin-Opener-Policy header does not break completion.
        const popup = window.open(
          'about:blank',
          'neon_oauth_popup',
          'width=520,height=700,popup=yes'
        );

        if (!popup) {
          return {
            success: false,
            error: formatAuthError(
              new Error('Popup blocked. Please allow popups for this site.')
            ),
          };
        }

        const popupId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        const popupCallbackUrl = new URL('/auth/callback', window.location.origin);
        popupCallbackUrl.searchParams.set('neon_popup', '1');
        popupCallbackUrl.searchParams.set('popup_id', popupId);
        popupCallbackUrl.searchParams.set('neon_popup_callback', safeDestination);

        const initRes = await fetch('/api/auth/sign-in/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            provider: 'google',
            callbackURL: popupCallbackUrl.toString(),
            disableRedirect: true,
            prompt: 'select_account',
          }),
        });

        const initData = (await initRes.json().catch(() => ({}))) as {
          url?: string;
          code?: string;
          message?: string;
          error?: string;
        };

        if (!initRes.ok || !initData.url) {
          try {
            popup.close();
          } catch {
            // ignore
          }
          return {
            success: false,
            error: formatAuthError({
              status: initRes.status,
              code: initData.code || 'INVALID_CALLBACKURL',
              message:
                initData.message ||
                initData.error ||
                'Failed to get OAuth URL',
            }),
          };
        }

        let oauthUrl = initData.url;
        try {
          const parsed = new URL(oauthUrl);
          // Force Google to prompt the account chooser dialog ("Choose an account")
          // so the user can select or switch their Gmail account rather than auto-signing in.
          parsed.searchParams.set('prompt', 'select_account');
          oauthUrl = parsed.toString();
        } catch {
          // If URL parsing fails, fallback to original URL
        }

        popup.location.href = oauthUrl;

        const completion = await new Promise<OAuthPopupCompletionPayload>(
          (resolve, reject) => {
            let settled = false;
            let bc: BroadcastChannel | null = null;

            const cleanup = () => {
              settled = true;
              clearTimeout(timeoutId);
              clearInterval(pollIntervalId);
              window.removeEventListener('message', onWindowMessage);
              window.removeEventListener('storage', onStorageEvent);
              if (bc) {
                try {
                  bc.close();
                } catch {
                  // ignore
                }
              }
            };

            const handlePayload = (payload: OAuthPopupCompletionPayload) => {
              if (settled) return;
              if (!payload || payload.type !== 'neon-auth:oauth-complete') {
                return;
              }
              cleanup();
              try {
                popup.close();
              } catch {
                // ignore
              }
              resolve(payload);
            };

            const onWindowMessage = (event: MessageEvent) => {
              if (event.origin !== window.location.origin) return;
              handlePayload(event.data as OAuthPopupCompletionPayload);
            };

            const onStorageEvent = (event: StorageEvent) => {
              if (event.key !== OAUTH_STORAGE_KEY || !event.newValue) return;
              try {
                const parsed = JSON.parse(
                  event.newValue
                ) as OAuthPopupCompletionPayload;
                handlePayload(parsed);
              } catch {
                // ignore malformed storage item
              }
            };

            try {
              bc = new BroadcastChannel(OAUTH_BROADCAST_CHANNEL);
              bc.onmessage = (event: MessageEvent) => {
                handlePayload(event.data as OAuthPopupCompletionPayload);
              };
            } catch {
              bc = null;
            }

            window.addEventListener('message', onWindowMessage);
            window.addEventListener('storage', onStorageEvent);

            const pollIntervalId = setInterval(async () => {
              if (settled) return;
              try {
                const res = await fetch(
                  `/api/auth/popup-bridge?popup_id=${encodeURIComponent(popupId)}`,
                  { cache: 'no-store' }
                );
                if (!res.ok) return;
                const data = (await res.json()) as {
                  ready?: boolean;
                  payload?: OAuthPopupCompletionPayload;
                };
                if (data.ready && data.payload) {
                  handlePayload(data.payload);
                }
              } catch {
                // ignore transient network errors during polling
              }
            }, 700);

            const timeoutId = setTimeout(() => {
              if (settled) return;
              cleanup();
              reject(new Error('OAuth popup timed out. Please try again.'));
            }, 120_000);
          }
        );

        if (completion.error) {
          return {
            success: false,
            error: formatAuthError({
              code: 'OAUTH_CALLBACK_FAILED',
              message: completion.error,
            }),
          };
        }

        if (!completion.verifier) {
          return {
            success: false,
            error: formatAuthError({
              code: 'OAUTH_CALLBACK_FAILED',
              message: 'OAuth completed but no session verifier was received.',
            }),
          };
        }

        // Exchange the verifier token with our Next.js Neon Auth proxy so the
        // session cookie is minted in this iframe context, then navigate.
        await fetch(
          `/api/auth/get-session?neon_auth_session_verifier=${encodeURIComponent(
            completion.verifier
          )}`,
          { credentials: 'include' }
        );

        await sessionState.refetch();
        const target = sanitizeRedirectPath(
          completion.originalCallback || safeDestination,
          '/app'
        );
        router.push(target);
        router.refresh();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: formatAuthError(err),
        };
      }
    },
    [router, sessionState]
  );

  const signOut = useCallback(async () => {
    setIsExplicitlySignedOut(true);
    try {
      if (clerkAuth.isSignedIn) {
        await clerk.signOut().catch(() => null);
      }
      await authClient.signOut().catch(() => null);
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      }).catch(() => null);
    } catch (err) {
      console.warn('[LifeCraft Auth] Remote sign-out failed, continuing with local cleanup:', err);
    } finally {
      if (typeof window !== 'undefined') {
        window.location.href = '/sign-in';
      } else {
        router.push('/sign-in');
      }
    }
  }, [clerk, clerkAuth.isSignedIn, router]);

  const isAuthenticated =
    !isExplicitlySignedOut &&
    Boolean((clerkAuth.isSignedIn && clerkUser) || (user && session));
  const isLoading = !clerkAuth.isLoaded || Boolean(sessionState?.isPending);

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
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
