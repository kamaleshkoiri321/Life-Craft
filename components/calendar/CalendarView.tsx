'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Flag,
  Layers,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import type { SerializedTaskItem } from '@/lib/tasks/validation';
import {
  buildDayScheduleData,
  getCalendarPeriodRange,
  HOUR_ROWS,
  shiftCalendarAnchorDate,
  type CalendarTimedLayoutItem,
  type CalendarViewMode,
} from '@/lib/calendar/calendar-utils';
import type {
  CalendarDataPayload,
  CalendarQueryResult,
} from '@/lib/queries/calendar';
import TaskFormModal, {
  type TaskFormSubmitPayload,
} from '@/components/tasks/TaskFormModal';
import DeleteTaskDialog from '@/components/tasks/DeleteTaskDialog';
import CalendarTaskDetailSheet from './CalendarTaskDetailSheet';
import CalendarEventModal from './CalendarEventModal';
import CalendarEventDetailSheet from './CalendarEventDetailSheet';
import {
  detectMeetingPlatform,
  type SerializedCalendarEvent,
} from '@/lib/calendar/event-validation';

interface CalendarViewProps {
  todayLocalDate: string;
  timezone: string;
  onTasksMutated?: () => void;
}

interface InitialSchedulePrefill {
  scheduledDate: string;
  scheduledStartTime: string;
  durationMinutes: number;
  isAllDay: boolean;
}

const HOUR_ROW_HEIGHT_PX = 60; // 1px per minute across 24 hours (1440px total)

const CATEGORY_FILTERS = [
  'All',
  'Meeting',
  'Work',
  'Personal',
  'Focus',
  'Health',
  'Other',
];

export default function CalendarView({
  todayLocalDate,
  timezone,
  onTasksMutated,
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [anchorDate, setAnchorDate] = useState<string>(todayLocalDate);
  const [selectedDate, setSelectedDate] = useState<string>(todayLocalDate);

  const [calendarData, setCalendarData] = useState<CalendarDataPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showMiniSidebar, setShowMiniSidebar] = useState(true);

  // Task Modals & sheets state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<SerializedTaskItem | null>(null);
  const [prefillSchedule, setPrefillSchedule] = useState<InitialSchedulePrefill | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState<SerializedTaskItem | null>(null);
  const [showUnscheduledTray, setShowUnscheduledTray] = useState(false);

  // Calendar Event Modals & sheets state
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventModalMode, setEventModalMode] = useState<'create' | 'edit'>('create');
  const [editingEvent, setEditingEvent] = useState<SerializedCalendarEvent | null>(null);
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const [prefillEventDate, setPrefillEventDate] = useState(todayLocalDate);
  const [prefillEventTime, setPrefillEventTime] = useState('09:00');
  const [prefillEventIsAllDay, setPrefillEventIsAllDay] = useState(false);

  const timeGridScrollRef = useRef<HTMLDivElement | null>(null);

  const fetchCalendarData = useCallback(
    async (mode: CalendarViewMode, date: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const params = new URLSearchParams({
          view: mode,
          anchorDate: date,
        });
        const response = await fetch(`/api/calendar?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const result = (await response.json().catch(() => null)) as CalendarQueryResult | null;

        if (!response.ok || !result || result.status !== 'ok') {
          setErrorMessage(
            (result && 'message' in result && result.message) ||
              'Could not load calendar schedule right now.'
          );
          return;
        }
        setCalendarData(result.data);
      } catch {
        setErrorMessage('Network error while loading calendar data.');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      view: viewMode,
      anchorDate,
    });
    fetch(`/api/calendar?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (cancelled) return;
        const result = (await response.json().catch(() => null)) as CalendarQueryResult | null;
        if (!cancelled) {
          if (!response.ok || !result || result.status !== 'ok') {
            setErrorMessage(
              (result && 'message' in result && result.message) ||
                'Could not load calendar schedule right now.'
            );
          } else {
            setErrorMessage(null);
            setCalendarData(result.data);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Network error while loading calendar data.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, anchorDate]);

  // Scroll hourly grid to 6:00 AM initially when in week or day view
  const scrollToSixAm = useCallback(() => {
    if (timeGridScrollRef.current) {
      timeGridScrollRef.current.scrollTop = 6 * HOUR_ROW_HEIGHT_PX;
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'week' || viewMode === 'day') {
      const timer = setTimeout(() => {
        scrollToSixAm();
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [viewMode, scrollToSixAm]);

  const activeTimezone = calendarData?.timezone || timezone;
  const weekStartsOn = calendarData?.weekStartsOn ?? 1;

  const period = useMemo(
    () =>
      getCalendarPeriodRange({
        anchorDate,
        view: viewMode,
        timezone: activeTimezone,
        weekStartsOn,
        todayLocalDate: calendarData?.todayLocalDate || todayLocalDate,
      }),
    [
      anchorDate,
      viewMode,
      activeTimezone,
      weekStartsOn,
      calendarData?.todayLocalDate,
      todayLocalDate,
    ]
  );

  const rangeTasks = useMemo(
    () => calendarData?.rangeTasks ?? [],
    [calendarData?.rangeTasks]
  );
  const unscheduledTasks = useMemo(
    () => calendarData?.unscheduledTasks ?? [],
    [calendarData?.unscheduledTasks]
  );
  const events = useMemo(
    () => calendarData?.events ?? [],
    [calendarData?.events]
  );

  // Combine rangeTasks + unscheduledTasks for lookup by ID
  const allKnownTasks = useMemo(() => {
    const map = new Map<string, SerializedTaskItem>();
    for (const t of rangeTasks) map.set(t.id, t);
    for (const t of unscheduledTasks) map.set(t.id, t);
    return Array.from(map.values());
  }, [rangeTasks, unscheduledTasks]);

  // Filter tasks & events by search query and category
  const filteredTasks = useMemo(() => {
    let result = rangeTasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }
    return result;
  }, [rangeTasks, searchQuery]);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (categoryFilter !== 'All') {
      result = result.filter(
        (e) => (e.category || '').toLowerCase() === categoryFilter.toLowerCase()
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (e.category && e.category.toLowerCase().includes(q))
      );
    }
    return result;
  }, [events, categoryFilter, searchQuery]);

  // Build per-day schedule layout map
  const dayScheduleMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildDayScheduleData>>();
    for (const day of period.days) {
      map.set(
        day.dateKey,
        buildDayScheduleData({
          day,
          tasks: filteredTasks,
          events: filteredEvents,
          timezone: activeTimezone,
        })
      );
    }
    return map;
  }, [period.days, filteredTasks, filteredEvents, activeTimezone]);

  const detailTask = useMemo(
    () =>
      detailTaskId
        ? allKnownTasks.find((t) => t.id === detailTaskId) ?? null
        : null,
    [detailTaskId, allKnownTasks]
  );

  const detailEvent = useMemo(
    () =>
      detailEventId
        ? events.find((e) => e.id === detailEventId) ?? null
        : null,
    [detailEventId, events]
  );

  const detailTaskConflictingTitles = useMemo(() => {
    if (!detailTask) return [];
    const titles = new Set<string>();
    for (const daySchedule of dayScheduleMap.values()) {
      for (const item of daySchedule.timedItems) {
        if (item.task?.id === detailTask.id) {
          for (const t of item.conflictingTitles) {
            titles.add(t);
          }
        }
      }
    }
    return Array.from(titles);
  }, [detailTask, dayScheduleMap]);

  // Upcoming items for sidebar (next 8 events/tasks chronologically)
  const upcomingEvents = useMemo(() => {
    const list = [...events].filter((e) => {
      const s = new Date(e.startIso).getTime();
      return s >= new Date().getTime() - 2 * 60 * 60 * 1000;
    });
    list.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
    return list.slice(0, 8);
  }, [events]);

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    setIsLoading(true);
    if (direction === 'today') {
      const targetToday = calendarData?.todayLocalDate || todayLocalDate;
      setAnchorDate(targetToday);
      setSelectedDate(targetToday);
      return;
    }
    const delta = direction === 'prev' ? -1 : 1;
    const nextDate = shiftCalendarAnchorDate(anchorDate, viewMode, delta);
    setAnchorDate(nextDate);
    setSelectedDate(nextDate);
  };

  const handleSelectViewMode = (nextMode: CalendarViewMode) => {
    setIsLoading(true);
    setViewMode(nextMode);
    setAnchorDate(selectedDate);
  };

  const handleOpenCreateEventModal = (
    dateKey?: string,
    hour?: number,
    isAllDay = false
  ) => {
    const date = dateKey || selectedDate;
    setSelectedDate(date);
    setEditingEvent(null);
    setEventModalMode('create');
    setPrefillEventDate(date);
    const startHour = typeof hour === 'number' ? hour : 9;
    setPrefillEventTime(
      isAllDay ? '09:00' : `${String(startHour).padStart(2, '0')}:00`
    );
    setPrefillEventIsAllDay(isAllDay);
    setIsEventModalOpen(true);
  };

  const handleOpenEditEventModal = (event: SerializedCalendarEvent) => {
    setDetailEventId(null);
    setEditingEvent(event);
    setEventModalMode('edit');
    setIsEventModalOpen(true);
  };

  const handleDeleteEvent = async (
    event: SerializedCalendarEvent,
    scope: 'this' | 'series'
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/calendar/events/${event.id}?scope=${scope}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || 'Failed to delete event.' };
      }
      setBannerNotice({
        type: 'success',
        message: `Event "${event.title}" was deleted.`,
      });
      await fetchCalendarData(viewMode, anchorDate);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error deleting event.' };
    }
  };

  const handleOpenCreateTaskSlot = (
    dateKey: string,
    hour?: number,
    isAllDay = false
  ) => {
    setSelectedDate(dateKey);
    setEditingTask(null);
    const startHour = typeof hour === 'number' ? hour : 9;
    const startTimeStr = isAllDay
      ? ''
      : `${String(startHour).padStart(2, '0')}:00`;
    setPrefillSchedule({
      scheduledDate: dateKey,
      scheduledStartTime: startTimeStr,
      durationMinutes: 60,
      isAllDay,
    });
    setIsTaskModalOpen(true);
  };

  const handleTaskFormSubmit = async (
    payload: TaskFormSubmitPayload
  ): Promise<{
    ok: boolean;
    error?: string;
    fieldErrors?: Record<string, string>;
  }> => {
    const isEdit = Boolean(editingTask);
    const url = isEdit ? `/api/tasks/${editingTask!.id}` : '/api/tasks';
    const method = isEdit ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || 'Could not save task.',
        fieldErrors: data?.fieldErrors,
      };
    }

    onTasksMutated?.();
    await fetchCalendarData(viewMode, anchorDate);
    return { ok: true };
  };

  const handleQuickUpdateTask = async (
    taskId: string,
    patch: Record<string, unknown>
  ): Promise<{ ok: boolean; error?: string }> => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || 'Could not update task.',
      };
    }
    onTasksMutated?.();
    await fetchCalendarData(viewMode, anchorDate);
    return { ok: true };
  };

  const handleConfirmDeleteTask = async (
    taskId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || 'Could not delete task.',
      };
    }
    if (detailTaskId === taskId) {
      setDetailTaskId(null);
    }
    setDeletingTask(null);
    onTasksMutated?.();
    await fetchCalendarData(viewMode, anchorDate);
    return { ok: true };
  };

  const handleArchiveTaskInstead = async (
    taskId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = await handleQuickUpdateTask(taskId, { status: 'archived' });
    if (res.ok) {
      if (detailTaskId === taskId) {
        setDetailTaskId(null);
      }
      setDeletingTask(null);
    }
    return res;
  };

  // Render timed block on hourly grid
  const renderHourlyItemBlock = (item: CalendarTimedLayoutItem) => {
    const topPx = (item.startMinutes / 60) * HOUR_ROW_HEIGHT_PX;
    const heightPx = Math.max(
      26,
      (item.visualDurationMinutes / 60) * HOUR_ROW_HEIGHT_PX - 2
    );

    const widthPercent = 100 / item.totalColumns;
    const leftPercent = item.columnIndex * widthPercent;

    if (item.source === 'calendar_event' && item.event) {
      const event = item.event;
      const meetingPlat = detectMeetingPlatform(event.meetingUrl);

      return (
        <button
          key={item.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDetailEventId(event.id);
          }}
          style={{
            top: `${topPx}px`,
            height: `${heightPx}px`,
            left: `calc(${leftPercent}% + 2px)`,
            width: `calc(${widthPercent}% - 4px)`,
            backgroundColor: `${event.color || '#5938B5'}18`,
            borderLeftColor: event.color || '#5938B5',
          }}
          className="absolute z-10 overflow-hidden rounded-xl border border-[#171622]/15 border-l-4 px-2.5 py-1 text-left shadow-2xs transition-all hover:shadow-md hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-[#171622]"
          title={`${event.title} (${item.timeRangeLabel})${
            event.meetingUrl ? ' • Includes meeting link' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-xs font-bold text-[#171622]">
              {event.title}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {event.meetingUrl && (
                <span title={meetingPlat?.label ?? 'Meeting'}>
                  <Video className="h-3 w-3 text-[#2563EB]" />
                </span>
              )}
              {(event.attachments ?? []).length > 0 && (
                <Paperclip className="h-2.5 w-2.5 text-[#171622]/50" />
              )}
            </div>
          </div>
          {heightPx >= 38 && (
            <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] text-[#171622]/70">
              <span className="tabular-nums font-medium">{item.timeRangeLabel}</span>
              <span
                className="truncate font-semibold px-1 rounded text-[9px]"
                style={{ backgroundColor: `${event.color || '#5938B5'}25`, color: event.color || '#5938B5' }}
              >
                {event.category}
              </span>
            </div>
          )}
        </button>
      );
    }

    const task = item.task;
    if (!task) return null;

    const isCompleted = task.status === 'completed';
    const priorityBorder =
      task.priority === 'high'
        ? 'border-l-4 border-l-[#DC2626]'
        : task.priority === 'medium'
          ? 'border-l-4 border-l-[#5938B5]'
          : 'border-l-4 border-l-[#4D7C0F]';

    return (
      <button
        key={item.id}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDetailTaskId(task.id);
        }}
        style={{
          top: `${topPx}px`,
          height: `${heightPx}px`,
          left: `calc(${leftPercent}% + 2px)`,
          width: `calc(${widthPercent}% - 4px)`,
        }}
        className={`absolute z-10 overflow-hidden rounded-xl border border-[#171622]/12 ${priorityBorder} ${
          isCompleted
            ? 'bg-[#FAF9F6]/95 text-[#171622]/55'
            : item.hasConflict
              ? 'bg-[#FEF3C7]/95 text-[#171622]'
              : 'bg-white/95 text-[#171622]'
        } px-2.5 py-1 text-left shadow-2xs transition-all hover:border-[#171622]/35 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#171622]`}
        title={`${task.title} (${item.timeRangeLabel})${
          item.hasConflict ? ' • Overlapping time block' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            className={`truncate text-xs font-bold ${
              isCompleted ? 'line-through text-[#171622]/50' : 'text-[#171622]'
            }`}
          >
            {task.title}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {item.hasConflict && (
              <span
                className="inline-flex items-center gap-0.5 rounded bg-[#FDE68A] px-1 py-0.5 text-[9px] font-bold text-[#92400E]"
                title="Overlaps with another scheduled item"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                <span>Overlap</span>
              </span>
            )}
          </div>
        </div>
        {heightPx >= 40 && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-[#171622]/65 tabular-nums">
            <span>{item.timeRangeLabel}</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header: Title, Timezone & Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622]">
              Calendar
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/10 bg-white px-2.5 py-1 text-xs font-medium text-[#171622]/70">
              <Clock className="h-3.5 w-3.5 text-[#5938B5]" />
              <span>{activeTimezone}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#171622]/65">
            Manage your schedule, meetings, notes, and file attachments in one place.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unscheduled Tasks Toggle */}
          <button
            type="button"
            onClick={() => setShowUnscheduledTray((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
              showUnscheduledTray
                ? 'border-[#171622] bg-[#EBE8F8] text-[#171622]'
                : 'border-[#171622]/12 bg-white text-[#171622] hover:bg-[#FAF9F6]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Tasks ({unscheduledTasks.length})</span>
          </button>

          {/* Add Task Button */}
          <button
            type="button"
            onClick={() => handleOpenCreateTaskSlot(selectedDate, 9, false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-3.5 py-2 text-xs font-bold text-[#171622] hover:bg-[#FAF9F6] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Task</span>
          </button>

          {/* New Event Button (Primary) */}
          <button
            type="button"
            onClick={() => handleOpenCreateEventModal(selectedDate, 9, false)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5938B5] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-2xs hover:bg-[#4a2e9b] transition-all focus-visible:outline-2 focus-visible:outline-[#5938B5]"
          >
            <Plus className="h-4 w-4" />
            <span>New Event</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {bannerNotice && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-xs sm:text-sm ${
            bannerNotice.type === 'success'
              ? 'border-[#4D7C0F]/25 bg-[#ECFCCB]/60 text-[#365314]'
              : 'border-[#DC2626]/25 bg-[#FEF2F2] text-[#991B1B]'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{bannerNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerNotice(null)}
            className="text-xs font-semibold underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 rounded-2xl border border-[#171622]/10 bg-white p-3 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#171622]/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, meetings, or tasks..."
            className="w-full rounded-xl border border-[#171622]/12 bg-[#FAF9F6] pl-9 pr-8 py-1.5 text-xs text-[#171622] placeholder:text-[#171622]/40 focus:outline-none focus:ring-1 focus:ring-[#5938B5] focus:bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#171622]/40 hover:text-[#171622]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-[11px] font-semibold text-[#171622]/50 pl-1 shrink-0">Category:</span>
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#171622] text-white font-semibold'
                  : 'bg-[#FAF9F6] text-[#171622]/70 hover:bg-[#171622]/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Unscheduled Tasks Drawer */}
      {showUnscheduledTray && (
        <section
          aria-label="Unscheduled tasks tray"
          className="rounded-2xl border border-[#171622]/12 bg-white p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#171622]/70">
                Unscheduled Tasks ({unscheduledTasks.length})
              </h2>
              <p className="text-xs text-[#171622]/60">
                Assign any task to a 1-hour slot on your selected date ({selectedDate}).
              </p>
            </div>
          </div>

          {unscheduledTasks.length === 0 ? (
            <p className="text-xs text-[#171622]/55 py-2">
              All active tasks currently have a scheduled time block, or you have no unscheduled tasks.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {unscheduledTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#171622]">
                      {task.title}
                    </p>
                    <p className="truncate text-[11px] text-[#171622]/55">
                      {task.dueDisplayLabel ? `Due: ${task.dueDisplayLabel}` : 'No deadline'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickUpdateTask(task.id, {
                        scheduledDate: selectedDate,
                        scheduledEndDate: selectedDate,
                        scheduledStartTime: '09:00',
                        scheduledEndTime: '10:00',
                        durationMinutes: 60,
                        isAllDay: false,
                      })
                    }
                    className="shrink-0 rounded-lg bg-[#5938B5] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#4a2e9b] transition-colors"
                  >
                    Schedule 9 AM
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Main Navigation & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[#171622]/10 bg-white px-4 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Navigation Controls */}
          <div className="inline-flex items-center rounded-xl border border-[#171622]/12 bg-[#FAF9F6] p-0.5">
            <button
              type="button"
              onClick={() => handleNavigate('prev')}
              aria-label="Previous period"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622] hover:bg-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('today')}
              className="px-3 py-1 text-xs font-semibold text-[#171622] hover:bg-white rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('next')}
              aria-label="Next period"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622] hover:bg-white transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h2 className="font-display text-base sm:text-lg font-bold text-[#171622] px-1">
            {calendarData?.headingLabel || period.headingLabel}
          </h2>

          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBE8F8]/75 px-2.5 py-1 text-xs font-semibold text-[#5938B5]">
            <span>Selected:</span>
            <span className="tabular-nums">{selectedDate}</span>
          </span>
        </div>

        {/* View Switcher Tabs: Month / Week / Day / Agenda */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <div
            role="tablist"
            aria-label="Calendar view mode"
            className="inline-flex items-center rounded-xl border border-[#171622]/12 bg-[#FAF9F6] p-1"
          >
            {(['month', 'week', 'day', 'agenda'] as const).map((mode) => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleSelectViewMode(mode)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                    active
                      ? 'bg-[#171622] text-[#FAF9F6] shadow-2xs'
                      : 'text-[#171622]/70 hover:text-[#171622]'
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error state */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-[#DC2626]/25 bg-[#FEF2F2] px-4 py-3 text-xs text-[#991B1B]"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => fetchCalendarData(viewMode, anchorDate)}
            className="inline-flex items-center gap-1 font-semibold underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Main Grid & Optional Left Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
        {/* Left Sidebar: Mini Month Calendar & Upcoming Events */}
        <div className="space-y-4">
          {/* Mini Calendar Widget */}
          <div className="rounded-2xl border border-[#171622]/10 bg-white p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#171622]">
                {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
                  new Date(anchorDate + 'T12:00:00Z')
                )}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleNavigate('prev')}
                  className="rounded p-1 text-[#171622]/60 hover:bg-[#FAF9F6] hover:text-[#171622]"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('next')}
                  className="rounded p-1 text-[#171622]/60 hover:bg-[#FAF9F6] hover:text-[#171622]"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Mini Grid Header */}
            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-[#171622]/40">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div key={i} className="py-0.5">
                  {d}
                </div>
              ))}
            </div>

            {/* Mini Grid Days */}
            <div className="grid grid-cols-7 text-center gap-y-1">
              {period.days.slice(0, 35).map((day) => {
                const isSelected = selectedDate === day.dateKey;
                const isToday = day.isToday;
                const dayData = dayScheduleMap.get(day.dateKey);
                const hasItems =
                  (dayData?.allDayEvents.length ?? 0) > 0 ||
                  (dayData?.timedItems.length ?? 0) > 0 ||
                  (dayData?.allDayTasks.length ?? 0) > 0;

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day.dateKey);
                      setAnchorDate(day.dateKey);
                    }}
                    className={`relative mx-auto flex h-6 w-6 flex-col items-center justify-center rounded-full text-[11px] font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#171622] text-white shadow-2xs'
                        : isToday
                          ? 'bg-[#5938B5]/15 text-[#5938B5] font-bold'
                          : day.isCurrentMonth
                            ? 'text-[#171622]/80 hover:bg-[#FAF9F6]'
                            : 'text-[#171622]/30'
                    }`}
                  >
                    <span>{day.dayOfMonth}</span>
                    {hasItems && !isSelected && (
                      <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#5938B5]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upcoming Events Box */}
          <div className="rounded-2xl border border-[#171622]/10 bg-white p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-[#5938B5]" />
                Upcoming Events ({upcomingEvents.length})
              </span>
              <button
                type="button"
                onClick={() => handleOpenCreateEventModal(todayLocalDate, 10, false)}
                className="text-[11px] font-bold text-[#5938B5] hover:underline"
              >
                + Add
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-[#171622]/50 italic px-1 py-1">
                No upcoming events scheduled.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                {upcomingEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setDetailEventId(ev.id)}
                    className="w-full text-left rounded-xl border border-[#171622]/8 bg-[#FAF9F6] p-2 hover:bg-white hover:border-[#5938B5]/40 transition-all text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[#171622] truncate">{ev.title}</span>
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: ev.color || '#5938B5' }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#171622]/60">
                      <span>{ev.startDate}</span>
                      <span>•</span>
                      <span>{ev.displayTimeLabel}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Calendar View Body (Month / Week / Day / Agenda) */}
        <div>
          {/* MONTH VIEW */}
          {viewMode === 'month' && (
            <section
              aria-label="Month calendar view"
              className="rounded-2xl border border-[#171622]/10 bg-white overflow-hidden shadow-2xs"
            >
              {/* Weekday Header Row */}
              <div className="grid grid-cols-7 border-b border-[#171622]/10 bg-[#FAF9F6]">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName) => (
                  <div
                    key={dayName}
                    className="py-2.5 text-center text-xs font-bold uppercase tracking-wider text-[#171622]/60"
                  >
                    {dayName}
                  </div>
                ))}
              </div>

              {/* 42-Day Month Grid */}
              <div className="grid grid-cols-7 divide-x divide-y divide-[#171622]/8">
                {period.days.map((day) => {
                  const dayData = dayScheduleMap.get(day.dateKey);
                  const isSelected = selectedDate === day.dateKey;
                  const allItemsCount =
                    (dayData?.allDayEvents.length ?? 0) +
                    (dayData?.allDayTasks.length ?? 0) +
                    (dayData?.timedItems.length ?? 0) +
                    (dayData?.deadlineOnlyTasks.length ?? 0);

                  return (
                    <div
                      key={day.dateKey}
                      onClick={() => setSelectedDate(day.dateKey)}
                      onDoubleClick={() => handleOpenCreateEventModal(day.dateKey, 9, false)}
                      className={`min-h-[118px] sm:min-h-[132px] p-2 transition-colors cursor-pointer ${
                        !day.isCurrentMonth
                          ? 'bg-[#FAF9F6]/60 text-[#171622]/40'
                          : 'bg-white'
                      } ${
                        isSelected
                          ? 'ring-2 ring-inset ring-[#171622]'
                          : 'hover:bg-[#FAF9F6]/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day.dateKey);
                            setAnchorDate(day.dateKey);
                            setViewMode('day');
                          }}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                            day.isToday
                              ? 'bg-[#5938B5] text-white shadow-2xs'
                              : isSelected
                                ? 'bg-[#171622] text-[#FAF9F6]'
                                : 'text-[#171622] hover:bg-[#171622]/8'
                          }`}
                          title={`View ${day.fullLabel}`}
                        >
                          {day.dayOfMonth}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCreateEventModal(day.dateKey, 9, false);
                          }}
                          aria-label={`Create event on ${day.dateKey}`}
                          className="opacity-60 hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-md text-[#171622]/55 hover:bg-[#171622]/8 hover:text-[#171622]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Day Items */}
                      <div className="space-y-1">
                        {/* All-Day Events */}
                        {dayData?.allDayEvents.slice(0, 2).map((ev) => (
                          <button
                            key={`m-allday-ev-${ev.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailEventId(ev.id);
                            }}
                            style={{
                              backgroundColor: `${ev.color || '#5938B5'}20`,
                              borderLeftColor: ev.color || '#5938B5',
                            }}
                            className="w-full truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[10px] font-bold text-[#171622] hover:opacity-90 transition-opacity"
                          >
                            {ev.title}
                          </button>
                        ))}

                        {/* All-Day Tasks */}
                        {dayData?.allDayTasks.slice(0, 2).map((task) => (
                          <button
                            key={`m-allday-${task.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailTaskId(task.id);
                            }}
                            className="w-full truncate rounded-md bg-[#EBE8F8] px-1.5 py-0.5 text-left text-[10px] font-semibold text-[#171622] hover:bg-[#ded9f4]"
                          >
                            Task: {task.title}
                          </button>
                        ))}

                        {/* Timed Items (Events & Tasks) */}
                        {dayData?.timedItems.slice(0, 3).map((item) => {
                          if (item.source === 'calendar_event' && item.event) {
                            return (
                              <button
                                key={`m-ev-${item.event.id}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailEventId(item.event!.id);
                                }}
                                style={{
                                  borderLeftColor: item.event.color || '#5938B5',
                                  backgroundColor: `${item.event.color || '#5938B5'}12`,
                                }}
                                className="w-full truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[10px] font-medium text-[#171622] hover:bg-white"
                              >
                                <span className="font-bold tabular-nums">
                                  {item.event.startTime}
                                </span>{' '}
                                {item.event.title}
                              </button>
                            );
                          }
                          if (!item.task) return null;
                          return (
                            <button
                              key={`m-hr-${item.task.id}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailTaskId(item.task!.id);
                              }}
                              className={`w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[10px] font-medium ${
                                item.hasConflict
                                  ? 'border-[#F59E0B] bg-[#FEF3C7] text-[#92400E]'
                                  : 'border-[#171622]/10 bg-[#FAF9F6] text-[#171622] hover:bg-[#FAF9F6]/80'
                              }`}
                            >
                              <span className="font-bold tabular-nums">
                                {item.task.scheduledStartTime}
                              </span>{' '}
                              {item.task.title}
                            </button>
                          );
                        })}

                        {allItemsCount > 4 && (
                          <p className="text-[9px] font-bold text-[#5938B5] pl-1">
                            +{allItemsCount - 4} more
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* WEEK & DAY VIEWS */}
          {(viewMode === 'week' || viewMode === 'day') && (
            <section
              aria-label={`${viewMode === 'week' ? 'Week' : 'Day'} hourly calendar view`}
              className="rounded-2xl border border-[#171622]/10 bg-white overflow-hidden shadow-2xs"
            >
              <div className="overflow-x-auto">
                <div className={viewMode === 'week' ? 'min-w-[720px]' : 'min-w-[300px]'}>
                  {/* Column Header */}
                  <div
                    className={`grid border-b border-[#171622]/10 bg-[#FAF9F6] ${
                      viewMode === 'week'
                        ? 'grid-cols-[64px_repeat(7,minmax(0,1fr))]'
                        : 'grid-cols-[64px_minmax(0,1fr)]'
                    }`}
                  >
                    <div className="p-2 flex items-center justify-center border-r border-[#171622]/8 text-[10px] font-bold uppercase tracking-wider text-[#171622]/50">
                      Time
                    </div>

                    {period.days.map((day) => {
                      const isSelected = selectedDate === day.dateKey;
                      const dayData = dayScheduleMap.get(day.dateKey);
                      const hasConflicts = (dayData?.conflictCount ?? 0) > 0;
                      return (
                        <div
                          key={`hdr-${day.dateKey}`}
                          onClick={() => setSelectedDate(day.dateKey)}
                          className={`p-2 border-r last:border-r-0 border-[#171622]/8 cursor-pointer transition-colors ${
                            day.isToday
                              ? 'bg-[#5938B5]/10'
                              : isSelected
                                ? 'bg-[#EBE8F8]/50'
                                : 'hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#171622]/65">
                              {day.weekdayShort}
                            </span>
                            {hasConflicts && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded bg-[#FEF3C7] px-1 py-0.2 text-[9px] font-bold text-[#92400E]"
                                title="Has overlapping items"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                <span>Overlap</span>
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${
                                day.isToday
                                  ? 'bg-[#5938B5] text-white shadow-2xs'
                                  : isSelected
                                    ? 'bg-[#171622] text-[#FAF9F6]'
                                    : 'text-[#171622]'
                              }`}
                            >
                              {day.dayOfMonth}
                            </span>
                            {viewMode === 'day' && (
                              <span className="text-xs font-semibold text-[#171622]/75">
                                {day.fullLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* All-Day Items Bar */}
                  <div
                    className={`grid border-b border-[#171622]/10 bg-white ${
                      viewMode === 'week'
                        ? 'grid-cols-[64px_repeat(7,minmax(0,1fr))]'
                        : 'grid-cols-[64px_minmax(0,1fr)]'
                    }`}
                  >
                    <div className="p-2 flex flex-col items-center justify-center border-r border-[#171622]/8 text-[10px] font-bold uppercase tracking-wider text-[#171622]/55 text-center leading-tight">
                      <span>All-day</span>
                    </div>

                    {period.days.map((day) => {
                      const dayData = dayScheduleMap.get(day.dateKey);
                      const allDayEvs = dayData?.allDayEvents ?? [];
                      const allDayTasks = dayData?.allDayTasks ?? [];
                      const deadlineTasks = dayData?.deadlineOnlyTasks ?? [];

                      return (
                        <div
                          key={`allday-${day.dateKey}`}
                          className="min-h-[44px] p-1.5 border-r last:border-r-0 border-[#171622]/8 space-y-1"
                        >
                          {allDayEvs.map((ev) => (
                            <button
                              key={`ad-ev-${ev.id}`}
                              type="button"
                              onClick={() => setDetailEventId(ev.id)}
                              style={{
                                backgroundColor: `${ev.color || '#5938B5'}20`,
                                borderLeftColor: ev.color || '#5938B5',
                              }}
                              className="w-full truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[10px] font-bold text-[#171622] hover:opacity-90"
                            >
                              {ev.title}
                            </button>
                          ))}

                          {allDayTasks.map((task) => (
                            <button
                              key={`ad-${task.id}`}
                              type="button"
                              onClick={() => setDetailTaskId(task.id)}
                              className="w-full truncate rounded-md bg-[#EBE8F8] px-1.5 py-0.5 text-left text-[10px] font-semibold text-[#171622] hover:bg-[#ded9f4]"
                            >
                              Task: {task.title}
                            </button>
                          ))}

                          {deadlineTasks.map((task) => (
                            <button
                              key={`dl-${task.id}`}
                              type="button"
                              onClick={() => setDetailTaskId(task.id)}
                              className="w-full flex items-center justify-between gap-1 truncate rounded-md border border-dashed border-[#DC2626]/35 bg-[#FEF2F2]/75 px-1.5 py-0.5 text-left text-[10px] font-semibold text-[#991B1B]"
                            >
                              <span className="truncate">
                                <Flag className="inline h-2 w-2 mr-1" />
                                {task.title}
                              </span>
                            </button>
                          ))}

                          {allDayEvs.length === 0 && allDayTasks.length === 0 && deadlineTasks.length === 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenCreateEventModal(day.dateKey, 9, true)}
                              className="w-full h-full min-h-[26px] rounded-lg text-[10px] text-[#171622]/30 hover:bg-[#FAF9F6] hover:text-[#171622]/60 transition-colors"
                            >
                              + All-day
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Hourly Grid (Scrollable) */}
                  <div
                    ref={timeGridScrollRef}
                    className="relative max-h-[640px] overflow-y-auto"
                  >
                    <div
                      className={`grid ${
                        viewMode === 'week'
                          ? 'grid-cols-[64px_repeat(7,minmax(0,1fr))]'
                          : 'grid-cols-[64px_minmax(0,1fr)]'
                      }`}
                    >
                      {/* Left Hourly Labels Column */}
                      <div className="border-r border-[#171622]/8 bg-[#FAF9F6] select-none">
                        {HOUR_ROWS.map((slot) => (
                          <div
                            key={`lbl-${slot.hour}`}
                            style={{ height: `${HOUR_ROW_HEIGHT_PX}px` }}
                            className="relative border-b border-[#171622]/6 pr-2 pt-1 text-right text-[11px] font-semibold tabular-nums text-[#171622]/55"
                          >
                            {slot.label}
                          </div>
                        ))}
                      </div>

                      {/* Day Columns */}
                      {period.days.map((day) => {
                        const dayData = dayScheduleMap.get(day.dateKey);
                        const timedItems = dayData?.timedItems ?? [];

                        return (
                          <div
                            key={`col-${day.dateKey}`}
                            style={{ height: `${24 * HOUR_ROW_HEIGHT_PX}px` }}
                            className={`relative border-r last:border-r-0 border-[#171622]/8 ${
                              day.isToday ? 'bg-[#5938B5]/3' : 'bg-white'
                            }`}
                          >
                            {/* 24 Interactive Hour Cells */}
                            {HOUR_ROWS.map((slot) => (
                              <button
                                key={`slot-${day.dateKey}-${slot.hour}`}
                                type="button"
                                onClick={() => handleOpenCreateEventModal(day.dateKey, slot.hour, false)}
                                aria-label={`Create event on ${day.dateKey} at ${slot.label}`}
                                style={{ height: `${HOUR_ROW_HEIGHT_PX}px` }}
                                className="group block w-full border-b border-[#171622]/6 text-left transition-colors hover:bg-[#5938B5]/10 focus-visible:outline-none"
                              >
                                <span className="opacity-0 group-hover:opacity-100 pl-2 pt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#5938B5]">
                                  <Plus className="h-3 w-3" />
                                  <span>{slot.label}</span>
                                </span>
                              </button>
                            ))}

                            {/* Positioned Item Blocks */}
                            {timedItems.map((item) => renderHourlyItemBlock(item))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* AGENDA VIEW */}
          {viewMode === 'agenda' && (
            <section
              aria-label="Agenda calendar view"
              className="rounded-2xl border border-[#171622]/10 bg-white p-5 shadow-2xs space-y-6"
            >
              <div className="flex items-center justify-between border-b border-[#171622]/10 pb-3">
                <h3 className="font-bold text-sm text-[#171622]">
                  Upcoming Agenda ({period.headingLabel})
                </h3>
                <span className="text-xs text-[#171622]/50 font-medium">
                  {period.days.length} days scheduled
                </span>
              </div>

              <div className="space-y-6">
                {period.days.map((day) => {
                  const dayData = dayScheduleMap.get(day.dateKey);
                  const allDayEvents = dayData?.allDayEvents ?? [];
                  const allDayTasks = dayData?.allDayTasks ?? [];
                  const timedItems = dayData?.timedItems ?? [];
                  const deadlineTasks = dayData?.deadlineOnlyTasks ?? [];

                  const totalCount =
                    allDayEvents.length +
                    allDayTasks.length +
                    timedItems.length +
                    deadlineTasks.length;

                  if (totalCount === 0) return null;

                  return (
                    <div key={`agenda-day-${day.dateKey}`} className="space-y-2">
                      {/* Day Header */}
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-bold ${
                            day.isToday
                              ? 'bg-[#5938B5] text-white shadow-2xs'
                              : 'bg-[#FAF9F6] border border-[#171622]/15 text-[#171622]'
                          }`}
                        >
                          {day.weekdayShort}, {day.monthShort} {day.dayOfMonth}
                        </span>
                        {day.isToday && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5938B5]">
                            Today
                          </span>
                        )}
                        <div className="flex-1 h-px bg-[#171622]/10" />
                      </div>

                      {/* Items List */}
                      <div className="space-y-2 pl-2 sm:pl-4">
                        {/* All-Day Events */}
                        {allDayEvents.map((ev) => (
                          <div
                            key={`ag-ev-ad-${ev.id}`}
                            onClick={() => setDetailEventId(ev.id)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3 hover:bg-white hover:border-[#5938B5]/40 transition-all cursor-pointer"
                          >
                            <div className="flex items-start gap-2.5">
                              <span
                                className="h-3 w-3 rounded-full shrink-0 mt-0.5"
                                style={{ backgroundColor: ev.color || '#5938B5' }}
                              />
                              <div>
                                <h4 className="font-bold text-xs text-[#171622]">{ev.title}</h4>
                                <div className="flex items-center gap-2 text-[11px] text-[#171622]/60 pt-0.5">
                                  <span className="font-semibold text-[#5938B5]">All Day</span>
                                  <span>•</span>
                                  <span>{ev.category}</span>
                                </div>
                              </div>
                            </div>
                            {ev.meetingUrl && (
                              <a
                                href={ev.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#1D4ED8]"
                              >
                                <Video className="h-3.5 w-3.5" />
                                <span>Join</span>
                              </a>
                            )}
                          </div>
                        ))}

                        {/* Timed Items */}
                        {timedItems.map((item) => {
                          if (item.source === 'calendar_event' && item.event) {
                            const ev = item.event;
                            return (
                              <div
                                key={`ag-ev-${ev.id}`}
                                onClick={() => setDetailEventId(ev.id)}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-[#171622]/10 bg-white p-3 hover:border-[#5938B5]/50 hover:shadow-2xs transition-all cursor-pointer"
                              >
                                <div className="flex items-start gap-2.5">
                                  <span
                                    className="h-3 w-3 rounded-full shrink-0 mt-0.5"
                                    style={{ backgroundColor: ev.color || '#5938B5' }}
                                  />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-bold text-xs text-[#171622]">{ev.title}</h4>
                                      <span
                                        className="text-[10px] font-semibold px-1.5 py-0.2 rounded"
                                        style={{ backgroundColor: `${ev.color || '#5938B5'}20`, color: ev.color || '#5938B5' }}
                                      >
                                        {ev.category}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-[#171622]/60 pt-0.5">
                                      <Clock className="h-3 w-3 text-[#171622]/40" />
                                      <span className="font-semibold tabular-nums">{item.timeRangeLabel}</span>
                                      {(ev.attachments ?? []).length > 0 && (
                                        <>
                                          <span>•</span>
                                          <span className="flex items-center gap-0.5 text-[10px]">
                                            <Paperclip className="h-3 w-3" />
                                            {ev.attachments!.length}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {ev.meetingUrl && (
                                  <a
                                    href={ev.meetingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1D4ED8] transition-colors"
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                    <span>Join Meeting</span>
                                  </a>
                                )}
                              </div>
                            );
                          }

                          if (item.task) {
                            const task = item.task;
                            return (
                              <div
                                key={`ag-task-${task.id}`}
                                onClick={() => setDetailTaskId(task.id)}
                                className="flex items-center justify-between gap-2 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3 hover:bg-white hover:border-[#171622]/30 transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="h-2 w-2 rounded-sm bg-[#171622]" />
                                  <div>
                                    <h4 className="font-bold text-xs text-[#171622]">{task.title}</h4>
                                    <span className="text-[11px] text-[#171622]/60 font-semibold tabular-nums">
                                      {item.timeRangeLabel}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-semibold text-[#171622]/50">
                                  LifeCraft Task
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  );
                })}

                {period.days.every((d) => {
                  const data = dayScheduleMap.get(d.dateKey);
                  return (
                    (data?.allDayEvents.length ?? 0) === 0 &&
                    (data?.allDayTasks.length ?? 0) === 0 &&
                    (data?.timedItems.length ?? 0) === 0 &&
                    (data?.deadlineOnlyTasks.length ?? 0) === 0
                  );
                }) && (
                  <div className="text-center py-12 text-[#171622]/50 space-y-2">
                    <CalendarIcon className="h-8 w-8 mx-auto text-[#171622]/30" />
                    <p className="text-xs">No scheduled events or tasks found for this period.</p>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateEventModal(todayLocalDate, 9, false)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#5938B5] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#4a2e9b]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create an event</span>
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Task Creation Modal */}
      <TaskFormModal
        key={`cal-task-modal-${editingTask?.id ?? 'new'}-${prefillSchedule?.scheduledDate ?? ''}-${prefillSchedule?.scheduledStartTime ?? ''}-${prefillSchedule?.isAllDay ? 'allday' : 'timed'}`}
        isOpen={isTaskModalOpen}
        mode={editingTask ? 'edit' : 'create'}
        initialTask={editingTask}
        defaultScheduledDate={prefillSchedule?.scheduledDate ?? ''}
        defaultScheduledStartTime={prefillSchedule?.scheduledStartTime ?? ''}
        defaultDurationMinutes={prefillSchedule?.durationMinutes ?? 60}
        defaultIsAllDay={prefillSchedule?.isAllDay ?? false}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
          setPrefillSchedule(null);
        }}
        onSubmit={handleTaskFormSubmit}
      />

      {/* Calendar Event Modal (Create / Edit) */}
      <CalendarEventModal
        isOpen={isEventModalOpen}
        mode={eventModalMode}
        initialEvent={editingEvent}
        defaultDate={prefillEventDate}
        defaultStartTime={prefillEventTime}
        defaultIsAllDay={prefillEventIsAllDay}
        timezone={activeTimezone}
        onClose={() => {
          setIsEventModalOpen(false);
          setEditingEvent(null);
        }}
        onSaved={async (savedEvent) => {
          setBannerNotice({
            type: 'success',
            message: `Event "${savedEvent.title}" has been saved.`,
          });
          await fetchCalendarData(viewMode, anchorDate);
        }}
      />

      {/* Calendar Event Detail Sheet */}
      <CalendarEventDetailSheet
        event={detailEvent}
        onClose={() => setDetailEventId(null)}
        onEditEvent={handleOpenEditEventModal}
        onDeleteEvent={handleDeleteEvent}
        onEventUpdated={async () => {
          await fetchCalendarData(viewMode, anchorDate);
        }}
      />

      {/* Scheduled Task Details Sheet */}
      <CalendarTaskDetailSheet
        task={detailTask}
        conflictingTitles={detailTaskConflictingTitles}
        onClose={() => setDetailTaskId(null)}
        onEditTask={(task) => {
          setDetailTaskId(null);
          setEditingTask(task);
          setPrefillSchedule(null);
          setIsTaskModalOpen(true);
        }}
        onDeleteTask={(task) => {
          setDetailTaskId(null);
          setDeletingTask(task);
        }}
        onQuickUpdateTask={handleQuickUpdateTask}
      />

      {/* Delete Task Confirmation Modal */}
      <DeleteTaskDialog
        task={deletingTask}
        onClose={() => setDeletingTask(null)}
        onConfirmDelete={handleConfirmDeleteTask}
        onArchiveInstead={handleArchiveTaskInstead}
      />
    </div>
  );
}
