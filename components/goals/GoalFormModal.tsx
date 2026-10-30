'use client';

import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Coins,
  Compass,
  Dumbbell,
  Loader2,
  Plus,
  Sprout,
  Trash2,
  X,
} from 'lucide-react';
import {
  GOAL_CATEGORIES,
  GOAL_DESCRIPTION_MAX_LENGTH,
  GOAL_TITLE_MAX_LENGTH,
  MILESTONE_TITLE_MAX_LENGTH,
  type GoalCategory,
  type GoalStatus,
  type SerializedGoalItem,
} from '@/lib/goals/goal-utils';

export interface GoalFormSubmitPayload {
  title: string;
  description: string | null;
  category: GoalCategory;
  targetDate: string | null;
  status: GoalStatus;
  progressPercent: number;
  initialMilestones?: Array<{ title: string; targetDate: string | null }>;
}

interface GoalFormModalProps {
  isOpen: boolean;
  editingGoal: SerializedGoalItem | null;
  onClose: () => void;
  onSubmit: (payload: GoalFormSubmitPayload) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
}

export function getCategoryIconAndStyle(
  category: GoalCategory,
  isCompleted = false
) {
  if (isCompleted) {
    return {
      Icon: Sprout,
      iconBg: 'bg-[#E9F8EF]',
      iconText: 'text-[#1E7E48]',
      pillBg: 'bg-[#E9F8EF]',
      pillText: 'text-[#1E7E48]',
      barColor: 'bg-[#419E6A]',
    };
  }

  switch (category) {
    case 'Personal Growth':
      return {
        Icon: Sprout,
        iconBg: 'bg-[#EEF8E8]',
        iconText: 'text-[#2E7D32]',
        pillBg: 'bg-[#EEF8E8]',
        pillText: 'text-[#2E7D32]',
        barColor: 'bg-[#63B838]',
      };
    case 'Health & Fitness':
      return {
        Icon: Dumbbell,
        iconBg: 'bg-[#F3EEFC]',
        iconText: 'text-[#6342C6]',
        pillBg: 'bg-[#F3EEFC]',
        pillText: 'text-[#6342C6]',
        barColor: 'bg-[#D960A8]',
      };
    case 'Learning':
      return {
        Icon: BookOpen,
        iconBg: 'bg-[#EDF5FF]',
        iconText: 'text-[#2563EB]',
        pillBg: 'bg-[#EDF5FF]',
        pillText: 'text-[#2563EB]',
        barColor: 'bg-[#8E6CE8]',
      };
    case 'Career':
      return {
        Icon: Briefcase,
        iconBg: 'bg-[#FDF0F3]',
        iconText: 'text-[#C83E65]',
        pillBg: 'bg-[#FDF0F3]',
        pillText: 'text-[#C83E65]',
        barColor: 'bg-[#5B8DEF]',
      };
    case 'Lifestyle':
      return {
        Icon: Compass,
        iconBg: 'bg-[#FFF7E6]',
        iconText: 'text-[#B7791F]',
        pillBg: 'bg-[#FFF7E6]',
        pillText: 'text-[#B7791F]',
        barColor: 'bg-[#F5B041]',
      };
    case 'Finance':
      return {
        Icon: Coins,
        iconBg: 'bg-[#E8F8F2]',
        iconText: 'text-[#1E7E5A]',
        pillBg: 'bg-[#E8F8F2]',
        pillText: 'text-[#1E7E5A]',
        barColor: 'bg-[#38A87D]',
      };
  }
}

export default function GoalFormModal({
  isOpen,
  editingGoal,
  onClose,
  onSubmit,
}: GoalFormModalProps) {
  const [title, setTitle] = useState(editingGoal?.title ?? '');
  const [description, setDescription] = useState(
    editingGoal?.description ?? ''
  );
  const [category, setCategory] = useState<GoalCategory>(
    editingGoal?.category ?? 'Personal Growth'
  );
  const [targetDate, setTargetDate] = useState<string>(
    editingGoal?.targetDate ?? ''
  );
  const [status, setStatus] = useState<GoalStatus>(
    editingGoal?.status ?? 'active'
  );
  const [progressPercent, setProgressPercent] = useState<number>(
    editingGoal?.progressPercent ?? 0
  );

  // Initial milestones when creating a new goal
  const [draftMilestones, setDraftMilestones] = useState<
    Array<{ title: string; targetDate: string }>
  >([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');

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

  const handleStatusChange = (nextStatus: GoalStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'completed') {
      setProgressPercent(100);
    } else if (
      status === 'completed' &&
      (nextStatus === 'active' || nextStatus === 'paused') &&
      progressPercent === 100
    ) {
      setProgressPercent(90);
    }
  };

  const handleProgressChange = (nextVal: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(nextVal || 0)));
    setProgressPercent(clamped);
    if (clamped === 100 && status !== 'archived') {
      setStatus('completed');
    } else if (clamped < 100 && status === 'completed') {
      setStatus('active');
    }
  };

  const handleAddDraftMilestone = () => {
    const trimmed = newMilestoneTitle.trim();
    if (!trimmed) return;
    if (trimmed.length > MILESTONE_TITLE_MAX_LENGTH) return;
    setDraftMilestones((prev) => [
      ...prev,
      { title: trimmed, targetDate: newMilestoneDate || '' },
    ]);
    setNewMilestoneTitle('');
    setNewMilestoneDate('');
  };

  const handleRemoveDraftMilestone = (idx: number) => {
    setDraftMilestones((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldErrors({ title: 'Goal title is required.' });
      setErrorMessage('Goal title is required.');
      return;
    }
    if (trimmedTitle.length > GOAL_TITLE_MAX_LENGTH) {
      setFieldErrors({
        title: `Goal title must be ${GOAL_TITLE_MAX_LENGTH} characters or fewer.`,
      });
      return;
    }

    const trimmedDesc = description.trim();
    if (trimmedDesc.length > GOAL_DESCRIPTION_MAX_LENGTH) {
      setFieldErrors({
        description: `Description must be ${GOAL_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      });
      return;
    }

    const finalMilestones = [...draftMilestones];
    if (!editingGoal && newMilestoneTitle.trim()) {
      finalMilestones.push({
        title: newMilestoneTitle.trim(),
        targetDate: newMilestoneDate || '',
      });
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        title: trimmedTitle,
        description: trimmedDesc ? trimmedDesc : null,
        category,
        targetDate: targetDate.trim() ? targetDate.trim() : null,
        status,
        progressPercent,
        initialMilestones: !editingGoal
          ? finalMilestones.map((m) => ({
              title: m.title,
              targetDate: m.targetDate || null,
            }))
          : undefined,
      });

      if (!res.ok) {
        setErrorMessage(res.message || 'Could not save goal.');
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
      } else {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-form-modal-title"
    >
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between pb-4">
          <h2
            id="goal-form-modal-title"
            className="text-xl font-bold tracking-tight text-[#171622]"
          >
            {editingGoal ? 'Edit Goal' : 'Add New Goal'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close goal modal"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/50 transition-colors hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs font-medium text-red-900"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="goal-title-input"
              className="mb-1.5 block text-xs font-semibold text-[#171622]"
            >
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="goal-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Learn Next.js and build a project"
              maxLength={GOAL_TITLE_MAX_LENGTH}
              required
              autoFocus
              className={`w-full rounded-xl border bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#171622] placeholder:text-[#171622]/38 focus:bg-white focus:outline-none ${
                fieldErrors.title
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-[#171622]/10 focus:border-[#171622]/30'
              }`}
            />
            <div className="mt-1 flex items-center justify-between">
              {fieldErrors.title ? (
                <span className="text-[11px] font-medium text-red-600">
                  {fieldErrors.title}
                </span>
              ) : (
                <span />
              )}
              <span className="text-[11px] text-[#171622]/40">
                {title.length}/{GOAL_TITLE_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="goal-description-input"
              className="mb-1.5 block text-xs font-semibold text-[#171622]"
            >
              Description <span className="font-normal text-[#171622]/45">(optional)</span>
            </label>
            <textarea
              id="goal-description-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why does this goal matter and what does success look like?"
              maxLength={GOAL_DESCRIPTION_MAX_LENGTH}
              className="w-full resize-none rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#171622] placeholder:text-[#171622]/38 focus:border-[#171622]/30 focus:bg-white focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <span className="text-[11px] text-[#171622]/40">
                {description.length}/{GOAL_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#171622]">
              Category
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GOAL_CATEGORIES.map((cat) => {
                const { Icon, iconBg, iconText } = getCategoryIconAndStyle(cat);
                const selected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-all ${
                      selected
                        ? 'border-[#171622] bg-[#FAF9F6] text-[#171622] shadow-xs ring-1 ring-[#171622]/15'
                        : 'border-[#171622]/10 bg-white text-[#171622]/70 hover:border-[#171622]/25 hover:bg-[#FAF9F6]/60'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconText}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate">{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Date & Status */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="goal-target-date-input"
                className="mb-1.5 block text-xs font-semibold text-[#171622]"
              >
                Target date <span className="font-normal text-[#171622]/45">(optional)</span>
              </label>
              <div className="relative flex items-center">
                <input
                  id="goal-target-date-input"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2.5 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
                />
                {targetDate && (
                  <button
                    type="button"
                    onClick={() => setTargetDate('')}
                    aria-label="Clear target date"
                    className="ml-1.5 rounded-lg p-1.5 text-[#171622]/40 hover:bg-[#FAF9F6] hover:text-[#171622]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="goal-status-select"
                className="mb-1.5 block text-xs font-semibold text-[#171622]"
              >
                Status
              </label>
              <select
                id="goal-status-select"
                value={status}
                onChange={(e) =>
                  handleStatusChange(e.target.value as GoalStatus)
                }
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2.5 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed (100%)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Authoritative Progress Percent */}
          <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6]/70 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="goal-progress-range"
                className="text-xs font-semibold text-[#171622]"
              >
                Progress (%)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="goal-progress-number"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={progressPercent}
                  onChange={(e) => handleProgressChange(Number(e.target.value))}
                  aria-label="Goal progress percentage"
                  className="w-16 rounded-lg border border-[#171622]/15 bg-white px-2 py-1 text-right text-xs font-bold text-[#171622] focus:border-[#171622]/40 focus:outline-none"
                />
                <span className="text-xs font-semibold text-[#171622]/60">
                  %
                </span>
              </div>
            </div>
            <input
              id="goal-progress-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={progressPercent}
              onChange={(e) => handleProgressChange(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#171622]/12 accent-[#52B748]"
            />
            <div className="mt-1.5 flex justify-between text-[10px] font-medium text-[#171622]/45">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Initial Milestones when creating a goal */}
          {!editingGoal && (
            <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6]/50 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#171622]">
                  Initial Milestones{' '}
                  <span className="font-normal text-[#171622]/45">
                    (optional steps)
                  </span>
                </span>
                <span className="text-[11px] font-medium text-[#171622]/45">
                  {draftMilestones.length} added
                </span>
              </div>

              {draftMilestones.length > 0 && (
                <ul className="mb-2.5 space-y-1.5">
                  {draftMilestones.map((m, idx) => (
                    <li
                      key={`${m.title}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#171622]/8 bg-white px-3 py-1.5 text-xs text-[#171622]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.title}</p>
                        {m.targetDate && (
                          <p className="text-[10px] text-[#171622]/45">
                            Target: {m.targetDate}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftMilestone(idx)}
                        aria-label={`Remove milestone ${m.title}`}
                        className="rounded-lg p-1 text-[#171622]/40 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDraftMilestone();
                    }
                  }}
                  placeholder="Add a milestone step..."
                  maxLength={MILESTONE_TITLE_MAX_LENGTH}
                  className="flex-1 rounded-xl border border-[#171622]/10 bg-white px-3 py-2 text-xs text-[#171622] placeholder:text-[#171622]/38 focus:border-[#171622]/30 focus:outline-none"
                />
                <input
                  type="date"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                  aria-label="Milestone target date"
                  className="rounded-xl border border-[#171622]/10 bg-white px-2.5 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddDraftMilestone}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#171622]/15 bg-white px-3 py-2 text-xs font-semibold text-[#171622] transition-colors hover:bg-[#FAF9F6]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2.5 text-xs font-semibold text-[#171622]/75 transition-colors hover:bg-[#FAF9F6] hover:text-[#171622]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-xs font-semibold text-[#FAF9F6] shadow-xs transition-all hover:bg-[#171622]/90 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingGoal ? 'Update goal' : 'Create goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
