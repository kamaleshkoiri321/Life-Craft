'use client';

import React from 'react';
import {
  CheckSquare,
  ChevronRight,
  Flame,
  Sparkles,
  Target,
} from 'lucide-react';
import type { DashboardSummaryMetrics } from '@/lib/queries/timezone';
import type { DashboardSectionId } from './DashboardSidebar';

interface SummaryCardsGridProps {
  summary: DashboardSummaryMetrics;
  onSelectSection: (section: DashboardSectionId) => void;
}

export default function SummaryCardsGrid({
  summary,
  onSelectSection,
}: SummaryCardsGridProps) {
  const cards = [
    {
      id: 'tasks-today',
      targetSection: 'tasks' as DashboardSectionId,
      label: 'Tasks today',
      value: String(summary.tasksTodayCount),
      subtext:
        summary.tasksTodayCount === 0
          ? 'None scheduled today'
          : summary.highPriorityTodayCount > 0
            ? `${summary.highPriorityTodayCount} high priority`
            : 'All on track for today',
      cardBg: 'bg-[#F2FBE0] border-[#171622]/8',
      iconBg: 'bg-[#C8F27C] text-[#171622]',
      icon: CheckSquare,
    },
    {
      id: 'completed-today',
      targetSection: 'tasks' as DashboardSectionId,
      label: 'Completed today',
      value: String(summary.completedTodayCount),
      subtext:
        summary.completedTodayCount > 0
          ? 'Keep going!'
          : 'Ready when you are',
      cardBg: 'bg-[#F3F1FC] border-[#171622]/8',
      iconBg: 'bg-[#DFD9F5] text-[#171622]',
      icon: Sparkles,
    },
    {
      id: 'active-habits',
      targetSection: 'habits' as DashboardSectionId,
      label: 'Active habits',
      value: String(summary.activeHabitsCount),
      subtext:
        summary.activeHabitsCount === 0
          ? 'No active habits yet'
          : `${summary.completedHabitsTodayCount} of ${summary.dueHabitsTodayCount || summary.activeHabitsCount} done today`,
      cardBg: 'bg-[#FDF8EE] border-[#171622]/8',
      iconBg: 'bg-[#F7E3BA] text-[#9A5B13]',
      icon: Flame,
    },
    {
      id: 'active-goals',
      targetSection: 'goals' as DashboardSectionId,
      label: 'Active goals',
      value: String(summary.activeGoalsCount),
      subtext:
        summary.activeGoalsCount === 0
          ? 'No active goals yet'
          : `${summary.activeGoalsCount} in progress`,
      cardBg: 'bg-[#F3F1FC] border-[#171622]/8',
      iconBg: 'bg-[#DFD9F5] text-[#4C3599]',
      icon: Target,
    },
  ];

  return (
    <section
      aria-label="Daily productivity summary"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectSection(card.targetSection)}
            className={`group text-left rounded-2xl border p-5 transition-colors hover:border-[#171622]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${card.cardBg}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-medium text-[#171622]/75">
                    {card.label}
                  </p>
                  <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#171622] tabular-nums leading-none">
                    {card.value}
                  </p>
                  <p className="pt-1 text-xs text-[#171622]/65 truncate">
                    {card.subtext}
                  </p>
                </div>
              </div>

              <ChevronRight
                className="mt-4 h-4 w-4 shrink-0 text-[#171622]/45 transition-transform group-hover:translate-x-0.5 group-hover:text-[#171622]"
                aria-hidden="true"
              />
            </div>
          </button>
        );
      })}
    </section>
  );
}
