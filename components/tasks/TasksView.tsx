'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  SerializedTaskItem,
  TaskPriority,
  TaskScheduleFilter,
  TaskSortField,
  TaskStatus,
  TaskSummaryMetrics,
} from '@/lib/tasks/validation';
import TaskFormModal, { type TaskFormSubmitPayload } from './TaskFormModal';
import DeleteTaskDialog from './DeleteTaskDialog';
import TaskDetailView from './TaskDetailView';

interface TasksViewProps {
  todayLocalDate: string;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  defaultOpenCreateModal?: boolean;
  onCreateModalOpened?: () => void;
  initialSelectedTaskId?: string | null;
  onTasksMutated?: () => void;
}

const PRIORITY_BADGES: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  high: {
    label: 'High',
    className: 'bg-[#FDECEC] text-[#B42318]',
  },
  medium: {
    label: 'Medium',
    className: 'bg-[#EBE8F8] text-[#5938B5]',
  },
  low: {
    label: 'Low',
    className: 'bg-[#EAF7E1] text-[#2F6B1E]',
  },
};

const STATUS_BADGES: Record<
  TaskStatus,
  { label: string; className: string }
> = {
  todo: {
    label: 'To do',
    className: 'bg-[#F2F1EE] text-[#171622]/75',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-[#E6F0FF] text-[#1D4ED8]',
  },
  completed: {
    label: 'Completed',
    className: 'bg-[#E2F7C4] text-[#2F6B1E]',
  },
  archived: {
    label: 'Archived',
    className: 'bg-[#F2F1EE] text-[#171622]/60',
  },
};

export default function TasksView({
  todayLocalDate,
  searchQuery,
  onSearchChange,
  defaultOpenCreateModal = false,
  onCreateModalOpened,
  initialSelectedTaskId = null,
  onTasksMutated,
}: TasksViewProps) {
  const [tasks, setTasks] = useState<SerializedTaskItem[]>([]);
  const [summary, setSummary] = useState<TaskSummaryMetrics>({
    totalCount: 0,
    totalActiveCount: 0,
    todoCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    overdueCount: 0,
    dueTodayCount: 0,
    archivedCount: 0,
    completionRatePercent: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'error' | 'info';
    message: string;
  } | null>(null);

  // Filters & view state
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>(
    'all'
  );
  const [scheduleFilter, setScheduleFilter] =
    useState<TaskScheduleFilter>('all');
  const [sortBy, setSortBy] = useState<TaskSortField>('due_date');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Detail view & active row action menu
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialSelectedTaskId
  );
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);

  // Modals & row busy tracking
  const [isFormModalOpen, setIsFormModalOpen] = useState(
    defaultOpenCreateModal
  );
  const [formModalMode, setFormModalMode] = useState<'create' | 'edit'>(
    'create'
  );
  const [editingTask, setEditingTask] = useState<SerializedTaskItem | null>(
    null
  );
  const [taskToDelete, setTaskToDelete] = useState<SerializedTaskItem | null>(
    null
  );
  const [busyTaskIds, setBusyTaskIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (defaultOpenCreateModal && onCreateModalOpened) {
      onCreateModalOpened();
    }
  }, [defaultOpenCreateModal, onCreateModalOpened]);

  const loadTasksFromApi = useCallback(async () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (scheduleFilter !== 'all') params.set('schedule', scheduleFilter);
    params.set('sortBy', sortBy);

    const response = await fetch(`/api/tasks?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    const data = await response.json();
    return { ok: response.ok && data.status === 'ok', data };
  }, [searchQuery, statusFilter, priorityFilter, scheduleFilter, sortBy]);

  const refreshTasks = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const { ok, data } = await loadTasksFromApi();
        if (!ok) {
          setErrorMessage(
            data?.message ||
              'We could not load your tasks from PostgreSQL right now.'
          );
          return;
        }
        setTasks(data.tasks ?? []);
        if (data.summary) {
          setSummary(data.summary);
        }
      } catch {
        setErrorMessage(
          'Unable to reach the server to load your tasks. Please check your connection and try again.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [loadTasksFromApi]
  );

  useEffect(() => {
    let cancelled = false;

    async function runInitialOrFilterFetch() {
      try {
        const { ok, data } = await loadTasksFromApi();
        if (cancelled) return;
        if (!ok) {
          setErrorMessage(
            data?.message ||
              'We could not load your tasks from PostgreSQL right now.'
          );
        } else {
          setErrorMessage(null);
          setTasks(data.tasks ?? []);
          if (data.summary) {
            setSummary(data.summary);
          }
        }
      } catch {
        if (!cancelled) {
          setErrorMessage(
            'Unable to reach the server to load your tasks. Please check your connection and try again.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    runInitialOrFilterFetch();
    return () => {
      cancelled = true;
    };
  }, [loadTasksFromApi]);

  function openCreateTaskModal() {
    setOpenMenuTaskId(null);
    setEditingTask(null);
    setFormModalMode('create');
    setIsFormModalOpen(true);
  }

  function openEditTaskModal(task: SerializedTaskItem) {
    setOpenMenuTaskId(null);
    setEditingTask(task);
    setFormModalMode('edit');
    setIsFormModalOpen(true);
  }

  async function handleFormSubmit(payload: TaskFormSubmitPayload): Promise<{
    ok: boolean;
    error?: string;
    fieldErrors?: Record<string, string>;
  }> {
    setActionFeedback(null);
    const isEdit = formModalMode === 'edit' && editingTask;
    const url = isEdit ? `/api/tasks/${editingTask.id}` : '/api/tasks';
    const method = isEdit ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || data.status !== 'ok') {
      return {
        ok: false,
        error: data.message || 'Could not save task.',
        fieldErrors: data.fieldErrors,
      };
    }

    await refreshTasks({ silent: true });
    onTasksMutated?.();
    return { ok: true };
  }

  async function handlePatchTask(
    taskId: string,
    patchBody: Record<string, unknown>,
    errorFallback: string
  ): Promise<{ ok: boolean; error?: string }> {
    setActionFeedback(null);
    setBusyTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patchBody),
      });

      const data = await response.json();
      if (!response.ok || data.status !== 'ok') {
        const msg = data.message || errorFallback;
        setActionFeedback({ type: 'error', message: msg });
        return { ok: false, error: msg };
      }

      await refreshTasks({ silent: true });
      onTasksMutated?.();
      return { ok: true };
    } catch {
      const msg = 'Unable to update task right now. Please try again.';
      setActionFeedback({ type: 'error', message: msg });
      return { ok: false, error: msg };
    } finally {
      setBusyTaskIds((prev) => ({ ...prev, [taskId]: false }));
    }
  }

  async function handleToggleComplete(task: SerializedTaskItem) {
    setOpenMenuTaskId(null);
    const nextStatus: TaskStatus =
      task.status === 'completed' ? 'todo' : 'completed';
    await handlePatchTask(
      task.id,
      { status: nextStatus },
      'Could not update task completion state.'
    );
  }

  async function handleChangeStatus(
    task: SerializedTaskItem,
    nextStatus: TaskStatus
  ) {
    await handlePatchTask(
      task.id,
      { status: nextStatus },
      'Could not update task status.'
    );
  }

  async function handleChangePriority(
    task: SerializedTaskItem,
    nextPriority: TaskPriority
  ) {
    await handlePatchTask(
      task.id,
      { priority: nextPriority },
      'Could not update task priority.'
    );
  }

  async function handleArchiveOrRestore(
    task: SerializedTaskItem
  ): Promise<{ ok: boolean; error?: string }> {
    setOpenMenuTaskId(null);
    const nextStatus: TaskStatus =
      task.status === 'archived'
        ? task.completedAt
          ? 'completed'
          : 'todo'
        : 'archived';
    const res = await handlePatchTask(
      task.id,
      { status: nextStatus },
      'Could not update task archive state.'
    );
    if (res.ok && selectedTaskId === task.id && nextStatus === 'archived') {
      setSelectedTaskId(null);
    }
    return res;
  }

  async function handleConfirmDelete(
    taskId: string
  ): Promise<{ ok: boolean; error?: string }> {
    setActionFeedback(null);
    setBusyTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || data.status !== 'ok') {
        return {
          ok: false,
          error: data.message || 'Could not delete task.',
        };
      }

      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
      await refreshTasks({ silent: true });
      onTasksMutated?.();
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Unable to delete task right now. Please try again.',
      };
    } finally {
      setBusyTaskIds((prev) => ({ ...prev, [taskId]: false }));
    }
  }

  function resetAllFilters() {
    onSearchChange('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setScheduleFilter('all');
    setSortBy('due_date');
  }

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    scheduleFilter !== 'all';

  const totalUserTasksInDb = summary.totalCount + summary.archivedCount;
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  const statusTabs: {
    id: 'all' | TaskStatus;
    label: string;
    count: number;
  }[] = [
    { id: 'all', label: 'All', count: summary.totalCount },
    { id: 'todo', label: 'To do', count: summary.todoCount },
    { id: 'in_progress', label: 'In progress', count: summary.inProgressCount },
    { id: 'completed', label: 'Completed', count: summary.completedCount },
    { id: 'archived', label: 'Archived', count: summary.archivedCount },
  ];

  const combinedScheduleSortValue =
    scheduleFilter !== 'all' ? `schedule:${scheduleFilter}` : `sort:${sortBy}`;

  function handleCombinedScheduleSortChange(val: string) {
    if (val.startsWith('schedule:')) {
      const sched = val.replace('schedule:', '') as TaskScheduleFilter;
      setScheduleFilter(sched);
    } else if (val.startsWith('sort:')) {
      const sort = val.replace('sort:', '') as TaskSortField;
      setScheduleFilter('all');
      setSortBy(sort);
    }
  }

  return (
    <div className="space-y-6">
      {selectedTask ? (
        <TaskDetailView
          task={selectedTask}
          isBusy={Boolean(busyTaskIds[selectedTask.id])}
          onBack={() => setSelectedTaskId(null)}
          onEdit={openEditTaskModal}
          onToggleComplete={handleToggleComplete}
          onChangeStatus={handleChangeStatus}
          onChangePriority={handleChangePriority}
          onArchiveOrRestore={handleArchiveOrRestore}
          onRequestDelete={(t) => setTaskToDelete(t)}
        />
      ) : (
        <>
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622]">
                My Tasks
              </h1>
              <p className="text-sm sm:text-base text-[#171622]/65">
                Keep track of what matters, one step at a time.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateTaskModal}
              className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add task</span>
            </button>
          </div>

          {/* 3 Summary Cards Matching Mockup */}
          <section
            aria-label="Task summary metrics"
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {/* Card 1: Total tasks */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setScheduleFilter('all');
              }}
              className="group flex items-center justify-between rounded-2xl bg-[#EFFAE1] p-5 text-left transition-all hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C8F27C] text-[#171622]">
                  <CheckSquare className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-medium text-[#171622]/75">
                    Total tasks
                  </p>
                  <p
                    data-testid="tasks-metric-total"
                    className="font-display text-2xl sm:text-3xl font-extrabold text-[#171622] tabular-nums leading-tight"
                  >
                    {summary.totalCount}
                  </p>
                  <p
                    data-testid="tasks-metric-active"
                    className="text-xs text-[#171622]/60 truncate tabular-nums"
                  >
                    {summary.totalActiveCount} active • {summary.completedCount}{' '}
                    completed
                  </p>
                </div>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[#171622]/40 group-hover:translate-x-0.5 group-hover:text-[#171622]/75 transition-transform"
                aria-hidden="true"
              />
            </button>

            {/* Card 2: Completed */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('completed');
                setScheduleFilter('all');
              }}
              className="group flex items-center justify-between rounded-2xl bg-[#F3F0FA] p-5 text-left transition-all hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E2DCF8] text-[#171622]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-medium text-[#171622]/75">
                    Completed
                  </p>
                  <p
                    data-testid="tasks-metric-completed"
                    className="font-display text-2xl sm:text-3xl font-extrabold text-[#171622] tabular-nums leading-tight"
                  >
                    {summary.completedCount}
                  </p>
                  <p className="text-xs text-[#171622]/60 truncate tabular-nums">
                    {summary.totalCount > 0
                      ? `${summary.completionRatePercent}% of total`
                      : 'Ready to start'}
                  </p>
                </div>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[#171622]/40 group-hover:translate-x-0.5 group-hover:text-[#171622]/75 transition-transform"
                aria-hidden="true"
              />
            </button>

            {/* Card 3: Overdue */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setScheduleFilter('overdue');
              }}
              className="group flex items-center justify-between rounded-2xl bg-[#FDF3EF] p-5 text-left transition-all hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FCE4DC] text-[#D92D20]">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-medium text-[#171622]/75">
                    Overdue
                  </p>
                  <p
                    data-testid="tasks-metric-overdue"
                    className="font-display text-2xl sm:text-3xl font-extrabold text-[#171622] tabular-nums leading-tight"
                  >
                    {summary.overdueCount}
                  </p>
                  <p className="text-xs text-[#171622]/60 truncate">
                    {summary.overdueCount > 0
                      ? 'Needs attention'
                      : 'All caught up'}
                  </p>
                </div>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[#171622]/40 group-hover:translate-x-0.5 group-hover:text-[#171622]/75 transition-transform"
                aria-hidden="true"
              />
            </button>
          </section>

          {/* Filter Tabs & Controls Row Matching Mockup */}
          <section
            aria-label="Filter and sort tasks"
            className="flex flex-col lg:flex-row lg:items-center justify-between gap-3"
          >
            {/* Status Filter Tabs with Counts */}
            <div
              role="tablist"
              aria-label="Task status filter"
              className="flex flex-wrap items-center gap-1.5"
            >
              {statusTabs.map((tab) => {
                const isSelected =
                  statusFilter === tab.id && scheduleFilter === 'all';
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setScheduleFilter('all');
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                      isSelected
                        ? 'bg-[#C8F27C] text-[#171622]'
                        : 'bg-white border border-[#171622]/10 text-[#171622]/70 hover:text-[#171622] hover:bg-[#171622]/5'
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Priority select, Due date / schedule select, View toggle */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Priority Dropdown */}
              <div className="relative flex items-center">
                <select
                  aria-label="Filter by priority"
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as 'all' | TaskPriority)
                  }
                  className="appearance-none rounded-xl border border-[#171622]/12 bg-white pl-3.5 pr-8 py-1.5 text-xs font-semibold text-[#171622] focus:border-[#171622] focus:outline-none"
                >
                  <option value="all">Priority</option>
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="low">Low priority</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#171622]/55"
                  aria-hidden="true"
                />
              </div>

              {/* Due date / Schedule & Sort Dropdown */}
              <div className="relative flex items-center">
                <select
                  aria-label="Sort or filter by due date"
                  value={combinedScheduleSortValue}
                  onChange={(e) =>
                    handleCombinedScheduleSortChange(e.target.value)
                  }
                  className="appearance-none rounded-xl border border-[#171622]/12 bg-white pl-3.5 pr-8 py-1.5 text-xs font-semibold text-[#171622] focus:border-[#171622] focus:outline-none"
                >
                  <optgroup label="Sort by">
                    <option value="sort:due_date">Due date</option>
                    <option value="sort:priority">Priority</option>
                    <option value="sort:created_at">Created date</option>
                  </optgroup>
                  <optgroup label="Filter schedule">
                    <option value="schedule:overdue">Overdue only</option>
                    <option value="schedule:due_today">Due today</option>
                    <option value="schedule:upcoming">Upcoming</option>
                    <option value="schedule:completed">Completed</option>
                  </optgroup>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#171622]/55"
                  aria-hidden="true"
                />
              </div>

              {/* List / Grid View Toggle */}
              <div
                role="group"
                aria-label="View layout"
                className="inline-flex items-center rounded-xl border border-[#171622]/12 bg-white p-0.5"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                  className={`rounded-lg p-1.5 transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#171622]/10 text-[#171622]'
                      : 'text-[#171622]/50 hover:text-[#171622]'
                  }`}
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                  className={`rounded-lg p-1.5 transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-[#171622]/10 text-[#171622]'
                      : 'text-[#171622]/50 hover:text-[#171622]'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>

          {/* Action error banner */}
          {actionFeedback && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#B42318]/25 bg-[#FEF3F2] px-4 py-3 text-xs sm:text-sm text-[#B42318]"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{actionFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                aria-label="Dismiss message"
                className="rounded-md p-1 hover:bg-[#B42318]/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Main Task List / Table Surface */}
          <section
            aria-label="Task list"
            className="rounded-2xl border border-[#171622]/10 bg-white overflow-visible shadow-2xs"
          >
            {isLoading ? (
              <div
                aria-busy="true"
                aria-label="Loading tasks"
                className="divide-y divide-[#171622]/8 p-6 space-y-4"
              >
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="flex items-center justify-between gap-4 pt-4 first:pt-0 animate-pulse"
                  >
                    <div className="flex items-center gap-3.5 flex-1">
                      <div className="h-5 w-5 rounded-md bg-[#171622]/10" />
                      <div className="space-y-2 flex-1 max-w-md">
                        <div className="h-4 w-3/4 rounded-md bg-[#171622]/10" />
                        <div className="h-3 w-1/2 rounded-md bg-[#171622]/8" />
                      </div>
                    </div>
                    <div className="h-6 w-16 rounded-md bg-[#171622]/8" />
                    <div className="h-6 w-24 rounded-md bg-[#171622]/8 hidden sm:block" />
                    <div className="h-6 w-20 rounded-md bg-[#171622]/8 hidden md:block" />
                  </div>
                ))}
              </div>
            ) : errorMessage ? (
              <div
                role="alert"
                className="flex flex-col items-center justify-center px-6 py-14 text-center space-y-4"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEF3F2] text-[#B42318]">
                  <AlertCircle className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="space-y-1 max-w-md">
                  <p className="font-display text-base sm:text-lg font-bold text-[#171622]">
                    Could not load your tasks
                  </p>
                  <p className="text-xs sm:text-sm text-[#171622]/65">
                    {errorMessage}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshTasks()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>Try again</span>
                </button>
              </div>
            ) : tasks.length === 0 ? (
              totalUserTasksInDb === 0 && !hasActiveFilters ? (
                /* True Empty State when no tasks exist yet */
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F27C]/60 text-[#171622]">
                    <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-[#171622]">
                    Nothing on your list yet.
                  </h2>
                  <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-[#171622]/65 leading-relaxed">
                    Add your first task and start making progress.
                  </p>
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={openCreateTaskModal}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>Add task</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Filtered Empty State */
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EBE8F8] text-[#171622]">
                    <Search className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#171622]">
                    No tasks match your current filters.
                  </h2>
                  <p className="mt-1 max-w-sm text-xs sm:text-sm text-[#171622]/65">
                    Try adjusting your search query, status, priority, or
                    schedule filter.
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#171622]/5 transition-colors"
                    >
                      Reset filters
                    </button>
                    <button
                      type="button"
                      onClick={openCreateTaskModal}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>Add task</span>
                    </button>
                  </div>
                </div>
              )
            ) : viewMode === 'grid' ? (
              /* Optional Grid View */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
                {tasks.map((task) => {
                  const isCompleted = task.status === 'completed';
                  const isBusy = Boolean(busyTaskIds[task.id]);
                  const priorityBadge =
                    PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES.medium;
                  const statusBadge =
                    STATUS_BADGES[task.status] ?? STATUS_BADGES.todo;

                  return (
                    <div
                      key={task.id}
                      data-testid={`task-row-${task.id}`}
                      className="flex flex-col justify-between rounded-xl border border-[#171622]/10 bg-[#FAF9F6]/60 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleComplete(task)}
                            aria-label={
                              isCompleted
                                ? `Reopen '${task.title}'`
                                : `Mark '${task.title}' as completed`
                            }
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                              isCompleted
                                ? 'border-[#5C9E31] bg-[#78C247] text-white'
                                : 'border-[#171622]/30 bg-white hover:border-[#171622]'
                            }`}
                          >
                            {isCompleted && (
                              <Check
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )}
                          </button>

                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedTaskId(task.id)}
                              className={`text-left text-sm font-semibold hover:underline break-words ${
                                isCompleted
                                  ? 'line-through text-[#171622]/45'
                                  : 'text-[#171622]'
                              }`}
                            >
                              {task.title}
                            </button>
                            {task.description && (
                              <p className="mt-0.5 text-xs text-[#171622]/60 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openEditTaskModal(task)}
                          aria-label={`Edit '${task.title}'`}
                          className="rounded-lg p-1.5 text-[#171622]/55 hover:bg-[#171622]/5 hover:text-[#171622]"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#171622]/8 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${priorityBadge.className}`}
                          >
                            {priorityBadge.label}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                          >
                            {statusBadge.label}
                          </span>
                        </div>

                        {task.dueDisplayLabel && (
                          <span
                            className={`inline-flex items-center gap-1 tabular-nums ${
                              task.isOverdue
                                ? 'font-semibold text-[#B42318]'
                                : 'text-[#171622]/65'
                            }`}
                          >
                            <Calendar
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>{task.dueDisplayLabel}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Default Tabular Task List Matching Mockup */
              <div>
                {/* Table Column Headers (Desktop) */}
                <div className="hidden md:grid md:grid-cols-12 items-center gap-4 border-b border-[#171622]/8 bg-[#FAF9F6]/70 px-6 py-3 text-xs font-bold text-[#171622]/75">
                  <div className="col-span-5 pl-9">Task</div>
                  <div className="col-span-2">Priority</div>
                  <div className="col-span-2">Due date</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>

                <ul className="divide-y divide-[#171622]/8">
                  {tasks.map((task) => {
                    const isCompleted = task.status === 'completed';
                    const isArchived = task.status === 'archived';
                    const isBusy = Boolean(busyTaskIds[task.id]);
                    const isMenuOpen = openMenuTaskId === task.id;
                    const priorityBadge =
                      PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES.medium;
                    const statusBadge =
                      STATUS_BADGES[task.status] ?? STATUS_BADGES.todo;

                    return (
                      <li
                        key={task.id}
                        data-testid={`task-row-${task.id}`}
                        className="px-5 sm:px-6 py-4 transition-colors hover:bg-[#FAF9F6]/60"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 md:gap-4">
                          {/* Col 1: Checkbox + Title + Description (5 cols) */}
                          <div className="md:col-span-5 flex items-start gap-3.5 min-w-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleComplete(task)}
                              aria-label={
                                isCompleted
                                  ? `Reopen '${task.title}'`
                                  : `Mark '${task.title}' as completed`
                              }
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] disabled:opacity-50 ${
                                isCompleted
                                  ? 'border-[#5C9E31] bg-[#78C247] text-white'
                                  : 'border-[#171622]/30 bg-white hover:border-[#171622]'
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
                            </button>

                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => setSelectedTaskId(task.id)}
                                className={`text-left text-sm font-bold hover:text-[#5938B5] transition-colors truncate block max-w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] rounded-xs ${
                                  isCompleted
                                    ? 'line-through text-[#171622]/45 font-medium'
                                    : 'text-[#171622]'
                                }`}
                              >
                                {task.title}
                              </button>
                              {task.description && (
                                <p
                                  className={`mt-0.5 text-xs truncate ${
                                    isCompleted
                                      ? 'text-[#171622]/35'
                                      : 'text-[#171622]/60'
                                  }`}
                                >
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Col 2: Priority Badge (2 cols) */}
                          <div className="md:col-span-2 flex items-center pl-8 md:pl-0">
                            <span
                              className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${priorityBadge.className}`}
                            >
                              {priorityBadge.label}
                            </span>
                          </div>

                          {/* Col 3: Due Date (2 cols) */}
                          <div className="md:col-span-2 flex items-center pl-8 md:pl-0">
                            {task.dueDisplayLabel ? (
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${
                                  task.isOverdue
                                    ? 'font-semibold text-[#B42318]'
                                    : isCompleted
                                    ? 'line-through text-[#171622]/45'
                                    : 'text-[#171622]/75'
                                }`}
                              >
                                <Calendar
                                  className="h-3.5 w-3.5 shrink-0 text-[#171622]/45"
                                  aria-hidden="true"
                                />
                                <span>{task.dueDisplayLabel}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-[#171622]/40">
                                No due date
                              </span>
                            )}
                          </div>

                          {/* Col 4: Status Badge (2 cols) */}
                          <div className="md:col-span-2 flex items-center pl-8 md:pl-0">
                            <span
                              className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                            >
                              {statusBadge.label}
                            </span>
                          </div>

                          {/* Col 5: Actions Menu (1 col) */}
                          <div className="md:col-span-1 flex items-center justify-end relative">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setOpenMenuTaskId((prev) =>
                                  prev === task.id ? null : task.id
                                )
                              }
                              aria-label={`Actions for '${task.title}'`}
                              aria-expanded={isMenuOpen}
                              aria-haspopup="menu"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                            >
                              <MoreVertical
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </button>

                            {isMenuOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-20"
                                  aria-hidden="true"
                                  onClick={() => setOpenMenuTaskId(null)}
                                />
                                <div
                                  role="menu"
                                  aria-label={`Menu for ${task.title}`}
                                  className="absolute right-0 top-9 z-30 w-44 rounded-xl border border-[#171622]/12 bg-white py-1.5 shadow-lg"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuTaskId(null);
                                      setSelectedTaskId(task.id);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                  >
                                    <Eye
                                      className="h-3.5 w-3.5 text-[#171622]/60"
                                      aria-hidden="true"
                                    />
                                    <span>View details</span>
                                  </button>

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => openEditTaskModal(task)}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                  >
                                    <Pencil
                                      className="h-3.5 w-3.5 text-[#171622]/60"
                                      aria-hidden="true"
                                    />
                                    <span>Edit task</span>
                                  </button>

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleToggleComplete(task)}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                  >
                                    <Check
                                      className="h-3.5 w-3.5 text-[#171622]/60"
                                      aria-hidden="true"
                                    />
                                    <span>
                                      {isCompleted
                                        ? 'Reopen task'
                                        : 'Mark as completed'}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleArchiveOrRestore(task)}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                  >
                                    {isArchived ? (
                                      <>
                                        <ArchiveRestore
                                          className="h-3.5 w-3.5 text-[#171622]/60"
                                          aria-hidden="true"
                                        />
                                        <span>Restore task</span>
                                      </>
                                    ) : (
                                      <>
                                        <Archive
                                          className="h-3.5 w-3.5 text-[#171622]/60"
                                          aria-hidden="true"
                                        />
                                        <span>Archive task</span>
                                      </>
                                    )}
                                  </button>

                                  <div className="my-1 border-t border-[#171622]/8" />

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuTaskId(null);
                                      setTaskToDelete(task);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                                  >
                                    <Trash2
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                    <span>Delete task</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      {/* Create / Edit Task Modal */}
      <TaskFormModal
        key={`${formModalMode}-${editingTask?.id ?? 'new'}-${isFormModalOpen}`}
        isOpen={isFormModalOpen}
        mode={formModalMode}
        initialTask={editingTask}
        defaultDueDate={todayLocalDate}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteTaskDialog
        key={taskToDelete?.id ?? 'closed'}
        task={taskToDelete}
        onClose={() => setTaskToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
        onArchiveInstead={
          taskToDelete && taskToDelete.status !== 'archived'
            ? () => handleArchiveOrRestore(taskToDelete)
            : undefined
        }
      />
    </div>
  );
}
