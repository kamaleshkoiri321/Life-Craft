'use client';

import React from 'react';
import { Calendar, Menu, Plus, Search, X } from 'lucide-react';
import type { DashboardSectionId } from './DashboardSidebar';

interface DashboardHeaderProps {
  activeSection: DashboardSectionId;
  greeting: string;
  userDisplayName: string;
  userImage?: string | null;
  formattedDate: string;
  timezone: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onAddTask: () => void;
  onOpenMobileMenu: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function DashboardHeader({
  activeSection,
  greeting,
  userDisplayName,
  userImage,
  formattedDate,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onAddTask,
  onOpenMobileMenu,
  onRefresh,
  isRefreshing,
}: DashboardHeaderProps) {
  const initials =
    userDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'LC';

  return (
    <header className="space-y-6">
      {/* Top Bar with Search Input & User Profile */}
      <div className="flex items-center justify-between gap-4 border-b border-[#171622]/8 pb-4">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="lg:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#171622]/12 bg-white text-[#171622] hover:bg-[#FAF9F6] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          {activeSection !== 'settings' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSearchSubmit();
              }}
              className="relative flex-1"
            >
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#171622]/45"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label={
                  activeSection === 'tasks'
                    ? 'Search tasks'
                    : activeSection === 'habits'
                      ? 'Search habits'
                      : activeSection === 'goals'
                        ? 'Search goals, milestones'
                        : activeSection === 'notes'
                          ? 'Search notes, tags, or content'
                          : activeSection === 'library'
                            ? 'Search books, notes, collections'
                            : activeSection === 'focus'
                              ? 'Search tasks, notes, books, or anything'
                              : 'Search habits, tasks, goals'
                }
                placeholder={
                  activeSection === 'tasks'
                    ? 'Search tasks...'
                    : activeSection === 'habits'
                      ? 'Search habits...'
                      : activeSection === 'goals'
                        ? 'Search goals, milestones...'
                        : activeSection === 'notes'
                          ? 'Search notes, tags, or content...'
                          : activeSection === 'library'
                            ? 'Search books, notes, collections...'
                            : activeSection === 'focus'
                              ? 'Search tasks, notes, books, or anything...'
                              : 'Search habits, tasks, goals...'
                }
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full rounded-xl border border-[#171622]/10 bg-white pl-10 pr-8 py-2 text-xs sm:text-sm text-[#171622] placeholder:text-[#171622]/45 focus:border-[#171622] focus:outline-none shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#171622]/45 hover:text-[#171622]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </form>
          )}
        </div>

        <div className="flex items-center gap-3">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userImage}
              alt={`Signed in as ${userDisplayName}`}
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-full object-cover border border-[#171622]/12 bg-[#EBE8F8]"
            />
          ) : (
            <div
              aria-label={`Signed in as ${userDisplayName}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EBE8F8] border border-[#171622]/12 font-display text-xs font-bold text-[#171622]"
            >
              {initials}
            </div>
          )}
        </div>
      </div>

      {/* Welcome Headline, Date Display & Add Task CTA (Overview only) */}
      {activeSection === 'overview' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622] text-balance">
              {greeting}, {userDisplayName}
            </h1>
            <p className="text-sm sm:text-base text-[#171622]/65">
              A little progress goes a long way.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <div className="inline-flex items-center gap-2 rounded-xl border border-[#171622]/12 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[#171622] shadow-2xs whitespace-nowrap shrink-0">
              <Calendar
                className="h-4 w-4 text-[#171622]/65"
                aria-hidden="true"
              />
              <span className="tabular-nums font-semibold">
                {formattedDate}
              </span>
            </div>

            <button
              type="button"
              onClick={onAddTask}
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add task</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
