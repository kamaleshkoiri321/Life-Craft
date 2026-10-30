'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import { useAuth } from '@/components/auth/AuthProvider';
import type { DashboardQueryResult } from '@/lib/queries/dashboard';
import {
  buildDashboardPayload,
  DEFAULT_TIMEZONE,
  type DashboardDataPayload,
} from '@/lib/queries/timezone';
import dynamic from 'next/dynamic';
import DashboardHeader from './DashboardHeader';
import DashboardPanels from './DashboardPanels';
import DashboardSidebar, {
  DASHBOARD_NAV_ITEMS,
  type DashboardSectionId,
} from './DashboardSidebar';
import SummaryCardsGrid from './SummaryCardsGrid';

function ModuleLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[340px] items-center justify-center rounded-2xl border border-[#171622]/10 bg-white p-8"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-[#171622]/70">
        <Loader2 className="h-4 w-4 animate-spin text-[#171622]" aria-hidden="true" />
        <span>Loading module...</span>
      </div>
    </div>
  );
}

const TasksView = dynamic(() => import('@/components/tasks/TasksView'), {
  loading: () => <ModuleLoadingFallback />,
});
const CalendarView = dynamic(() => import('@/components/calendar/CalendarView'), {
  loading: () => <ModuleLoadingFallback />,
});
const HabitsView = dynamic(() => import('@/components/habits/HabitsView'), {
  loading: () => <ModuleLoadingFallback />,
});
const GoalsView = dynamic(() => import('@/components/goals/GoalsView'), {
  loading: () => <ModuleLoadingFallback />,
});
const LibraryView = dynamic(() => import('@/components/library/LibraryView'), {
  loading: () => <ModuleLoadingFallback />,
});
const NotesView = dynamic(() => import('@/components/notes/NotesView'), {
  loading: () => <ModuleLoadingFallback />,
});
const FocusView = dynamic(() => import('@/components/focus/FocusView'), {
  loading: () => <ModuleLoadingFallback />,
});
const SettingsView = dynamic(() => import('@/components/settings/SettingsView'), {
  loading: () => <ModuleLoadingFallback />,
});

const SECTION_PATH_MAP: Record<DashboardSectionId, string> = {
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

function resolveSectionFromPathname(path: string | null): DashboardSectionId | null {
  if (!path) return null;
  const cleaned = path.replace(/\/+$/, '') || '/app';
  if (cleaned === '/app') return 'overview';
  if (cleaned === '/app/tasks' || cleaned === '/tasks') return 'tasks';
  if (cleaned === '/app/calendar' || cleaned === '/calendar') return 'calendar';
  if (cleaned === '/app/habits' || cleaned === '/habits') return 'habits';
  if (cleaned === '/app/goals' || cleaned === '/goals') return 'goals';
  if (cleaned === '/app/library' || cleaned === '/library') return 'library';
  if (cleaned === '/app/notes' || cleaned === '/notes') return 'notes';
  if (cleaned === '/app/focus' || cleaned === '/focus') return 'focus';
  if (cleaned === '/app/settings' || cleaned === '/settings') return 'settings';
  return null;
}

interface DashboardClientShellProps {
  initialResult: DashboardQueryResult | null;
  initialSection?: DashboardSectionId;
}

export default function DashboardClientShell({
  initialResult,
  initialSection = 'overview',
}: DashboardClientShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading: isAuthLoading, signOut } = useAuth();

  const [dashboardResult, setDashboardResult] =
    useState<DashboardQueryResult | null>(initialResult);
  const [isFetchingDashboard, setIsFetchingDashboard] = useState<boolean>(
    !initialResult
  );
  const [activeSection, setActiveSection] =
    useState<DashboardSectionId>(initialSection);
  const [visitedSections, setVisitedSections] = useState<Set<DashboardSectionId>>(
    () => new Set([initialSection])
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCreateModalSignal, setOpenCreateModalSignal] = useState(0);
  const [openCreateHabitSignal, setOpenCreateHabitSignal] = useState(0);
  const [selectedTaskIdFromOverview, setSelectedTaskIdFromOverview] = useState<
    string | null
  >(null);

  const navigateToSection = useCallback((sec: DashboardSectionId) => {
    setActiveSection(sec);
    setVisitedSections((prev) => {
      if (prev.has(sec)) return prev;
      const next = new Set(prev);
      next.add(sec);
      return next;
    });
    if (typeof window !== 'undefined') {
      const targetPath = SECTION_PATH_MAP[sec] || '/app';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ section: sec }, '', targetPath);
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const resolved = resolveSectionFromPathname(window.location.pathname);
      if (resolved) {
        setSelectedTaskIdFromOverview(null);
        setActiveSection(resolved);
        setVisitedSections((prev) => {
          if (prev.has(resolved)) return prev;
          const next = new Set(prev);
          next.add(resolved);
          return next;
        });
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Background idle prefetching of heavy modules so first-click is instant
  useEffect(() => {
    const prefetchModules = () => {
      void import('@/components/tasks/TasksView');
      void import('@/components/habits/HabitsView');
      void import('@/components/notes/NotesView');
      void import('@/components/focus/FocusView');
      void import('@/components/calendar/CalendarView');
      void import('@/components/goals/GoalsView');
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (
        window as unknown as {
          requestIdleCallback: (cb: () => void) => number;
        }
      ).requestIdleCallback(prefetchModules);
      return () => {
        if ('cancelIdleCallback' in window) {
          (
            window as unknown as {
              cancelIdleCallback: (id: number) => void;
            }
          ).cancelIdleCallback(handle);
        }
      };
    } else {
      const timer = setTimeout(prefetchModules, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsFetchingDashboard(true);
    try {
      const response = await fetch('/api/dashboard', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (response.status === 401) {
        if (!isSigningOut) {
          const target = pathname || '/app';
          router.replace(`/sign-in?redirect=${encodeURIComponent(target)}`);
        }
        return;
      }

      if (response.ok) {
        const result = (await response.json()) as DashboardQueryResult;
        setDashboardResult(result);
      }
    } catch {
      // Keep current state or fallback if network fails
    } finally {
      setIsFetchingDashboard(false);
    }
  }, [isSigningOut, pathname, router]);

  useEffect(() => {
    if (initialResult) {
      return;
    }

    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated && !isSigningOut) {
      const target = pathname || '/app';
      router.replace(`/sign-in?redirect=${encodeURIComponent(target)}`);
      return;
    }

    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    fetch('/api/dashboard', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          if (!isSigningOut) {
            const target = pathname || '/app';
            router.replace(`/sign-in?redirect=${encodeURIComponent(target)}`);
          }
          return;
        }
        if (response.ok) {
          const result = (await response.json()) as DashboardQueryResult;
          if (!cancelled) {
            setDashboardResult(result);
          }
        }
      })
      .catch(() => {
        // Keep fallback state on transient network error
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetchingDashboard(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    initialResult,
    isAuthLoading,
    isAuthenticated,
    isSigningOut,
    pathname,
    router,
  ]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleCloseMobile = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleOpenMobile = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  // Resolve effective payload from server result or authenticated client session fallback
  const effectivePayload: DashboardDataPayload | null =
    dashboardResult?.data ??
    (user
      ? buildDashboardPayload({
          authUser: {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image ?? null,
          },
          profile: null,
          preferences: null,
          userTasks: [],
          userHabits: [],
          userHabitLogs: [],
          userGoals: [],
          userNotes: [],
        })
      : null);

  if (!effectivePayload && (isAuthLoading || isFetchingDashboard)) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#171622]">
        <header className="h-16 border-b border-[#171622]/8 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
            <BrandMark />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div
            role="status"
            aria-live="polite"
            className="w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-8 text-center space-y-4"
          >
            <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBE8F8] text-[#171622]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
            <h1 className="font-display text-lg font-bold text-[#171622]">
              Loading your LifeCraft workspace...
            </h1>
            <p className="text-xs text-[#171622]/70">
              Verifying your authenticated session and loading your personal
              dashboard.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!effectivePayload) {
    return null;
  }

  const dbStatus = dashboardResult?.status ?? 'ok';
  const dbStatusMessage = dashboardResult?.message;

  return (
    <div className="min-h-screen flex bg-[#FAF9F6] text-[#171622]">
      <DashboardSidebar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setSelectedTaskIdFromOverview(null);
          navigateToSection(sec);
        }}
        userDisplayName={effectivePayload.user.displayName}
        userEmail={effectivePayload.user.email}
        userImage={effectivePayload.user.image}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={handleCloseMobile}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6">
          <DashboardHeader
            activeSection={activeSection}
            greeting={effectivePayload.greeting}
            userDisplayName={effectivePayload.user.displayName}
            userImage={effectivePayload.user.image}
            formattedDate={effectivePayload.formattedDate}
            timezone={effectivePayload.user.timezone || DEFAULT_TIMEZONE}
            searchQuery={searchQuery}
            onSearchChange={(val) => {
              setSearchQuery(val);
              if (
                val.trim() &&
                activeSection !== 'tasks' &&
                activeSection !== 'habits' &&
                activeSection !== 'goals' &&
                activeSection !== 'notes' &&
                activeSection !== 'library' &&
                activeSection !== 'focus'
              ) {
                setSelectedTaskIdFromOverview(null);
                navigateToSection('tasks');
              }
            }}
            onSearchSubmit={() => {
              if (
                activeSection !== 'tasks' &&
                activeSection !== 'habits' &&
                activeSection !== 'goals' &&
                activeSection !== 'notes' &&
                activeSection !== 'library' &&
                activeSection !== 'focus'
              ) {
                setSelectedTaskIdFromOverview(null);
                navigateToSection('tasks');
              }
            }}
            onAddTask={() => {
              setSelectedTaskIdFromOverview(null);
              navigateToSection('tasks');
              setOpenCreateModalSignal((prev) => prev + 1);
            }}
            onOpenMobileMenu={handleOpenMobile}
            onRefresh={handleManualRefresh}
            isRefreshing={isFetchingDashboard}
          />

          {/* Unverified Email Notice (if applicable) */}
          {!effectivePayload.user.emailVerified && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#171622]/12 bg-white px-5 py-3.5 text-xs sm:text-sm"
            >
              <div className="flex items-center gap-2.5 text-[#171622]/85">
                <ShieldAlert
                  className="h-4 w-4 shrink-0 text-[#5938B5]"
                  aria-hidden="true"
                />
                <span>
                  Please verify your email address (
                  <strong className="font-semibold">
                    {effectivePayload.user.email}
                  </strong>
                  ) to keep your account recovery options active.
                </span>
              </div>
              <Link
                href={`/verify-email?email=${encodeURIComponent(
                  effectivePayload.user.email
                )}`}
                className="font-semibold text-[#5938B5] underline underline-offset-4 hover:text-[#171622] whitespace-nowrap shrink-0"
              >
                Verify email
              </Link>
            </div>
          )}

          {/* Main View Container: Persistent SPA Sections with Instant 0ms Switching */}
          <div style={{ display: activeSection === 'overview' ? 'block' : 'none' }}>
            <SummaryCardsGrid
              summary={effectivePayload.summary}
              onSelectSection={(sec) => {
                setSelectedTaskIdFromOverview(null);
                navigateToSection(sec);
              }}
            />

            <DashboardPanels
              todaysFocus={effectivePayload.todaysFocus}
              weeklyActivity={effectivePayload.weeklyActivity}
              activeGoals={effectivePayload.activeGoals}
              dailyHabits={effectivePayload.dailyHabits}
              recentNotes={effectivePayload.recentNotes}
              onSelectSection={(sec) => {
                setSelectedTaskIdFromOverview(null);
                navigateToSection(sec);
              }}
              onAddTask={() => {
                setSelectedTaskIdFromOverview(null);
                navigateToSection('tasks');
                setOpenCreateModalSignal((prev) => prev + 1);
              }}
              onAddHabit={() => {
                setSelectedTaskIdFromOverview(null);
                navigateToSection('habits');
                setOpenCreateHabitSignal((prev) => prev + 1);
              }}
              onOpenTaskDetail={(taskId) => {
                setSelectedTaskIdFromOverview(taskId);
                navigateToSection('tasks');
              }}
              onTaskMutated={handleManualRefresh}
            />
          </div>

          {visitedSections.has('tasks') && (
            <div style={{ display: activeSection === 'tasks' ? 'block' : 'none' }}>
              <TasksView
                todayLocalDate={effectivePayload.todayLocalDate}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                defaultOpenCreateModal={openCreateModalSignal > 0}
                onCreateModalOpened={() => setOpenCreateModalSignal(0)}
                initialSelectedTaskId={selectedTaskIdFromOverview}
                onTasksMutated={handleManualRefresh}
              />
            </div>
          )}

          {visitedSections.has('calendar') && (
            <div style={{ display: activeSection === 'calendar' ? 'block' : 'none' }}>
              <CalendarView
                todayLocalDate={effectivePayload.todayLocalDate}
                timezone={effectivePayload.user.timezone || DEFAULT_TIMEZONE}
                onTasksMutated={handleManualRefresh}
              />
            </div>
          )}

          {visitedSections.has('habits') && (
            <div style={{ display: activeSection === 'habits' ? 'block' : 'none' }}>
              <HabitsView
                todayLocalDate={effectivePayload.todayLocalDate}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                defaultOpenCreateModal={openCreateHabitSignal > 0}
                onCreateModalOpened={() => setOpenCreateHabitSignal(0)}
                onHabitsMutated={handleManualRefresh}
              />
            </div>
          )}

          {visitedSections.has('goals') && (
            <div style={{ display: activeSection === 'goals' ? 'block' : 'none' }}>
              <GoalsView
                searchQuery={searchQuery}
                onDataMutated={handleManualRefresh}
              />
            </div>
          )}

          {visitedSections.has('notes') && (
            <div style={{ display: activeSection === 'notes' ? 'block' : 'none' }}>
              <NotesView
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onDataMutated={handleManualRefresh}
              />
            </div>
          )}

          {visitedSections.has('library') && (
            <div style={{ display: activeSection === 'library' ? 'block' : 'none' }}>
              <LibraryView
                searchQuery={searchQuery}
                onDataMutated={handleManualRefresh}
              />
            </div>
          )}

          {visitedSections.has('focus') && (
            <div style={{ display: activeSection === 'focus' ? 'block' : 'none' }}>
              <FocusView
                searchQuery={searchQuery}
                onDataMutated={handleManualRefresh}
              />
            </div>
          )}

          {visitedSections.has('settings') && (
            <div style={{ display: activeSection === 'settings' ? 'block' : 'none' }}>
              <SettingsView
                initialDisplayName={effectivePayload.user.displayName}
                initialEmail={effectivePayload.user.email}
                initialEmailVerified={effectivePayload.user.emailVerified}
                initialImage={effectivePayload.user.image}
                initialTimezone={
                  effectivePayload.user.timezone || DEFAULT_TIMEZONE
                }
                initialTheme={effectivePayload.preferences.theme}
                initialWeekStartsOn={effectivePayload.preferences.weekStartsOn}
                onSignOut={handleSignOut}
                isSigningOut={isSigningOut}
                onSettingsMutated={handleManualRefresh}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
