'use client';

import { createAuthClient } from '@neondatabase/auth/next';

/**
 * Client-side Neon Managed Better Auth instance for Next.js App Router.
 * Automatically proxies requests through `/api/auth/*`, manages session caching,
 * cross-tab BroadcastChannel sync, and popup-based OAuth when running inside an iframe.
 */
export const authClient = createAuthClient();
