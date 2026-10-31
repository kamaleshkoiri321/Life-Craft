import { clerkClient } from '@clerk/nextjs/server';

export interface ClerkRecipientResolution {
  ok: boolean;
  email?: string;
  name?: string;
  reason?: 'unverified_email' | 'missing_email' | 'user_not_found' | 'clerk_error';
  rawStatus?: string;
}

/**
 * Resolves a user's verified primary email address server-side from Clerk.
 * Guarantees recipient isolation and verifies email verification status.
 */
export async function resolveVerifiedClerkUser(
  userId: string
): Promise<ClerkRecipientResolution> {
  if (!userId || typeof userId !== 'string') {
    return { ok: false, reason: 'user_not_found' };
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId).catch(() => null);

    if (!user) {
      return { ok: false, reason: 'user_not_found' };
    }

    // Find primary email address
    const primaryId = user.primaryEmailAddressId;
    const primaryEmailObj =
      user.emailAddresses?.find((e) => e.id === primaryId) ??
      user.emailAddresses?.[0];

    if (!primaryEmailObj || !primaryEmailObj.emailAddress) {
      return { ok: false, reason: 'missing_email' };
    }

    const verificationStatus = primaryEmailObj.verification?.status;
    const isVerified = verificationStatus === 'verified';

    if (!isVerified) {
      return {
        ok: false,
        reason: 'unverified_email',
        rawStatus: verificationStatus ?? 'unknown',
      };
    }

    const name =
      user.fullName ||
      (user.firstName
        ? `${user.firstName} ${user.lastName || ''}`.trim()
        : null) ||
      user.username ||
      primaryEmailObj.emailAddress.split('@')[0] ||
      'LifeCraft Member';

    return {
      ok: true,
      email: primaryEmailObj.emailAddress.trim().toLowerCase(),
      name,
    };
  } catch (err) {
    console.error(
      `[LifeCraft Email] Failed to fetch Clerk user ${userId}:`,
      err
    );
    return { ok: false, reason: 'clerk_error' };
  }
}

