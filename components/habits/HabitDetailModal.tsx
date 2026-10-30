'use client';

import React, { useEffect, useState } from 'react';
import {
  Archive,
  BookOpen,
  Calendar,
  Check,
  Code2,
  Droplets,
  Dumbbell,
  Flame,
  Leaf,
  Loader2,
  MoreVertical,
  PauseCircle,
  Pencil,
  PenLine,
  PlayCircle,
  RotateCcw,
  SkipForward,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {
  ISO_WEEKDAYS,
  type HabitCheckInAction,
  type HabitHeatmapCell,
  type HabitViewItem,
} from '@/lib/habits/habit-utils';

interface HabitDetailModalProps {
  habit: HabitViewItem | null;
  todayDateKey: string;
  selectedDateKey: string;
  onClose: () => void;
  onEdit: (habit: HabitViewItem) => void;
  onToggleArchive: (habit: HabitViewItem) => Promise<void>;
  onDeleteRequest: (habit: HabitViewItem) => void;
  onCheckIn: (
    habitId: string,
    dateKey: string,
    action: HabitCheckInAction
  ) => Promise<void>;
}

export function renderHabitCategoryIcon(
  iconKey: HabitViewItem['iconKey'],
  className = 'h-5 w-5'
) {
  switch (iconKey) {
    case 'water':
      return <Droplets className={className} aria-hidden="true" />;
    case 'exercise':
      return <Dumbbell className={className} aria-hidden="true" />;
    case 'book':
      return <BookOpen className={className} aria-hidden="true" />;
    case 'journal':
      return <PenLine className={className} aria-hidden="true" />;
    case 'code':
      return <Code2 className={className} aria-hidden="true" />;
    default:
      return <Leaf className={className} aria-hidden="true" />;
  }
}

export function getHabitIconBadgeClasses(iconKey: HabitViewItem['iconKey']) {
  switch (iconKey) {
    case 'water':
      return 'bg-[#EAF4FF] text-[#1D6FD8]';
    case 'exercise':
      return 'bg-[#F3F1FC] text-[#5938B5]';
    case 'book':
      return 'bg-[#F3F1FC] text-[#4C3599]';
    case 'journal':
      return 'bg-[#FDF6EA] text-[#B86814]';
    case 'code':
      return 'bg-[#EAF7E1] text-[#2F6B1E]';
    default:
      return 'bg-[#EAF7E1] text-[#2F6B1E]';
  }
}

export default function HabitDetailModal({
  habit,
  todayDateKey,
  selectedDateKey,
  onClose,
  onEdit,
  onToggleArchive,
  onDeleteRequest,
  onCheckIn,
}: HabitDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'progress' | 'history' | 'settings'>(
    'progress'
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [busyDateKey, setBusyDateKey] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<HabitHeatmapCell | null>(null);

  useEffect(() => {
    if (!habit) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [habit, onClose]);

  if (!habit) return null;

  const weeks = habit.heatmapWeeks;
  const recent14Days = habit.recentHistory;

  const handleActionOnDate = async (
    dateKey: string,
    action: HabitCheckInAction
  ) => {
    if (busyDateKey) return;
    setBusyDateKey(dateKey);
    try {
      await onCheckIn(habit.id, dateKey, action);
    } finally {
      setBusyDateKey(null);
    }
  };

  const handleArchiveClick = async () => {
    if (isArchiving) return;
    setIsArchiving(true);
    try {
      await onToggleArchive(habit);
    } finally {
      setIsArchiving(false);
    }
  };

  const effectiveScheduledDays =
    habit.scheduledDays && habit.scheduledDays.length > 0
      ? habit.scheduledDays
      : [1, 2, 3, 4, 5, 6, 7];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="habit-detail-modal-title"
    >
      <div
        className="fixed inset-0 bg-[#171622]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${getHabitIconBadgeClasses(
                habit.iconKey
              )}`}
            >
              {renderHabitCategoryIcon(habit.iconKey, 'h-5 w-5')}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="habit-detail-modal-title"
                  className="font-display text-lg font-bold text-[#171622] truncate"
                >
                  {habit.title}
                </h2>
                {!habit.isActive && (
                  <span className="inline-flex items-center rounded-md bg-[#171622]/10 px-2 py-0.5 text-[11px] font-semibold text-[#171622]/75">
                    Paused
                  </span>
                )}
              </div>
              <p className="text-xs text-[#171622]/65 mt-0.5 leading-relaxed">
                {habit.description || 'Consistent daily routine.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(habit)}
              aria-label={`Edit ${habit.title}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#FAF9F6] hover:text-[#171622] transition-colors"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                aria-label="More habit actions"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#FAF9F6] hover:text-[#171622] transition-colors"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-[#171622]/12 bg-white py-1.5 shadow-lg z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleActionOnDate(
                        selectedDateKey,
                        habit.selectedDateStatus === 'completed'
                          ? 'undo'
                          : 'completed'
                      );
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {habit.selectedDateStatus === 'completed'
                        ? 'Undo completion'
                        : 'Mark completed'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleActionOnDate(
                        selectedDateKey,
                        habit.selectedDateStatus === 'skipped'
                          ? 'undo'
                          : 'skipped'
                      );
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                  >
                    <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {habit.selectedDateStatus === 'skipped'
                        ? 'Clear skipped status'
                        : 'Skip selected day'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleArchiveClick();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {habit.isActive ? 'Pause / archive habit' : 'Resume habit'}
                    </span>
                  </button>
                  <div className="my-1 border-t border-[#171622]/8" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onDeleteRequest(habit);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#B42318] hover:bg-[#FDECEC]/60"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Delete habit</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close habit details"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#FAF9F6] hover:text-[#171622] transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 3 KPI Stat Cards matching reference */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#FAF9F6] border border-[#171622]/8 p-3.5 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#171622] border border-[#171622]/8">
              <Calendar className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#171622]/60">
                Weekly target
              </p>
              <p className="font-display text-sm sm:text-base font-bold text-[#171622] tabular-nums">
                {habit.targetPerWeek}{' '}
                {habit.targetPerWeek === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#FDF6F0] border border-[#171622]/8 p-3.5 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#D95D24] border border-[#171622]/8">
              <Flame className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#171622]/60">
                Current streak
              </p>
              <p className="font-display text-sm sm:text-base font-bold text-[#171622] tabular-nums">
                {habit.currentStreak}{' '}
                {habit.currentStreak === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#FDF8EE] border border-[#171622]/8 p-3.5 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#B86814] border border-[#171622]/8">
              <Trophy className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#171622]/60">
                Best streak
              </p>
              <p className="font-display text-sm sm:text-base font-bold text-[#171622] tabular-nums">
                {habit.bestStreak} {habit.bestStreak === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>
        </div>

        {/* Repeat on Weekday Pills + 30-day completion rate */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#171622]">Repeat on</p>
            <div className="flex items-center gap-1.5">
              {ISO_WEEKDAYS.map((dayMeta) => {
                const isScheduled = effectiveScheduledDays.includes(
                  dayMeta.isoDay
                );
                return (
                  <span
                    key={dayMeta.isoDay}
                    className={`inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold ${
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
          </div>

          <div className="text-right space-y-0.5">
            <p className="text-[11px] font-medium text-[#171622]/60">
              30-day consistency
            </p>
            <p className="font-display text-sm font-bold text-[#171622] tabular-nums">
              {habit.completionRate30d ?? 0}% · {habit.completedThisWeek}/
              {habit.targetPerWeek} this week
            </p>
          </div>
        </div>

        {/* Tabs Navigation: Progress | History | Settings */}
        <div className="border-b border-[#171622]/10 flex items-center gap-6">
          {(
            [
              { id: 'progress', label: 'Progress' },
              { id: 'history', label: 'History' },
              { id: 'settings', label: 'Settings' },
            ] as const
          ).map((tab) => {
            const isActiveTab = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  isActiveTab
                    ? 'border-[#171622] text-[#171622]'
                    : 'border-transparent text-[#171622]/55 hover:text-[#171622]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'progress' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#171622]">
                Last 12 weeks
              </h3>
              <span className="text-[11px] text-[#171622]/60 tabular-nums">
                {hoveredCell
                  ? `${hoveredCell.formattedDate} — ${
                      hoveredCell.state === 'completed'
                        ? 'Completed'
                        : hoveredCell.state === 'skipped'
                          ? 'Skipped'
                          : hoveredCell.state === 'missed'
                            ? 'Missed'
                            : hoveredCell.state === 'upcoming'
                              ? 'Upcoming'
                              : 'Not scheduled'
                    }`
                  : 'Click any past date to toggle check-in'}
              </span>
            </div>

            <div className="rounded-xl border border-[#171622]/8 bg-[#FAF9F6]/60 p-3.5">
              <div className="flex items-start gap-2.5">
                {/* Weekday Labels Column */}
                <div className="grid grid-rows-7 gap-1.5 text-[10px] font-medium text-[#171622]/55 pr-1">
                  {ISO_WEEKDAYS.map((d) => (
                    <span key={d.isoDay} className="h-4 flex items-center">
                      {d.shortLabel}
                    </span>
                  ))}
                </div>

                {/* 12 Weeks Columns */}
                <div className="flex-1 grid grid-cols-12 gap-1.5">
                  {weeks.map((weekCells, wIndex) => (
                    <div key={wIndex} className="grid grid-rows-7 gap-1.5">
                      {weekCells.map((cell) => {
                        const isFuture = cell.dateKey > todayDateKey;
                        const isBusy = busyDateKey === cell.dateKey;
                        let cellClass = 'bg-[#171622]/8';
                        if (cell.state === 'completed') {
                          cellClass = 'bg-[#58B937]';
                        } else if (cell.state === 'skipped') {
                          cellClass = 'bg-[#C8F27C]';
                        } else if (cell.state === 'missed') {
                          cellClass = 'bg-[#171622]/18';
                        } else if (cell.state === 'upcoming') {
                          cellClass = 'bg-[#171622]/5 opacity-45';
                        }

                        return (
                          <button
                            key={cell.dateKey}
                            type="button"
                            disabled={isFuture || Boolean(busyDateKey)}
                            onMouseEnter={() => setHoveredCell(cell)}
                            onMouseLeave={() => setHoveredCell(null)}
                            onFocus={() => setHoveredCell(cell)}
                            onClick={() => {
                              if (isFuture) return;
                              const nextAction: HabitCheckInAction =
                                cell.state === 'completed'
                                  ? 'undo'
                                  : 'completed';
                              void handleActionOnDate(cell.dateKey, nextAction);
                            }}
                            aria-label={`${cell.formattedDate}: ${cell.state}`}
                            className={`h-4 w-full rounded-[4px] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-[#171622] ${cellClass} ${
                              cell.dateKey === selectedDateKey
                                ? 'ring-1 ring-[#171622]'
                                : ''
                            } ${isBusy ? 'animate-pulse' : ''}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-3.5 pt-2.5 border-t border-[#171622]/8 flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#171622]/65">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#58B937]" />
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#C8F27C]" />
                  <span>Skipped</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#171622]/18" />
                  <span>Missed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#171622]/8" />
                  <span>Not scheduled</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {recent14Days.map((item) => {
              const isBusy = busyDateKey === item.dateKey;
              return (
                <div
                  key={item.dateKey}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#171622]/8 bg-[#FAF9F6]/60 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#171622]">
                      {item.dateKey === todayDateKey
                        ? `Today · ${item.formattedDate}`
                        : item.formattedDate}
                    </p>
                    <p className="text-[11px] text-[#171622]/55">
                      {item.status === 'completed'
                        ? 'Completed'
                        : item.status === 'skipped'
                          ? 'Skipped (intentional rest)'
                          : 'No check-in recorded'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isBusy ? (
                      <Loader2
                        className="h-4 w-4 animate-spin text-[#171622]/60"
                        aria-hidden="true"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void handleActionOnDate(
                              item.dateKey,
                              item.status === 'completed' ? 'undo' : 'completed'
                            )
                          }
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            item.status === 'completed'
                              ? 'bg-[#58B937] text-white'
                              : 'bg-white border border-[#171622]/12 text-[#171622] hover:bg-[#C8F27C]/40'
                          }`}
                        >
                          {item.status === 'completed' ? 'Done' : 'Complete'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleActionOnDate(
                              item.dateKey,
                              item.status === 'skipped' ? 'undo' : 'skipped'
                            )
                          }
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            item.status === 'skipped'
                              ? 'bg-[#C8F27C] text-[#171622]'
                              : 'bg-white border border-[#171622]/12 text-[#171622]/70 hover:text-[#171622]'
                          }`}
                        >
                          {item.status === 'skipped' ? 'Skipped' : 'Skip'}
                        </button>

                        {item.status !== null && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleActionOnDate(item.dateKey, 'undo')
                            }
                            aria-label={`Clear status for ${item.formattedDate}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[#171622]/50 hover:bg-[#171622]/8 hover:text-[#171622]"
                          >
                            <RotateCcw
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3.5">
              <div>
                <p className="text-xs font-bold text-[#171622]">
                  Edit habit details
                </p>
                <p className="text-[11px] text-[#171622]/60">
                  Update the name, description, weekly target, or repeat days.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEdit(habit)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-3.5 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Edit</span>
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3.5">
              <div>
                <p className="text-xs font-bold text-[#171622]">
                  {habit.isActive ? 'Pause / archive habit' : 'Resume habit'}
                </p>
                <p className="text-[11px] text-[#171622]/60">
                  {habit.isActive
                    ? 'Hide from your daily active checklist while keeping all history.'
                    : 'Return this habit to your active routine.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isArchiving}
                onClick={() => void handleArchiveClick()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-3.5 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6] disabled:opacity-50"
              >
                {habit.isActive ? (
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{habit.isActive ? 'Pause' : 'Resume'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[#B42318]/20 bg-[#FDECEC]/45 p-3.5">
              <div>
                <p className="text-xs font-bold text-[#B42318]">
                  Delete habit permanently
                </p>
                <p className="text-[11px] text-[#B42318]/80">
                  Deletes this habit and all of its historical check-in logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDeleteRequest(habit)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B42318] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#B42318]/90"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
