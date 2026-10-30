'use client';

import React, { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';
import type {
  SerializedTaskItem,
  TaskPriority,
  TaskStatus,
} from '@/lib/tasks/validation';

interface TaskDetailViewProps {
  task: SerializedTaskItem;
  isBusy: boolean;
  onBack: () => void;
  onEdit: (task: SerializedTaskItem) => void;
  onToggleComplete: (task: SerializedTaskItem) => Promise<void>;
  onChangeStatus: (
    task: SerializedTaskItem,
    nextStatus: TaskStatus
  ) => Promise<void>;
  onChangePriority: (
    task: SerializedTaskItem,
    nextPriority: TaskPriority
  ) => Promise<void>;
  onArchiveOrRestore: (
    task: SerializedTaskItem
  ) => Promise<{ ok: boolean; error?: string }>;
  onRequestDelete: (task: SerializedTaskItem) => void;
}

const PRIORITY_BADGE_STYLES: Record<
  TaskPriority,
  { label: string; className: string; dotColor: string; selectBg: string }
> = {
  high: {
    label: 'High',
    className: 'bg-[#FDECEC] text-[#B42318]',
    dotColor: 'bg-[#E11D48]',
    selectBg: 'border-[#F9D0D0] bg-[#FEF6F6]',
  },
  medium: {
    label: 'Medium',
    className: 'bg-[#EBE8F8] text-[#5938B5]',
    dotColor: 'bg-[#6941C6]',
    selectBg: 'border-[#DDD6FE] bg-[#F7F5FF]',
  },
  low: {
    label: 'Low',
    className: 'bg-[#EAF7E1] text-[#2F6B1E]',
    dotColor: 'bg-[#78C247]',
    selectBg: 'border-[#D3F0BE] bg-[#F4FBEF]',
  },
};

const STATUS_BADGE_STYLES: Record<
  TaskStatus,
  { label: string; className: string; dotColor: string; selectBg: string }
> = {
  todo: {
    label: 'To do',
    className: 'bg-[#F2F1EE] text-[#171622]/75',
    dotColor: 'bg-[#171622]/45',
    selectBg: 'border-[#171622]/15 bg-[#FAF9F6]',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-[#E6F0FF] text-[#1D4ED8]',
    dotColor: 'bg-[#2563EB]',
    selectBg: 'border-[#BFDBFE] bg-[#F2F7FF]',
  },
  completed: {
    label: 'Completed',
    className: 'bg-[#E2F7C4] text-[#2F6B1E]',
    dotColor: 'bg-[#5C9E31]',
    selectBg: 'border-[#C8F27C] bg-[#F3FCE4]',
  },
  archived: {
    label: 'Archived',
    className: 'bg-[#F2F1EE] text-[#171622]/60',
    dotColor: 'bg-[#171622]/40',
    selectBg: 'border-[#171622]/15 bg-[#FAF9F6]',
  },
};

export default function TaskDetailView({
  task,
  isBusy,
  onBack,
  onEdit,
  onToggleComplete,
  onChangeStatus,
  onChangePriority,
  onArchiveOrRestore,
  onRequestDelete,
}: TaskDetailViewProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isCompleted = task.status === 'completed';
  const isArchived = task.status === 'archived';
  const priorityMeta =
    PRIORITY_BADGE_STYLES[task.priority] ?? PRIORITY_BADGE_STYLES.medium;
  const statusMeta =
    STATUS_BADGE_STYLES[task.status] ?? STATUS_BADGE_STYLES.todo;

  return (
    <div className="space-y-5">
      {/* Top Back Link */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#171622]/65 hover:text-[#171622] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] rounded-md"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to tasks</span>
        </button>
      </div>

      {/* Main Detail Card */}
      <section
        aria-labelledby="task-detail-heading"
        className="rounded-2xl border border-[#171622]/10 bg-white p-6 sm:p-8 shadow-xs space-y-6"
      >
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#171622]/8 pb-6">
          <div className="flex items-start gap-4 min-w-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onToggleComplete(task)}
              aria-label={
                isCompleted
                  ? `Reopen '${task.title}'`
                  : `Mark '${task.title}' as completed`
              }
              className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] disabled:opacity-50 ${
                isCompleted
                  ? 'border-[#5C9E31] bg-[#78C247] text-white'
                  : 'border-[#171622]/30 bg-white hover:border-[#171622]'
              }`}
            >
              {isBusy ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-[#171622]"
                  aria-hidden="true"
                />
              ) : (
                isCompleted && (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )
              )}
            </button>

            <div className="space-y-2.5 min-w-0">
              <h1
                id="task-detail-heading"
                className={`font-display text-xl sm:text-2xl font-bold break-words ${
                  isCompleted
                    ? 'line-through text-[#171622]/50'
                    : 'text-[#171622]'
                }`}
              >
                {task.title}
              </h1>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${priorityMeta.className}`}
                >
                  {priorityMeta.label}
                </span>

                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${statusMeta.className}`}
                >
                  {statusMeta.label}
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Actions: Edit & More v */}
          <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onEdit(task)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#171622]/5 transition-colors disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Edit</span>
            </button>

            <div className="relative">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setIsMoreOpen((prev) => !prev)}
                aria-expanded={isMoreOpen}
                aria-haspopup="menu"
                aria-label="More task actions"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#171622]/5 transition-colors disabled:opacity-50"
              >
                <span>More</span>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {isMoreOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    aria-hidden="true"
                    onClick={() => setIsMoreOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-1.5 w-44 rounded-xl border border-[#171622]/12 bg-white py-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMoreOpen(false);
                        onArchiveOrRestore(task);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                    >
                      {isArchived ? (
                        <>
                          <ArchiveRestore
                            className="h-3.5 w-3.5 text-[#171622]/65"
                            aria-hidden="true"
                          />
                          <span>Restore task</span>
                        </>
                      ) : (
                        <>
                          <Archive
                            className="h-3.5 w-3.5 text-[#171622]/65"
                            aria-hidden="true"
                          />
                          <span>Archive task</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMoreOpen(false);
                        onRequestDelete(task);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Delete task</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 2-Column Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Description & Metadata */}
          <div className="lg:col-span-7 space-y-5">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#171622]/55 mb-2">
                Description
              </h2>
              <p className="text-sm text-[#171622]/80 leading-relaxed whitespace-pre-line">
                {task.description || 'No description added for this task.'}
              </p>
            </div>

            <div className="space-y-4 pt-2 border-t border-[#171622]/8">
              <div>
                <p className="text-xs font-semibold text-[#171622] mb-1">
                  Due date
                </p>
                <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#171622]/75">
                  <Calendar
                    className="h-4 w-4 text-[#171622]/50"
                    aria-hidden="true"
                  />
                  <span>{task.dueFullDateLabel || 'No due date set'}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#171622] mb-1">
                  Due time
                </p>
                <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#171622]/75">
                  <Clock
                    className="h-4 w-4 text-[#171622]/50"
                    aria-hidden="true"
                  />
                  <span>{task.dueTimeLabel || 'All day'}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#171622] mb-1">
                  Calendar schedule
                </p>
                <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#171622]/75">
                  <Calendar
                    className="h-4 w-4 text-[#5938B5]"
                    aria-hidden="true"
                  />
                  <span>
                    {task.scheduleDisplayLabel || 'Not time-blocked on calendar'}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#171622] mb-1">
                  Created at
                </p>
                <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#171622]/75 tabular-nums">
                  <Calendar
                    className="h-4 w-4 text-[#171622]/50"
                    aria-hidden="true"
                  />
                  <span>{task.createdAtLabel}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#171622] mb-1">
                  Last updated
                </p>
                <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#171622]/75 tabular-nums">
                  <Clock
                    className="h-4 w-4 text-[#171622]/50"
                    aria-hidden="true"
                  />
                  <span>{task.updatedAtLabel}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Quick Status & Priority Controls Card */}
          <div className="lg:col-span-5 rounded-2xl border border-[#171622]/10 bg-[#FAF9F6]/60 p-5 space-y-4">
            {/* Status Dropdown */}
            <div>
              <label
                htmlFor="detail-status-select"
                className="block text-xs font-semibold text-[#171622] mb-1.5"
              >
                Status
              </label>
              <div className="relative flex items-center">
                <span
                  className={`pointer-events-none absolute left-3.5 h-2.5 w-2.5 rounded-full ${statusMeta.dotColor}`}
                  aria-hidden="true"
                />
                <select
                  id="detail-status-select"
                  disabled={isBusy}
                  value={task.status}
                  onChange={(e) =>
                    onChangeStatus(task, e.target.value as TaskStatus)
                  }
                  className={`w-full appearance-none rounded-xl border pl-8 pr-9 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] focus:outline-none ${statusMeta.selectBg}`}
                >
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3.5 h-4 w-4 text-[#171622]/55"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Priority Dropdown */}
            <div>
              <label
                htmlFor="detail-priority-select"
                className="block text-xs font-semibold text-[#171622] mb-1.5"
              >
                Priority
              </label>
              <div className="relative flex items-center">
                <span
                  className={`pointer-events-none absolute left-3.5 h-2.5 w-2.5 rounded-full ${priorityMeta.dotColor}`}
                  aria-hidden="true"
                />
                <select
                  id="detail-priority-select"
                  disabled={isBusy}
                  value={task.priority}
                  onChange={(e) =>
                    onChangePriority(task, e.target.value as TaskPriority)
                  }
                  className={`w-full appearance-none rounded-xl border pl-8 pr-9 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] focus:outline-none ${priorityMeta.selectBg}`}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3.5 h-4 w-4 text-[#171622]/55"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Primary Mark as completed / Reopen button */}
            <div className="pt-1 space-y-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onToggleComplete(task)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors disabled:opacity-60"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>
                  {isCompleted ? 'Reopen task' : 'Mark as completed'}
                </span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => onArchiveOrRestore(task)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#171622]/15 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#171622]/5 transition-colors disabled:opacity-60"
              >
                {isArchived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                    <span>Restore task</span>
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    <span>Archive task</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
