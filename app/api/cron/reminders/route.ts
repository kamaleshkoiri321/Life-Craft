import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lte } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '@/lib/db';
import {
  calendarEventNotifications,
  calendarEvents,
  userPreferences,
} from '@/lib/db/schema';
import { resolveVerifiedClerkUser } from '@/lib/email/clerk-recipient';
import { sendEmail } from '@/lib/email/email-service';
import { buildReminderEmail } from '@/lib/email/templates/reminder-template';
import {
  detectMeetingPlatform,
  formatReminderLabel,
} from '@/lib/calendar/event-validation';
import {
  DEFAULT_TIMEZONE,
  formatLocalTime,
  getLocalDateString,
  resolveValidTimezone,
} from '@/lib/queries/timezone';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Up to 60 seconds on Vercel

/**
 * Validates the authorization header against the secret CRON_SECRET token.
 */
function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // If CRON_SECRET is not set in development, allow local requests
    return process.env.NODE_ENV === 'development';
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) {
    return true;
  }

  // Also check query param fallback for simple external cron pings
  const url = new URL(req.url);
  const queryKey = url.searchParams.get('key');
  return queryKey === secret;
}

export async function GET(req: NextRequest) {
  return handleCronJob(req);
}

export async function POST(req: NextRequest) {
  return handleCronJob(req);
}

async function handleCronJob(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing cron secret.' },
      { status: 401 }
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured.' },
      { status: 503 }
    );
  }

  const db = getDb();
  const now = new Date();

  // Find due pending reminders
  const dueNotifications = await db
    .select({
      notification: calendarEventNotifications,
      event: calendarEvents,
    })
    .from(calendarEventNotifications)
    .innerJoin(
      calendarEvents,
      eq(calendarEventNotifications.eventId, calendarEvents.id)
    )
    .where(
      and(
        eq(calendarEventNotifications.status, 'pending'),
        lte(calendarEventNotifications.scheduledFor, now)
      )
    )
    .limit(50);

  if (dueNotifications.length === 0) {
    return NextResponse.json({
      status: 'ok',
      message: 'No pending reminders due at this time.',
      processed: 0,
      timestamp: now.toISOString(),
    });
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const { notification, event } of dueNotifications) {
    // Atomically transition status to 'processing' to avoid duplicate deliveries under concurrent calls
    const [claimed] = await db
      .update(calendarEventNotifications)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarEventNotifications.id, notification.id),
          eq(calendarEventNotifications.status, 'pending')
        )
      )
      .returning();

    if (!claimed) {
      // Job was already claimed by another worker
      continue;
    }

    try {
      // 1. Check user notification preferences
      const [prefs] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, notification.userId))
        .limit(1);

      if (prefs && prefs.emailNotificationsEnabled === false) {
        await db
          .update(calendarEventNotifications)
          .set({
            status: 'skipped',
            errorMessage: 'User has disabled email notifications in preferences.',
            updatedAt: new Date(),
          })
          .where(eq(calendarEventNotifications.id, notification.id));
        skippedCount++;
        continue;
      }

      // 2. Resolve verified primary email dynamically from Clerk
      const clerkResolution = await resolveVerifiedClerkUser(notification.userId);

      if (!clerkResolution.ok || !clerkResolution.email) {
        await db
          .update(calendarEventNotifications)
          .set({
            status: 'skipped',
            errorMessage: `Skipped: User email is unverified or missing (${clerkResolution.reason || 'unknown'}).`,
            updatedAt: new Date(),
          })
          .where(eq(calendarEventNotifications.id, notification.id));
        skippedCount++;
        continue;
      }

      // 3. Format event details in user's timezone
      const tz = resolveValidTimezone(event.timezone || DEFAULT_TIMEZONE);
      const startAt = new Date(event.startAt);
      const endAt = new Date(event.endAt);
      const formattedDate = getLocalDateString(startAt, tz);
      const sTime = event.isAllDay ? 'All Day' : formatLocalTime(startAt, tz) || '';
      const eTime = event.isAllDay ? '' : formatLocalTime(endAt, tz) || '';
      const formattedTime = event.isAllDay ? 'All Day' : `${sTime} – ${eTime}`;

      const meetingDetails = event.meetingUrl
        ? detectMeetingPlatform(event.meetingUrl)
        : null;

      const reminderLabel = formatReminderLabel(notification.reminderMinutes);

      // 4. Build branded email template
      const emailContent = buildReminderEmail({
        recipientName: clerkResolution.name || 'there',
        eventTitle: event.title,
        category: event.category,
        color: event.color,
        formattedDate,
        formattedTime,
        timezone: tz,
        meetingUrl: event.meetingUrl,
        meetingLabel: meetingDetails?.label,
        description: event.description,
        notes: event.notes,
        reminderLabel,
        eventId: event.id,
      });

      // 5. Send through Gmail SMTP
      const sendResult = await sendEmail({
        to: clerkResolution.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (sendResult.ok) {
        await db
          .update(calendarEventNotifications)
          .set({
            status: 'sent',
            recipientEmail: sendResult.actualRecipient || clerkResolution.email,
            messageId: sendResult.messageId || null,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(calendarEventNotifications.id, notification.id));
        sentCount++;
      } else {
        const nextRetry = (notification.retryCount || 0) + 1;
        const newStatus = nextRetry >= 3 ? 'failed' : 'pending';

        await db
          .update(calendarEventNotifications)
          .set({
            status: newStatus,
            retryCount: nextRetry,
            errorMessage: sendResult.error || 'SMTP delivery failed.',
            updatedAt: new Date(),
          })
          .where(eq(calendarEventNotifications.id, notification.id));

        if (newStatus === 'failed') {
          failedCount++;
        }
      }
    } catch (err) {
      console.error(
        `[LifeCraft Cron] Error processing notification ${notification.id}:`,
        err
      );
      await db
        .update(calendarEventNotifications)
        .set({
          status: 'failed',
          errorMessage:
            err instanceof Error ? err.message : 'Unexpected processing failure',
          updatedAt: new Date(),
        })
        .where(eq(calendarEventNotifications.id, notification.id));
      failedCount++;
    }
  }

  return NextResponse.json({
    status: 'ok',
    processed: dueNotifications.length,
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount,
    timestamp: new Date().toISOString(),
  });
}

