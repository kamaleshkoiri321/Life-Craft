'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  LayoutGrid,
  LayoutList,
  ListChecks,
  Loader2,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  filterAndSortGoals,
  type GoalCategory,
  type GoalFilterTab,
  type GoalSortOption,
  type GoalStatus,
  type SerializedGoalItem,
} from '@/lib/goals/goal-utils';
import type { GoalsViewData } from '@/lib/queries/goals';
import GoalFormModal, {
  getCategoryIconAndStyle,
  type GoalFormSubmitPayload,
} from './GoalFormModal';
import GoalDetailModal, { getDeadlineBadgeClass } from './GoalDetailModal';

interface GoalsViewProps {
  searchQuery?: string;
  onDataMutated?: () => void;
}

export default function GoalsView({
  searchQuery = '',
  onDataMutated,
}: GoalsViewProps) {
  const [goalsData, setGoalsData] = useState<GoalsViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & view state
  const [filterTab, setFilterTab] = useState<GoalFilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<GoalCategory | 'all'>(
    'all'
  );
  const [sortBy, setSortBy] = useState<GoalSortOption>('target_date');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Modals & menus
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SerializedGoalItem | null>(
    null
  );
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<
    'milestones' | 'history' | 'settings'
  >('milestones');
  const [openMenuGoalId, setOpenMenuGoalId] = useState<string | null>(null);
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(
    null
  );
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const fetchGoals = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/goals', { cache: 'no-store' });
      const json = (await res.json()) as {
        status: string;
        data?: GoalsViewData;
        message?: string;
      };
      if (!res.ok || json.status !== 'ok' || !json.data) {
        setErrorMessage(
          json.message || 'Unable to load your goals right now.'
        );
      } else {
        setGoalsData(json.data);
      }
    } catch {
      setErrorMessage(
        'Network error while loading your goals. Please try again.'
      );
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/goals', { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as {
          status: string;
          data?: GoalsViewData;
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok || json.status !== 'ok' || !json.data) {
          setErrorMessage(
            json.message || 'Unable to load your goals right now.'
          );
        } else {
          setGoalsData(json.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage(
            'Network error while loading your goals. Please try again.'
          );
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
  }, []);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    if (!openMenuGoalId) return;
    const handleOutsideClick = () => {
      setOpenMenuGoalId(null);
      setConfirmDeleteGoalId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [openMenuGoalId]);

  const handleOpenCreateModal = () => {
    setEditingGoal(null);
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (goal: SerializedGoalItem) => {
    setOpenMenuGoalId(null);
    setDetailGoalId(null);
    setEditingGoal(goal);
    setIsFormOpen(true);
  };

  const handleOpenDetailModal = (
    goalId: string,
    tab: 'milestones' | 'history' | 'settings' = 'milestones'
  ) => {
    setOpenMenuGoalId(null);
    setDetailInitialTab(tab);
    setDetailGoalId(goalId);
  };

  const handleFormSubmit = async (
    payload: GoalFormSubmitPayload
  ): Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }> => {
    try {
      const url = editingGoal ? `/api/goals/${editingGoal.id}` : '/api/goals';
      const method = editingGoal ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        status: string;
        message?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok || json.status !== 'ok') {
        return {
          ok: false,
          message: json.message || 'Could not save goal.',
          fieldErrors: json.fieldErrors,
        };
      }

      await fetchGoals(true);
      onDataMutated?.();
      showToast(editingGoal ? 'Goal updated' : 'Goal created');
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while saving goal.' };
    }
  };

  const handleUpdateGoalProgress = async (
    goalId: string,
    progressPercent: number,
    progressNote: string | null
  ): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressPercent, progressNote }),
      });
      const json = (await res.json()) as { status: string; message?: string };
      if (!res.ok || json.status !== 'ok') {
        return {
          ok: false,
          message: json.message || 'Could not update progress.',
        };
      }
      await fetchGoals(true);
      onDataMutated?.();
      showToast(`Progress updated to ${progressPercent}%`);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while updating progress.' };
    }
  };

  const handleUpdateGoalStatus = async (
    goalId: string,
    status: GoalStatus
  ): Promise<{ ok: boolean; message?: string }> => {
    setBusyActionId(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { status: string; message?: string };
      if (!res.ok || json.status !== 'ok') {
        return {
          ok: false,
          message: json.message || 'Could not update goal status.',
        };
      }
      await fetchGoals(true);
      onDataMutated?.();
      const label =
        status === 'completed'
          ? 'Goal marked as completed'
          : status === 'archived'
            ? 'Goal archived'
            : status === 'paused'
              ? 'Goal paused'
              : 'Goal active';
      showToast(label);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while updating status.' };
    } finally {
      setBusyActionId(null);
      setOpenMenuGoalId(null);
    }
  };

  const handleDeleteGoal = async (
    goalId: string
  ): Promise<{ ok: boolean; message?: string }> => {
    setBusyActionId(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as { status: string; message?: string };
      if (!res.ok || json.status !== 'ok') {
        return {
          ok: false,
          message: json.message || 'Could not delete goal.',
        };
      }
      await fetchGoals(true);
      onDataMutated?.();
      showToast('Goal deleted');
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while deleting goal.' };
    } finally {
      setBusyActionId(null);
      setOpenMenuGoalId(null);
      setConfirmDeleteGoalId(null);
    }
  };

  const handleCreateMilestone = async (
    goalId: string,
    payload: {
      title: string;
      description?: string | null;
      targetDate?: string | null;
    }
  ): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await fetch(`/api/goals/${goalId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { status: string; message?: string };
      if (!res.ok || json.status !== 'ok') {
        return {
          ok: false,
          message: json.message || 'Could not add milestone.',
        };
      }
      await fetchGoals(true);
      onDataMutated?.();
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while adding milestone.' };
    }
  };

  const handleUpdateMilestone = async (
    goalId: string,
    milestoneId: string,
    payload: {
      title?: string;
      description?: string | null;
      targetDate?: string | null;
      status?: 'pending' | 'completed';
      sortOrder?: number;
    }
  ): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await fetch(
        `/api/goals/${goalId}/milestones/${milestoneId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as { status: string; message?: string };
      if (!res.ok || json.status !== 'ok') {
        return {
          ok: false,
          message: json.message || 'Could not update milestone.',
        };
      }
      await fetchGoals(true);
      onDataMutated?.();
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while updating milestone.' };
    }
  };

  const handleDeleteMilestone = async (
    goalId: string,
    milestoneId: string
  ): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await fetch(
        `/api/goals/${goalId}/milestones/${milestoneId}`,
        {
          method: 'DELETE',
        }
      );
      const json = (await res.json()) as { status: string; message?: string };
      if (!res.ok || json.status !== 'ok') {
        return {
          ok: false,
          message: json.message || 'Could not delete milestone.',
        };
      }
      await fetchGoals(true);
      onDataMutated?.();
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while deleting milestone.' };
    }
  };

  const summary = goalsData?.summary ?? {
    totalNonArchivedCount: 0,
    activeGoalsCount: 0,
    pausedGoalsCount: 0,
    onTrackActiveCount: 0,
    completedGoalsCount: 0,
    archivedGoalsCount: 0,
    approachingDeadlinesCount: 0,
    dueNext7DaysCount: 0,
    overdueGoalsCount: 0,
    overallActiveProgressPercent: 0,
  };

  const allGoals = goalsData?.goals ?? [];
  const filteredGoals = filterAndSortGoals({
    goals: allGoals,
    filterTab,
    categoryFilter,
    searchQuery,
    sortBy,
  });

  const activeDetailGoal =
    detailGoalId && allGoals.length > 0
      ? allGoals.find((g) => g.id === detailGoalId) ?? null
      : null;

  // Ring chart calculations for "Goal progress" right sidebar card
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const overallProgressDash =
    (Math.min(100, Math.max(0, summary.overallActiveProgressPercent)) / 100) *
    ringCircumference;

  return (
    <div className="space-y-6 pb-10">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-2xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-[#FAF9F6] shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 text-[#C8F27C]" />
          {toastMessage}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171622] sm:text-[28px]">
            Goals &amp; Progress
          </h1>
          <p className="mt-1 text-sm text-[#171622]/60">
            Turn what matters to you into meaningful progress.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-[#FAF9F6] shadow-xs transition-all hover:bg-[#171622]/90"
          >
            <Plus className="h-4 w-4" />
            Add goal
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-xs font-medium text-red-900"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchGoals(false)}
            className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-red-700 shadow-2xs hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main 12-Column Responsive Layout matching reference design */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (8 cols on lg): Summary Cards + Filter Bar + Goal List */}
        <div className="space-y-5 lg:col-span-8">
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {/* Card 1: Active goals */}
            <button
              type="button"
              onClick={() => setFilterTab('active')}
              className="group flex flex-col justify-between rounded-2xl border border-[#52B748]/15 bg-[#F2FBE0]/90 p-4 text-left transition-all hover:border-[#52B748]/35 hover:shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E1F6C3] text-[#2B6E23]">
                  <Target className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#2B6E23]">
                    Active goals
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#171622]">
                    {summary.activeGoalsCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/60">
                {summary.onTrackActiveCount} on track
              </p>
            </button>

            {/* Card 2: Completed goals */}
            <button
              type="button"
              onClick={() => setFilterTab('completed')}
              className="group flex flex-col justify-between rounded-2xl border border-[#6E56CF]/12 bg-[#F3F1FC]/90 p-4 text-left transition-all hover:border-[#6E56CF]/30 hover:shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E6E1FA] text-[#573EC2]">
                  <Trophy className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#573EC2]">
                    Completed goals
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#171622]">
                    {summary.completedGoalsCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/60">
                {summary.completedGoalsCount > 0
                  ? 'Great progress!'
                  : 'Finish your first goal'}
              </p>
            </button>

            {/* Card 3: Due soon */}
            <button
              type="button"
              onClick={() => {
                setFilterTab('active');
                setSortBy('target_date');
              }}
              className="group flex flex-col justify-between rounded-2xl border border-[#D97736]/15 bg-[#FDF3EC]/90 p-4 text-left transition-all hover:border-[#D97736]/35 hover:shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBE4D4] text-[#B8541A]">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#B8541A]">
                    Due soon
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#171622]">
                    {summary.approachingDeadlinesCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/60">
                {summary.overdueGoalsCount > 0
                  ? `${summary.overdueGoalsCount} overdue • Next 7 days`
                  : 'Next 7 days'}
              </p>
            </button>

            {/* Card 4: Overall progress */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#2563EB]/12 bg-[#EEF6FF]/90 p-4 text-left">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DCEBFF] text-[#1D58D8]">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1D58D8]">
                    Overall progress
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#171622]">
                    {summary.overallActiveProgressPercent}%
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/60">
                Across active goals
              </p>
            </div>
          </div>

          {/* Filter Tabs & Sort Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Filter goals by status"
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  {
                    id: 'all',
                    label: `All (${summary.totalNonArchivedCount})`,
                  },
                  {
                    id: 'active',
                    label: `Active (${
                      summary.activeGoalsCount + summary.pausedGoalsCount
                    })`,
                  },
                  {
                    id: 'completed',
                    label: `Completed (${summary.completedGoalsCount})`,
                  },
                  {
                    id: 'archived',
                    label: `Archived (${summary.archivedGoalsCount})`,
                  },
                ] as const
              ).map((tab) => {
                const isSelected = filterTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setFilterTab(tab.id)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#C8F27C] text-[#171622] shadow-2xs'
                        : 'border border-[#171622]/10 bg-white text-[#171622]/70 hover:border-[#171622]/20 hover:text-[#171622]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}

              {categoryFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className="inline-flex items-center gap-1 rounded-full border border-[#171622]/15 bg-[#171622] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {categoryFilter} ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  aria-label="Sort goals by"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as GoalSortOption)}
                  className="rounded-xl border border-[#171622]/10 bg-white px-3 py-1.5 pr-7 text-xs font-semibold text-[#171622]/80 focus:border-[#171622]/30 focus:outline-none"
                >
                  <option value="target_date">Target date</option>
                  <option value="progress_desc">Progress (High to Low)</option>
                  <option value="progress_asc">Progress (Low to High)</option>
                  <option value="updated_desc">Recently updated</option>
                  <option value="title_asc">Title (A–Z)</option>
                </select>
              </div>

              <div className="flex items-center rounded-xl border border-[#171622]/10 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  className={`rounded-lg p-1.5 transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#FAF9F6] text-[#171622] shadow-2xs'
                      : 'text-[#171622]/45 hover:text-[#171622]'
                  }`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  className={`rounded-lg p-1.5 transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-[#FAF9F6] text-[#171622] shadow-2xs'
                      : 'text-[#171622]/45 hover:text-[#171622]'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Goal List / Grid */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-28 animate-pulse rounded-2xl border border-[#171622]/6 bg-white p-5"
                />
              ))}
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="rounded-3xl border border-[#171622]/8 bg-white px-6 py-12 text-center shadow-2xs">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2FBE0] text-[#2B6E23]">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="mt-3.5 text-base font-bold text-[#171622]">
                {allGoals.length === 0
                  ? 'No goals yet'
                  : 'No goals match your current filter'}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[#171622]/55">
                {allGoals.length === 0
                  ? 'Create your first goal, set a target date, and break it into milestones to track meaningful progress.'
                  : 'Try switching tabs, clearing your search query, or creating a new goal.'}
              </p>
              <div className="mt-5 flex items-center justify-center gap-2.5">
                {allGoals.length > 0 &&
                  (filterTab !== 'all' ||
                    categoryFilter !== 'all' ||
                    searchQuery.trim() !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterTab('all');
                        setCategoryFilter('all');
                      }}
                      className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2 text-xs font-semibold text-[#171622]"
                    >
                      Show all goals
                    </button>
                  )}
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add goal
                </button>
              </div>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                  : 'space-y-3.5'
              }
            >
              {filteredGoals.map((goal) => {
                const isCompleted = goal.status === 'completed';
                const { Icon, iconBg, iconText, pillBg, pillText } =
                  getCategoryIconAndStyle(goal.category, isCompleted);
                const isMenuOpen = openMenuGoalId === goal.id;
                const isBusy = busyActionId === goal.id;

                return (
                  <div
                    key={goal.id}
                    className="group relative flex flex-col justify-between gap-4 rounded-2xl border border-[#171622]/8 bg-white p-4 shadow-2xs transition-all hover:border-[#171622]/16 sm:flex-row sm:items-center sm:p-5"
                  >
                    {/* Left section: Icon + Title + Description + Category & Milestone pills */}
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenDetailModal(goal.id, 'milestones')
                        }
                        aria-label={`Open ${goal.title} details`}
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform group-hover:scale-[1.02] ${iconBg} ${iconText}`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-6 w-6" />
                        ) : (
                          <Icon className="h-6 w-6" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenDetailModal(goal.id, 'milestones')
                          }
                          className="text-left text-sm font-bold text-[#171622] hover:underline sm:text-[15px]"
                        >
                          {goal.title}
                        </button>
                        {goal.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-[#171622]/55">
                            {goal.description}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-[11px] font-semibold ${pillBg} ${pillText}`}
                          >
                            {goal.category}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleOpenDetailModal(goal.id, 'milestones')
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FAF9F6] px-2.5 py-0.5 text-[11px] font-medium text-[#171622]/65 transition-colors hover:bg-[#171622]/8 hover:text-[#171622]"
                          >
                            <ListChecks className="h-3 w-3 text-[#171622]/45" />
                            <span>
                              {goal.completedMilestonesCount}/
                              {goal.totalMilestonesCount} milestones
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right section: Progress bar + % + Target date + Status badge + Actions menu */}
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <div className="w-full sm:w-52">
                        {/* Progress bar + percentage */}
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenDetailModal(goal.id, 'milestones')
                          }
                          aria-label={`Update progress for ${goal.title} (currently ${goal.progressPercent}%)`}
                          className="flex w-full items-center gap-2.5 text-left"
                        >
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#171622]/8">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isCompleted ? 'bg-[#3EA65A]' : 'bg-[#63B838]'
                              }`}
                              style={{ width: `${goal.progressPercent}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs font-bold text-[#171622]">
                            {goal.progressPercent}%
                          </span>
                        </button>

                        {/* Target Date + Status Pill */}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#171622]/55">
                            <Calendar className="h-3.5 w-3.5 text-[#171622]/40" />
                            {goal.targetDateLabel ?? 'No target date'}
                          </span>

                          <span
                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${getDeadlineBadgeClass(
                              goal.deadlineState
                            )}`}
                          >
                            {goal.badgeLabel}
                          </span>
                        </div>
                      </div>

                      {/* 3-dots Action Menu */}
                      <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuGoalId(isMenuOpen ? null : goal.id)
                          }
                          disabled={isBusy}
                          aria-label={`Actions for ${goal.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/45 transition-colors hover:bg-[#FAF9F6] hover:text-[#171622]"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4" />
                          )}
                        </button>

                        {isMenuOpen && (
                          <div
                            role="menu"
                            className="absolute right-0 z-30 mt-1.5 w-52 rounded-2xl border border-[#171622]/10 bg-white p-1.5 shadow-xl"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                handleOpenDetailModal(goal.id, 'milestones')
                              }
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                            >
                              <ListChecks className="h-3.5 w-3.5 text-[#171622]/55" />
                              View details &amp; milestones
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                handleOpenDetailModal(goal.id, 'history')
                              }
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5 text-[#171622]/55" />
                              Update progress
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleOpenEditModal(goal)}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-[#171622]/55" />
                              Edit goal
                            </button>

                            <div className="my-1 border-t border-[#171622]/6" />

                            {goal.status !== 'completed' ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  void handleUpdateGoalStatus(
                                    goal.id,
                                    'completed'
                                  )
                                }
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#1E7E48] hover:bg-[#F2FBE0]/60"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Mark as completed
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  void handleUpdateGoalStatus(goal.id, 'active')
                                }
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-[#171622]/55" />
                                Reopen goal
                              </button>
                            )}

                            {goal.status === 'active' && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  void handleUpdateGoalStatus(goal.id, 'paused')
                                }
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                                Pause goal
                              </button>
                            )}

                            {goal.status === 'paused' && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  void handleUpdateGoalStatus(goal.id, 'active')
                                }
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <PlayCircle className="h-3.5 w-3.5 text-[#2E7D32]" />
                                Resume goal
                              </button>
                            )}

                            {goal.status !== 'archived' ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  void handleUpdateGoalStatus(
                                    goal.id,
                                    'archived'
                                  )
                                }
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <Archive className="h-3.5 w-3.5 text-[#171622]/55" />
                                Archive goal
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  void handleUpdateGoalStatus(goal.id, 'active')
                                }
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <ArchiveRestore className="h-3.5 w-3.5 text-[#171622]/55" />
                                Restore goal
                              </button>
                            )}

                            <div className="my-1 border-t border-[#171622]/6" />

                            {confirmDeleteGoalId !== goal.id ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => setConfirmDeleteGoalId(goal.id)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete goal
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => void handleDeleteGoal(goal.id)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                              >
                                Confirm delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (4 cols on lg): Analytics Sidebar matching reference image */}
        <div className="space-y-5 lg:col-span-4">
          {/* 1. Goal progress ring chart card */}
          <div className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[#171622]/75" />
              <h2 className="text-sm font-bold text-[#171622]">
                Goal progress
              </h2>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              {/* Circular Ring Chart */}
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                <svg
                  viewBox="0 0 112 112"
                  className="h-28 w-28 -rotate-90 transform"
                  aria-label={`Overall active goal progress ${summary.overallActiveProgressPercent}%`}
                >
                  <circle
                    cx="56"
                    cy="56"
                    r={ringRadius}
                    fill="none"
                    stroke="#ECEAF6"
                    strokeWidth="11"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r={ringRadius}
                    fill="none"
                    stroke="#63B838"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={`${overallProgressDash} ${ringCircumference}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold tracking-tight text-[#171622]">
                    {summary.overallActiveProgressPercent}%
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex-1 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[#171622]/70">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#63B838]" />
                    <span>On track</span>
                  </div>
                  <span className="font-bold text-[#171622]">
                    {summary.onTrackActiveCount}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[#171622]/70">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#9270EA]" />
                    <span>Due soon</span>
                  </div>
                  <span className="font-bold text-[#171622]">
                    {summary.approachingDeadlinesCount}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[#171622]/70">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E2E0EC]" />
                    <span>Completed</span>
                  </div>
                  <span className="font-bold text-[#171622]">
                    {summary.completedGoalsCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Upcoming deadlines card */}
          <div className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#171622]/75" />
                <h2 className="text-sm font-bold text-[#171622]">
                  Upcoming deadlines
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterTab('active');
                  setSortBy('target_date');
                }}
                className="text-xs font-semibold text-[#5B3FC4] hover:underline"
              >
                View all →
              </button>
            </div>

            {!goalsData || goalsData.upcomingDeadlines.length === 0 ? (
              <p className="mt-4 text-xs text-[#171622]/50">
                No active goals with target dates yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {goalsData.upcomingDeadlines.map((item) => {
                  const { Icon, iconBg, iconText } = getCategoryIconAndStyle(
                    item.category
                  );
                  const isOverdue = item.deadlineState === 'overdue';
                  return (
                    <li key={item.goalId}>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenDetailModal(item.goalId, 'milestones')
                        }
                        className="flex w-full items-center justify-between gap-2.5 rounded-2xl p-1.5 text-left transition-colors hover:bg-[#FAF9F6]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconText}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[#171622]">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-[#171622]/50">
                              Due {item.targetDateLabel}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                            isOverdue
                              ? 'bg-red-50 text-red-700'
                              : 'bg-[#FDF3EC] text-[#B8541A]'
                          }`}
                        >
                          {item.relativeDeadlineLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 3. Recent milestones card */}
          <div className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-[#171622]/75" />
                <h2 className="text-sm font-bold text-[#171622]">
                  Recent milestones
                </h2>
              </div>
              {allGoals.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleOpenDetailModal(allGoals[0].id, 'milestones')
                  }
                  className="text-xs font-semibold text-[#5B3FC4] hover:underline"
                >
                  View all →
                </button>
              )}
            </div>

            {!goalsData || goalsData.recentMilestones.length === 0 ? (
              <p className="mt-4 text-xs text-[#171622]/50">
                Add milestones to your goals to check off steps here.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {goalsData.recentMilestones.map((m) => {
                  const isDone = m.status === 'completed';
                  return (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-2.5"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateMilestone(m.goalId, m.id, {
                              status: isDone ? 'pending' : 'completed',
                            })
                          }
                          aria-label={
                            isDone
                              ? `Mark milestone "${m.title}" as pending`
                              : `Mark milestone "${m.title}" as completed`
                          }
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            isDone
                              ? 'border-[#52B748] bg-[#52B748] text-white'
                              : 'border-[#171622]/20 bg-white hover:border-[#52B748]'
                          }`}
                        >
                          {isDone && (
                            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenDetailModal(m.goalId, 'milestones')
                          }
                          className="min-w-0 text-left"
                        >
                          <p
                            className={`truncate text-xs font-semibold ${
                              isDone
                                ? 'text-[#171622]/50 line-through'
                                : 'text-[#171622]'
                            }`}
                          >
                            {m.title}
                          </p>
                          <p className="truncate text-[11px] text-[#171622]/45">
                            {m.goalTitle}
                          </p>
                        </button>
                      </div>

                      <span className="shrink-0 text-[11px] font-medium text-[#171622]/40">
                        {m.dateLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 4. Goal categories breakdown card */}
          <div className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[#171622]/75" />
              <h2 className="text-sm font-bold text-[#171622]">
                Goal categories
              </h2>
            </div>

            <ul className="mt-4 space-y-3">
              {(goalsData?.categoryBreakdown ?? []).map((item) => {
                const { Icon, iconBg, iconText, barColor } =
                  getCategoryIconAndStyle(item.category);
                const maxCount = Math.max(
                  1,
                  ...(goalsData?.categoryBreakdown.map((c) => c.count) ?? [1])
                );
                const widthPercent =
                  item.count > 0
                    ? Math.max(18, Math.round((item.count / maxCount) * 100))
                    : 0;

                return (
                  <li key={item.category}>
                    <button
                      type="button"
                      onClick={() =>
                        setCategoryFilter(
                          categoryFilter === item.category
                            ? 'all'
                            : item.category
                        )
                      }
                      className="flex w-full items-center justify-between gap-3 rounded-xl py-0.5 text-left transition-opacity hover:opacity-85"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconText}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate text-xs font-medium text-[#171622]/80">
                          {item.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-[#171622]/8">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="w-4 text-right text-xs font-bold text-[#171622]">
                          {item.count}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Add / Edit Goal Modal (keyed by editingGoal ID so state initializes cleanly) */}
      <GoalFormModal
        key={
          isFormOpen
            ? editingGoal
              ? `edit-${editingGoal.id}`
              : 'create-new-goal'
            : 'closed'
        }
        isOpen={isFormOpen}
        editingGoal={editingGoal}
        onClose={() => {
          setIsFormOpen(false);
          setEditingGoal(null);
        }}
        onSubmit={handleFormSubmit}
      />

      {/* Goal Detail, Milestones & Progress History Modal */}
      <GoalDetailModal
        key={
          activeDetailGoal
            ? `${activeDetailGoal.id}-${activeDetailGoal.updatedAt}-${detailInitialTab}`
            : 'closed-detail'
        }
        goal={activeDetailGoal}
        initialTab={detailInitialTab}
        onClose={() => setDetailGoalId(null)}
        onEditGoal={handleOpenEditModal}
        onUpdateGoalProgress={handleUpdateGoalProgress}
        onUpdateGoalStatus={handleUpdateGoalStatus}
        onDeleteGoal={handleDeleteGoal}
        onCreateMilestone={handleCreateMilestone}
        onUpdateMilestone={handleUpdateMilestone}
        onDeleteMilestone={handleDeleteMilestone}
      />
    </div>
  );
}
