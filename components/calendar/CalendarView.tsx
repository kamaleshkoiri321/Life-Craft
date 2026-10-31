'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
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

export default function CalendarView({
  todayLocalDate,
  timezone,
  onTasksMutated,
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [anchorDate, setAnchorDate] = useState<string>(todayLocalDate);
  const [selectedDate, setSelectedDate] = useState<string>(todayLocalDate);

  const [calendarData, setCalendarData] = useState<CalendarDataPayload | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modals & sheets state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<SerializedTaskItem | null>(
    null
  );
  const [prefillSchedule, setPrefillSchedule] =
    useState<InitialSchedulePrefill | null>(null);

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState<SerializedTaskItem | null>(
    null
  );
  const [showUnscheduledTray, setShowUnscheduledTray] = useState(false);

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
        const result = (await response
          .json()
          .catch(() => null)) as CalendarQueryResult | null;

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
        const result = (await response
          .json()
          .catch(() => null)) as CalendarQueryResult | null;
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
      // 6 AM = 6 * 60px = 360px
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
  // Combine rangeTasks + unscheduledTasks for lookup by ID
  const allKnownTasks = useMemo(() => {
    const map = new Map<string, SerializedTaskItem>();
    for (const t of rangeTasks) map.set(t.id, t);
    for (const t of unscheduledTasks) map.set(t.id, t);
    return Array.from(map.values());
  }, [rangeTasks, unscheduledTasks]);

  // Build per-day schedule layout map
  const dayScheduleMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildDayScheduleData>>();
    for (const day of period.days) {
      map.set(
        day.dateKey,
        buildDayScheduleData({
          day,
          tasks: rangeTasks,
          timezone: activeTimezone,
        })
      );
    }
    return map;
  }, [period.days, rangeTasks, activeTimezone]);

  const detailTask = useMemo(
    () =>
      detailTaskId
        ? allKnownTasks.find((t) => t.id === detailTaskId) ?? null
        : null,
    [detailTaskId, allKnownTasks]
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

  const handleOpenCreateAtSlot = (
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
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (
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

  const renderHourlyItemBlock = (item: CalendarTimedLayoutItem) => {
    const topPx = (item.startMinutes / 60) * HOUR_ROW_HEIGHT_PX;
    const heightPx = Math.max(
      26,
      (item.visualDurationMinutes / 60) * HOUR_ROW_HEIGHT_PX - 2
    );

    const widthPercent = 100 / item.totalColumns;
    const leftPercent = item.columnIndex * widthPercent;

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
        } px-2.5 py-1.5 text-left shadow-2xs transition-all hover:border-[#171622]/35 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#171622]`}
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
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
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
    <div className="space-y-5">
      {/* Page Title + Primary Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622]">
              Calendar
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/10 bg-white px-2.5 py-1 text-xs font-medium text-[#171622]/70">
              <Clock className="h-3.5 w-3.5 text-[#5938B5]" aria-hidden="true" />
              <span>{activeTimezone}</span>
            </span>
          </div>
          <p className="text-sm text-[#171622]/65">
            Time-block your day and manage deadlines with LifeCraft&apos;s native schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Unscheduled Tasks Tray Toggle */}
          <button
            type="button"
            onClick={() => setShowUnscheduledTray((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ${
              showUnscheduledTray
                ? 'border-[#171622] bg-[#EBE8F8] text-[#171622]'
                : 'border-[#171622]/12 bg-white text-[#171622] hover:bg-[#FAF9F6]'
            }`}
          >
            <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Unscheduled ({unscheduledTasks.length})</span>
          </button>

          {/* Add Scheduled Task Button */}
          <button
            type="button"
            onClick={() => handleOpenCreateAtSlot(selectedDate, 9, false)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add task</span>
          </button>
        </div>
      </div>

      {/* Status / OAuth Feedback Banner */}
      {bannerNotice && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs sm:text-sm ${
            bannerNotice.type === 'success'
              ? 'border-[#4D7C0F]/25 bg-[#ECFCCB]/60 text-[#365314]'
              : 'border-[#DC2626]/25 bg-[#FEF2F2] text-[#991B1B]'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
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


      {/* Unscheduled Tasks Quick-Schedule Bar */}
      {showUnscheduledTray && (
        <section
          aria-label="Unscheduled tasks tray"
          className="rounded-2xl border border-[#171622]/12 bg-white p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#171622]/70">
                Unscheduled Tasks ({unscheduledTasks.length})
              </h2>
              <p className="text-xs text-[#171622]/60">
                Assign any task below to a 1-hour slot on your selected date (
                <strong className="font-semibold text-[#171622]">
                  {selectedDate}
                </strong>
                ) without altering its deadline.
              </p>
            </div>
          </div>

          {unscheduledTasks.length === 0 ? (
            <p className="text-xs text-[#171622]/55 py-2">
              All active tasks currently have a scheduled time block, or you have
              no unscheduled tasks.
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
                      {task.dueDisplayLabel
                        ? `Due: ${task.dueDisplayLabel}`
                        : 'No deadline'}
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
                    className="shrink-0 rounded-lg bg-[#C8F27C] px-2.5 py-1.5 text-[11px] font-semibold text-[#171622] hover:bg-[#b8e668] transition-colors"
                  >
                    Schedule 9 AM
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Calendar Navigation & View Switcher Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[#171622]/10 bg-white px-4 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-[#171622]/12 bg-[#FAF9F6] p-0.5">
            <button
              type="button"
              onClick={() => handleNavigate('prev')}
              aria-label="Previous period"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622] hover:bg-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
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
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <h2
            data-testid="calendar-period-heading"
            className="font-display text-base sm:text-lg font-bold text-[#171622] px-1"
          >
            {calendarData?.headingLabel || period.headingLabel}
          </h2>

          {/* Selected Date Pill */}
          <span
            data-testid="selected-date-indicator"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBE8F8]/75 px-2.5 py-1 text-xs font-semibold text-[#5938B5]"
          >
            <span>Selected:</span>
            <span className="tabular-nums">{selectedDate}</span>
          </span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          {(viewMode === 'week' || viewMode === 'day') && (
            <button
              type="button"
              onClick={scrollToSixAm}
              className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-2.5 py-1.5 text-[11px] font-semibold text-[#171622]/75 hover:text-[#171622] transition-colors"
              title="Jump scroll position to 6:00 AM"
            >
              6 AM – 11 PM
            </button>
          )}

          {/* View Switcher (Month / Week / Day) */}
          <div
            role="tablist"
            aria-label="Calendar view mode"
            className="inline-flex items-center rounded-xl border border-[#171622]/12 bg-[#FAF9F6] p-1"
          >
            {(['month', 'week', 'day'] as const).map((mode) => {
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
                      ? 'bg-[#171622] text-[#FAF9F6]'
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

      {/* Loading & Error states */}
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
                (dayData?.allDayTasks.length ?? 0) +
                (dayData?.timedItems.length ?? 0) +
                (dayData?.deadlineOnlyTasks.length ?? 0);

              return (
                <div
                  key={day.dateKey}
                  onClick={() => setSelectedDate(day.dateKey)}
                  onDoubleClick={() =>
                    handleOpenCreateAtSlot(day.dateKey, 9, false)
                  }
                  className={`min-h-[112px] sm:min-h-[128px] p-2 transition-colors cursor-pointer ${
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
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        day.isToday
                          ? 'bg-[#C8F27C] text-[#171622] border border-[#171622]/15'
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
                        handleOpenCreateAtSlot(day.dateKey, 9, false);
                      }}
                      aria-label={`Schedule task on ${day.dateKey}`}
                      className="opacity-70 hover:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded-md text-[#171622]/55 hover:bg-[#171622]/8 hover:text-[#171622]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Compact Day Indicators */}
                  <div className="space-y-1">
                    {dayData?.allDayTasks.slice(0, 2).map((task) => (
                      <button
                        key={`m-allday-${task.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailTaskId(task.id);
                        }}
                        className="w-full truncate rounded-md bg-[#EBE8F8] px-1.5 py-0.5 text-left text-[11px] font-semibold text-[#171622] hover:bg-[#ded9f4]"
                      >
                        All-day • {task.title}
                      </button>
                    ))}

                    {dayData?.timedItems.slice(0, 3).map((item) => {
                      if (!item.task) return null;
                      return (
                        <button
                          key={`m-hr-${item.task.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailTaskId(item.task!.id);
                          }}
                          className={`w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium ${
                            item.hasConflict
                              ? 'border-[#F59E0B] bg-[#FEF3C7] text-[#92400E]'
                              : 'border-[#171622]/10 bg-[#FAF9F6] text-[#171622] hover:bg-[#C8F27C]/40'
                          }`}
                        >
                          <span className="font-bold tabular-nums">
                            {item.task.scheduledStartTime}
                          </span>{' '}
                          {item.task.title}
                        </button>
                      );
                    })}

                    {dayData?.deadlineOnlyTasks.slice(0, 2).map((task) => (
                      <button
                        key={`m-due-${task.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailTaskId(task.id);
                        }}
                        className="w-full truncate rounded-md border border-dashed border-[#DC2626]/35 bg-[#FEF2F2]/70 px-1.5 py-0.5 text-left text-[10px] font-semibold text-[#991B1B]"
                      >
                        Due • {task.title}
                      </button>
                    ))}

                    {allItemsCount > 4 && (
                      <p className="text-[10px] font-semibold text-[#5938B5] pl-1">
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

      {/* WEEK & DAY HOURLY VIEWS */}
      {(viewMode === 'week' || viewMode === 'day') && (
        <section
          aria-label={`${viewMode === 'week' ? 'Week' : 'Day'} hourly calendar view`}
          className="rounded-2xl border border-[#171622]/10 bg-white overflow-hidden shadow-2xs"
        >
          <div className="overflow-x-auto">
            <div
              className={
                viewMode === 'week' ? 'min-w-[760px]' : 'min-w-[320px]'
              }
            >
              {/* Day Column Header Bar */}
              <div
                className={`grid border-b border-[#171622]/10 bg-[#FAF9F6] ${
                  viewMode === 'week'
                    ? 'grid-cols-[68px_repeat(7,minmax(0,1fr))]'
                    : 'grid-cols-[68px_minmax(0,1fr)]'
                }`}
              >
                <div className="p-2.5 flex items-center justify-center border-r border-[#171622]/8 text-[10px] font-bold uppercase tracking-wider text-[#171622]/50">
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
                      className={`p-2.5 border-r last:border-r-0 border-[#171622]/8 cursor-pointer transition-colors ${
                        day.isToday
                          ? 'bg-[#C8F27C]/25'
                          : isSelected
                            ? 'bg-[#EBE8F8]/50'
                            : 'hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#171622]/65">
                          {day.weekdayShort}
                        </span>
                        {hasConflicts && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold text-[#92400E]"
                            title="Has overlapping scheduled tasks"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            <span>Conflict</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${
                            day.isToday
                              ? 'bg-[#C8F27C] text-[#171622] border border-[#171622]/15'
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

              {/* All-Day & Deadlines Row (Keeps deadline-only tasks separate from hourly slots) */}
              <div
                className={`grid border-b border-[#171622]/10 bg-white ${
                  viewMode === 'week'
                    ? 'grid-cols-[68px_repeat(7,minmax(0,1fr))]'
                    : 'grid-cols-[68px_minmax(0,1fr)]'
                }`}
              >
                <div className="p-2 flex flex-col items-center justify-center border-r border-[#171622]/8 text-[10px] font-bold uppercase tracking-wider text-[#171622]/55 text-center leading-tight">
                  <span>All-day</span>
                  <span className="text-[9px] font-normal text-[#171622]/45">
                    & Due
                  </span>
                </div>

                {period.days.map((day) => {
                  const dayData = dayScheduleMap.get(day.dateKey);
                  const allDayTasks = dayData?.allDayTasks ?? [];
                  const deadlineTasks = dayData?.deadlineOnlyTasks ?? [];
                  const isEmpty =
                    allDayTasks.length === 0 &&
                    deadlineTasks.length === 0;

                  return (
                    <div
                      key={`allday-${day.dateKey}`}
                      className="min-h-[46px] p-1.5 border-r last:border-r-0 border-[#171622]/8 space-y-1"
                    >
                      {allDayTasks.map((task) => (
                        <button
                          key={`ad-${task.id}`}
                          type="button"
                          onClick={() => {
                            setDetailTaskId(task.id);
                          }}
                          className="w-full truncate rounded-lg bg-[#EBE8F8] px-2 py-1 text-left text-[11px] font-semibold text-[#171622] hover:bg-[#ded9f4]"
                        >
                          All-day: {task.title}
                        </button>
                      ))}

                      {deadlineTasks.map((task) => (
                        <button
                          key={`dl-${task.id}`}
                          type="button"
                          onClick={() => {
                            setDetailTaskId(task.id);
                          }}
                          className="w-full flex items-center justify-between gap-1 truncate rounded-lg border border-dashed border-[#DC2626]/35 bg-[#FEF2F2]/75 px-2 py-1 text-left text-[11px] font-semibold text-[#991B1B] hover:bg-[#FEE2E2]"
                          title="Deadline-only task (not assigned an arbitrary hourly slot). Click to schedule or inspect."
                        >
                          <span className="truncate">
                            <Flag className="inline h-2.5 w-2.5 mr-1" />
                            Due: {task.title}
                          </span>
                          {task.dueTime && (
                            <span className="text-[10px] shrink-0 tabular-nums">
                              {task.dueTime}
                            </span>
                          )}
                        </button>
                      ))}

                      {isEmpty && (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCreateAtSlot(day.dateKey, 9, true)
                          }
                          className="w-full h-full min-h-[28px] rounded-lg text-[10px] text-[#171622]/35 hover:bg-[#FAF9F6] hover:text-[#171622]/70 transition-colors"
                        >
                          + All-day
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Vertically Scrollable 24-Hour Grid (Initial scroll positioned at 6 AM - 11 PM) */}
              <div
                ref={timeGridScrollRef}
                data-testid="calendar-hourly-scroll-grid"
                className="relative max-h-[640px] overflow-y-auto"
              >
                <div
                  className={`grid ${
                    viewMode === 'week'
                      ? 'grid-cols-[68px_repeat(7,minmax(0,1fr))]'
                      : 'grid-cols-[68px_minmax(0,1fr)]'
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

                  {/* Day Columns with Empty-Slot Click Prefill & Positioned Task Blocks */}
                  {period.days.map((day) => {
                    const dayData = dayScheduleMap.get(day.dateKey);
                    const timedItems = dayData?.timedItems ?? [];

                    return (
                      <div
                        key={`col-${day.dateKey}`}
                        style={{ height: `${24 * HOUR_ROW_HEIGHT_PX}px` }}
                        className={`relative border-r last:border-r-0 border-[#171622]/8 ${
                          day.isToday ? 'bg-[#C8F27C]/6' : 'bg-white'
                        }`}
                      >
                        {/* 24 Interactive Hour Cells */}
                        {HOUR_ROWS.map((slot) => (
                          <button
                            key={`slot-${day.dateKey}-${slot.hour}`}
                            type="button"
                            data-testid={`slot-${day.dateKey}-${slot.hour}`}
                            onClick={() =>
                              handleOpenCreateAtSlot(
                                day.dateKey,
                                slot.hour,
                                false
                              )
                            }
                            aria-label={`Schedule task on ${day.dateKey} at ${slot.label}`}
                            style={{ height: `${HOUR_ROW_HEIGHT_PX}px` }}
                            className={`group block w-full border-b border-[#171622]/6 text-left transition-colors hover:bg-[#C8F27C]/20 focus-visible:outline-none focus-visible:bg-[#C8F27C]/25 ${
                              !slot.isInitialVisibleRange
                                ? 'bg-[#FAF9F6]/50'
                                : ''
                            }`}
                          >
                            <span className="opacity-0 group-hover:opacity-100 pl-2 pt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#171622]/65">
                              <Plus className="h-3 w-3" />
                              <span>{slot.label}</span>
                            </span>
                          </button>
                        ))}

                        {/* Positioned Scheduled Tasks */}
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

      {/* Legend & Quick Info Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#171622]/8 bg-white px-4 py-3 text-xs text-[#171622]/65">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#171622]" />
            <span>Scheduled LifeCraft Task</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#DC2626] bg-[#FEF2F2]" />
            <span>Task Deadline (Due Date)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#F59E0B]" />
            <span>Overlapping Slot Warning</span>
          </span>
        </div>

        {isLoading && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5938B5]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Syncing schedule...</span>
          </span>
        )}
      </div>

      {/* Create / Edit Task Modal (Reused from Phase 4A + Extended with Schedule Support) */}
      <TaskFormModal
        key={`cal-task-modal-${editingTask?.id ?? 'new'}-${prefillSchedule?.scheduledDate ?? ''}-${prefillSchedule?.scheduledStartTime ?? ''}-${prefillSchedule?.isAllDay ? 'allday' : 'timed'}`}
        isOpen={isFormModalOpen}
        mode={editingTask ? 'edit' : 'create'}
        initialTask={editingTask}
        defaultScheduledDate={prefillSchedule?.scheduledDate ?? ''}
        defaultScheduledStartTime={prefillSchedule?.scheduledStartTime ?? ''}
        defaultDurationMinutes={prefillSchedule?.durationMinutes ?? 60}
        defaultIsAllDay={prefillSchedule?.isAllDay ?? false}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingTask(null);
          setPrefillSchedule(null);
        }}
        onSubmit={handleFormSubmit}
      />

      {/* Scheduled Task Details & Accessible Reschedule Sheet */}
      <CalendarTaskDetailSheet
        task={detailTask}
        conflictingTitles={detailTaskConflictingTitles}
        onClose={() => {
          setDetailTaskId(null);
        }}
        onEditTask={(task) => {
          setDetailTaskId(null);
          setEditingTask(task);
          setPrefillSchedule(null);
          setIsFormModalOpen(true);
        }}
        onDeleteTask={(task) => {
          setDetailTaskId(null);
          setDeletingTask(task);
        }}
        onQuickUpdateTask={handleQuickUpdateTask}
      />

      {/* Delete Confirmation Modal */}
      <DeleteTaskDialog
        task={deletingTask}
        onClose={() => setDeletingTask(null)}
        onConfirmDelete={handleConfirmDeleteTask}
        onArchiveInstead={handleArchiveTaskInstead}
      />
    </div>
  );
}
