'use client';

import React, { useEffect, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  Edit3,
  History,
  ListChecks,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  MILESTONE_DESCRIPTION_MAX_LENGTH,
  MILESTONE_TITLE_MAX_LENGTH,
  PROGRESS_NOTE_MAX_LENGTH,
  type GoalDeadlineState,
  type GoalStatus,
  type SerializedGoalItem,
  type SerializedGoalMilestone,
} from '@/lib/goals/goal-utils';
import { getCategoryIconAndStyle } from './GoalFormModal';

export function getDeadlineBadgeClass(state: GoalDeadlineState): string {
  switch (state) {
    case 'completed':
      return 'bg-[#E9F8EF] text-[#1E7E48] border-[#1E7E48]/12';
    case 'due_soon':
      return 'bg-[#FDF3EC] text-[#B8541A] border-[#B8541A]/15';
    case 'overdue':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'paused':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'archived':
      return 'bg-[#171622]/8 text-[#171622]/60 border-[#171622]/12';
    case 'on_track':
    default:
      return 'bg-[#F1EFFC] text-[#5B3FC4] border-[#5B3FC4]/12';
  }
}

interface GoalDetailModalProps {
  goal: SerializedGoalItem | null;
  initialTab?: 'milestones' | 'history' | 'settings';
  onClose: () => void;
  onEditGoal: (goal: SerializedGoalItem) => void;
  onUpdateGoalProgress: (
    goalId: string,
    progressPercent: number,
    progressNote: string | null
  ) => Promise<{ ok: boolean; message?: string }>;
  onUpdateGoalStatus: (
    goalId: string,
    status: GoalStatus
  ) => Promise<{ ok: boolean; message?: string }>;
  onDeleteGoal: (
    goalId: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onCreateMilestone: (
    goalId: string,
    payload: {
      title: string;
      description?: string | null;
      targetDate?: string | null;
    }
  ) => Promise<{ ok: boolean; message?: string }>;
  onUpdateMilestone: (
    goalId: string,
    milestoneId: string,
    payload: {
      title?: string;
      description?: string | null;
      targetDate?: string | null;
      status?: 'pending' | 'completed';
      sortOrder?: number;
    }
  ) => Promise<{ ok: boolean; message?: string }>;
  onDeleteMilestone: (
    goalId: string,
    milestoneId: string
  ) => Promise<{ ok: boolean; message?: string }>;
}

export default function GoalDetailModal({
  goal,
  initialTab = 'milestones',
  onClose,
  onEditGoal,
  onUpdateGoalProgress,
  onUpdateGoalStatus,
  onDeleteGoal,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
}: GoalDetailModalProps) {
  const [activeTab, setActiveTab] = useState<
    'milestones' | 'history' | 'settings'
  >(initialTab);

  // Authoritative progress updater state
  const [draftProgress, setDraftProgress] = useState<number>(
    goal?.progressPercent ?? 0
  );
  const [progressNote, setProgressNote] = useState('');
  const [isSavingProgress, setIsSavingProgress] = useState(false);

  // Add milestone state
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);

  // Inline milestone edit state
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(
    null
  );
  const [editMilestoneTitle, setEditMilestoneTitle] = useState('');
  const [editMilestoneDate, setEditMilestoneDate] = useState('');
  const [editMilestoneDesc, setEditMilestoneDesc] = useState('');
  const [busyMilestoneId, setBusyMilestoneId] = useState<string | null>(null);

  // Goal status / delete state
  const [isMutatingGoal, setIsMutatingGoal] = useState(false);
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!goal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goal, onClose]);

  if (!goal) return null;

  const { Icon, iconBg, iconText, pillBg, pillText } = getCategoryIconAndStyle(
    goal.category,
    goal.status === 'completed'
  );

  const milestoneRatioPercent =
    goal.totalMilestonesCount > 0
      ? Math.round(
          (goal.completedMilestonesCount / goal.totalMilestonesCount) * 100
        )
      : null;

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);
    setIsSavingProgress(true);
    try {
      const clamped = Math.min(100, Math.max(0, Math.round(draftProgress)));
      const res = await onUpdateGoalProgress(
        goal.id,
        clamped,
        progressNote.trim() ? progressNote.trim() : null
      );
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not update progress.');
      } else {
        setProgressNote('');
        setFeedbackSuccess(`Progress saved (${clamped}%).`);
      }
    } finally {
      setIsSavingProgress(false);
    }
  };

  const handleSyncProgressFromMilestones = async () => {
    if (milestoneRatioPercent === null) return;
    setFeedbackError(null);
    setFeedbackSuccess(null);
    setIsSavingProgress(true);
    try {
      const res = await onUpdateGoalProgress(
        goal.id,
        milestoneRatioPercent,
        `Synced progress with milestone completion (${goal.completedMilestonesCount}/${goal.totalMilestonesCount})`
      );
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not sync progress.');
      } else {
        setDraftProgress(milestoneRatioPercent);
        setFeedbackSuccess(
          `Progress synced to ${milestoneRatioPercent}% from milestones.`
        );
      }
    } finally {
      setIsSavingProgress(false);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMilestoneTitle.trim();
    if (!trimmed) return;
    setFeedbackError(null);
    setIsAddingMilestone(true);
    try {
      const res = await onCreateMilestone(goal.id, {
        title: trimmed,
        description: newMilestoneDesc.trim() ? newMilestoneDesc.trim() : null,
        targetDate: newMilestoneDate.trim() ? newMilestoneDate.trim() : null,
      });
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not add milestone.');
      } else {
        setNewMilestoneTitle('');
        setNewMilestoneDate('');
        setNewMilestoneDesc('');
      }
    } finally {
      setIsAddingMilestone(false);
    }
  };

  const handleToggleMilestone = async (m: SerializedGoalMilestone) => {
    setFeedbackError(null);
    setBusyMilestoneId(m.id);
    try {
      const nextStatus = m.status === 'completed' ? 'pending' : 'completed';
      const res = await onUpdateMilestone(goal.id, m.id, {
        status: nextStatus,
      });
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not update milestone.');
      }
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const startEditingMilestone = (m: SerializedGoalMilestone) => {
    setEditingMilestoneId(m.id);
    setEditMilestoneTitle(m.title);
    setEditMilestoneDate(m.targetDate ?? '');
    setEditMilestoneDesc(m.description ?? '');
  };

  const handleSaveMilestoneEdit = async (mId: string) => {
    const trimmed = editMilestoneTitle.trim();
    if (!trimmed) return;
    setFeedbackError(null);
    setBusyMilestoneId(mId);
    try {
      const res = await onUpdateMilestone(goal.id, mId, {
        title: trimmed,
        description: editMilestoneDesc.trim() ? editMilestoneDesc.trim() : null,
        targetDate: editMilestoneDate.trim() ? editMilestoneDate.trim() : null,
      });
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not update milestone.');
      } else {
        setEditingMilestoneId(null);
      }
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const handleReorderMilestone = async (
    index: number,
    direction: 'up' | 'down'
  ) => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    const current = goal.milestones[index];
    const target = goal.milestones[swapIdx];
    if (!current || !target) return;

    setBusyMilestoneId(current.id);
    try {
      await Promise.all([
        onUpdateMilestone(goal.id, current.id, { sortOrder: swapIdx }),
        onUpdateMilestone(goal.id, target.id, { sortOrder: index }),
      ]);
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    setFeedbackError(null);
    setBusyMilestoneId(milestoneId);
    try {
      const res = await onDeleteMilestone(goal.id, milestoneId);
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not delete milestone.');
      }
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const handleGoalStatusAction = async (nextStatus: GoalStatus) => {
    setFeedbackError(null);
    setIsMutatingGoal(true);
    try {
      const res = await onUpdateGoalStatus(goal.id, nextStatus);
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not update goal status.');
      } else {
        if (nextStatus === 'completed') {
          setDraftProgress(100);
        }
      }
    } finally {
      setIsMutatingGoal(false);
    }
  };

  const handleConfirmDeleteGoal = async () => {
    setFeedbackError(null);
    setIsMutatingGoal(true);
    try {
      const res = await onDeleteGoal(goal.id);
      if (!res.ok) {
        setFeedbackError(res.message || 'Could not delete goal.');
      } else {
        onClose();
      }
    } finally {
      setIsMutatingGoal(false);
    }
  };

  // Chronological oldest-to-newest points for SVG trend line
  const chronologicalHistory = [...goal.progressHistory].reverse();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-detail-modal-title"
    >
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl sm:p-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg} ${iconText}`}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="goal-detail-modal-title"
                  className="text-lg font-bold tracking-tight text-[#171622] sm:text-xl"
                >
                  {goal.title}
                </h2>
                <span
                  className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${getDeadlineBadgeClass(
                    goal.deadlineState
                  )}`}
                >
                  {goal.badgeLabel}
                </span>
              </div>
              {goal.description && (
                <p className="mt-1 text-xs leading-relaxed text-[#171622]/60">
                  {goal.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-[11px] font-semibold ${pillBg} ${pillText}`}
                >
                  {goal.category}
                </span>
                {goal.targetDateLabel && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#FAF9F6] px-2.5 py-0.5 text-[11px] font-medium text-[#171622]/65">
                    <Calendar className="h-3 w-3 text-[#171622]/45" />
                    Target: {goal.targetDateLabel}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#FAF9F6] px-2.5 py-0.5 text-[11px] font-medium text-[#171622]/65">
                  <ListChecks className="h-3 w-3 text-[#171622]/45" />
                  {goal.completedMilestonesCount}/{goal.totalMilestonesCount}{' '}
                  milestones
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEditGoal(goal)}
              aria-label="Edit goal"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/55 transition-colors hover:bg-[#FAF9F6] hover:text-[#171622]"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close goal details"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/55 transition-colors hover:bg-[#FAF9F6] hover:text-[#171622]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {feedbackError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2 text-xs font-medium text-red-900"
          >
            {feedbackError}
          </div>
        )}
        {feedbackSuccess && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-[#52B748]/25 bg-[#F2FBE0] px-3.5 py-2 text-xs font-medium text-[#1F511A]"
          >
            {feedbackSuccess}
          </div>
        )}

        {/* Authoritative Goal Progress Updater Card */}
        <form
          onSubmit={handleSaveProgress}
          className="mb-5 rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[#171622]">
                Goal Progress
              </span>
              <span className="ml-2 text-[11px] text-[#171622]/50">
                Current saved: {goal.progressPercent}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={draftProgress}
                onChange={(e) =>
                  setDraftProgress(
                    Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)))
                  )
                }
                aria-label="Progress percentage value"
                className="w-16 rounded-lg border border-[#171622]/15 bg-white px-2 py-1 text-right text-xs font-bold text-[#171622] focus:border-[#171622]/40 focus:outline-none"
              />
              <span className="text-xs font-bold text-[#171622]/70">%</span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draftProgress}
            onChange={(e) => setDraftProgress(Number(e.target.value))}
            aria-label="Adjust goal progress slider"
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#171622]/12 accent-[#52B748]"
          />

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={progressNote}
              onChange={(e) => setProgressNote(e.target.value)}
              placeholder="Add an optional progress note (e.g. Completed chapter 4)..."
              maxLength={PROGRESS_NOTE_MAX_LENGTH}
              className="flex-1 rounded-xl border border-[#171622]/10 bg-white px-3 py-2 text-xs text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622]/30 focus:outline-none"
            />
            <button
              type="submit"
              disabled={
                isSavingProgress ||
                (draftProgress === goal.progressPercent && !progressNote.trim())
              }
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] transition-all hover:bg-[#171622]/90 disabled:opacity-45"
            >
              {isSavingProgress && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Save progress
            </button>
          </div>
        </form>

        {/* Navigation Tabs */}
        <div className="mb-4 flex items-center gap-1 border-b border-[#171622]/8">
          <button
            type="button"
            onClick={() => setActiveTab('milestones')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === 'milestones'
                ? 'border-[#171622] text-[#171622]'
                : 'border-transparent text-[#171622]/50 hover:text-[#171622]'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            Milestones ({goal.completedMilestonesCount}/
            {goal.totalMilestonesCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === 'history'
                ? 'border-[#171622] text-[#171622]'
                : 'border-transparent text-[#171622]/50 hover:text-[#171622]'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Progress History ({goal.progressHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === 'settings'
                ? 'border-[#171622] text-[#171622]'
                : 'border-transparent text-[#171622]/50 hover:text-[#171622]'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>

        {/* Tab 1: Milestones */}
        {activeTab === 'milestones' && (
          <div className="space-y-4">
            {/* Explicit user-controlled sync button when milestone ratio differs from saved progress */}
            {milestoneRatioPercent !== null &&
              milestoneRatioPercent !== goal.progressPercent && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#5B3FC4]/15 bg-[#F3F1FC]/70 px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-[#171622]/80">
                    <Sparkles className="h-3.5 w-3.5 text-[#5B3FC4]" />
                    <span>
                      {goal.completedMilestonesCount} of{' '}
                      {goal.totalMilestonesCount} milestones completed (
                      <strong>{milestoneRatioPercent}%</strong>).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncProgressFromMilestones}
                    disabled={isSavingProgress}
                    className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#5B3FC4] shadow-2xs ring-1 ring-[#5B3FC4]/20 transition-colors hover:bg-[#5B3FC4] hover:text-white"
                  >
                    Sync progress to {milestoneRatioPercent}%
                  </button>
                </div>
              )}

            {/* Add milestone form */}
            <form
              onSubmit={handleAddMilestone}
              className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6]/60 p-3.5"
            >
              <p className="mb-2 text-xs font-semibold text-[#171622]">
                Add Milestone
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="Milestone title (e.g. Complete authentication)..."
                  maxLength={MILESTONE_TITLE_MAX_LENGTH}
                  required
                  className="flex-1 rounded-xl border border-[#171622]/10 bg-white px-3 py-2 text-xs text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622]/30 focus:outline-none"
                />
                <input
                  type="date"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                  aria-label="Milestone target date"
                  className="rounded-xl border border-[#171622]/10 bg-white px-2.5 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isAddingMilestone || !newMilestoneTitle.trim()}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#171622] px-3.5 py-2 text-xs font-semibold text-[#FAF9F6] transition-all hover:bg-[#171622]/90 disabled:opacity-45"
                >
                  {isAddingMilestone ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add
                </button>
              </div>
              <input
                type="text"
                value={newMilestoneDesc}
                onChange={(e) => setNewMilestoneDesc(e.target.value)}
                placeholder="Optional note or milestone details..."
                maxLength={MILESTONE_DESCRIPTION_MAX_LENGTH}
                className="mt-2 w-full rounded-xl border border-[#171622]/10 bg-white px-3 py-1.5 text-xs text-[#171622] placeholder:text-[#171622]/35 focus:border-[#171622]/30 focus:outline-none"
              />
            </form>

            {/* Milestones list */}
            {goal.milestones.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#171622]/12 bg-[#FAF9F6]/50 px-4 py-8 text-center">
                <p className="text-xs font-semibold text-[#171622]/75">
                  No milestones added yet
                </p>
                <p className="mt-1 text-[11px] text-[#171622]/50">
                  Break this goal into smaller checkpoints to track every step.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {goal.milestones.map((m, idx) => {
                  const isDone = m.status === 'completed';
                  const isBusy = busyMilestoneId === m.id;
                  const isEditingThis = editingMilestoneId === m.id;

                  if (isEditingThis) {
                    return (
                      <li
                        key={m.id}
                        className="rounded-2xl border border-[#171622]/20 bg-[#FAF9F6] p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={editMilestoneTitle}
                            onChange={(e) =>
                              setEditMilestoneTitle(e.target.value)
                            }
                            maxLength={MILESTONE_TITLE_MAX_LENGTH}
                            className="flex-1 rounded-xl border border-[#171622]/15 bg-white px-3 py-1.5 text-xs font-medium text-[#171622] focus:outline-none"
                          />
                          <input
                            type="date"
                            value={editMilestoneDate}
                            onChange={(e) =>
                              setEditMilestoneDate(e.target.value)
                            }
                            className="rounded-xl border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs text-[#171622] focus:outline-none"
                          />
                        </div>
                        <input
                          type="text"
                          value={editMilestoneDesc}
                          onChange={(e) => setEditMilestoneDesc(e.target.value)}
                          placeholder="Optional milestone description..."
                          maxLength={MILESTONE_DESCRIPTION_MAX_LENGTH}
                          className="mt-2 w-full rounded-xl border border-[#171622]/15 bg-white px-3 py-1.5 text-xs text-[#171622] focus:outline-none"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMilestoneId(null)}
                            className="rounded-lg border border-[#171622]/12 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171622]/70"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveMilestoneEdit(m.id)}
                            disabled={isBusy}
                            className="rounded-lg bg-[#171622] px-3 py-1 text-[11px] font-semibold text-white"
                          >
                            Save
                          </button>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[#171622]/8 bg-white px-3.5 py-2.5 transition-colors hover:border-[#171622]/15"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleMilestone(m)}
                          disabled={isBusy}
                          aria-label={
                            isDone
                              ? `Mark "${m.title}" as pending`
                              : `Mark "${m.title}" as completed`
                          }
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            isDone
                              ? 'border-[#52B748] bg-[#52B748] text-white'
                              : 'border-[#171622]/25 bg-white hover:border-[#52B748]'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isDone ? (
                            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                          ) : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs font-semibold ${
                              isDone
                                ? 'text-[#171622]/45 line-through'
                                : 'text-[#171622]'
                            }`}
                          >
                            {m.title}
                          </p>
                          {m.description && (
                            <p className="mt-0.5 text-[11px] text-[#171622]/55">
                              {m.description}
                            </p>
                          )}
                          {m.targetDateLabel && (
                            <p className="mt-0.5 text-[10px] font-medium text-[#171622]/45">
                              Target: {m.targetDateLabel}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleReorderMilestone(idx, 'up')}
                          disabled={idx === 0 || isBusy}
                          aria-label="Move milestone up"
                          className="rounded-lg p-1 text-[#171622]/40 hover:bg-[#FAF9F6] hover:text-[#171622] disabled:opacity-25"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorderMilestone(idx, 'down')}
                          disabled={
                            idx === goal.milestones.length - 1 || isBusy
                          }
                          aria-label="Move milestone down"
                          className="rounded-lg p-1 text-[#171622]/40 hover:bg-[#FAF9F6] hover:text-[#171622] disabled:opacity-25"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditingMilestone(m)}
                          disabled={isBusy}
                          aria-label={`Edit milestone ${m.title}`}
                          className="rounded-lg p-1 text-[#171622]/45 hover:bg-[#FAF9F6] hover:text-[#171622]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMilestone(m.id)}
                          disabled={isBusy}
                          aria-label={`Delete milestone ${m.title}`}
                          className="rounded-lg p-1 text-[#171622]/45 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Tab 2: Progress History */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* SVG Trend Chart when history has records */}
            {chronologicalHistory.length > 0 && (
              <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#171622]">
                    Progress Over Time
                  </span>
                  <span className="text-[11px] font-bold text-[#52B748]">
                    Current: {goal.progressPercent}%
                  </span>
                </div>
                <div className="h-24 w-full">
                  <svg
                    viewBox="0 0 320 80"
                    className="h-full w-full overflow-visible"
                    aria-label="Goal progress trend chart"
                  >
                    <line
                      x1="0"
                      y1="70"
                      x2="320"
                      y2="70"
                      stroke="#171622"
                      strokeOpacity="0.08"
                      strokeWidth="1"
                    />
                    <line
                      x1="0"
                      y1="38"
                      x2="320"
                      y2="38"
                      stroke="#171622"
                      strokeOpacity="0.06"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <line
                      x1="0"
                      y1="6"
                      x2="320"
                      y2="6"
                      stroke="#171622"
                      strokeOpacity="0.06"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    {(() => {
                      const pts =
                        chronologicalHistory.length === 1
                          ? [
                              { progressPercent: 0 },
                              chronologicalHistory[0],
                            ]
                          : chronologicalHistory;
                      const coords = pts.map((p, i) => {
                        const x =
                          pts.length > 1
                            ? (i / (pts.length - 1)) * 300 + 10
                            : 160;
                        const y = 70 - (p.progressPercent / 100) * 64;
                        return { x, y, val: p.progressPercent };
                      });
                      const polylinePoints = coords
                        .map((c) => `${c.x},${c.y}`)
                        .join(' ');
                      return (
                        <>
                          <polyline
                            fill="none"
                            stroke="#52B748"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={polylinePoints}
                          />
                          {coords.map((c, idx) => (
                            <circle
                              key={idx}
                              cx={c.x}
                              cy={c.y}
                              r="3.5"
                              fill="#52B748"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                            />
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            )}

            {goal.progressHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#171622]/12 bg-[#FAF9F6]/50 px-4 py-8 text-center">
                <p className="text-xs font-semibold text-[#171622]/75">
                  No progress updates recorded yet
                </p>
                <p className="mt-1 text-[11px] text-[#171622]/50">
                  Every time you update your goal percentage, LifeCraft logs it
                  here.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {goal.progressHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-[#171622]/8 bg-white px-4 py-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-[#F2FBE0] px-2 py-0.5 text-xs font-bold text-[#2E7D32]">
                          {entry.progressPercent}%
                        </span>
                        <span className="text-xs font-medium text-[#171622]">
                          {entry.note || 'Progress updated'}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-[#171622]/45">
                      {entry.createdAtLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tab 3: Settings & Lifecycle */}
        {activeTab === 'settings' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {goal.status !== 'completed' ? (
                <button
                  type="button"
                  onClick={() => handleGoalStatusAction('completed')}
                  disabled={isMutatingGoal}
                  className="flex items-center gap-2.5 rounded-2xl border border-[#52B748]/25 bg-[#F2FBE0]/70 px-4 py-3 text-left text-xs font-semibold text-[#1F511A] transition-colors hover:bg-[#F2FBE0]"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E7D32]" />
                  <div>
                    <p>Mark as Completed (100%)</p>
                    <p className="text-[10px] font-normal text-[#1F511A]/75">
                      Sets progress to 100% and records completion timestamp
                    </p>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleGoalStatusAction('active')}
                  disabled={isMutatingGoal}
                  className="flex items-center gap-2.5 rounded-2xl border border-[#171622]/12 bg-[#FAF9F6] px-4 py-3 text-left text-xs font-semibold text-[#171622] transition-colors hover:bg-[#171622]/5"
                >
                  <RotateCcw className="h-4 w-4 shrink-0 text-[#171622]/70" />
                  <div>
                    <p>Reopen Goal</p>
                    <p className="text-[10px] font-normal text-[#171622]/55">
                      Moves goal back to active status
                    </p>
                  </div>
                </button>
              )}

              {goal.status === 'active' && (
                <button
                  type="button"
                  onClick={() => handleGoalStatusAction('paused')}
                  disabled={isMutatingGoal}
                  className="flex items-center gap-2.5 rounded-2xl border border-[#171622]/12 bg-[#FAF9F6] px-4 py-3 text-left text-xs font-semibold text-[#171622] transition-colors hover:bg-[#171622]/5"
                >
                  <PauseCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p>Pause Goal</p>
                    <p className="text-[10px] font-normal text-[#171622]/55">
                      Temporarily pause deadline alerts
                    </p>
                  </div>
                </button>
              )}

              {goal.status === 'paused' && (
                <button
                  type="button"
                  onClick={() => handleGoalStatusAction('active')}
                  disabled={isMutatingGoal}
                  className="flex items-center gap-2.5 rounded-2xl border border-[#171622]/12 bg-[#FAF9F6] px-4 py-3 text-left text-xs font-semibold text-[#171622] transition-colors hover:bg-[#171622]/5"
                >
                  <PlayCircle className="h-4 w-4 shrink-0 text-[#2E7D32]" />
                  <div>
                    <p>Resume Goal</p>
                    <p className="text-[10px] font-normal text-[#171622]/55">
                      Return this goal to active tracking
                    </p>
                  </div>
                </button>
              )}

              {goal.status !== 'archived' ? (
                <button
                  type="button"
                  onClick={() => handleGoalStatusAction('archived')}
                  disabled={isMutatingGoal}
                  className="flex items-center gap-2.5 rounded-2xl border border-[#171622]/12 bg-[#FAF9F6] px-4 py-3 text-left text-xs font-semibold text-[#171622] transition-colors hover:bg-[#171622]/5"
                >
                  <Archive className="h-4 w-4 shrink-0 text-[#171622]/65" />
                  <div>
                    <p>Archive Goal</p>
                    <p className="text-[10px] font-normal text-[#171622]/55">
                      Hide from active list while preserving history
                    </p>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleGoalStatusAction('active')}
                  disabled={isMutatingGoal}
                  className="flex items-center gap-2.5 rounded-2xl border border-[#171622]/12 bg-[#FAF9F6] px-4 py-3 text-left text-xs font-semibold text-[#171622] transition-colors hover:bg-[#171622]/5"
                >
                  <ArchiveRestore className="h-4 w-4 shrink-0 text-[#171622]/65" />
                  <div>
                    <p>Restore from Archive</p>
                    <p className="text-[10px] font-normal text-[#171622]/55">
                      Move goal back to active tracking
                    </p>
                  </div>
                </button>
              )}
            </div>

            {/* Permanent Delete Confirmation */}
            <div className="mt-4 rounded-2xl border border-red-200/80 bg-red-50/40 p-4">
              {!confirmDeleteGoal ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-red-900">
                      Delete Goal Permanently
                    </p>
                    <p className="text-[11px] text-red-800/75">
                      Permanently deletes this goal, its milestones, and
                      progress history.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteGoal(true)}
                    className="shrink-0 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                  >
                    Delete goal
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-red-900">
                    Are you sure? This action cannot be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteGoal(false)}
                      disabled={isMutatingGoal}
                      className="rounded-xl border border-[#171622]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#171622]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteGoal}
                      disabled={isMutatingGoal}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      {isMutatingGoal && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Confirm permanent delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
