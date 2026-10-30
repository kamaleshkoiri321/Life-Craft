import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '@/lib/db';
import { userPreferences, userProfiles } from '@/lib/db/schema';
import { DEFAULT_TIMEZONE } from '@/lib/queries/timezone';

export const dynamic = 'force-dynamic';

interface ClerkWebhookEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserData {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email_addresses?: ClerkWebhookEmailAddress[];
  image_url?: string | null;
  deleted?: boolean;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData;
}

export async function POST(req: NextRequest) {
  let evt: ClerkWebhookEvent;

  try {
    // verifyWebhook automatically verifies Svix signature headers using CLERK_WEBHOOK_SIGNING_SECRET
    evt = (await verifyWebhook(req)) as ClerkWebhookEvent;
  } catch (err) {
    console.error('[LifeCraft Clerk Webhook] Verification failed:', err instanceof Error ? err.message : err);
    return new NextResponse('Webhook verification failed', { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    // Acknowledge receipt if database is temporarily unavailable so Svix does not spam retries
    return new NextResponse('Database unavailable; skipped processing', { status: 200 });
  }

  try {
    const db = getDb();
    const eventType = evt.type;
    const { id, first_name, last_name, username, email_addresses } = evt.data;

    const email = email_addresses?.[0]?.email_address;
    const nameCandidate = `${first_name ?? ''} ${last_name ?? ''}`.trim();
    const displayName = nameCandidate || username || (email ? email.split('@')[0] : 'LifeCraft Member');

    if (eventType === 'user.created') {
      // Idempotently create user profile and preferences
      await db
        .insert(userProfiles)
        .values({
          userId: id,
          displayName,
          timezone: DEFAULT_TIMEZONE,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            displayName,
            updatedAt: new Date(),
          },
        });

      await db
        .insert(userPreferences)
        .values({
          userId: id,
          theme: 'light',
          weekStartsOn: 1,
        })
        .onConflictDoNothing();
    } else if (eventType === 'user.updated') {
      // Update display name if user modified profile in Clerk
      await db
        .update(userProfiles)
        .set({
          displayName,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, id));
    } else if (eventType === 'user.deleted') {
      // Cascades and deletes all user-owned records (tasks, habits, goals, notes, library, focus)
      await db.delete(userProfiles).where(eq(userProfiles.userId, id));
    }

    return new NextResponse('Webhook processed successfully', { status: 200 });
  } catch (err) {
    console.error('[LifeCraft Clerk Webhook] Error processing event:', err);
    // Return 500 so Svix can retry if an unexpected DB error occurred
    return new NextResponse('Internal error processing webhook', { status: 500 });
  }
}

