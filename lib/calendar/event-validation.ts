import {
  DEFAULT_TIMEZONE,
  formatLocalTime,
  getLocalDateString,
  resolveValidTimezone,
  shiftLocalDateString,
} from '../queries/timezone';
import {
  combineLocalDateAndTimeToUtc,
  extractLocalDateAndExactTime,
} from '../tasks/validation';
import type {
  CalendarEventAttachmentRow,
  CalendarEventRecurrenceRule,
  CalendarEventReminder,
  CalendarEventRow,
} from '../db/schema';

export type {
  CalendarEventAttachmentRow,
  CalendarEventRecurrenceRule,
  CalendarEventReminder,
  CalendarEventRow,
};

export const EVENT_CATEGORIES = [
  'General',
  'Meeting',
  'Work',
  'Personal',
  'Study',
  'Health',
  'Focus',
  'Social',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_COLORS = [
  { name: 'Purple', hex: '#5938B5', bg: '#FAF5FF', border: '#C084FC' },
  { name: 'Blue', hex: '#2563EB', bg: '#EFF6FF', border: '#93C5FD' },
  { name: 'Emerald', hex: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  { name: 'Amber', hex: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  { name: 'Rose', hex: '#E11D48', bg: '#FFF1F2', border: '#FDA4AF' },
  { name: 'Indigo', hex: '#4F46E5', bg: '#EEF2FF', border: '#A5B4FC' },
  { name: 'Teal', hex: '#0D9488', bg: '#F0FDFA', border: '#5EEAD4' },
  { name: 'Red', hex: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
] as const;

export const DEFAULT_EVENT_COLOR = '#5938B5';

/**
 * Normalizes any time representation (e.g. "5:45 AM", "05:45", "9:00", "4:32 PM")
 * into a strict HTML5-compliant 24-hour "HH:mm" string (e.g. "05:45", "16:32").
 */
export function normalizeTo24HourTime(
  timeStr: string | null | undefined,
  defaultTime = '09:00'
): string {
  if (!timeStr || typeof timeStr !== 'string') return defaultTime;
  const trimmed = timeStr.trim();
  if (!trimmed) return defaultTime;

  // Check if it's already HH:mm (24-hour with leading zero)
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    return trimmed;
  }

  // Check if it's H:mm (e.g. "9:00" -> "09:00")
  if (/^\d:[0-5]\d$/.test(trimmed)) {
    return `0${trimmed}`;
  }

  // Check if it has 12-hour AM/PM (e.g. "5:45 AM", "05:45 AM", "4:32 PM", "12:15 PM")
  const ampmMatch = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([ap]m)$/i.exec(trimmed);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2];
    const meridian = ampmMatch[3].toUpperCase();

    if (meridian === 'PM' && hour < 12) {
      hour += 12;
    } else if (meridian === 'AM' && hour === 12) {
      hour = 0;
    }
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  return defaultTime;
}

export const REMINDER_PRESETS = [
  { value: 0, label: 'At start time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
] as const;

export type MeetingPlatform =
  | 'google_meet'
  | 'zoom'
  | 'teams'
  | 'webex'
  | 'custom';

export interface MeetingLinkDetails {
  url: string;
  platform: MeetingPlatform;
  label: string;
}

export function detectMeetingPlatform(
  rawUrl?: string | null
): MeetingLinkDetails | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }

    if (host === 'meet.google.com' || host.endsWith('.meet.google.com')) {
      return { url: trimmed, platform: 'google_meet', label: 'Google Meet' };
    }
    if (host === 'zoom.us' || host.endsWith('.zoom.us')) {
      return { url: trimmed, platform: 'zoom', label: 'Zoom' };
    }
    if (
      host === 'teams.microsoft.com' ||
      host === 'teams.live.com' ||
      host.endsWith('.teams.microsoft.com')
    ) {
      return { url: trimmed, platform: 'teams', label: 'Microsoft Teams' };
    }
    if (host === 'webex.com' || host.endsWith('.webex.com')) {
      return { url: trimmed, platform: 'webex', label: 'Cisco Webex' };
    }
    return { url: trimmed, platform: 'custom', label: 'Online Meeting' };
  } catch {
    return null;
  }
}

export function formatReminderLabel(minutesBefore: number): string {
  if (minutesBefore === 0) return 'At start time';
  if (minutesBefore < 60) return `${minutesBefore} minute${minutesBefore === 1 ? '' : 's'} before`;
  if (minutesBefore < 1440) {
    const hours = Math.floor(minutesBefore / 60);
    const remainder = minutesBefore % 60;
    if (remainder === 0) {
      return `${hours} hour${hours === 1 ? '' : 's'} before`;
    }
    return `${hours}h ${remainder}m before`;
  }
  if (minutesBefore < 10080) {
    const days = Math.floor(minutesBefore / 1440);
    return `${days} day${days === 1 ? '' : 's'} before`;
  }
  const weeks = Math.floor(minutesBefore / 10080);
  return `${weeks} week${weeks === 1 ? '' : 's'} before`;
}

export function formatRecurrenceLabel(
  rule: CalendarEventRecurrenceRule | null | undefined
): string | null {
  if (!rule || rule.frequency === 'daily' && rule.interval === 0) return null;
  const freq = rule.frequency;
  const interval = rule.interval ?? 1;

  let base = '';
  if (freq === 'daily') {
    base = interval === 1 ? 'Repeats daily' : `Repeats every ${interval} days`;
  } else if (freq === 'weekly') {
    const days = rule.daysOfWeek ?? [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysStr =
      days.length > 0 && days.length < 7
        ? ` on ${days.map((d) => dayNames[d] ?? '').filter(Boolean).join(', ')}`
        : '';
    base =
      interval === 1
        ? `Repeats weekly${daysStr}`
        : `Repeats every ${interval} weeks${daysStr}`;
  } else if (freq === 'monthly') {
    base = interval === 1 ? 'Repeats monthly' : `Repeats every ${interval} months`;
  } else if (freq === 'yearly') {
    base = interval === 1 ? 'Repeats yearly' : `Repeats every ${interval} years`;
  } else {
    base = 'Repeats custom';
  }

  if (rule.endType === 'until' && rule.endDate) {
    base += ` until ${rule.endDate}`;
  } else if (rule.endType === 'count' && rule.count) {
    base += ` (${rule.count} occurrences)`;
  }

  return base;
}

export interface SerializedEventAttachment {
  id: string;
  eventId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  formattedSize: string;
  downloadUrl: string;
  createdAt: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SerializedCalendarEvent {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  notes: string | null;
  category: string;
  color: string;
  isAllDay: boolean;
  timezone: string;
  startDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:mm (null if all-day)
  endDate: string; // YYYY-MM-DD
  endTime: string | null; // HH:mm (null if all-day)
  startIso: string;
  endIso: string;
  durationMinutes: number;
  displayTimeLabel: string;
  meetingUrl: string | null;
  meetingPlatform: MeetingPlatform | null;
  meetingLabel: string | null;
  recurrenceRule: CalendarEventRecurrenceRule | null;
  recurrenceLabel: string | null;
  isRecurring: boolean;
  recurringEventId: string | null;
  reminders: CalendarEventReminder[];
  reminderLabels: string[];
  attachments: SerializedEventAttachment[];
  createdAt: string;
  updatedAt: string;
}

export function serializeCalendarEventRow(
  row: CalendarEventRow,
  options?: {
    timezone?: string;
    attachments?: CalendarEventAttachmentRow[];
  }
): SerializedCalendarEvent {
  const tz = resolveValidTimezone(options?.timezone ?? row.timezone ?? DEFAULT_TIMEZONE);
  const startAt = new Date(row.startAt);
  const endAt = new Date(row.endAt);

  const startExtract = extractLocalDateAndExactTime(startAt, tz);
  const endExtract = extractLocalDateAndExactTime(endAt, tz);

  const startDate = startExtract.localDate ?? getLocalDateString(startAt, tz);
  const endDate = endExtract.localDate ?? getLocalDateString(endAt, tz);

  const startTime = row.isAllDay
    ? null
    : startExtract.localTime
      ? normalizeTo24HourTime(startExtract.localTime)
      : '09:00';
  const endTime = row.isAllDay
    ? null
    : endExtract.localTime
      ? normalizeTo24HourTime(endExtract.localTime)
      : '10:00';

  const startMs = startAt.getTime();
  const endMs = endAt.getTime();
  const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

  let displayTimeLabel = '';
  if (row.isAllDay) {
    displayTimeLabel = startDate === endDate ? `${startDate} (All day)` : `${startDate} – ${endDate} (All day)`;
  } else {
    const sFormatted = formatLocalTime(startAt, tz) ?? '';
    const eFormatted = formatLocalTime(endAt, tz) ?? '';
    displayTimeLabel =
      startDate === endDate
        ? `${sFormatted} – ${eFormatted}`
        : `${startDate} ${sFormatted} – ${endDate} ${eFormatted}`;
  }

  const meetingDetails = row.meetingUrl ? detectMeetingPlatform(row.meetingUrl) : null;
  const recurrenceRule = row.recurrenceRule ?? null;
  const recurrenceLabel = formatRecurrenceLabel(recurrenceRule);

  const reminders = (row.reminders as CalendarEventReminder[]) || [];
  const reminderLabels = reminders.map((r) => formatReminderLabel(r.minutesBefore));

  const attachments: SerializedEventAttachment[] = (options?.attachments ?? []).map((att) => ({
    id: att.id,
    eventId: att.eventId,
    fileName: att.fileName,
    fileType: att.fileType,
    fileSize: att.fileSize,
    formattedSize: formatFileSize(att.fileSize),
    downloadUrl: `/api/calendar/events/${row.id}/attachments/${att.id}/download`,
    createdAt: new Date(att.createdAt).toISOString(),
  }));

  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description ?? null,
    notes: row.notes ?? null,
    category: row.category,
    color: row.color,
    isAllDay: row.isAllDay,
    timezone: tz,
    startDate,
    startTime,
    endDate,
    endTime,
    startIso: startAt.toISOString(),
    endIso: endAt.toISOString(),
    durationMinutes,
    displayTimeLabel,
    meetingUrl: row.meetingUrl ?? null,
    meetingPlatform: meetingDetails?.platform ?? null,
    meetingLabel: meetingDetails?.label ?? null,
    recurrenceRule,
    recurrenceLabel,
    isRecurring: Boolean(recurrenceRule || row.recurringEventId),
    recurringEventId: row.recurringEventId ?? null,
    reminders,
    reminderLabels,
    attachments,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export interface CalendarEventCreateInput {
  title: string;
  description?: string | null;
  notes?: string | null;
  category?: string;
  color?: string;
  startDate: string; // YYYY-MM-DD
  startTime?: string | null; // HH:mm
  endDate?: string | null; // YYYY-MM-DD
  endTime?: string | null; // HH:mm
  isAllDay?: boolean;
  timezone?: string;
  meetingUrl?: string | null;
  recurrenceRule?: CalendarEventRecurrenceRule | null;
  reminders?: CalendarEventReminder[];
}

export type CalendarEventInput = CalendarEventCreateInput;

export interface CalendarEventValidationResult {
  ok: boolean;
  errors?: Record<string, string>;
  cleaned?: {
    title: string;
    description: string | null;
    notes: string | null;
    category: string;
    color: string;
    startAt: Date;
    endAt: Date;
    isAllDay: boolean;
    timezone: string;
    meetingUrl: string | null;
    recurrenceRule: CalendarEventRecurrenceRule | null;
    reminders: CalendarEventReminder[];
  };
}

export function validateCalendarEventInput(
  input: unknown,
  fallbackTimezone = 'Asia/Kathmandu'
): CalendarEventValidationResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: { _general: 'Invalid event data payload.' } };
  }

  const raw = input as Record<string, unknown>;
  const errors: Record<string, string> = {};

  // Title validation
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) {
    errors.title = 'Event title is required.';
  } else if (title.length > 200) {
    errors.title = 'Event title cannot exceed 200 characters.';
  }

  // Category validation
  const categoryRaw = typeof raw.category === 'string' ? raw.category.trim() : 'General';
  const category = categoryRaw && categoryRaw.length <= 50 ? categoryRaw : 'General';

  // Color validation (hex format #RRGGBB)
  let color = typeof raw.color === 'string' ? raw.color.trim() : DEFAULT_EVENT_COLOR;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    color = DEFAULT_EVENT_COLOR;
  }

  // Timezone resolution
  const timezone = resolveValidTimezone(
    typeof raw.timezone === 'string' ? raw.timezone : fallbackTimezone
  );

  // All-day flag
  const isAllDay = Boolean(raw.isAllDay);

  // Dates and times
  const startDateStr = typeof raw.startDate === 'string' ? raw.startDate.trim() : '';
  if (!startDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
    errors.startDate = 'A valid start date (YYYY-MM-DD) is required.';
  }

  const endDateStr =
    typeof raw.endDate === 'string' && raw.endDate.trim()
      ? raw.endDate.trim()
      : startDateStr;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
    errors.endDate = 'End date must be formatted as YYYY-MM-DD.';
  }

  let startTimeStr =
    typeof raw.startTime === 'string'
      ? normalizeTo24HourTime(raw.startTime, '')
      : null;
  let endTimeStr =
    typeof raw.endTime === 'string'
      ? normalizeTo24HourTime(raw.endTime, '')
      : null;

  if (!isAllDay) {
    if (!startTimeStr || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTimeStr)) {
      errors.startTime = 'Start time is required for timed events (HH:mm).';
      startTimeStr = '09:00';
    }
    if (!endTimeStr || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTimeStr)) {
      // Default to 1 hour after start time if omitted
      if (startTimeStr && /^([01]\d|2[0-3]):([0-5]\d)$/.test(startTimeStr)) {
        const [h, m] = startTimeStr.split(':').map(Number);
        const nextH = (h + 1) % 24;
        endTimeStr = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      } else {
        endTimeStr = '10:00';
      }
    }
  }

  // Meeting URL validation
  let meetingUrl: string | null = null;
  if (typeof raw.meetingUrl === 'string' && raw.meetingUrl.trim()) {
    const details = detectMeetingPlatform(raw.meetingUrl);
    if (!details) {
      errors.meetingUrl = 'Meeting link must be a valid http:// or https:// URL.';
    } else {
      meetingUrl = details.url;
    }
  }

  // Description & Notes
  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : null;
  const notes =
    typeof raw.notes === 'string' && raw.notes.trim()
      ? raw.notes.trim()
      : null;

  // Reminders validation
  const reminders: CalendarEventReminder[] = [];
  if (Array.isArray(raw.reminders)) {
    for (const rem of raw.reminders) {
      if (rem && typeof rem === 'object') {
        const mins = Number((rem as Record<string, unknown>).minutesBefore);
        if (Number.isInteger(mins) && mins >= 0 && mins <= 43200) {
          if (!reminders.some((r) => r.minutesBefore === mins)) {
            reminders.push({ minutesBefore: mins });
          }
        }
      }
    }
  }
  reminders.sort((a, b) => a.minutesBefore - b.minutesBefore);

  // Recurrence rule validation
  let recurrenceRule: CalendarEventRecurrenceRule | null = null;
  if (raw.recurrenceRule && typeof raw.recurrenceRule === 'object') {
    const rRaw = raw.recurrenceRule as Record<string, unknown>;
    const freq = rRaw.frequency;
    if (
      freq === 'daily' ||
      freq === 'weekly' ||
      freq === 'monthly' ||
      freq === 'yearly' ||
      freq === 'custom'
    ) {
      const interval = Math.max(1, Math.min(99, Number(rRaw.interval) || 1));
      const endType =
        rRaw.endType === 'until'
          ? 'until'
          : rRaw.endType === 'count'
            ? 'count'
            : 'never';
      const endDate =
        typeof rRaw.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rRaw.endDate)
          ? rRaw.endDate
          : undefined;
      const count =
        typeof rRaw.count === 'number' && rRaw.count > 0
          ? Math.min(365, rRaw.count)
          : undefined;

      const daysOfWeek = Array.isArray(rRaw.daysOfWeek)
        ? rRaw.daysOfWeek.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
        : undefined;

      recurrenceRule = {
        frequency: freq,
        interval,
        endType,
        endDate,
        count,
        daysOfWeek,
      };
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // Convert to UTC dates using timezone
  let startAt: Date;
  let endAt: Date;

  if (isAllDay) {
    const sUtc = combineLocalDateAndTimeToUtc(startDateStr, '00:00', timezone);
    // All day ends on next calendar day for full interval coverage in target timezone
    const nextDay = shiftLocalDateString(endDateStr, 1);
    const eUtc = combineLocalDateAndTimeToUtc(nextDay, '00:00', timezone);
    if (!sUtc || !eUtc) {
      errors.startDate = 'Invalid date for event.';
      return { ok: false, errors };
    }
    startAt = sUtc;
    endAt = eUtc;
  } else {
    const sUtc = combineLocalDateAndTimeToUtc(startDateStr, startTimeStr, timezone);
    const eUtc = combineLocalDateAndTimeToUtc(endDateStr, endTimeStr, timezone);

    if (!sUtc) {
      errors.startDate = 'Invalid start date and time.';
      return { ok: false, errors };
    }
    if (!eUtc) {
      errors.endDate = 'Invalid end date and time.';
      return { ok: false, errors };
    }

    startAt = sUtc;
    endAt = eUtc;

    if (endAt.getTime() <= startAt.getTime()) {
      errors.endTime = 'End time must be strictly after start time.';
      return { ok: false, errors };
    }
  }

  return {
    ok: true,
    cleaned: {
      title,
      description,
      notes,
      category,
      color,
      startAt,
      endAt,
      isAllDay,
      timezone,
      meetingUrl,
      recurrenceRule,
      reminders,
    },
  };
}

/**
 * Expands recurring event instances across a requested date range [rangeStartUtc, rangeEndUtc]
 * without storing unbounded rows in the database.
 */
export function expandRecurringInstances(
  rawEvent: SerializedCalendarEvent | CalendarEventRow,
  rangeStartUtc: Date,
  rangeEndUtc: Date
): SerializedCalendarEvent[] {
  const baseEvent: SerializedCalendarEvent =
    'startIso' in rawEvent ? rawEvent : serializeCalendarEventRow(rawEvent);

  if (!baseEvent.recurrenceRule) {
    return [baseEvent];
  }

  const rule = baseEvent.recurrenceRule;
  const originalStart = new Date(baseEvent.startIso);
  const originalEnd = new Date(baseEvent.endIso);
  const durationMs = originalEnd.getTime() - originalStart.getTime();

  const results: SerializedCalendarEvent[] = [];
  const maxOccurrences = rule.count ?? 200;
  let occurrenceCount = 0;

  let currentStart = new Date(originalStart);

  const rangeEndMs = rangeEndUtc.getTime();
  const rangeStartMs = rangeStartUtc.getTime();
  const maxIterations = 500; // Safeguard against infinite loops
  let iteration = 0;

  while (iteration++ < maxIterations) {
    const currentEnd = new Date(currentStart.getTime() + durationMs);

    // Check end conditions
    if (rule.endType === 'count' && occurrenceCount >= maxOccurrences) break;
    if (rule.endType === 'until' && rule.endDate) {
      const untilLimit = new Date(`${rule.endDate}T23:59:59Z`).getTime();
      if (currentStart.getTime() > untilLimit) break;
    }

    // Stop if we have passed beyond the query range
    if (currentStart.getTime() > rangeEndMs) break;

    // Check if current instance falls within requested range
    if (currentEnd.getTime() >= rangeStartMs && currentStart.getTime() <= rangeEndMs) {
      const instanceId =
        occurrenceCount === 0
          ? baseEvent.id
          : `${baseEvent.id}_rec_${currentStart.getTime()}`;

      const startExtract = extractLocalDateAndExactTime(currentStart, baseEvent.timezone);
      const endExtract = extractLocalDateAndExactTime(currentEnd, baseEvent.timezone);
      const sDate = startExtract.localDate ?? getLocalDateString(currentStart, baseEvent.timezone);
      const eDate = endExtract.localDate ?? getLocalDateString(currentEnd, baseEvent.timezone);
      const sTime = baseEvent.isAllDay ? null : startExtract.localTime;
      const eTime = baseEvent.isAllDay ? null : endExtract.localTime;

      results.push({
        ...baseEvent,
        id: instanceId,
        recurringEventId: baseEvent.id,
        startDate: sDate,
        startTime: sTime,
        endDate: eDate,
        endTime: eTime,
        startIso: currentStart.toISOString(),
        endIso: currentEnd.toISOString(),
      });
    }

    occurrenceCount++;

    // Increment currentStart based on frequency
    if (rule.frequency === 'daily') {
      currentStart = new Date(currentStart.getTime() + rule.interval * 86400000);
    } else if (rule.frequency === 'weekly') {
      currentStart = new Date(currentStart.getTime() + rule.interval * 7 * 86400000);
    } else if (rule.frequency === 'monthly') {
      const nextMonth = currentStart.getUTCMonth() + rule.interval;
      const nextDate = new Date(currentStart);
      nextDate.setUTCMonth(nextMonth);
      currentStart = nextDate;
    } else if (rule.frequency === 'yearly') {
      const nextYear = currentStart.getUTCFullYear() + rule.interval;
      const nextDate = new Date(currentStart);
      nextDate.setUTCFullYear(nextYear);
      currentStart = nextDate;
    } else {
      break;
    }
  }

  return results.length > 0 ? results : [baseEvent];
}
