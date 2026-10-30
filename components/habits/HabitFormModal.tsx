'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import {
  HABIT_DESCRIPTION_MAX_LENGTH,
  HABIT_TITLE_MAX_LENGTH,
  ISO_WEEKDAYS,
  type HabitViewItem,
} from '@/lib/habits/habit-utils';

export interface HabitFormSubmitPayload {
  title: string;
  description: string | null;
  targetPerWeek: number;
  scheduledDays: number[] | null;
  isActive?: boolean;
}

interface HabitFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialHabit?: HabitViewItem | null;
  onClose: () => void;
  onSubmit: (payload: HabitFormSubmitPayload) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
}

export default function HabitFormModal({
  isOpen,
  mode,
  initialHabit,
  onClose,
  onSubmit,
}: HabitFormModalProps) {
  const [title, setTitle] = useState<string>(
    mode === 'edit' && initialHabit ? initialHabit.title : ''
  );
  const [description, setDescription] = useState<string>(
    mode === 'edit' && initialHabit ? initialHabit.description ?? '' : ''
  );
  const [targetPerWeek, setTargetPerWeek] = useState<number>(
    mode === 'edit' && initialHabit ? initialHabit.targetPerWeek : 5
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(
    mode === 'edit' && initialHabit
      ? initialHabit.scheduledDays && initialHabit.scheduledDays.length > 0
        ? [...initialHabit.scheduledDays]
        : []
      : [1, 2, 3, 4, 5]
  );
  const [isActive, setIsActive] = useState<boolean>(
    mode === 'edit' && initialHabit ? initialHabit.isActive : true
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleToggleDay = (day: number) => {
    setSelectedDays((prev) => {
      const exists = prev.includes(day);
      const next = exists
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b);
      if (next.length > 0 && next.length <= 7) {
        setTargetPerWeek(next.length);
      }
      return next;
    });
  };

  const handleTargetChange = (newTarget: number) => {
    setTargetPerWeek(newTarget);
    if (newTarget === 7) {
      setSelectedDays([1, 2, 3, 4, 5, 6, 7]);
    } else if (newTarget === 5 && selectedDays.length === 7) {
      setSelectedDays([1, 2, 3, 4, 5]);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldErrors({ title: 'Habit name is required.' });
      setErrorMessage('Habit name is required.');
      return;
    }

    if (trimmedTitle.length > HABIT_TITLE_MAX_LENGTH) {
      setFieldErrors({
        title: `Habit name must be ${HABIT_TITLE_MAX_LENGTH} characters or fewer.`,
      });
      setErrorMessage(
        `Habit name must be ${HABIT_TITLE_MAX_LENGTH} characters or fewer.`
      );
      return;
    }

    if (description.trim().length > HABIT_DESCRIPTION_MAX_LENGTH) {
      setFieldErrors({
        description: `Description must be ${HABIT_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      });
      setErrorMessage(
        `Description must be ${HABIT_DESCRIPTION_MAX_LENGTH} characters or fewer.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setFieldErrors({});

    try {
      const result = await onSubmit({
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
        targetPerWeek,
        scheduledDays:
          selectedDays.length > 0 && selectedDays.length < 7
            ? selectedDays
            : selectedDays.length === 7
              ? [1, 2, 3, 4, 5, 6, 7]
              : null,
        ...(mode === 'edit' ? { isActive } : {}),
      });

      if (!result.ok) {
        setErrorMessage(
          result.message || 'Could not save habit. Please check your input.'
        );
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else {
        onClose();
      }
    } catch {
      setErrorMessage('Network error while saving habit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="habit-form-modal-title"
    >
      <div
        className="fixed inset-0 bg-[#171622]/40 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="habit-form-modal-title"
            className="font-display text-lg font-bold text-[#171622]"
          >
            {mode === 'create' ? 'Add New Habit' : 'Edit Habit'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/55 hover:bg-[#FAF9F6] hover:text-[#171622] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3.5 py-2.5 text-xs text-[#B42318]"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Name Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="habit-name-input"
              className="block text-xs font-semibold text-[#171622]"
            >
              Name <span className="text-[#B42318]">*</span>
            </label>
            <input
              id="habit-name-input"
              type="text"
              required
              maxLength={HABIT_TITLE_MAX_LENGTH}
              placeholder="e.g. Read for 20 minutes"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) {
                  setFieldErrors((prev) => ({ ...prev, title: '' }));
                }
              }}
              aria-invalid={Boolean(fieldErrors.title)}
              className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6]/60 px-3.5 py-2.5 text-sm text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:bg-white focus:outline-none transition-colors"
            />
            <div className="flex items-center justify-between text-[11px] text-[#171622]/50">
              <span>{fieldErrors.title || ''}</span>
              <span className="tabular-nums">
                {title.length}/{HABIT_TITLE_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Description Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="habit-description-input"
              className="block text-xs font-semibold text-[#171622]"
            >
              Description (optional)
            </label>
            <textarea
              id="habit-description-input"
              rows={3}
              maxLength={HABIT_DESCRIPTION_MAX_LENGTH}
              placeholder="Add more details about your habit..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (fieldErrors.description) {
                  setFieldErrors((prev) => ({ ...prev, description: '' }));
                }
              }}
              aria-invalid={Boolean(fieldErrors.description)}
              className="w-full resize-none rounded-xl border border-[#171622]/15 bg-[#FAF9F6]/60 px-3.5 py-2.5 text-sm text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:bg-white focus:outline-none transition-colors"
            />
            <div className="flex items-center justify-between text-[11px] text-[#171622]/50">
              <span>{fieldErrors.description || ''}</span>
              <span className="tabular-nums">
                {description.length}/{HABIT_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Weekly Target Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="habit-weekly-target-select"
              className="block text-xs font-semibold text-[#171622]"
            >
              Weekly target <span className="text-[#B42318]">*</span>
            </label>
            <select
              id="habit-weekly-target-select"
              value={targetPerWeek}
              onChange={(e) => handleTargetChange(Number(e.target.value))}
              className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6]/60 px-3.5 py-2.5 text-sm font-medium text-[#171622] focus:border-[#171622] focus:bg-white focus:outline-none transition-colors"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                <option key={num} value={num}>
                  {num} {num === 1 ? 'day' : 'days'} per week
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[#171622]/55">
              How many days per week do you want to complete this habit?
            </p>
          </div>

          {/* Repeat on (optional) Weekday Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-semibold text-[#171622]">
                Repeat on (optional)
              </span>
              {selectedDays.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDays([])}
                  className="text-[11px] font-medium text-[#5938B5] hover:underline"
                >
                  Any day ({targetPerWeek}x/wk)
                </button>
              )}
            </div>
            <div
              role="group"
              aria-label="Scheduled days of week"
              className="grid grid-cols-7 gap-1.5"
            >
              {ISO_WEEKDAYS.map((dayMeta) => {
                const isSelected = selectedDays.includes(dayMeta.isoDay);
                return (
                  <button
                    key={dayMeta.isoDay}
                    type="button"
                    onClick={() => handleToggleDay(dayMeta.isoDay)}
                    aria-pressed={isSelected}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                      isSelected
                        ? 'bg-[#C8F27C] text-[#171622]'
                        : 'bg-[#FAF9F6] text-[#171622]/65 hover:bg-[#171622]/8 hover:text-[#171622]'
                    }`}
                  >
                    {dayMeta.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active / Paused state when editing */}
          {mode === 'edit' && (
            <div className="flex items-center justify-between rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3.5 py-2.5">
              <div>
                <p className="text-xs font-semibold text-[#171622]">
                  Active routine
                </p>
                <p className="text-[11px] text-[#171622]/60">
                  Paused habits are archived while preserving all historical
                  logs.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                  isActive ? 'bg-[#78C247]' : 'bg-[#171622]/25'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-150 ease-in-out ${
                    isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2.5 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors disabled:opacity-60"
            >
              {isSubmitting && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
              <span>
                {mode === 'create' ? 'Create habit' : 'Save changes'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
