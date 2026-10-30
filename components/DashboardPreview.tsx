'use client';

import { useState } from 'react';
import {
  Check,
  Calendar,
  Flame,
  Target,
  BookOpen,
  FileText,
  RotateCcw,
  LayoutDashboard,
} from 'lucide-react';
import {
  INITIAL_SAMPLE_TASKS,
  INITIAL_SAMPLE_HABITS,
  SAMPLE_WEEKLY_PROGRESS,
  SAMPLE_UPCOMING_GOALS,
  SAMPLE_NOTES_AND_FILES,
  SampleTask,
  calculateTaskSummary,
  filterSampleTasks,
  calculateWeeklyCompletionRate,
} from '@/lib/sample-data';

type PreviewSection = 'overview' | 'tasks' | 'habits' | 'goals' | 'notes';
type TaskCategoryFilter = 'All' | SampleTask['category'];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function DashboardPreview() {
  const [activeSection, setActiveSection] = useState<PreviewSection>('overview');
  const [tasks, setTasks] = useState<SampleTask[]>(INITIAL_SAMPLE_TASKS);
  const [categoryFilter, setCategoryFilter] = useState<TaskCategoryFilter>('All');

  const taskSummary = calculateTaskSummary(tasks);
  const visibleTasks = filterSampleTasks(tasks, categoryFilter);
  const weeklyStats = calculateWeeklyCompletionRate(SAMPLE_WEEKLY_PROGRESS);

  const isModified = tasks.some(
    (task, idx) => task.completed !== INITIAL_SAMPLE_TASKS[idx]?.completed
  );

  function handleToggleSampleTask(taskId: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  }

  function handleResetSampleData() {
    setTasks(INITIAL_SAMPLE_TASKS);
    setCategoryFilter('All');
    setActiveSection('overview');
  }

  const sidebarItems: {
    id: PreviewSection;
    label: string;
    icon: typeof LayoutDashboard;
    count?: string;
  }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'tasks',
      label: 'Today’s Tasks',
      icon: Calendar,
      count: `${taskSummary.completedCount}/${taskSummary.totalCount}`,
    },
    { id: 'habits', label: 'Habits', icon: Flame, count: '3' },
    { id: 'goals', label: 'Goals', icon: Target, count: '3' },
    { id: 'notes', label: 'Notes & PDFs', icon: BookOpen, count: '3' },
  ];

  return (
    <section
      aria-label="Sample LifeCraft product interface preview"
      className="w-full overflow-hidden rounded-2xl border border-[#171622]/12 bg-white shadow-sm"
    >
      {/* Top window bar — clearly labels preview as sample data */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#171622]/8 bg-[#FAF9F6] px-4 py-2.5 text-xs text-[#171622]/70">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[#171622]">
            LifeCraft Workspace Preview
          </span>
          <span aria-hidden="true">·</span>
          <span>Sample data only (changes are not saved)</span>
        </div>
        {isModified && (
          <button
            type="button"
            onClick={handleResetSampleData}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#171622] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] rounded-xs whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Reset sample</span>
          </button>
        )}
      </div>

      {/* Main workspace split: minimal sidebar + main content area */}
      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* Minimal Sidebar */}
        <aside
          aria-label="Preview workspace navigation"
          className="border-b border-[#171622]/8 bg-[#FAF9F6]/60 p-3 md:col-span-3 md:border-r md:border-b-0 md:p-4 flex flex-col justify-between"
        >
          <div>
            <div className="mb-3 px-2 hidden md:block">
              <p className="text-xs font-medium text-[#171622]/55">
                Personal Space
              </p>
              <p className="text-sm font-semibold text-[#171622] truncate">
                Personal Workspace
              </p>
            </div>

            <nav className="flex gap-1 overflow-x-auto md:overflow-visible md:flex-col md:space-y-1 pb-1 md:pb-0">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#171622] ${
                      isActive
                        ? 'bg-[#171622] text-[#FAF9F6]'
                        : 'text-[#171622]/75 hover:bg-[#171622]/6 hover:text-[#171622]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? 'text-[#C8F27C]' : 'text-[#171622]/60'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.count && (
                      <span
                        className={`font-mono text-[11px] tabular-nums shrink-0 ${
                          isActive ? 'text-[#C8F27C]' : 'text-[#171622]/50'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-6 hidden md:block border-t border-[#171622]/8 pt-3 px-2">
            <p className="text-[11px] text-[#171622]/60 leading-relaxed">
              Interactive sample view. Click any task to preview completion states.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="p-4 sm:p-5 md:col-span-9 space-y-5">
          {/* Personalized greeting header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#171622]/8 pb-3.5">
            <div>
              <p className="text-xs text-[#171622]/60">
                Friday, October 26 · Daily Overview
              </p>
              <h2 className="font-display text-lg sm:text-xl font-semibold text-[#171622]">
                Good morning
              </h2>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-[#171622]/75 whitespace-nowrap">
              <span>
                Completed today:{' '}
                <strong className="font-mono font-semibold text-[#171622] tabular-nums">
                  {taskSummary.completedCount} of {taskSummary.totalCount}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#171622]">
                {taskSummary.completionPercentage}%
              </span>
            </div>
          </div>

          {/* Today's Tasks section (visible in 'overview' and 'tasks') */}
          {(activeSection === 'overview' || activeSection === 'tasks') && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#171622]">
                    Today’s Tasks
                  </h3>
                  <span className="text-xs text-[#171622]/55">
                    · Click to toggle sample completion
                  </span>
                </div>

                {/* Interactive category filter controls */}
                <div
                  role="group"
                  aria-label="Filter sample tasks by category"
                  className="flex items-center gap-1 rounded-lg bg-[#FAF9F6] p-1 border border-[#171622]/8"
                >
                  {(
                    ['All', 'Study', 'Career', 'Personal', 'Wellness'] as const
                  ).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      aria-pressed={categoryFilter === cat}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#171622] ${
                        categoryFilter === cat
                          ? 'bg-[#171622] text-[#FAF9F6]'
                          : 'text-[#171622]/70 hover:text-[#171622]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <ul className="divide-y divide-[#171622]/8 rounded-xl border border-[#171622]/10 bg-[#FAF9F6]/50">
                {visibleTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => handleToggleSampleTask(task.id)}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-[#EBE8F8]/35 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#171622]"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span
                          aria-hidden="true"
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                            task.completed
                              ? 'border-[#171622] bg-[#C8F27C] text-[#171622]'
                              : 'border-[#171622]/30 bg-white'
                          }`}
                        >
                          {task.completed && (
                            <Check className="h-3 w-3 stroke-[2.5]" />
                          )}
                        </span>
                        <span
                          className={`text-xs sm:text-sm truncate ${
                            task.completed
                              ? 'line-through text-[#171622]/45'
                              : 'text-[#171622] font-medium'
                          }`}
                        >
                          {task.title}
                        </span>
                      </span>

                      <span className="flex items-center gap-2 text-[11px] text-[#171622]/60 shrink-0">
                        {task.attachment && (
                          <>
                            <span className="hidden lg:inline-flex items-center gap-1 text-[#171622]/70">
                              <FileText className="h-3 w-3" aria-hidden="true" />
                              <span>{task.attachment}</span>
                            </span>
                            <span className="hidden lg:inline" aria-hidden="true">
                              ·
                            </span>
                          </>
                        )}
                        <span>{task.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {task.timeBlock}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Middle row: Small Habit Tracker + Weekly Progress Visualization */}
          {(activeSection === 'overview' || activeSection === 'habits') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
              {/* Small Habit Tracker */}
              <div className="lg:col-span-7 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#171622] whitespace-nowrap">
                    Habit Tracker
                  </h3>
                  <span className="text-xs text-[#171622]/60 whitespace-nowrap">
                    This week’s rhythm
                  </span>
                </div>

                <div className="divide-y divide-[#171622]/8 rounded-xl border border-[#171622]/10 bg-white p-3">
                  {INITIAL_SAMPLE_HABITS.map((habit) => (
                    <div
                      key={habit.id}
                      className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-[#171622]">
                          {habit.name}
                        </p>
                        <span className="text-[11px] text-[#171622]/55 whitespace-nowrap shrink-0">
                          {habit.cadence} ·{' '}
                          <span className="font-mono tabular-nums font-medium text-[#171622]">
                            {habit.streakDays}d
                          </span>
                        </span>
                      </div>

                      <div
                        className="flex items-center gap-1"
                        aria-label={`${habit.name} weekly check-ins`}
                      >
                        {habit.weekDays.map((done, dayIdx) => (
                          <span
                            key={dayIdx}
                            className={`flex h-5 flex-1 items-center justify-center rounded-md text-[10px] font-mono tabular-nums ${
                              done
                                ? 'bg-[#C8F27C] text-[#171622] font-semibold'
                                : 'bg-[#FAF9F6] text-[#171622]/40 border border-[#171622]/10'
                            }`}
                            title={`${DAY_LABELS[dayIdx]}: ${
                              done ? 'Completed' : 'Planned'
                            }`}
                          >
                            {DAY_LABELS[dayIdx]}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Progress Visualization */}
              <div className="lg:col-span-5 space-y-2 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#171622] whitespace-nowrap">
                    Weekly Progress
                  </h3>
                  <span className="font-mono text-xs text-[#171622]/70 tabular-nums whitespace-nowrap">
                    {weeklyStats.completedTotal}/{weeklyStats.plannedTotal} tasks
                  </span>
                </div>

                <div className="rounded-xl border border-[#171622]/10 bg-[#EBE8F8]/35 p-3.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-0.5 mb-3">
                    <div className="flex items-center justify-between text-xs text-[#171622]/70">
                      <span>Completion pace</span>
                      <span className="font-mono font-semibold text-[#171622] tabular-nums">
                        {weeklyStats.ratePercent}%
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-[#171622]/60 tabular-nums">
                      {weeklyStats.totalFocusHours}h focused study & work
                    </p>
                  </div>

                  {/* Bar chart for Mon-Sun */}
                  <div className="grid grid-cols-7 gap-1.5 items-end h-24 pt-2">
                    {SAMPLE_WEEKLY_PROGRESS.map((point) => {
                      const ratio =
                        point.tasksPlanned > 0
                          ? Math.round(
                              (point.tasksCompleted / point.tasksPlanned) * 100
                            )
                          : 0;
                      return (
                        <div
                          key={point.day}
                          className="flex flex-col items-center gap-1.5 h-full justify-end"
                        >
                          <div className="w-full h-16 rounded-md bg-white/80 border border-[#171622]/8 flex items-end p-0.5 overflow-hidden">
                            <div
                              style={{ height: `${Math.max(ratio, 12)}%` }}
                              className={`w-full rounded-xs transition-all ${
                                ratio >= 80
                                  ? 'bg-[#171622]'
                                  : ratio > 0
                                  ? 'bg-[#C8F27C]'
                                  : 'bg-[#171622]/10'
                              }`}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-[#171622]/65 tabular-nums">
                            {point.day.slice(0, 1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Compact Upcoming-Goals Section (visible in 'overview' and 'goals') */}
          {(activeSection === 'overview' || activeSection === 'goals') && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#171622]">
                  Upcoming Goals
                </h3>
                <span className="text-xs text-[#171622]/60">
                  Active milestones
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SAMPLE_UPCOMING_GOALS.map((goal) => (
                  <div
                    key={goal.id}
                    className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6]/70 p-3 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#171622]/60 mb-1">
                        <span>{goal.horizon}</span>
                        <span className="font-mono font-semibold text-[#171622] tabular-nums">
                          {goal.progressPercent}%
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#171622] leading-snug">
                        {goal.title}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#171622]/10">
                        <div
                          style={{ width: `${goal.progressPercent}%` }}
                          className="h-full rounded-full bg-[#171622]"
                        />
                      </div>
                      <p className="text-[11px] text-[#171622]/65 truncate">
                        Next: {goal.nextMilestone}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes & PDFs view when 'notes' tab is selected in sidebar */}
          {activeSection === 'notes' && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#171622]">
                  Notes, Journals & Reference PDFs
                </h3>
                <span className="text-xs text-[#171622]/60">
                  Sample library
                </span>
              </div>

              <div className="divide-y divide-[#171622]/8 rounded-xl border border-[#171622]/10 bg-[#FAF9F6]/60">
                {SAMPLE_NOTES_AND_FILES.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-[#171622] truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#171622]/60">
                        {item.meta}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-[#171622]/60 shrink-0">
                      <span>{item.type}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono tabular-nums">
                        {item.updatedAt}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
