'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  ChevronDown,
  Circle,
  Clock,
  Loader2,
  X,
} from 'lucide-react';
import { shiftLocalDateString } from '@/lib/queries/timezone';
import { normalizeTo24HourTime } from '@/lib/calendar/event-validation';
import type {
  SerializedTaskItem,
  TaskPriority,
  TaskStatus,
} from '@/lib/tasks/validation';

export interface TaskFormSubmitPayload {
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  dueTime: string;
  scheduledDate?: string;
  scheduledEndDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  durationMinutes?: number;
  isAllDay?: boolean;
}

interface TaskFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialTask?: SerializedTaskItem | null;
  defaultDueDate?: string;
  defaultScheduledDate?: string;
  defaultScheduledStartTime?: string;
  defaultDurationMinutes?: number;
  defaultIsAllDay?: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskFormSubmitPayload) => Promise<{
    ok: boolean;
    error?: string;
    fieldErrors?: Record<string, string>;
  }>;
}

const PRIORITY_OPTIONS: {
  value: TaskPriority;
  label: string;
  dotColor: string;
}[] = [
  { value: 'low', label: 'Low', dotColor: 'bg-[#78C247]' },
  { value: 'medium', label: 'Medium', dotColor: 'bg-[#6941C6]' },
  { value: 'high', label: 'High', dotColor: 'bg-[#E11D48]' },
];

const DURATION_PRESETS = [
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
];

function computeEndTimeFromStartAndDuration(
  startDate: string,
  startTime: string,
  durationMinutes: number
): { endTime: string; endDate: string } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime.trim());
  if (!match) {
    return { endTime: '', endDate: startDate };
  }
  const startTotalMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endTotalMinutes = startTotalMinutes + durationMinutes;
  const dayOverflow = Math.floor(endTotalMinutes / 1440);
  const wrappedMinutes = ((endTotalMinutes % 1440) + 1440) % 1440;
  const endH = Math.floor(wrappedMinutes / 60);
  const endM = wrappedMinutes % 60;
  const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  const endDate =
    dayOverflow > 0 && startDate
      ? shiftLocalDateString(startDate, dayOverflow)
      : startDate;
  return { endTime, endDate };
}

export default function TaskFormModal({
  isOpen,
  mode,
  initialTask,
  defaultDueDate = '',
  defaultScheduledDate = '',
  defaultScheduledStartTime = '',
  defaultDurationMinutes = 60,
  defaultIsAllDay = false,
  onClose,
  onSubmit,
}: TaskFormModalProps) {
  const isEdit = mode === 'edit' && Boolean(initialTask);

  const initialSchedDate =
    isEdit && initialTask
      ? initialTask.scheduledDate ?? ''
      : defaultScheduledDate;
  const initialSchedStart = normalizeTo24HourTime(
    isEdit && initialTask
      ? initialTask.scheduledStartTime ?? ''
      : defaultScheduledStartTime,
    ''
  );
  const initialDuration =
    isEdit && initialTask && initialTask.durationMinutes
      ? initialTask.durationMinutes
      : defaultDurationMinutes;
  const initialComputedEnd =
    initialSchedStart && !initialTask?.scheduledEndTime
      ? computeEndTimeFromStartAndDuration(
          initialSchedDate,
          initialSchedStart,
          initialDuration
        )
      : {
          endTime: normalizeTo24HourTime(
            isEdit && initialTask ? initialTask.scheduledEndTime ?? '' : '',
            ''
          ),
          endDate:
            isEdit && initialTask
              ? initialTask.scheduledEndDate ?? initialSchedDate
              : initialSchedDate,
        };

  const [title, setTitle] = useState(
    isEdit && initialTask ? initialTask.title : ''
  );
  const [description, setDescription] = useState(
    isEdit && initialTask ? initialTask.description ?? '' : ''
  );
  const [priority, setPriority] = useState<TaskPriority>(
    isEdit && initialTask ? initialTask.priority : 'medium'
  );
  const [status, setStatus] = useState<TaskStatus>(
    isEdit && initialTask ? initialTask.status : 'todo'
  );
  const [dueDate, setDueDate] = useState(
    isEdit && initialTask ? initialTask.dueDate ?? '' : defaultDueDate
  );
  const [dueTime, setDueTime] = useState(
    normalizeTo24HourTime(
      isEdit && initialTask ? initialTask.dueTime ?? '' : '',
      ''
    )
  );

  // Phase 4B Calendar Scheduling state
  const [isAllDay, setIsAllDay] = useState<boolean>(
    isEdit && initialTask ? initialTask.isAllDay : defaultIsAllDay
  );
  const [scheduledDate, setScheduledDate] = useState<string>(initialSchedDate);
  const [scheduledEndDate, setScheduledEndDate] = useState<string>(
    initialComputedEnd.endDate
  );
  const [scheduledStartTime, setScheduledStartTime] =
    useState<string>(initialSchedStart);
  const [scheduledEndTime, setScheduledEndTime] = useState<string>(
    initialComputedEnd.endTime
  );
  const [durationMinutes, setDurationMinutes] =
    useState<number>(initialDuration);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleStartTimeChange = (nextStart: string) => {
    setScheduledStartTime(nextStart);
    if (nextStart) {
      const computed = computeEndTimeFromStartAndDuration(
        scheduledDate,
        nextStart,
        durationMinutes
      );
      setScheduledEndTime(computed.endTime);
      setScheduledEndDate(computed.endDate);
    }
  };

  const handleDurationSelect = (mins: number) => {
    setDurationMinutes(mins);
    const baseStart = scheduledStartTime || '09:00';
    if (!scheduledStartTime) {
      setScheduledStartTime(baseStart);
    }
    const computed = computeEndTimeFromStartAndDuration(
      scheduledDate,
      baseStart,
      mins
    );
    setScheduledEndTime(computed.endTime);
    setScheduledEndDate(computed.endDate);
  };

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldErrors({ title: 'Please enter a task title.' });
      setErrorMessage('Please enter a task title.');
      return;
    }

    if (dueTime.trim() && !dueDate.trim()) {
      setFieldErrors({
        dueDate: 'Please select a due date when setting a due time.',
      });
      setErrorMessage('Please select a due date when setting a due time.');
      return;
    }

    const trimmedSchedDate = scheduledDate.trim();
    const trimmedSchedStart = scheduledStartTime.trim();
    const trimmedSchedEnd = scheduledEndTime.trim();

    if (!isAllDay && (trimmedSchedStart || trimmedSchedEnd) && !trimmedSchedDate) {
      setFieldErrors({
        scheduledDate: 'Please select a scheduled date for this time block.',
      });
      setErrorMessage('Please select a scheduled date for this time block.');
      return;
    }

    if (!isAllDay && trimmedSchedDate && !trimmedSchedStart) {
      setFieldErrors({
        scheduledStartTime:
          'Please select a start time or check All-day schedule.',
      });
      setErrorMessage('Please select a start time or check All-day schedule.');
      return;
    }

    if (isAllDay && !trimmedSchedDate) {
      setFieldErrors({
        scheduledDate: 'Please select a date for this all-day task.',
      });
      setErrorMessage('Please select a date for this all-day task.');
      return;
    }

    let effectiveEndDate = scheduledEndDate.trim() || trimmedSchedDate;
    if (
      !isAllDay &&
      trimmedSchedDate &&
      trimmedSchedStart &&
      trimmedSchedEnd &&
      effectiveEndDate === trimmedSchedDate &&
      trimmedSchedEnd <= trimmedSchedStart
    ) {
      setFieldErrors({
        scheduledEndTime: 'Scheduled end time must be after the start time.',
      });
      setErrorMessage('Scheduled end time must be after the start time.');
      return;
    }

    if (isAllDay) {
      effectiveEndDate = trimmedSchedDate;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
        priority,
        status,
        dueDate: dueDate.trim(),
        dueTime: dueTime.trim(),
        scheduledDate: trimmedSchedDate,
        scheduledEndDate: effectiveEndDate,
        scheduledStartTime: isAllDay ? '' : trimmedSchedStart,
        scheduledEndTime: isAllDay ? '' : trimmedSchedEnd,
        durationMinutes,
        isAllDay,
      });

      if (!result.ok) {
        setErrorMessage(
          result.error || 'Could not save task. Please try again.'
        );
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else {
        onClose();
      }
    } catch {
      setErrorMessage('Unable to save task right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/45 p-4 backdrop-blur-[2px] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-form-modal-title"
    >
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <div className="relative z-10 my-auto w-full max-w-[500px] rounded-2xl border border-[#171622]/10 bg-white p-6 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="task-form-modal-title"
            className="font-display text-xl font-bold text-[#171622]"
          >
            {mode === 'edit' ? 'Edit Task' : 'Add New Task'}
          </h2>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close task form"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} noValidate className="mt-5 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-[#B42318]/25 bg-[#FEF3F2] px-3.5 py-2.5 text-xs sm:text-sm text-[#B42318]"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label
              htmlFor="task-title-input"
              className="block text-xs font-semibold text-[#171622] mb-1.5"
            >
              Title <span className="text-[#E11D48]">*</span>
            </label>
            <input
              id="task-title-input"
              name="title"
              type="text"
              required
              maxLength={200}
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) {
                  setFieldErrors((prev) => ({ ...prev, title: '' }));
                }
              }}
              placeholder="Complete project report"
              aria-invalid={Boolean(fieldErrors.title)}
              className="w-full rounded-xl border border-[#171622]/12 bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#171622] placeholder:text-[#171622]/40 focus:border-[#5938B5] focus:bg-white focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <span className="text-[11px] text-[#171622]/45 tabular-nums">
                {title.length}/200
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-description-input"
              className="block text-xs font-semibold text-[#171622] mb-1.5"
            >
              Description (optional)
            </label>
            <textarea
              id="task-description-input"
              name="description"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Finish the final draft and submit before deadline."
              className="w-full rounded-xl border border-[#171622]/12 bg-[#FAF9F6] px-3.5 py-2 text-sm text-[#171622] placeholder:text-[#171622]/40 focus:border-[#5938B5] focus:bg-white focus:outline-none resize-none"
            />
            <div className="mt-1 flex justify-end">
              <span className="text-[11px] text-[#171622]/45 tabular-nums">
                {description.length}/500
              </span>
            </div>
          </div>

          {/* Priority 3-Option Segmented Selector */}
          <div>
            <span
              id="task-priority-group-label"
              className="block text-xs font-semibold text-[#171622] mb-1.5"
            >
              Priority
            </span>
            <div
              role="radiogroup"
              aria-labelledby="task-priority-group-label"
              className="grid grid-cols-3 gap-2.5"
            >
              {PRIORITY_OPTIONS.map((opt) => {
                const isSelected = priority === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setPriority(opt.value)}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2 px-3 text-xs sm:text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                      isSelected
                        ? 'border-[#5938B5] bg-[#F5F3FF] text-[#171622] ring-1 ring-[#5938B5]/30'
                        : 'border-[#171622]/12 bg-[#FAF9F6] text-[#171622]/75 hover:border-[#171622]/25 hover:bg-white'
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${opt.dotColor}`}
                      aria-hidden="true"
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Time Block (Phase 4B) */}
          <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6]/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock
                  className="h-4 w-4 text-[#5938B5]"
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-[#171622]">
                  Calendar schedule (optional)
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#171622]/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllDay}
                    onChange={(e) => {
                      const nextAllDay = e.target.checked;
                      setIsAllDay(nextAllDay);
                      if (nextAllDay) {
                        setScheduledStartTime('');
                        setScheduledEndTime('');
                      } else if (scheduledDate && !scheduledStartTime) {
                        handleStartTimeChange('09:00');
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-[#171622]/25 text-[#171622] focus:ring-[#5938B5]"
                  />
                  <span>All-day</span>
                </label>

                {(scheduledDate || scheduledStartTime || isAllDay) && (
                  <button
                    type="button"
                    onClick={() => {
                      setScheduledDate('');
                      setScheduledEndDate('');
                      setScheduledStartTime('');
                      setScheduledEndTime('');
                      setIsAllDay(false);
                    }}
                    className="text-[11px] font-semibold text-[#171622]/60 hover:text-[#B42318] transition-colors"
                  >
                    Clear schedule
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label
                  htmlFor="task-scheduled-date-input"
                  className="block text-[11px] font-semibold text-[#171622]/75 mb-1"
                >
                  Scheduled date
                </label>
                <input
                  id="task-scheduled-date-input"
                  name="scheduledDate"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setScheduledDate(nextDate);
                    setScheduledEndDate(nextDate);
                    if (nextDate && !isAllDay && !scheduledStartTime) {
                      const computed = computeEndTimeFromStartAndDuration(
                        nextDate,
                        '09:00',
                        durationMinutes
                      );
                      setScheduledStartTime('09:00');
                      setScheduledEndTime(computed.endTime);
                      setScheduledEndDate(computed.endDate);
                    }
                  }}
                  className="w-full rounded-xl border border-[#171622]/12 bg-white px-2.5 py-2 text-xs text-[#171622] focus:border-[#5938B5] focus:outline-none"
                />
              </div>

              {!isAllDay && (
                <>
                  <div>
                    <label
                      htmlFor="task-scheduled-start-input"
                      className="block text-[11px] font-semibold text-[#171622]/75 mb-1"
                    >
                      Start time
                    </label>
                    <input
                      id="task-scheduled-start-input"
                      name="scheduledStartTime"
                      type="time"
                      value={normalizeTo24HourTime(scheduledStartTime, '')}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      className="w-full rounded-xl border border-[#171622]/12 bg-white px-2.5 py-2 text-xs text-[#171622] focus:border-[#5938B5] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="task-scheduled-end-input"
                      className="block text-[11px] font-semibold text-[#171622]/75 mb-1"
                    >
                      End time
                    </label>
                    <input
                      id="task-scheduled-end-input"
                      name="scheduledEndTime"
                      type="time"
                      value={normalizeTo24HourTime(scheduledEndTime, '')}
                      onChange={(e) => {
                        setScheduledEndTime(e.target.value);
                        if (scheduledDate) {
                          setScheduledEndDate(scheduledDate);
                        }
                      }}
                      className="w-full rounded-xl border border-[#171622]/12 bg-white px-2.5 py-2 text-xs text-[#171622] focus:border-[#5938B5] focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            {!isAllDay && scheduledDate && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <span className="text-[11px] font-medium text-[#171622]/60">
                  Duration preset:
                </span>
                <div className="flex items-center gap-1.5">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.minutes}
                      type="button"
                      onClick={() => handleDurationSelect(preset.minutes)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        durationMinutes === preset.minutes
                          ? 'bg-[#171622] text-[#FAF9F6]'
                          : 'bg-white border border-[#171622]/12 text-[#171622]/75 hover:bg-[#171622]/5'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Due Date & Due Time (Deadline) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="task-due-date-input"
                className="block text-xs font-semibold text-[#171622] mb-1.5"
              >
                Due date (deadline)
              </label>
              <div className="relative flex items-center">
                <Calendar
                  className="pointer-events-none absolute left-3 h-4 w-4 text-[#171622]/55"
                  aria-hidden="true"
                />
                <input
                  id="task-due-date-input"
                  name="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-[#171622]/12 bg-[#FAF9F6] pl-9 pr-8 py-2 text-xs sm:text-sm text-[#171622] focus:border-[#5938B5] focus:bg-white focus:outline-none"
                />
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setDueDate('');
                      setDueTime('');
                    }}
                    aria-label="Clear due date"
                    className="absolute right-2 rounded-md p-1 text-[#171622]/45 hover:text-[#171622]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="task-due-time-input"
                className="block text-xs font-semibold text-[#171622] mb-1.5"
              >
                Due time
              </label>
              <div className="relative flex items-center">
                <Clock
                  className="pointer-events-none absolute left-3 h-4 w-4 text-[#171622]/55"
                  aria-hidden="true"
                />
                <input
                  id="task-due-time-input"
                  name="dueTime"
                  type="time"
                  value={normalizeTo24HourTime(dueTime, '')}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full rounded-xl border border-[#171622]/12 bg-[#FAF9F6] pl-9 pr-8 py-2 text-xs sm:text-sm text-[#171622] focus:border-[#5938B5] focus:bg-white focus:outline-none"
                />
                {dueTime && (
                  <button
                    type="button"
                    onClick={() => setDueTime('')}
                    aria-label="Clear due time"
                    className="absolute right-2 rounded-md p-1 text-[#171622]/45 hover:text-[#171622]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label
              htmlFor="task-status-select"
              className="block text-xs font-semibold text-[#171622] mb-1.5"
            >
              Status
            </label>
            <div className="relative flex items-center">
              <Circle
                className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#171622]/50"
                aria-hidden="true"
              />
              <select
                id="task-status-select"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full appearance-none rounded-xl border border-[#171622]/12 bg-[#FAF9F6] pl-9 pr-9 py-2 text-sm text-[#171622] focus:border-[#5938B5] focus:bg-white focus:outline-none"
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3.5 h-4 w-4 text-[#171622]/50"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-[#171622]/15 bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#171622]/5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              <span>
                {isSubmitting
                  ? mode === 'edit'
                    ? 'Updating...'
                    : 'Creating...'
                  : mode === 'edit'
                    ? 'Update task'
                    : 'Create task'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
