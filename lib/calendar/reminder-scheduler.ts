import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  calendarEventNotifications,
  type CalendarEventNotificationRow,
  type CalendarEventReminder,
  type CalendarEventRow,
} from '../db/schema';

/**
 * Builds a deterministic idempotency key for an event reminder notification.
 */
export function buildNotificationIdempotencyKey(
  eventId: string,
  minutesBefore: number,
  scheduledFor: Date
): string {
  return `${eventId}:${minutesBefore}:${scheduledFor.toISOString()}`;
}

/**
 * Synchronizes pending notification rows for an event based on its start time and configured reminders.
 * Inserts new pending reminders and cancels obsolete ones (e.g. if event was rescheduled or reminders modified).
 */
export async function syncEventNotifications(
  event: CalendarEventRow
): Promise<void> {
  const db = getDb();
  const reminders = (event.reminders as CalendarEventReminder[]) || [];
  const eventStartMs = new Date(event.startAt).getTime();
  const nowMs = Date.now();

  const validKeys: string[] = [];

  for (const rem of reminders) {
    // Only schedule email reminders if channel is email or not specified
    if (rem.channel && rem.channel !== 'email') {
      continue;
    }

    const minutesBefore = Math.max(0, rem.minutesBefore ?? 0);
    const scheduledMs = eventStartMs - minutesBefore * 60 * 1000;
    const scheduledFor = new Date(scheduledMs);

    // If the reminder trigger time is already more than 10 minutes in the past, skip scheduling
    if (scheduledMs < nowMs - 10 * 60 * 1000) {
      continue;
    }

    const idempotencyKey = buildNotificationIdempotencyKey(
      event.id,
      minutesBefore,
      scheduledFor
    );
    validKeys.push(idempotencyKey);

    // Insert pending notification if it does not already exist
    await db
      .insert(calendarEventNotifications)
      .values({
        userId: event.userId,
        eventId: event.id,
        reminderMinutes: minutesBefore,
        channel: 'email',
        scheduledFor,
        status: 'pending',
        idempotencyKey,
      })
      .onConflictDoNothing({
        target: calendarEventNotifications.idempotencyKey,
      });
  }

  // Cancel any pending notifications for this event that are no longer in the validKeys list
  if (validKeys.length > 0) {
    await db
      .update(calendarEventNotifications)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarEventNotifications.eventId, event.id),
          eq(calendarEventNotifications.status, 'pending'),
          notInArray(calendarEventNotifications.idempotencyKey, validKeys)
        )
      );
  } else {
    // If no email reminders remain, cancel all pending notifications for this event
    await db
      .update(calendarEventNotifications)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarEventNotifications.eventId, event.id),
          eq(calendarEventNotifications.status, 'pending')
        )
      );
  }
}

/**
 * Cancels all pending notifications for an event (e.g. when the event is deleted).
 */
export async function cancelEventNotifications(eventId: string): Promise<void> {
  const db = getDb();
  await db
    .update(calendarEventNotifications)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(calendarEventNotifications.eventId, eventId),
        eq(calendarEventNotifications.status, 'pending')
      )
    );
}

