'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { shiftLocalDateString } from '@/lib/queries/timezone';
import type { SerializedTaskItem } from '@/lib/tasks/validation';
import type { ExternalGoogleCalendarEvent } from '@/lib/calendar/calendar-utils';

interface CalendarTaskDetailSheetProps {
  task: SerializedTaskItem | null;
  externalEvent: ExternalGoogleCalendarEvent | null;
  conflictingTitles?: string[];
  googleConnected: boolean;
  onClose: () => void;
  onEditTask: (task: SerializedTaskItem) => void;
  onDeleteTask: (task: SerializedTaskItem) => void;
  onQuickUpdateTask: (
    taskId: string,
    patch: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string }>;
  onExportedToGoogle: () => Promise<void>;
}

function shiftTime24ByMinutes(
  dateStr: string,
  timeStr: string,
  deltaMinutes: number
): { date: string; time: string } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr);
  if (!match) return { date: dateStr, time: timeStr };
  const total = Number(match[1]) * 60 + Number(match[2]) + deltaMinutes;
  const dayShift = Math.floor(total / 1440);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return {
    date: dayShift !== 0 ? shiftLocalDateString(dateStr, dayShift) : dateStr,
    time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  };
}

export default function CalendarTaskDetailSheet({
  task,
  externalEvent,
  conflictingTitles = [],
  googleConnected,
  onClose,
  onEditTask,
  onDeleteTask,
  onQuickUpdateTask,
  onExportedToGoogle,
}: CalendarTaskDetailSheetProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  if (!task && !externalEvent) return null;

  // External Google Calendar Event Detail Modal
  if (externalEvent && !task) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/45 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-external-event-title"
      >
        <div
          className="fixed inset-0"
          aria-hidden="true"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-2xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8]">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Google Calendar · External Event</span>
              </span>
              <h2
                id="calendar-external-event-title"
                className="font-display text-lg font-bold text-[#171622]"
              >
                {externalEvent.title}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close event details"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3.5 space-y-2 text-xs text-[#171622]/80">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-[#171622]/55" />
              <span>
                {externalEvent.isAllDay
                  ? `All day (${externalEvent.startDate})`
                  : externalEvent.startIso && externalEvent.endIso
                    ? `${new Date(externalEvent.startIso).toLocaleString()} – ${new Date(externalEvent.endIso).toLocaleTimeString()}`
                    : 'Scheduled event'}
              </span>
            </div>
            {externalEvent.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-[#171622]/55" />
                <span>{externalEvent.location}</span>
              </div>
            )}
          </div>

          {externalEvent.description && (
            <p className="text-xs sm:text-sm text-[#171622]/75 whitespace-pre-wrap leading-relaxed">
              {externalEvent.description}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {externalEvent.htmlLink ? (
              <a
                href={externalEvent.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8] hover:underline"
              >
                <span>Open in Google Calendar</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!task) return null;

  const handleShiftDay = async (deltaDays: number) => {
    if (!task.scheduledDate) return;
    setFeedback(null);
    setIsBusy(true);
    try {
      const nextDate = shiftLocalDateString(task.scheduledDate, deltaDays);
      const nextEndDate = task.scheduledEndDate
        ? shiftLocalDateString(task.scheduledEndDate, deltaDays)
        : nextDate;

      const res = await onQuickUpdateTask(task.id, {
        scheduledDate: nextDate,
        scheduledEndDate: nextEndDate,
        scheduledStartTime: task.isAllDay ? '' : task.scheduledStartTime || '09:00',
        scheduledEndTime: task.isAllDay ? '' : task.scheduledEndTime || '10:00',
        isAllDay: task.isAllDay,
      });

      if (!res.ok) {
        setFeedback({
          type: 'error',
          message: res.error || 'Could not reschedule task.',
        });
      } else {
        setFeedback({
          type: 'success',
          message: `Moved to ${nextDate}.`,
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleShiftTimeMinutes = async (deltaMinutes: number) => {
    if (!task.scheduledDate || !task.scheduledStartTime || task.isAllDay) return;
    setFeedback(null);
    setIsBusy(true);
    try {
      const duration = task.durationMinutes || 60;
      const shiftedStart = shiftTime24ByMinutes(
        task.scheduledDate,
        task.scheduledStartTime,
        deltaMinutes
      );
      const shiftedEnd = shiftTime24ByMinutes(
        shiftedStart.date,
        shiftedStart.time,
        duration
      );

      const res = await onQuickUpdateTask(task.id, {
        scheduledDate: shiftedStart.date,
        scheduledEndDate: shiftedEnd.date,
        scheduledStartTime: shiftedStart.time,
        scheduledEndTime: shiftedEnd.time,
        isAllDay: false,
      });

      if (!res.ok) {
        setFeedback({
          type: 'error',
          message: res.error || 'Could not shift scheduled time.',
        });
      } else {
        setFeedback({
          type: 'success',
          message: `Rescheduled to ${shiftedStart.time} – ${shiftedEnd.time}.`,
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleCompleted = async () => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
      const res = await onQuickUpdateTask(task.id, { status: nextStatus });
      if (!res.ok) {
        setFeedback({
          type: 'error',
          message: res.error || 'Could not update completion status.',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnschedule = async () => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await onQuickUpdateTask(task.id, {
        scheduledDate: '',
        scheduledStartAt: null,
        scheduledEndAt: null,
        isAllDay: false,
      });
      if (res.ok) {
        onClose();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Could not remove task from calendar schedule.',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportToGoogle = async () => {
    setFeedback(null);
    setIsExporting(true);
    try {
      const res = await fetch('/api/calendar/google/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId: task.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({
          type: 'error',
          message:
            data.message || 'Could not export this task to Google Calendar.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        message:
          data.message || 'Task exported to your primary Google Calendar.',
      });
      await onExportedToGoogle();
    } catch {
      setFeedback({
        type: 'error',
        message: 'Network error while exporting to Google Calendar.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/45 p-4 backdrop-blur-[2px] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-task-detail-title"
    >
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={() => {
          if (!isBusy && !isExporting) onClose();
        }}
      />

      <div className="relative z-10 my-auto w-full max-w-lg rounded-2xl border border-[#171622]/12 bg-white p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#171622]/65">
              <span className="font-semibold text-[#5938B5]">
                LifeCraft Task
              </span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">Priority: {task.priority}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">
                {task.status === 'in_progress' ? 'In progress' : task.status}
              </span>
            </div>

            <h2
              id="calendar-task-detail-title"
              className={`font-display text-lg sm:text-xl font-bold text-[#171622] ${
                task.status === 'completed' ? 'line-through opacity-65' : ''
              }`}
            >
              {task.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close task details"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Conflict Warning */}
        {conflictingTitles.length > 0 && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-[#D97706]/30 bg-[#FFFBEB] px-3.5 py-2.5 text-xs text-[#92400E]"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">Schedule overlap detected</p>
              <p className="mt-0.5 text-[#92400E]/85">
                Overlaps with: {conflictingTitles.join(', ')}. Both items are
                preserved side-by-side.
              </p>
            </div>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
              feedback.type === 'error'
                ? 'border-[#B42318]/25 bg-[#FEF3F2] text-[#B42318]'
                : 'border-[#2F6B1E]/25 bg-[#EAF7E1] text-[#2F6B1E]'
            }`}
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Schedule & Deadline Summary */}
        <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold text-[#171622]">
              <CalendarClock
                className="h-4 w-4 text-[#5938B5]"
                aria-hidden="true"
              />
              <span>Scheduled block:</span>
            </span>
            <span className="font-medium text-[#171622] tabular-nums">
              {task.scheduleDisplayLabel || 'Not scheduled on hourly grid'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold text-[#171622]/75">
              <Calendar
                className="h-4 w-4 text-[#171622]/55"
                aria-hidden="true"
              />
              <span>Deadline (due_at):</span>
            </span>
            <span className="text-[#171622]/80 tabular-nums">
              {task.dueDisplayLabel || 'No deadline'}
            </span>
          </div>
        </div>

        {task.description && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#171622]/70">
              Description
            </p>
            <p className="text-xs sm:text-sm text-[#171622]/80 whitespace-pre-wrap leading-relaxed">
              {task.description}
            </p>
          </div>
        )}

        {/* Accessible Quick Reschedule Controls (Keyboard/Button alternative to Drag-and-Drop) */}
        {task.scheduledDate && (
          <div className="rounded-xl border border-[#171622]/10 bg-white p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#171622]">
                <ArrowLeftRight
                  className="h-3.5 w-3.5 text-[#5938B5]"
                  aria-hidden="true"
                />
                <span>Quick reschedule</span>
              </span>
              {isBusy && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-[#5938B5]"
                  aria-hidden="true"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleShiftDay(-1)}
                className="rounded-lg border border-[#171622]/12 bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5 disabled:opacity-50"
              >
                ← Prev day
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleShiftDay(1)}
                className="rounded-lg border border-[#171622]/12 bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5 disabled:opacity-50"
              >
                Next day →
              </button>

              {!task.isAllDay && task.scheduledStartTime && (
                <>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleShiftTimeMinutes(-30)}
                    className="rounded-lg border border-[#171622]/12 bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5 disabled:opacity-50"
                  >
                    -30m
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleShiftTimeMinutes(30)}
                    className="rounded-lg border border-[#171622]/12 bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5 disabled:opacity-50"
                  >
                    +30m
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleShiftTimeMinutes(60)}
                    className="rounded-lg border border-[#171622]/12 bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5 disabled:opacity-50"
                  >
                    +1h
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={isBusy}
                onClick={handleUnschedule}
                className="ml-auto text-xs font-semibold text-[#171622]/60 hover:text-[#B42318] px-2 py-1"
              >
                Unschedule
              </button>
            </div>
          </div>
        )}

        {/* Google Calendar Export Section */}
        {task.scheduledStartAt && task.scheduledEndAt && (
          <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6]/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
            {task.googleEventId ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2F6B1E]">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Exported to Google Calendar</span>
                {task.googleHtmlLink && (
                  <a
                    href={task.googleHtmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline ml-1"
                  >
                    <span>View</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            ) : (
              <>
                <span className="text-xs text-[#171622]/75">
                  {googleConnected
                    ? 'Export this scheduled block to your Google Calendar'
                    : 'Connect Google Calendar to export scheduled tasks'}
                </span>
                <button
                  type="button"
                  disabled={!googleConnected || isExporting}
                  onClick={handleExportToGoogle}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5 disabled:opacity-50 whitespace-nowrap"
                >
                  {isExporting ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {isExporting ? 'Exporting...' : 'Export to Google Calendar'}
                  </span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#171622]/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditTask(task);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-3.5 py-2 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Edit task</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onDeleteTask(task);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#B42318]/20 bg-[#FEF3F2] px-3.5 py-2 text-xs font-semibold text-[#B42318] hover:bg-[#FEE4E2]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleToggleCompleted}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {task.status === 'completed'
                ? 'Reopen task'
                : 'Mark as completed'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
