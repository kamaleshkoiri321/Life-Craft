'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Calendar,
  CheckSquare,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Home,
  Loader2,
  LogOut,
  Settings,
  Sunrise,
  Target,
  X,
} from 'lucide-react';

export type DashboardSectionId =
  | 'overview'
  | 'tasks'
  | 'calendar'
  | 'habits'
  | 'goals'
  | 'notes'
  | 'library'
  | 'focus'
  | 'settings';

export const SECTION_PATH_MAP: Record<DashboardSectionId, string> = {
  overview: '/app',
  tasks: '/app/tasks',
  calendar: '/app/calendar',
  habits: '/app/habits',
  goals: '/app/goals',
  library: '/app/library',
  notes: '/app/notes',
  focus: '/app/focus',
  settings: '/app/settings',
};

export const prefetchSectionModule = (sec: DashboardSectionId) => {
  switch (sec) {
    case 'tasks':
      void import('@/components/tasks/TasksView');
      break;
    case 'calendar':
      void import('@/components/calendar/CalendarView');
      break;
    case 'habits':
      void import('@/components/habits/HabitsView');
      break;
    case 'goals':
      void import('@/components/goals/GoalsView');
      break;
    case 'library':
      void import('@/components/library/LibraryView');
      break;
    case 'notes':
      void import('@/components/notes/NotesView');
      break;
    case 'focus':
      void import('@/components/focus/FocusView');
      break;
    case 'settings':
      void import('@/components/settings/SettingsView');
      break;
  }
};

export interface NavItemConfig {
  id: DashboardSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  phaseBadge?: string;
  phaseDescription?: string;
}

export const DASHBOARD_NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Home,
  },
  {
    id: 'tasks',
    label: 'My Tasks',
    icon: CheckSquare,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: Calendar,
  },
  {
    id: 'habits',
    label: 'Habits',
    icon: CheckCircle2,
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: Target,
  },
  {
    id: 'library',
    label: 'Library',
    icon: BookOpen,
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: FileText,
  },
  {
    id: 'focus',
    label: 'Focus',
    icon: Clock,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
  },
];

interface DashboardSidebarProps {
  activeSection: DashboardSectionId;
  onSelectSection: (section: DashboardSectionId) => void;
  userDisplayName: string;
  userEmail: string;
  userImage?: string | null;
  onSignOut: () => void;
  isSigningOut: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function DashboardSidebar({
  activeSection,
  onSelectSection,
  userDisplayName,
  userEmail,
  userImage,
  onSignOut,
  isSigningOut,
  isMobileOpen,
  onCloseMobile,
}: DashboardSidebarProps) {
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const initials =
    userDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'LC';

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-[#FAF9F6] border-r border-[#171622]/8 px-4 py-6">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2">
          <Link
            href="/"
            className="flex items-center gap-3 group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-lg"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171622] text-[#C8F27C] shadow-xs transition-transform duration-150 group-hover:scale-105"
            >
              <Compass className="h-5 w-5 stroke-[2.2]" />
            </span>
            <div>
              <span className="block font-display text-lg font-bold tracking-tight text-[#171622] leading-none">
                LifeCraft
              </span>
              <span className="mt-1 block text-xs text-[#171622]/65">
                Build a life you love.
              </span>
            </div>
          </Link>

          {isMobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation drawer"
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#171622]/12 bg-white text-[#171622] hover:bg-[#FAF9F6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Navigation Links with SPA Fast Client Navigation & Instant Hover Prefetch */}
        <nav aria-label="Dashboard navigation" className="space-y-1">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const href = SECTION_PATH_MAP[item.id] || '/app';
            return (
              <Link
                key={item.id}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                onMouseEnter={() => prefetchSectionModule(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                  isActive
                    ? 'bg-[#C8F27C] font-semibold text-[#171622]'
                    : 'text-[#171622]/75 hover:bg-[#171622]/5 hover:text-[#171622]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.phaseBadge && (
                  <span className="text-[11px] font-normal text-[#171622]/50 shrink-0">
                    {item.phaseBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Motivational Callout + User Profile & Sign Out */}
      <div className="space-y-4 pt-6">
        <div className="rounded-2xl bg-[#EBE8F8]/75 border border-[#171622]/8 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[#171622]">
              <Sunrise className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              {activeSection === 'library' ? (
                <>
                  <p className="text-xs font-semibold text-[#5938B5] leading-snug">
                    Knowledge today.
                  </p>
                  <p className="text-xs font-semibold text-[#5938B5] leading-snug">
                    A better you tomorrow.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-[#171622] leading-snug">
                    Small steps,
                  </p>
                  <p className="text-xs font-semibold text-[#171622] leading-snug">
                    brighter days.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#171622]/10 pt-4 space-y-3">
          <div className="flex items-center gap-3 px-1.5">
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt={userDisplayName}
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-full object-cover border border-[#171622]/12 bg-[#EBE8F8]"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EBE8F8] border border-[#171622]/12 font-display text-xs font-bold text-[#171622]"
              >
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#171622]">
                {userDisplayName}
              </p>
              <p className="truncate text-xs text-[#171622]/60">{userEmail}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#171622]/80 hover:bg-[#171622]/6 hover:text-[#171622] transition-colors disabled:opacity-60 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            {isSigningOut ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Permanent Sidebar */}
      <aside
        aria-label="Workspace sidebar"
        className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen"
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile Accessible Drawer */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation drawer"
        >
          <div
            className="fixed inset-0 bg-[#171622]/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-xl">
            {renderSidebarContent()}
          </div>
        </div>
      )}
    </>
  );
}
