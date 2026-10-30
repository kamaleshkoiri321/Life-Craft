'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  Leaf,
  ListTodo,
  Loader2,
  MoreVertical,
  Pin,
  Plus,
  Target,
} from 'lucide-react';
import type {
  DashboardGoalItem,
  DashboardHabitItem,
  DashboardNoteItem,
  DashboardTaskItem,
  WeeklyActivityPoint,
} from '@/lib/queries/timezone';
import type { DashboardSectionId } from './DashboardSidebar';

interface DashboardPanelsProps {
  todaysFocus: DashboardTaskItem[];
  weeklyActivity: {
    days: WeeklyActivityPoint[];
    totalCompletedLast7Days: number;
  };
  activeGoals: DashboardGoalItem[];
  dailyHabits: DashboardHabitItem[];
  recentNotes: DashboardNoteItem[];
  onSelectSection: (section: DashboardSectionId) => void;
  onAddTask?: () => void;
  onAddHabit?: () => void;
  onOpenTaskDetail?: (taskId: string) => void;
  onTaskMutated?: () => void;
}

const PRIORITY_STYLES: Record<
  DashboardTaskItem['priority'],
  { label: string; badgeClass: string }
> = {
  high: {
    label: 'High',
    badgeClass: 'bg-[#FDECEC] text-[#B42318]',
  },
  medium: {
    label: 'Medium',
    badgeClass: 'bg-[#EBE8F8] text-[#5938B5]',
  },
  low: {
    label: 'Low',
    badgeClass: 'bg-[#EAF7E1] text-[#2F6B1E]',
  },
};

export default function DashboardPanels({
  todaysFocus,
  weeklyActivity,
  activeGoals,
  dailyHabits,
  recentNotes,
  onSelectSection,
  onAddTask,
  onAddHabit,
  onOpenTaskDetail,
  onTaskMutated,
}: DashboardPanelsProps) {
  const [togglingTaskIds, setTogglingTaskIds] = useState<
    Record<string, boolean>
  >({});
  const [togglingHabitIds, setTogglingHabitIds] = useState<
    Record<string, boolean>
  >({});

  async function handleToggleFocusTask(task: DashboardTaskItem) {
    const nextStatus = task.isCompleted ? 'todo' : 'completed';
    setTogglingTaskIds((prev) => ({ ...prev, [task.id]: true }));
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.ok) {
        onTaskMutated?.();
      }
    } catch {
      // Ignore network hiccup; user can retry
    } finally {
      setTogglingTaskIds((prev) => ({ ...prev, [task.id]: false }));
    }
  }

  async function handleToggleDailyHabit(habit: DashboardHabitItem) {
    const nextAction = habit.completedToday ? 'undo' : 'completed';
    setTogglingHabitIds((prev) => ({ ...prev, [habit.id]: true }));
    try {
      const response = await fetch(`/api/habits/${habit.id}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: nextAction }),
      });
      if (response.ok) {
        onTaskMutated?.();
      }
    } catch {
      // Ignore network hiccup; user can retry
    } finally {
      setTogglingHabitIds((prev) => ({ ...prev, [habit.id]: false }));
    }
  }

  const maxChartCount = Math.max(
    8,
    ...weeklyActivity.days.map((d) => Math.max(d.dueCount, d.completedCount))
  );
  const hasAnyWeeklyActivity = weeklyActivity.days.some(
    (d) => d.completedCount > 0 || d.dueCount > 0
  );

  return (
    <div className="space-y-6">
      {/* Row 1: Today's Focus & Your Week */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Today's Focus Panel (7 cols on lg) */}
        <section
          aria-labelledby="todays-focus-heading"
          className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-[#171622]/10 bg-white p-6"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <ListTodo
                  className="h-5 w-5 text-[#171622]"
                  aria-hidden="true"
                />
                <h2
                  id="todays-focus-heading"
                  className="font-display text-lg font-bold text-[#171622]"
                >
                  Today&apos;s focus
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onSelectSection('tasks')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] rounded-xs"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {todaysFocus.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-[#FAF9F6] px-6 py-12 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#C8F27C]/50 text-[#171622]">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="font-display text-base font-bold text-[#171622]">
                  Nothing on your list yet.
                </p>
                <p className="mt-1 max-w-sm text-xs sm:text-sm text-[#171622]/65 leading-relaxed">
                  Add your first task and start making progress.
                </p>
                {onAddTask && (
                  <button
                    type="button"
                    onClick={onAddTask}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add task</span>
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-3">
                {todaysFocus.map((task) => {
                  const priorityMeta =
                    PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
                  const isBusy = Boolean(togglingTaskIds[task.id]);
                  return (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-[#171622]/8 bg-[#FAF9F6]/60 px-4 py-3.5 transition-colors hover:bg-[#FAF9F6]"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleFocusTask(task)}
                          aria-label={
                            task.isCompleted
                              ? `Reopen '${task.title}'`
                              : `Mark '${task.title}' as completed`
                          }
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] disabled:opacity-50 ${
                            task.isCompleted
                              ? 'border-[#5C9E31] bg-[#78C247] text-white'
                              : 'border-[#171622]/25 bg-white hover:border-[#171622]'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2
                              className="h-3 w-3 animate-spin text-[#171622]"
                              aria-hidden="true"
                            />
                          ) : (
                            task.isCompleted && (
                              <Check
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )
                          )}
                        </button>

                        <div className="min-w-0 space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenTaskDetail) {
                                onOpenTaskDetail(task.id);
                              } else {
                                onSelectSection('tasks');
                              }
                            }}
                            className={`text-left text-sm font-bold truncate block max-w-full hover:text-[#5938B5] transition-colors ${
                              task.isCompleted
                                ? 'line-through text-[#171622]/50 font-medium'
                                : 'text-[#171622]'
                            }`}
                          >
                            {task.title}
                          </button>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#171622]/60">
                            {task.dueTimeLabel ? (
                              <span className="tabular-nums">
                                {task.dueTimeLabel}
                              </span>
                            ) : (
                              <span>Due today</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${priorityMeta.badgeClass}`}
                        >
                          {priorityMeta.label}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenTaskDetail) {
                              onOpenTaskDetail(task.id);
                            } else {
                              onSelectSection('tasks');
                            }
                          }}
                          aria-label={`Open '${task.title}' in My Tasks`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#171622]/50 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors"
                        >
                          <MoreVertical
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Your Week (Weekly Activity) Panel (5 cols on lg) */}
        <section
          aria-labelledby="your-week-heading"
          className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-[#171622]/10 bg-white p-6"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BarChart3
                  className="h-5 w-5 text-[#171622]"
                  aria-hidden="true"
                />
                <h2
                  id="your-week-heading"
                  className="font-display text-lg font-bold text-[#171622]"
                >
                  Your week
                </h2>
              </div>
              <span className="text-xs font-medium text-[#171622]/60 tabular-nums">
                Last 7 days
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-[#171622]/65">
              <span>Weekly activity</span>
              <span className="tabular-nums font-medium text-[#171622]">
                {weeklyActivity.totalCompletedLast7Days} completed
              </span>
            </div>

            {/* 7-Day Bar Chart with Y-Axis Scale & Hairline Grid */}
            <div className="pt-2">
              <div className="flex items-stretch gap-3">
                {/* Y-Axis Numerals */}
                <div
                  aria-hidden="true"
                  className="flex flex-col justify-between text-[11px] font-medium text-[#171622]/45 tabular-nums pb-6 pt-1 select-none"
                >
                  <span>{maxChartCount}</span>
                  <span>{Math.round(maxChartCount * 0.75)}</span>
                  <span>{Math.round(maxChartCount * 0.5)}</span>
                  <span>{Math.round(maxChartCount * 0.25)}</span>
                  <span>0</span>
                </div>

                {/* Plot Area */}
                <div className="flex-1 min-w-0">
                  <div className="relative h-44 flex items-end justify-between gap-2 border-b border-[#171622]/10 pb-2 pt-2 px-1">
                    {/* Subtle Horizontal Grid Lines */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-2 bottom-2 flex flex-col justify-between"
                    >
                      <div className="border-b border-[#171622]/6" />
                      <div className="border-b border-[#171622]/6" />
                      <div className="border-b border-[#171622]/6" />
                      <div className="border-b border-[#171622]/6" />
                      <div />
                    </div>

                    {weeklyActivity.days.map((day) => {
                      const totalHeightPct = Math.min(
                        100,
                        Math.round((day.dueCount / maxChartCount) * 100)
                      );
                      const completedHeightPct = Math.min(
                        100,
                        Math.round((day.completedCount / maxChartCount) * 100)
                      );

                      return (
                        <div
                          key={day.dateKey}
                          className="relative z-10 flex-1 flex flex-col items-center justify-end h-full gap-2"
                        >
                          <div
                            className="relative w-full max-w-[28px] h-full flex items-end justify-center"
                            title={`${day.fullDateLabel}: ${day.completedCount} completed of ${day.dueCount} scheduled`}
                          >
                            {/* Total / Scheduled Bar */}
                            <div
                              style={{
                                height: `${Math.max(totalHeightPct, 6)}%`,
                              }}
                              className="w-full rounded-t-md bg-[#C8F27C]/55 transition-opacity"
                            />
                            {/* Completed Bar */}
                            {day.completedCount > 0 && (
                              <div
                                style={{
                                  height: `${Math.max(completedHeightPct, 10)}%`,
                                }}
                                className="absolute bottom-0 inset-x-0 rounded-t-md bg-[#78C247]"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Day Labels */}
                  <div className="mt-2 flex items-center justify-between gap-2 px-1">
                    {weeklyActivity.days.map((day) => (
                      <div
                        key={day.dateKey}
                        className="flex-1 text-center text-[11px] tabular-nums"
                      >
                        <span
                          className={
                            day.isToday
                              ? 'font-bold text-[#171622]'
                              : 'font-medium text-[#171622]/60'
                          }
                        >
                          {day.dayLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {!hasAnyWeeklyActivity && (
              <p className="text-center text-xs text-[#171622]/60 pt-1">
                Completed tasks across the week will chart automatically here.
              </p>
            )}
          </div>

          {/* Chart Legend */}
          <div className="mt-4 flex items-center justify-center gap-6 pt-3 border-t border-[#171622]/8 text-xs text-[#171622]/70">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-xs bg-[#78C247]"
              />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-xs bg-[#C8F27C]/65"
              />
              <span>Scheduled</span>
            </div>
          </div>
        </section>
      </div>

      {/* Row 2: Goals in Progress & Daily Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Goals in Progress (6 cols on lg) */}
        <section
          aria-labelledby="goals-in-progress-heading"
          className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-[#171622]/10 bg-white p-6"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Target
                  className="h-5 w-5 text-[#171622]"
                  aria-hidden="true"
                />
                <h2
                  id="goals-in-progress-heading"
                  className="font-display text-lg font-bold text-[#171622]"
                >
                  Goals in progress
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onSelectSection('goals')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] rounded-xs"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {activeGoals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-[#FAF9F6] px-6 py-10 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBE8F8] text-[#171622]">
                  <Target className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="font-display text-base font-bold text-[#171622]">
                  No active goals yet.
                </p>
                <p className="mt-1 max-w-sm text-xs sm:text-sm text-[#171622]/65 leading-relaxed">
                  Personal goals and milestone progress bars will appear here
                  once created.
                </p>
                <button
                  type="button"
                  onClick={() => onSelectSection('goals')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add goal</span>
                </button>
              </div>
            ) : (
              <ul className="space-y-5">
                {activeGoals.map((goal) => (
                  <li key={goal.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSection('goals')}
                      className="flex w-full items-start gap-4 rounded-xl p-1.5 text-left transition-colors hover:bg-[#FAF9F6]"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F3F1FC] text-[#5938B5]">
                        <BookOpen className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-bold text-[#171622] truncate">
                            {goal.title}
                          </p>
                          {goal.targetDateLabel && (
                            <span className="text-xs text-[#171622]/55 tabular-nums shrink-0">
                              Target · {goal.targetDateLabel}
                            </span>
                          )}
                        </div>
                        {goal.description && (
                          <p className="text-xs text-[#171622]/65 line-clamp-1">
                            {goal.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3">
                          <div
                            role="progressbar"
                            aria-valuenow={goal.progressPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${goal.title} progress`}
                            className="h-2 flex-1 overflow-hidden rounded-full bg-[#171622]/8"
                          >
                            <div
                              style={{ width: `${goal.progressPercent}%` }}
                              className="h-full rounded-full bg-[#9FE049]"
                            />
                          </div>
                          <span className="text-xs font-semibold text-[#171622]/75 tabular-nums w-9 text-right">
                            {goal.progressPercent}%
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Daily Habits (6 cols on lg) */}
        <section
          aria-labelledby="daily-habits-heading"
          className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-[#171622]/10 bg-white p-6"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Leaf className="h-5 w-5 text-[#171622]" aria-hidden="true" />
                <h2
                  id="daily-habits-heading"
                  className="font-display text-lg font-bold text-[#171622]"
                >
                  Daily habits
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onSelectSection('habits')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] rounded-xs"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {dailyHabits.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-[#FAF9F6] px-6 py-10 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#F2FBE0] text-[#171622]">
                  <Leaf className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="font-display text-base font-bold text-[#171622]">
                  No active habits yet.
                </p>
                <p className="mt-1 max-w-sm text-xs sm:text-sm text-[#171622]/65 leading-relaxed">
                  Build a routine that works for you and track daily
                  consistency.
                </p>
                {onAddHabit && (
                  <button
                    type="button"
                    onClick={onAddHabit}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add habit</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {dailyHabits.map((habit) => {
                  const pct = Math.min(
                    100,
                    Math.round(
                      (habit.completedDaysLast7 /
                        Math.max(1, habit.targetPerWeek)) *
                        100
                    )
                  );
                  const circumference = 2 * Math.PI * 18;
                  const strokeDashoffset =
                    circumference - (pct / 100) * circumference;
                  const isBusy = Boolean(togglingHabitIds[habit.id]);

                  return (
                    <div
                      key={habit.id}
                      className="rounded-xl bg-[#FAF9F6] p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectSection('habits')}
                          className="text-left text-sm font-semibold text-[#171622] hover:text-[#5938B5] transition-colors truncate"
                        >
                          {habit.title}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleDailyHabit(habit)}
                          aria-label={
                            habit.completedToday
                              ? `Undo completion for '${habit.title}'`
                              : `Mark '${habit.title}' as completed today`
                          }
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] disabled:opacity-50 ${
                            habit.completedToday
                              ? 'border-[#5C9E31] bg-[#78C247] text-white'
                              : 'border-[#171622]/25 bg-white hover:border-[#171622]'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2
                              className="h-3 w-3 animate-spin text-[#171622]"
                              aria-hidden="true"
                            />
                          ) : (
                            habit.completedToday && (
                              <Check
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <svg
                          className="h-11 w-11 -rotate-90 shrink-0"
                          viewBox="0 0 44 44"
                          aria-hidden="true"
                        >
                          <circle
                            cx="22"
                            cy="22"
                            r="18"
                            fill="none"
                            stroke="rgba(23,22,34,0.1)"
                            strokeWidth="4"
                          />
                          <circle
                            cx="22"
                            cy="22"
                            r="18"
                            fill="none"
                            stroke={
                              habit.completedToday ? '#5C9E31' : '#7C5CE6'
                            }
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                          />
                        </svg>

                        <div className="min-w-0">
                          <p
                            className={`text-xs font-bold tabular-nums ${
                              habit.completedToday
                                ? 'text-[#3F7A1C]'
                                : 'text-[#171622]'
                            }`}
                          >
                            {habit.completedToday
                              ? '1/1 done'
                              : habit.skippedToday
                                ? 'Skipped today'
                                : '0/1 today'}
                          </p>
                          <p className="text-[11px] text-[#171622]/60 tabular-nums">
                            {habit.completedDaysLast7}/{habit.targetPerWeek} this
                            week
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Row 3: Recent Notes */}
      <section
        aria-labelledby="recent-notes-heading"
        className="rounded-2xl border border-[#171622]/10 bg-white p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-[#171622]" aria-hidden="true" />
            <h2
              id="recent-notes-heading"
              className="font-display text-lg font-bold text-[#171622]"
            >
              Recent notes
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onSelectSection('notes')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] rounded-xs"
          >
            <span>View all</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {recentNotes.length === 0 ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl bg-[#FAF9F6] px-6 py-6 text-center sm:text-left">
            <div className="space-y-1">
              <p className="font-display text-sm font-bold text-[#171622]">
                No notes saved yet.
              </p>
              <p className="text-xs text-[#171622]/65">
                Quick thoughts, reflections, and reading notes will appear here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectSection('notes')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New note</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelectSection('notes')}
                className="w-full text-left rounded-xl bg-[#FAF9F6] hover:bg-[#F3F1EB] transition-colors p-4 space-y-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[#171622] truncate">
                    {note.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[#171622]/55 shrink-0 tabular-nums">
                    {note.isPinned && (
                      <>
                        <Pin
                          className="h-3 w-3 text-[#5938B5]"
                          aria-label="Pinned note"
                        />
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>{note.updatedAtLabel}</span>
                  </div>
                </div>
                {note.excerpt && (
                  <p className="text-xs text-[#171622]/70 line-clamp-2 leading-relaxed">
                    {note.excerpt}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
