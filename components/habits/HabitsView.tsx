'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  LayoutGrid,
  LayoutList,
  Leaf,
  Loader2,
  MoreVertical,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  formatHabitDateHeader,
  ISO_WEEKDAYS,
  shiftDateKeyByDays,
  type HabitCheckInAction,
  type HabitFilterTab,
  type HabitViewItem,
  type HabitsViewModel,
} from '@/lib/habits/habit-utils';
import HabitFormModal, { type HabitFormSubmitPayload } from './HabitFormModal';
import HabitDetailModal, {
  getHabitIconBadgeClasses,
  renderHabitCategoryIcon,
} from './HabitDetailModal';

interface HabitsViewProps {
  todayLocalDate: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  defaultOpenCreateModal?: boolean;
  onCreateModalOpened?: () => void;
  onHabitsMutated?: () => void;
}

export default function HabitsView({
  todayLocalDate,
  searchQuery,
  defaultOpenCreateModal = false,
  onCreateModalOpened,
  onHabitsMutated,
}: HabitsViewProps) {
  const [selectedDateKey, setSelectedDateKey] =
    useState<string>(todayLocalDate);
  const [viewModel, setViewModel] = useState<HabitsViewModel | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<HabitFilterTab>('all');
  const [layoutMode, setLayoutMode] = useState<'list' | 'compact'>('list');

  // Modals & menus state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(
    defaultOpenCreateModal
  );
  const [editingHabit, setEditingHabit] = useState<HabitViewItem | null>(null);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<HabitViewItem | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [openMenuHabitId, setOpenMenuHabitId] = useState<string | null>(null);
  const [busyHabitIds, setBusyHabitIds] = useState<Record<string, boolean>>({});
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const fetchHabits = useCallback(async (dateKey: string) => {
    try {
      const response = await fetch(
        `/api/habits?date=${encodeURIComponent(dateKey)}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          errBody.message || 'Unable to load habits right now.'
        );
      }

      const body = (await response.json()) as {
        status: string;
        data: HabitsViewModel;
      };
      setViewModel(body.data);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to load habits right now.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/habits?date=${encodeURIComponent(selectedDateKey)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const errBody = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(
            errBody.message || 'Unable to load habits right now.'
          );
        }
        const body = (await response.json()) as {
          status: string;
          data: HabitsViewModel;
        };
        if (!cancelled) {
          setViewModel(body.data);
          setErrorMessage(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Unable to load habits right now.'
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
  }, [selectedDateKey]);

  useEffect(() => {
    if (defaultOpenCreateModal) {
      onCreateModalOpened?.();
    }
  }, [defaultOpenCreateModal, onCreateModalOpened]);

  // Close row dropdown menu on outside click
  useEffect(() => {
    if (!openMenuHabitId) return;
    const handleClickOutside = () => setOpenMenuHabitId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openMenuHabitId]);

  const handleDateStep = (deltaDays: number) => {
    const nextDate = shiftDateKeyByDays(selectedDateKey, deltaDays);
    if (nextDate <= todayLocalDate) {
      setSelectedDateKey(nextDate);
    }
  };

  const handleCheckIn = async (
    habitId: string,
    dateKey: string,
    action: HabitCheckInAction
  ) => {
    if (busyHabitIds[habitId]) return;
    setBusyHabitIds((prev) => ({ ...prev, [habitId]: true }));
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/habits/${habitId}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: dateKey,
          action,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
      };

      if (!response.ok) {
        setErrorMessage(
          body.message || 'Could not update habit check-in. Please try again.'
        );
        return;
      }

      await fetchHabits(selectedDateKey);
      onHabitsMutated?.();
    } catch {
      setErrorMessage('Network error while recording habit check-in.');
    } finally {
      setBusyHabitIds((prev) => ({ ...prev, [habitId]: false }));
    }
  };

  const handleCreateHabit = async (payload: HabitFormSubmitPayload) => {
    const response = await fetch('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      fieldErrors?: Record<string, string>;
    };

    if (!response.ok) {
      return {
        ok: false,
        message: body.message || 'Could not create habit.',
        fieldErrors: body.fieldErrors,
      };
    }

    await fetchHabits(selectedDateKey);
    onHabitsMutated?.();
    setFeedbackBanner(`Created "${payload.title}".`);
    setTimeout(() => setFeedbackBanner(null), 3500);
    return { ok: true };
  };

  const handleUpdateHabit = async (payload: HabitFormSubmitPayload) => {
    if (!editingHabit) {
      return { ok: false, message: 'No habit selected for editing.' };
    }

    const response = await fetch(`/api/habits/${editingHabit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      fieldErrors?: Record<string, string>;
    };

    if (!response.ok) {
      return {
        ok: false,
        message: body.message || 'Could not update habit.',
        fieldErrors: body.fieldErrors,
      };
    }

    await fetchHabits(selectedDateKey);
    onHabitsMutated?.();
    setEditingHabit(null);
    setFeedbackBanner(`Updated "${payload.title}".`);
    setTimeout(() => setFeedbackBanner(null), 3500);
    return { ok: true };
  };

  const handleToggleArchive = async (habit: HabitViewItem) => {
    if (busyHabitIds[habit.id]) return;
    setBusyHabitIds((prev) => ({ ...prev, [habit.id]: true }));
    try {
      const response = await fetch(`/api/habits/${habit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !habit.isActive }),
      });

      if (response.ok) {
        await fetchHabits(selectedDateKey);
        onHabitsMutated?.();
        setFeedbackBanner(
          habit.isActive
            ? `Paused "${habit.title}".`
            : `Resumed "${habit.title}".`
        );
        setTimeout(() => setFeedbackBanner(null), 3500);
      } else {
        setErrorMessage('Could not update habit status.');
      }
    } catch {
      setErrorMessage('Network error while updating habit status.');
    } finally {
      setBusyHabitIds((prev) => ({ ...prev, [habit.id]: false }));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingHabit || isDeleting) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/habits/${deletingHabit.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        if (detailHabitId === deletingHabit.id) {
          setDetailHabitId(null);
        }
        const deletedTitle = deletingHabit.title;
        setDeletingHabit(null);
        await fetchHabits(selectedDateKey);
        onHabitsMutated?.();
        setFeedbackBanner(`Deleted "${deletedTitle}".`);
        setTimeout(() => setFeedbackBanner(null), 3500);
      } else {
        setErrorMessage('Could not delete habit.');
      }
    } catch {
      setErrorMessage('Network error while deleting habit.');
    } finally {
      setIsDeleting(false);
    }
  };

  const habits = useMemo(() => viewModel?.habits ?? [], [viewModel]);
  const activeHabits = useMemo(
    () => habits.filter((h) => h.isActive),
    [habits]
  );
  const archivedHabits = useMemo(
    () => habits.filter((h) => !h.isActive),
    [habits]
  );
  const dueHabits = useMemo(
    () => activeHabits.filter((h) => h.isDueOnSelectedDate),
    [activeHabits]
  );
  const completedHabits = useMemo(
    () =>
      activeHabits.filter((h) => h.selectedDateStatus === 'completed'),
    [activeHabits]
  );

  const filteredHabits = useMemo(() => {
    let base: HabitViewItem[] = activeHabits;
    if (activeFilter === 'due_today') {
      base = dueHabits;
    } else if (activeFilter === 'completed') {
      base = completedHabits;
    } else if (activeFilter === 'archived') {
      base = archivedHabits;
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        (h.description && h.description.toLowerCase().includes(q))
    );
  }, [
    activeFilter,
    activeHabits,
    dueHabits,
    completedHabits,
    archivedHabits,
    searchQuery,
  ]);

  const topStreakHabits = useMemo(() => {
    return [...activeHabits]
      .sort(
        (a, b) =>
          b.currentStreak - a.currentStreak ||
          b.bestStreak - a.bestStreak ||
          a.title.localeCompare(b.title)
      )
      .slice(0, 3);
  }, [activeHabits]);

  const detailHabit = useMemo(
    () => habits.find((h) => h.id === detailHabitId) ?? null,
    [habits, detailHabitId]
  );

  const isSelectedToday = selectedDateKey === todayLocalDate;
  const formattedSelectedDate = formatHabitDateHeader(selectedDateKey);

  const summary = viewModel?.summary ?? {
    activeHabitsCount: 0,
    archivedHabitsCount: 0,
    dueOnSelectedDateCount: 0,
    completedOnSelectedDateCount: 0,
    remainingOnSelectedDateCount: 0,
    topCurrentStreak: 0,
    topBestStreak: 0,
  };

  const weeklyProgress = viewModel?.weeklyChart ?? [];
  const maxWeeklyBar = Math.max(
    1,
    ...weeklyProgress.map((d) => Math.max(d.targetCount, d.completedCount))
  );

  const allDueCompleted =
    summary.dueOnSelectedDateCount > 0 &&
    summary.remainingOnSelectedDateCount === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622]">
            Habits &amp; Routines
          </h1>
          <p className="text-sm text-[#171622]/65">
            Small actions. Better days. Lasting progress.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Date Selector Bar matching Reference Image */}
          <div className="inline-flex items-center rounded-xl border border-[#171622]/12 bg-white p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => handleDateStep(-1)}
              aria-label="Previous day"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/70 hover:bg-[#FAF9F6] hover:text-[#171622] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1 text-xs sm:text-sm font-semibold text-[#171622] tabular-nums">
              <Calendar
                className="h-4 w-4 text-[#171622]/60"
                aria-hidden="true"
              />
              <span>{formattedSelectedDate}</span>
            </div>

            <button
              type="button"
              onClick={() => handleDateStep(1)}
              disabled={selectedDateKey >= todayLocalDate}
              aria-label="Next day"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/70 hover:bg-[#FAF9F6] hover:text-[#171622] transition-colors disabled:opacity-35 disabled:pointer-events-none"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {!isSelectedToday && (
            <button
              type="button"
              onClick={() => setSelectedDateKey(todayLocalDate)}
              className="inline-flex items-center rounded-xl border border-[#171622]/12 bg-white px-3 py-2 text-xs font-semibold text-[#5938B5] hover:bg-[#FAF9F6] transition-colors"
            >
              Today
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add habit</span>
          </button>
        </div>
      </div>

      {/* Feedback & Error Notices */}
      {feedbackBanner && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-xl border border-[#58B937]/30 bg-[#F2FBE0] px-4 py-2.5 text-xs font-semibold text-[#2F6B1E]"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{feedbackBanner}</span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B42318]/25 bg-[#FDECEC] px-4 py-3 text-xs text-[#B42318]"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              void fetchHabits(selectedDateKey);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#B42318] border border-[#B42318]/20 hover:bg-[#FDECEC]/50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 4 Top Summary Cards matching Reference Image */}
      <section
        aria-label="Habits summary metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {/* Card 1: Active habits */}
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className="group text-left rounded-2xl border border-[#171622]/8 bg-[#F2FBE0] p-5 transition-colors hover:border-[#171622]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C8F27C] text-[#2F6B1E]">
                <Leaf className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-[#2F6B1E]">
                  Active habits
                </p>
                <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#171622] tabular-nums leading-none">
                  {summary.activeHabitsCount}
                </p>
                <p className="pt-1 text-xs text-[#171622]/65 truncate">
                  {summary.dueOnSelectedDateCount} due{' '}
                  {isSelectedToday ? 'today' : 'this day'}
                </p>
              </div>
            </div>
            <ChevronRight
              className="mt-4 h-4 w-4 shrink-0 text-[#171622]/45 transition-transform group-hover:translate-x-0.5 group-hover:text-[#171622]"
              aria-hidden="true"
            />
          </div>
        </button>

        {/* Card 2: Completed today */}
        <button
          type="button"
          onClick={() => setActiveFilter('completed')}
          className="group text-left rounded-2xl border border-[#171622]/8 bg-[#F3F1FC] p-5 transition-colors hover:border-[#171622]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DFD9F5] text-[#4C3599]">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-[#4C3599]">
                  {isSelectedToday ? 'Completed today' : 'Completed on day'}
                </p>
                <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#171622] tabular-nums leading-none">
                  {summary.completedOnSelectedDateCount}
                </p>
                <p className="pt-1 text-xs text-[#171622]/65 truncate">
                  {summary.completedOnSelectedDateCount > 0
                    ? 'Great progress!'
                    : 'Ready when you are'}
                </p>
              </div>
            </div>
            <ChevronRight
              className="mt-4 h-4 w-4 shrink-0 text-[#171622]/45 transition-transform group-hover:translate-x-0.5 group-hover:text-[#171622]"
              aria-hidden="true"
            />
          </div>
        </button>

        {/* Card 3: Due today */}
        <button
          type="button"
          onClick={() => setActiveFilter('due_today')}
          className="group text-left rounded-2xl border border-[#171622]/8 bg-[#FDF3EC] p-5 transition-colors hover:border-[#171622]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FADCC8] text-[#B84A14]">
                <Clock className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-[#B84A14]">
                  {isSelectedToday ? 'Due today' : 'Scheduled on day'}
                </p>
                <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#171622] tabular-nums leading-none">
                  {summary.dueOnSelectedDateCount}
                </p>
                <p className="pt-1 text-xs text-[#171622]/65 truncate">
                  {summary.remainingOnSelectedDateCount === 0 &&
                  summary.dueOnSelectedDateCount > 0
                    ? 'All done for today!'
                    : `${summary.remainingOnSelectedDateCount} remaining`}
                </p>
              </div>
            </div>
            <ChevronRight
              className="mt-4 h-4 w-4 shrink-0 text-[#171622]/45 transition-transform group-hover:translate-x-0.5 group-hover:text-[#171622]"
              aria-hidden="true"
            />
          </div>
        </button>

        {/* Card 4: Current streak */}
        <button
          type="button"
          onClick={() => {
            if (topStreakHabits[0]) {
              setDetailHabitId(topStreakHabits[0].id);
            }
          }}
          className="group text-left rounded-2xl border border-[#171622]/8 bg-[#F3F1FC] p-5 transition-colors hover:border-[#171622]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DFD9F5] text-[#4C3599]">
                <Flame className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-[#4C3599]">
                  Current streak
                </p>
                <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#171622] tabular-nums leading-none">
                  {summary.topCurrentStreak}
                </p>
                <p className="pt-1 text-xs text-[#171622]/65 truncate">
                  Best: {summary.topBestStreak}{' '}
                  {summary.topBestStreak === 1 ? 'day' : 'days'}
                </p>
              </div>
            </div>
            <ChevronRight
              className="mt-4 h-4 w-4 shrink-0 text-[#171622]/45 transition-transform group-hover:translate-x-0.5 group-hover:text-[#171622]"
              aria-hidden="true"
            />
          </div>
        </button>
      </section>

      {/* Main 2-Column Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Filter Tabs + Habit List (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Filter Tabs & Week / View Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Filter habits"
              className="flex flex-wrap items-center gap-2"
            >
              {(
                [
                  {
                    id: 'all',
                    label: `All (${activeHabits.length})`,
                  },
                  {
                    id: 'due_today',
                    label: `${isSelectedToday ? 'Due today' : 'Due'} (${dueHabits.length})`,
                  },
                  {
                    id: 'completed',
                    label: `Completed (${completedHabits.length})`,
                  },
                  {
                    id: 'archived',
                    label: `Archived (${archivedHabits.length})`,
                  },
                ] as const
              ).map((tab) => {
                const isSelected = activeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveFilter(tab.id)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                      isSelected
                        ? 'bg-[#C8F27C] text-[#171622] border border-[#171622]/12'
                        : 'bg-white text-[#171622]/70 border border-[#171622]/10 hover:bg-[#FAF9F6] hover:text-[#171622]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/10 bg-white px-3 py-1.5 text-xs font-medium text-[#171622]">
                <span>{isSelectedToday ? 'This week' : 'Selected week'}</span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setLayoutMode((prev) =>
                    prev === 'list' ? 'compact' : 'list'
                  )
                }
                aria-label={
                  layoutMode === 'list'
                    ? 'Switch to compact view'
                    : 'Switch to detailed list view'
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#171622]/10 bg-white text-[#171622]/70 hover:bg-[#FAF9F6] hover:text-[#171622]"
              >
                {layoutMode === 'list' ? (
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <LayoutList className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* All due habits completed celebration banner */}
          {allDueCompleted && activeFilter !== 'archived' && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#58B937]/25 bg-[#F2FBE0] px-4 py-3 text-xs sm:text-sm text-[#2F6B1E]">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-semibold">
                  You&apos;ve completed every habit scheduled for{' '}
                  {isSelectedToday ? 'today' : formattedSelectedDate}!
                </span>
              </div>
            </div>
          )}

          {/* Habits List Container */}
          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-[#171622]/10 bg-white p-10 text-center space-y-3"
            >
              <Loader2
                className="mx-auto h-6 w-6 animate-spin text-[#5938B5]"
                aria-hidden="true"
              />
              <p className="text-xs font-semibold text-[#171622]/70">
                Loading your habits and consistency history...
              </p>
            </div>
          ) : habits.length === 0 ? (
            /* First-Use Empty State */
            <div className="rounded-2xl border border-[#171622]/10 bg-white px-6 py-14 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2FBE0] text-[#2F6B1E]">
                <Leaf className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#171622]">
                  Build a routine that works for you.
                </h2>
                <p className="text-xs sm:text-sm text-[#171622]/65 leading-relaxed">
                  Start with one small habit and build consistency at your own
                  pace.
                </p>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Add your first habit</span>
                </button>
              </div>
            </div>
          ) : filteredHabits.length === 0 ? (
            /* Filtered Empty State */
            <div className="rounded-2xl border border-[#171622]/10 bg-white px-6 py-12 text-center space-y-3">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#FAF9F6] text-[#171622]/70">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <p className="font-display text-base font-bold text-[#171622]">
                  {searchQuery.trim()
                    ? 'No matching habits found.'
                    : activeFilter === 'archived'
                      ? 'No paused or archived habits.'
                      : activeFilter === 'completed'
                        ? `No habits marked completed for ${isSelectedToday ? 'today' : formattedSelectedDate} yet.`
                        : `No habits scheduled for ${isSelectedToday ? 'today' : formattedSelectedDate}.`}
                </p>
                <p className="text-xs text-[#171622]/60">
                  {searchQuery.trim()
                    ? 'Try clearing your search filter or creating a new habit.'
                    : activeFilter === 'archived'
                      ? 'When you pause an active habit, it will stay safely stored here.'
                      : 'Check off a habit from All Habits or add a new routine.'}
                </p>
              </div>
              {activeFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
                >
                  <span>View all active habits</span>
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#171622]/10 bg-white divide-y divide-[#171622]/8">
              {filteredHabits.map((habit) => {
                const isBusy = Boolean(busyHabitIds[habit.id]);
                const isCompleted = habit.selectedDateStatus === 'completed';
                const isSkipped = habit.selectedDateStatus === 'skipped';
                const progressPct = habit.weeklyProgressPercent;

                const effectiveScheduledDays =
                  habit.scheduledDays && habit.scheduledDays.length > 0
                    ? habit.scheduledDays
                    : [1, 2, 3, 4, 5, 6, 7];

                return (
                  <div
                    key={habit.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-5 ${
                      layoutMode === 'compact' ? 'py-3' : 'py-4'
                    } transition-colors hover:bg-[#FAF9F6]/60`}
                  >
                    {/* Left: Icon + Title & Description */}
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setDetailHabitId(habit.id)}
                        aria-label={`View analytics for ${habit.title}`}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform hover:scale-105 ${getHabitIconBadgeClasses(
                          habit.iconKey
                        )}`}
                      >
                        {renderHabitCategoryIcon(habit.iconKey, 'h-5 w-5')}
                      </button>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setDetailHabitId(habit.id)}
                            className="text-left text-sm font-bold text-[#171622] hover:text-[#5938B5] transition-colors truncate max-w-full"
                          >
                            {habit.title}
                          </button>
                          {!habit.isActive && (
                            <span className="rounded-md bg-[#171622]/10 px-2 py-0.5 text-[10px] font-semibold text-[#171622]/70">
                              Paused
                            </span>
                          )}
                          {isSkipped && (
                            <span className="rounded-md bg-[#C8F27C]/70 px-2 py-0.5 text-[10px] font-semibold text-[#171622]">
                              Skipped
                            </span>
                          )}
                        </div>
                        {layoutMode === 'list' && (
                          <p className="text-xs text-[#171622]/60 truncate">
                            {habit.description ||
                              `${habit.targetPerWeek} days per week · ${habit.completionRate30d ?? 0}% 30d rate`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Middle: Mon-Sun Weekday Pills + Weekly Progress Bar */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-4 sm:gap-5">
                      {/* Weekday Schedule Pills matching Reference Image */}
                      <div
                        className="flex items-center gap-1"
                        aria-label="Scheduled days of week"
                      >
                        {ISO_WEEKDAYS.map((dayMeta) => {
                          const isScheduled = effectiveScheduledDays.includes(
                            dayMeta.isoDay
                          );
                          return (
                            <span
                              key={dayMeta.isoDay}
                              className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                                isScheduled
                                  ? 'bg-[#C8F27C] text-[#171622]'
                                  : 'bg-[#FAF9F6] text-[#171622]/45'
                              }`}
                            >
                              {dayMeta.shortLabel}
                            </span>
                          );
                        })}
                      </div>

                      {/* Weekly Progress Bar (`X/Y this week`) */}
                      <button
                        type="button"
                        onClick={() => setDetailHabitId(habit.id)}
                        className="w-28 text-left space-y-1.5 shrink-0 group"
                        aria-label={`${habit.completedThisWeek} of ${habit.targetPerWeek} completed this week. View habit analytics`}
                      >
                        <div className="flex items-center justify-between text-xs font-medium text-[#171622]/75 tabular-nums">
                          <span>
                            {habit.completedThisWeek}/{habit.targetPerWeek} this
                            week
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#171622]/10">
                          <div
                            style={{ width: `${progressPct}%` }}
                            className="h-full rounded-full bg-[#58B937] transition-all"
                          />
                        </div>
                      </button>

                      {/* Daily Check-In Button + More Actions Menu */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleCheckIn(
                              habit.id,
                              selectedDateKey,
                              isCompleted ? 'undo' : 'completed'
                            )
                          }
                          aria-label={
                            isCompleted
                              ? `Undo completion for '${habit.title}' on ${formattedSelectedDate}`
                              : `Mark '${habit.title}' as completed for ${formattedSelectedDate}`
                          }
                          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] disabled:opacity-50 ${
                            isCompleted
                              ? 'border-[#4C9E2B] bg-[#58B937] text-white'
                              : isSkipped
                                ? 'border-[#8FB83B] bg-[#C8F27C] text-[#171622]'
                                : 'border-[#171622]/25 bg-white hover:border-[#171622]'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin text-[#171622]"
                              aria-hidden="true"
                            />
                          ) : isCompleted ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          ) : isSkipped ? (
                            <SkipForward
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>

                        {/* Row Actions Menu */}
                        <div
                          className="relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuHabitId((prev) =>
                                prev === habit.id ? null : habit.id
                              )
                            }
                            aria-label={`Actions for ${habit.title}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/55 hover:bg-[#171622]/6 hover:text-[#171622] transition-colors"
                          >
                            <MoreVertical
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </button>

                          {openMenuHabitId === habit.id && (
                            <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-[#171622]/12 bg-white py-1.5 shadow-lg z-30">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuHabitId(null);
                                  setDetailHabitId(habit.id);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <BarChart3
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>View progress &amp; heatmap</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuHabitId(null);
                                  void handleCheckIn(
                                    habit.id,
                                    selectedDateKey,
                                    isCompleted ? 'undo' : 'completed'
                                  );
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <Check
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>
                                  {isCompleted
                                    ? 'Undo completion'
                                    : 'Mark completed'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuHabitId(null);
                                  void handleCheckIn(
                                    habit.id,
                                    selectedDateKey,
                                    isSkipped ? 'undo' : 'skipped'
                                  );
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <SkipForward
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>
                                  {isSkipped
                                    ? 'Clear skipped status'
                                    : 'Skip for this day'}
                                </span>
                              </button>

                              {(isCompleted || isSkipped) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuHabitId(null);
                                    void handleCheckIn(
                                      habit.id,
                                      selectedDateKey,
                                      'undo'
                                    );
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                >
                                  <RotateCcw
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Reset check-in</span>
                                </button>
                              )}

                              <div className="my-1 border-t border-[#171622]/8" />

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuHabitId(null);
                                  setEditingHabit(habit);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                <Pencil
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Edit habit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuHabitId(null);
                                  void handleToggleArchive(habit);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                              >
                                {habit.isActive ? (
                                  <PauseCircle
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <PlayCircle
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>
                                  {habit.isActive
                                    ? 'Pause / archive'
                                    : 'Resume habit'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuHabitId(null);
                                  setDeletingHabit(habit);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#B42318] hover:bg-[#FDECEC]/60"
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Delete habit</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Weekly Progress, Habit Streaks & Today's Habits (4 cols on lg) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Panel 1: Weekly progress */}
          <section
            aria-labelledby="habits-weekly-progress-heading"
            className="rounded-2xl border border-[#171622]/10 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3
                  className="h-4 w-4 text-[#171622]"
                  aria-hidden="true"
                />
                <h2
                  id="habits-weekly-progress-heading"
                  className="font-display text-sm sm:text-base font-bold text-[#171622]"
                >
                  Weekly progress
                </h2>
              </div>
              <span className="rounded-lg border border-[#171622]/10 bg-[#FAF9F6] px-2.5 py-1 text-[11px] font-medium text-[#171622]/75">
                {isSelectedToday ? 'This week' : 'Selected week'}
              </span>
            </div>

            {/* 7-Day Vertical Pill Bars matching Reference Image */}
            <div className="pt-2">
              <div className="h-36 flex items-end justify-between gap-2.5 px-1">
                {weeklyProgress.map((day) => {
                  const targetHeightPct = Math.min(
                    100,
                    Math.round((day.targetCount / maxWeeklyBar) * 100)
                  );
                  const completedHeightPct = Math.min(
                    100,
                    Math.round((day.completedCount / maxWeeklyBar) * 100)
                  );
                  return (
                    <button
                      key={day.dateKey}
                      type="button"
                      disabled={day.dateKey > todayLocalDate}
                      onClick={() => {
                        if (day.dateKey <= todayLocalDate) {
                          setSelectedDateKey(day.dateKey);
                        }
                      }}
                      title={`${day.dayLabel} (${day.dateKey}): ${day.completedCount}/${day.targetCount} completed`}
                      className="flex-1 flex flex-col items-center gap-2 h-full group focus-visible:outline-2 focus-visible:outline-[#171622] rounded-md disabled:opacity-50"
                    >
                      <div className="relative w-full max-w-[22px] flex-1 rounded-md bg-[#171622]/6 overflow-hidden flex items-end">
                        {/* Target height indicator */}
                        {day.targetCount > 0 && (
                          <div
                            style={{
                              height: `${Math.max(targetHeightPct, 12)}%`,
                            }}
                            className="w-full rounded-t-md bg-[#C8F27C]/45 transition-all"
                          />
                        )}
                        {/* Completed height bar */}
                        {day.completedCount > 0 && (
                          <div
                            style={{
                              height: `${Math.max(completedHeightPct, 14)}%`,
                            }}
                            className="absolute bottom-0 inset-x-0 rounded-t-md bg-[#58B937] transition-all"
                          />
                        )}
                      </div>
                      <span
                        className={`text-[11px] tabular-nums ${
                          day.isSelected
                            ? 'font-bold text-[#171622] underline underline-offset-4'
                            : day.isToday
                              ? 'font-bold text-[#5938B5]'
                              : 'font-medium text-[#171622]/60'
                        }`}
                      >
                        {day.dayLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-center gap-5 pt-2 border-t border-[#171622]/8 text-[11px] text-[#171622]/65">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#58B937]" />
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#171622]/15" />
                <span>Target</span>
              </div>
            </div>
          </section>

          {/* Panel 2: Habit streaks */}
          <section
            aria-labelledby="habit-streaks-heading"
            className="rounded-2xl border border-[#171622]/10 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flame
                  className="h-4 w-4 text-[#171622]"
                  aria-hidden="true"
                />
                <h2
                  id="habit-streaks-heading"
                  className="font-display text-sm sm:text-base font-bold text-[#171622]"
                >
                  Habit streaks
                </h2>
              </div>
              {topStreakHabits.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetailHabitId(topStreakHabits[0].id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622] transition-colors"
                >
                  <span>View all</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {topStreakHabits.length === 0 ? (
              <p className="text-xs text-[#171622]/60 py-4 text-center">
                Your active habit streaks will appear here as you check in.
              </p>
            ) : (
              <ul className="space-y-3">
                {topStreakHabits.map((habit) => (
                  <li key={habit.id}>
                    <button
                      type="button"
                      onClick={() => setDetailHabitId(habit.id)}
                      className="w-full flex items-center justify-between gap-3 rounded-xl bg-[#FAF9F6]/70 hover:bg-[#FAF9F6] px-3.5 py-2.5 text-left transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${getHabitIconBadgeClasses(
                            habit.iconKey
                          )}`}
                        >
                          {renderHabitCategoryIcon(habit.iconKey, 'h-4 w-4')}
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-[#171622] truncate">
                          {habit.title}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-[#D95D24] tabular-nums">
                          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            {habit.currentStreak}{' '}
                            {habit.currentStreak === 1 ? 'day' : 'days'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#171622]/55 tabular-nums">
                          Best: {habit.bestStreak}{' '}
                          {habit.bestStreak === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Panel 3: Today's habits quick checklist */}
          <section
            aria-labelledby="todays-habits-quick-heading"
            className="rounded-2xl border border-[#171622]/10 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4 text-[#171622]"
                  aria-hidden="true"
                />
                <h2
                  id="todays-habits-quick-heading"
                  className="font-display text-sm sm:text-base font-bold text-[#171622]"
                >
                  {isSelectedToday ? "Today's habits" : 'Scheduled on day'}
                </h2>
              </div>
              <span className="text-xs font-medium text-[#171622]/60 tabular-nums">
                {dueHabits.length} due {isSelectedToday ? 'today' : ''}
              </span>
            </div>

            {dueHabits.length === 0 ? (
              <p className="text-xs text-[#171622]/60 py-3 text-center">
                No habits scheduled for this day.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {dueHabits.slice(0, 5).map((habit) => {
                  const isCompleted = habit.selectedDateStatus === 'completed';
                  const isBusy = Boolean(busyHabitIds[habit.id]);
                  return (
                    <li
                      key={habit.id}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-[#FAF9F6]"
                    >
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleCheckIn(
                            habit.id,
                            selectedDateKey,
                            isCompleted ? 'undo' : 'completed'
                          )
                        }
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            isCompleted
                              ? 'border-[#4C9E2B] bg-[#58B937] text-white'
                              : 'border-[#171622]/25 bg-white'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2
                              className="h-3 w-3 animate-spin text-[#171622]"
                              aria-hidden="true"
                            />
                          ) : (
                            isCompleted && (
                              <Check
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )
                          )}
                        </span>
                        <span
                          className={`text-xs sm:text-sm font-medium truncate ${
                            isCompleted
                              ? 'line-through text-[#171622]/50'
                              : 'text-[#171622]'
                          }`}
                        >
                          {habit.title}
                        </span>
                      </button>

                      <span className="text-[11px] text-[#171622]/50 tabular-nums shrink-0">
                        {habit.completedThisWeek}/{habit.targetPerWeek}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622] transition-colors"
              >
                <span>View all habits</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Create Habit Modal */}
      <HabitFormModal
        key={`create-habit-${isCreateModalOpen ? 'open' : 'closed'}`}
        isOpen={isCreateModalOpen}
        mode="create"
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateHabit}
      />

      {/* Edit Habit Modal */}
      <HabitFormModal
        key={`edit-habit-${editingHabit?.id ?? 'closed'}`}
        isOpen={Boolean(editingHabit)}
        mode="edit"
        initialHabit={editingHabit}
        onClose={() => setEditingHabit(null)}
        onSubmit={handleUpdateHabit}
      />

      {/* Habit Detail & 12-Week Consistency Heatmap Modal */}
      <HabitDetailModal
        key={`detail-habit-${detailHabit?.id ?? 'closed'}`}
        habit={detailHabit}
        todayDateKey={todayLocalDate}
        selectedDateKey={selectedDateKey}
        onClose={() => setDetailHabitId(null)}
        onEdit={(habit) => {
          setDetailHabitId(null);
          setEditingHabit(habit);
        }}
        onToggleArchive={handleToggleArchive}
        onDeleteRequest={(habit) => setDeletingHabit(habit)}
        onCheckIn={handleCheckIn}
      />

      {/* Delete Confirmation Modal */}
      {deletingHabit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-habit-modal-title"
        >
          <div
            className="fixed inset-0 bg-[#171622]/40 backdrop-blur-xs"
            onClick={() => {
              if (!isDeleting) setDeletingHabit(null);
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-4">
            <div className="space-y-1.5">
              <h2
                id="delete-habit-modal-title"
                className="font-display text-lg font-bold text-[#171622]"
              >
                Delete &ldquo;{deletingHabit.title}&rdquo;?
              </h2>
              <p className="text-xs sm:text-sm text-[#171622]/70 leading-relaxed">
                This will permanently delete this habit and all of its
                historical check-in logs. If you want to keep your past streak
                history, you can pause this habit instead.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingHabit(null)}
                className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
              >
                Cancel
              </button>

              {deletingHabit.isActive && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    const target = deletingHabit;
                    setDeletingHabit(null);
                    void handleToggleArchive(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#EBE8F8]/60"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pause instead</span>
                </button>
              )}

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B42318] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B42318]/90 disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{isDeleting ? 'Deleting...' : 'Delete permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
