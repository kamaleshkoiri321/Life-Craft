import { and, desc, eq, gt, gte, ilike, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../db';
import {
  calendarEventAttachments,
  calendarEvents,
  type CalendarEventAttachmentRow,
  type CalendarEventRow,
} from '../db/schema';
import type { AuthSessionUser } from './dashboard';
import {
  expandRecurringInstances,
  serializeCalendarEventRow,
  validateCalendarEventInput,
  type SerializedCalendarEvent,
  type SerializedEventAttachment,
} from '../calendar/event-validation';
import {
  deleteEventAttachmentFile,
  getEventAttachmentFile,
  MAX_EVENT_ATTACHMENT_BYTES,
  saveEventAttachmentFile,
} from '../storage/event-attachments';
import { resolveValidTimezone } from './timezone';
import {
  cancelEventNotifications,
  syncEventNotifications,
} from '../calendar/reminder-scheduler';

export interface CalendarEventListFilters {
  startUtc?: Date;
  endUtc?: Date;
  category?: string;
  search?: string;
  timezone?: string;
}

export async function listCalendarEventsForUser(
  authUser: AuthSessionUser,
  filters: CalendarEventListFilters = {}
): Promise<{
  status: 'ok' | 'unconfigured' | 'error';
  events: SerializedCalendarEvent[];
  message?: string;
}> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      events: [],
      message: 'Database storage is not configured.',
    };
  }

  try {
    const db = getDb();
    const tz = resolveValidTimezone(filters.timezone);

    const conditions = [eq(calendarEvents.userId, authUser.id)];

    // Fetch base events that overlap range OR are recurring
    if (filters.startUtc && filters.endUtc) {
      conditions.push(
        or(
          and(
            lt(calendarEvents.startAt, filters.endUtc),
            gt(calendarEvents.endAt, filters.startUtc)
          ),
          isNotNull(calendarEvents.recurrenceRule)
        )!
      );
    }

    if (filters.category && filters.category !== 'All') {
      conditions.push(eq(calendarEvents.category, filters.category));
    }

    let rows: CalendarEventRow[] = [];
    try {
      rows = await db
        .select()
        .from(calendarEvents)
        .where(and(...conditions))
        .orderBy(calendarEvents.startAt)
        .limit(300);
    } catch {
      // Table may not yet be migrated
      return { status: 'ok', events: [] };
    }

    if (rows.length === 0) {
      return { status: 'ok', events: [] };
    }

    // Fetch attachments for all matched events
    const eventIds = rows.map((r) => r.id);
    let attachmentRows: CalendarEventAttachmentRow[] = [];
    try {
      attachmentRows = await db
        .select()
        .from(calendarEventAttachments)
        .where(
          and(
            eq(calendarEventAttachments.userId, authUser.id),
            inArray(calendarEventAttachments.eventId, eventIds)
          )
        );
    } catch {
      // Attachments table may not be migrated yet
    }

    const attachmentsByEvent = new Map<string, CalendarEventAttachmentRow[]>();
    for (const att of attachmentRows) {
      const list = attachmentsByEvent.get(att.eventId) ?? [];
      list.push(att);
      attachmentsByEvent.set(att.eventId, list);
    }

    // Serialize and expand recurring events
    const allExpanded: SerializedCalendarEvent[] = [];
    const searchLower = filters.search?.trim().toLowerCase();

    const rangeStart = filters.startUtc || new Date(Date.now() - 30 * 86400000);
    const rangeEnd = filters.endUtc || new Date(Date.now() + 60 * 86400000);

    for (const row of rows) {
      const serialized = serializeCalendarEventRow(row, {
        timezone: tz,
        attachments: attachmentsByEvent.get(row.id) ?? [],
      });

      const instances = expandRecurringInstances(serialized, rangeStart, rangeEnd);
      for (const inst of instances) {
        if (searchLower) {
          const matchTitle = inst.title.toLowerCase().includes(searchLower);
          const matchDesc = inst.description?.toLowerCase().includes(searchLower);
          const matchNotes = inst.notes?.toLowerCase().includes(searchLower);
          if (!matchTitle && !matchDesc && !matchNotes) continue;
        }
        allExpanded.push(inst);
      }
    }

    allExpanded.sort(
      (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime()
    );

    return { status: 'ok', events: allExpanded };
  } catch (err) {
    console.error('[LifeCraft Events] Failed to list calendar events:', err);
    return {
      status: 'error',
      events: [],
      message: 'Failed to load calendar events.',
    };
  }
}

export async function getCalendarEventById(
  authUser: AuthSessionUser,
  eventId: string
): Promise<{
  status: 'ok' | 'not_found' | 'error';
  event?: SerializedCalendarEvent;
  message?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Database not configured.' };
  }

  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, eventId),
          eq(calendarEvents.userId, authUser.id)
        )
      )
      .limit(1);

    if (!row) {
      return { status: 'not_found', message: 'Event not found.' };
    }

    const attachments = await db
      .select()
      .from(calendarEventAttachments)
      .where(
        and(
          eq(calendarEventAttachments.eventId, eventId),
          eq(calendarEventAttachments.userId, authUser.id)
        )
      );

    const serialized = serializeCalendarEventRow(row, {
      timezone: row.timezone,
      attachments,
    });

    return { status: 'ok', event: serialized };
  } catch (err) {
    console.error('[LifeCraft Events] Failed to get event details:', err);
    return { status: 'error', message: 'Failed to fetch event.' };
  }
}

export async function createCalendarEvent(
  authUser: AuthSessionUser,
  input: unknown
): Promise<{
  status: 'ok' | 'validation_error' | 'error';
  event?: SerializedCalendarEvent;
  errors?: Record<string, string>;
  message?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Database not configured.' };
  }

  const validation = validateCalendarEventInput(input);
  if (!validation.ok || !validation.cleaned) {
    return {
      status: 'validation_error',
      errors: validation.errors,
      message: 'Please check the event input fields.',
    };
  }

  try {
    const db = getDb();
    const data = validation.cleaned;

    const [inserted] = await db
      .insert(calendarEvents)
      .values({
        userId: authUser.id,
        title: data.title,
        description: data.description,
        notes: data.notes,
        category: data.category,
        color: data.color,
        startAt: data.startAt,
        endAt: data.endAt,
        isAllDay: data.isAllDay,
        timezone: data.timezone,
        meetingUrl: data.meetingUrl,
        recurrenceRule: data.recurrenceRule,
        reminders: data.reminders,
      })
      .returning();

    // Synchronize pending notification schedule
    await syncEventNotifications(inserted).catch((err) =>
      console.error('[LifeCraft Notifications] sync error on create:', err)
    );

    const serialized = serializeCalendarEventRow(inserted, {
      timezone: data.timezone,
      attachments: [],
    });

    return { status: 'ok', event: serialized };
  } catch (err) {
    console.error('[LifeCraft Events] Failed to create event:', err);
    return { status: 'error', message: 'Could not create event.' };
  }
}

export async function updateCalendarEvent(
  authUser: AuthSessionUser,
  eventId: string,
  input: unknown
): Promise<{
  status: 'ok' | 'not_found' | 'validation_error' | 'error';
  event?: SerializedCalendarEvent;
  errors?: Record<string, string>;
  message?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Database not configured.' };
  }

  const validation = validateCalendarEventInput(input);
  if (!validation.ok || !validation.cleaned) {
    return {
      status: 'validation_error',
      errors: validation.errors,
      message: 'Please check the event input fields.',
    };
  }

  try {
    const db = getDb();
    const data = validation.cleaned;

    const [updated] = await db
      .update(calendarEvents)
      .set({
        title: data.title,
        description: data.description,
        notes: data.notes,
        category: data.category,
        color: data.color,
        startAt: data.startAt,
        endAt: data.endAt,
        isAllDay: data.isAllDay,
        timezone: data.timezone,
        meetingUrl: data.meetingUrl,
        recurrenceRule: data.recurrenceRule,
        reminders: data.reminders,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarEvents.id, eventId),
          eq(calendarEvents.userId, authUser.id)
        )
      )
      .returning();

    if (!updated) {
      return { status: 'not_found', message: 'Event not found.' };
    }

    // Reschedule notifications based on updated start time and reminders
    await syncEventNotifications(updated).catch((err) =>
      console.error('[LifeCraft Notifications] sync error on update:', err)
    );

    const attachments = await db
      .select()
      .from(calendarEventAttachments)
      .where(
        and(
          eq(calendarEventAttachments.eventId, eventId),
          eq(calendarEventAttachments.userId, authUser.id)
        )
      );

    const serialized = serializeCalendarEventRow(updated, {
      timezone: data.timezone,
      attachments,
    });

    return { status: 'ok', event: serialized };
  } catch (err) {
    console.error('[LifeCraft Events] Failed to update event:', err);
    return { status: 'error', message: 'Could not update event.' };
  }
}

export async function deleteCalendarEvent(
  authUser: AuthSessionUser,
  eventId: string
): Promise<{
  status: 'ok' | 'not_found' | 'error';
  deletedEventId?: string;
  message?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Database not configured.' };
  }

  try {
    const db = getDb();

    // Fetch attachments to delete their storage files
    const attachments = await db
      .select()
      .from(calendarEventAttachments)
      .where(
        and(
          eq(calendarEventAttachments.eventId, eventId),
          eq(calendarEventAttachments.userId, authUser.id)
        )
      );

    for (const att of attachments) {
      await deleteEventAttachmentFile({
        storageBucket: att.storageBucket,
        storageKey: att.storageKey,
      });
    }

    const [deleted] = await db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, eventId),
          eq(calendarEvents.userId, authUser.id)
        )
      )
      .returning({ id: calendarEvents.id });

    if (!deleted) {
      return { status: 'not_found', message: 'Event not found.' };
    }

    // Cancel any pending notifications for this event
    await cancelEventNotifications(eventId).catch((err) =>
      console.error('[LifeCraft Notifications] cancel error on delete:', err)
    );

    return { status: 'ok', deletedEventId: deleted.id };
  } catch (err) {
    console.error('[LifeCraft Events] Failed to delete event:', err);
    return { status: 'error', message: 'Could not delete event.' };
  }
}

export async function addEventAttachment(
  authUser: AuthSessionUser,
  eventId: string,
  params: {
    fileName: string;
    fileType: string;
    bytes: Uint8Array;
  }
): Promise<{
  status: 'ok' | 'not_found' | 'validation_error' | 'error';
  attachment?: SerializedEventAttachment;
  message?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Database not configured.' };
  }

  if (params.bytes.byteLength > MAX_EVENT_ATTACHMENT_BYTES) {
    return {
      status: 'validation_error',
      message: 'Attachment exceeds the 25 MB file limit.',
    };
  }

  try {
    const db = getDb();
    // Verify event ownership
    const [eventRow] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, eventId),
          eq(calendarEvents.userId, authUser.id)
        )
      )
      .limit(1);

    if (!eventRow) {
      return { status: 'not_found', message: 'Event not found.' };
    }

    const attachmentId = crypto.randomUUID();
    const saveRes = await saveEventAttachmentFile({
      userId: authUser.id,
      eventId,
      attachmentId,
      fileName: params.fileName,
      fileType: params.fileType,
      bytes: params.bytes,
    });

    if (!saveRes.ok) {
      return {
        status: 'error',
        message: saveRes.error || 'Failed to save file attachment.',
      };
    }

    const [inserted] = await db
      .insert(calendarEventAttachments)
      .values({
        id: attachmentId,
        eventId,
        userId: authUser.id,
        fileName: params.fileName,
        fileType: params.fileType,
        fileSize: params.bytes.byteLength,
        storageBucket: saveRes.storageBucket,
        storageKey: saveRes.storageKey,
      })
      .returning();

    const attachment: SerializedEventAttachment = {
      id: inserted.id,
      eventId: inserted.eventId,
      fileName: inserted.fileName,
      fileType: inserted.fileType,
      fileSize: inserted.fileSize,
      formattedSize: `${(inserted.fileSize / 1024).toFixed(1)} KB`,
      downloadUrl: `/api/calendar/events/${eventId}/attachments/${inserted.id}/download`,
      createdAt: new Date(inserted.createdAt).toISOString(),
    };

    return { status: 'ok', attachment };
  } catch (err) {
    console.error('[LifeCraft Events] Failed to attach file:', err);
    return { status: 'error', message: 'Could not upload attachment.' };
  }
}

export async function deleteEventAttachment(
  authUser: AuthSessionUser,
  eventId: string,
  attachmentId: string
): Promise<{
  status: 'ok' | 'not_found' | 'error';
  deletedAttachmentId?: string;
  message?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Database not configured.' };
  }

  try {
    const db = getDb();
    const [att] = await db
      .select()
      .from(calendarEventAttachments)
      .where(
        and(
          eq(calendarEventAttachments.id, attachmentId),
          eq(calendarEventAttachments.eventId, eventId),
          eq(calendarEventAttachments.userId, authUser.id)
        )
      )
      .limit(1);

    if (!att) {
      return { status: 'not_found', message: 'Attachment not found.' };
    }

    await deleteEventAttachmentFile({
      storageBucket: att.storageBucket,
      storageKey: att.storageKey,
    });

    await db
      .delete(calendarEventAttachments)
      .where(eq(calendarEventAttachments.id, attachmentId));

    return { status: 'ok', deletedAttachmentId: attachmentId };
  } catch (err) {
    console.error('[LifeCraft Events] Failed to delete attachment:', err);
    return { status: 'error', message: 'Could not delete attachment.' };
  }
}

export async function getEventAttachmentDownloadData(
  authUser: AuthSessionUser,
  eventId: string,
  attachmentId: string
) {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const db = getDb();
  const [att] = await db
    .select()
    .from(calendarEventAttachments)
    .where(
      and(
        eq(calendarEventAttachments.id, attachmentId),
        eq(calendarEventAttachments.eventId, eventId),
        eq(calendarEventAttachments.userId, authUser.id)
      )
    )
    .limit(1);

  if (!att) return null;

  const fileRes = await getEventAttachmentFile({
    storageBucket: att.storageBucket,
    storageKey: att.storageKey,
  });

  if (!fileRes.ok || !fileRes.bytes) return null;

  return {
    fileName: att.fileName,
    fileType: att.fileType,
    fileSize: att.fileSize,
    bytes: fileRes.bytes,
  };
}

