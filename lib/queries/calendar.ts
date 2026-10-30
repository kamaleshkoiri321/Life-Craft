import { and, desc, eq, gte, isNull, lt, gt, ne, or } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../db';
import {
  googleCalendarEventMappings,
  tasks,
  userPreferences,
} from '../db/schema';
import { ensureUserProfile, type AuthSessionUser } from './dashboard';
import {
  DEFAULT_TIMEZONE,
  getLocalDateString,
  resolveValidTimezone,
} from './timezone';
import {
  serializeTaskRow,
  type SerializedTaskItem,
} from '../tasks/validation';
import {
  getCalendarPeriodRange,
  isValidCalendarView,
  type CalendarViewMode,
  type ExternalGoogleCalendarEvent,
} from '../calendar/calendar-utils';
import {
  fetchGoogleCalendarEventsForRange,
  getGoogleCalendarConfigStatus,
  getGoogleCalendarConnectionSummary,
  type GoogleCalendarConfigStatus,
  type GoogleCalendarConnectionSummary,
} from '../calendar/google-calendar';

export interface CalendarDataPayload {
  timezone: string;
  weekStartsOn: number;
  todayLocalDate: string;
  anchorDate: string;
  view: CalendarViewMode;
  startDateKey: string;
  endDateKey: string;
  headingLabel: string;
  rangeTasks: SerializedTaskItem[];
  unscheduledTasks: SerializedTaskItem[];
  externalEvents: ExternalGoogleCalendarEvent[];
  googleWarning: string | null;
  googleConfig: GoogleCalendarConfigStatus;
  googleConnection: GoogleCalendarConnectionSummary;
}

export type CalendarQueryResult =
  | {
      status: 'ok';
      data: CalendarDataPayload;
    }
  | {
      status: 'unconfigured' | 'error';
      message: string;
    };

export async function getCalendarViewDataForUser(
  authUser: AuthSessionUser,
  options?: {
    anchorDate?: string;
    view?: string;
    includeExternal?: boolean;
    requestOrigin?: string;
  }
): Promise<CalendarQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Calendar storage is not configured yet. Please check server settings.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(
      profile?.timezone ?? DEFAULT_TIMEZONE
    );

    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, authUser.id))
      .limit(1);
    const weekStartsOn = prefs?.weekStartsOn ?? 1;

    const now = new Date();
    const todayLocalDate = getLocalDateString(now, timezone);
    const view: CalendarViewMode = isValidCalendarView(options?.view)
      ? options.view
      : 'week';

    const period = getCalendarPeriodRange({
      anchorDate: options?.anchorDate || todayLocalDate,
      view,
      timezone,
      weekStartsOn,
      todayLocalDate,
    });

    // Bounded date-range query for tasks either scheduled within [startUtc, endUtc)
    // or with a deadline within [startUtc, endUtc)
    const rangeTaskRows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, authUser.id),
          ne(tasks.status, 'archived'),
          or(
            and(
              lt(tasks.scheduledStartAt, period.endUtc),
              gt(tasks.scheduledEndAt, period.startUtc)
            ),
            and(
              gte(tasks.dueAt, period.startUtc),
              lt(tasks.dueAt, period.endUtc)
            )
          )
        )
      )
      .orderBy(tasks.scheduledStartAt, tasks.dueAt)
      .limit(300);

    // Bounded query for unscheduled active tasks so users can schedule existing tasks onto the grid
    const unscheduledRows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, authUser.id),
          ne(tasks.status, 'archived'),
          ne(tasks.status, 'completed'),
          isNull(tasks.scheduledStartAt)
        )
      )
      .orderBy(desc(tasks.createdAt))
      .limit(30);

    // Fetch Google Calendar export mappings for this user
    const mappingMap = new Map<
      string,
      { googleEventId: string; googleHtmlLink: string | null }
    >();
    try {
      const mappingRows = await db
        .select()
        .from(googleCalendarEventMappings)
        .where(eq(googleCalendarEventMappings.userId, authUser.id));
      for (const m of mappingRows) {
        mappingMap.set(m.taskId, {
          googleEventId: m.googleEventId,
          googleHtmlLink: m.googleHtmlLink ?? null,
        });
      }
    } catch {
      // Proceed if mapping table not yet migrated
    }

    const rangeTasks = rangeTaskRows.map((row) =>
      serializeTaskRow(row, {
        timezone,
        now,
        googleMapping: mappingMap.get(row.id) ?? null,
      })
    );

    const unscheduledTasks = unscheduledRows.map((row) =>
      serializeTaskRow(row, {
        timezone,
        now,
        googleMapping: mappingMap.get(row.id) ?? null,
      })
    );

    const googleConfig = getGoogleCalendarConfigStatus(options?.requestOrigin);
    let googleConnection = await getGoogleCalendarConnectionSummary(
      authUser.id
    );

    let externalEvents: ExternalGoogleCalendarEvent[] = [];
    let googleWarning: string | null = null;

    if (googleConnection.connected && options?.includeExternal !== false) {
      const externalResult = await fetchGoogleCalendarEventsForRange({
        userId: authUser.id,
        startUtc: period.startUtc,
        endUtc: period.endUtc,
      });
      externalEvents = externalResult.events;
      googleWarning = externalResult.warningMessage;

      if (googleWarning) {
        googleConnection = await getGoogleCalendarConnectionSummary(
          authUser.id
        );
      }
    }

    return {
      status: 'ok',
      data: {
        timezone,
        weekStartsOn,
        todayLocalDate,
        anchorDate: period.anchorDate,
        view: period.view,
        startDateKey: period.startDateKey,
        endDateKey: period.endDateKey,
        headingLabel: period.headingLabel,
        rangeTasks,
        unscheduledTasks,
        externalEvents,
        googleWarning,
        googleConfig,
        googleConnection,
      },
    };
  } catch (err) {
    console.error('[LifeCraft Calendar] Failed to query calendar data:', err);
    return {
      status: 'error',
      message:
        'We could not load your calendar schedule right now. Please try again.',
    };
  }
}
