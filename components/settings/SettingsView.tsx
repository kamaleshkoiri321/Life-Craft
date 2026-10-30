'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { UserProfile } from '@clerk/nextjs';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Globe,
  Loader2,
  LogOut,
  Shield,
  Sliders,
  X,
} from 'lucide-react';
import {
  WEEK_START_OPTIONS,
  buildTimezoneOptions,
  type SettingsDataPayload,
  type SettingsTheme,
} from '@/lib/settings/settings-utils';
import type {
  SettingsMutationResult,
  SettingsQueryResult,
} from '@/lib/queries/settings';

export function applyThemePreference(theme: SettingsTheme): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem('lifecraft:theme', theme);
  } catch {
    // Ignore storage access errors
  }

  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved =
    theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

  document.documentElement.dataset.theme = resolved;
}

interface SettingsViewProps {
  initialDisplayName: string;
  initialEmail: string;
  initialEmailVerified: boolean;
  initialImage: string | null;
  initialTimezone: string;
  initialTheme: SettingsTheme;
  initialWeekStartsOn: number;
  onSignOut: () => Promise<void> | void;
  isSigningOut: boolean;
  onSettingsMutated?: () => Promise<void> | void;
}

export default function SettingsView({
  initialTimezone,
  initialTheme,
  initialWeekStartsOn,
  onSignOut,
  isSigningOut,
  onSettingsMutated,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'account' | 'preferences'>('account');

  // Preferences state hydrated from props and /api/settings
  const [theme, setTheme] = useState<SettingsTheme>(initialTheme);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [weekStartsOn, setWeekStartsOn] = useState<number>(initialWeekStartsOn);

  // Saving / busy states
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Status feedback
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const browserTimezone = useMemo(() => {
    if (typeof Intl === 'undefined') return null;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return null;
    }
  }, []);

  const timezoneOptions = useMemo(
    () => buildTimezoneOptions(timezone, browserTimezone),
    [timezone, browserTimezone]
  );

  const showFeedback = useCallback(
    (type: 'success' | 'error', message: string) => {
      setFeedbackBanner({ type, message });
      if (type === 'success') {
        setTimeout(() => {
          setFeedbackBanner((curr) =>
            curr?.message === message ? null : curr
          );
        }, 4000);
      }
    },
    []
  );

  const applyServerPayload = useCallback((data: SettingsDataPayload) => {
    setTimezone(data.profile.timezone);
    setTheme(data.preferences.theme);
    setWeekStartsOn(data.preferences.weekStartsOn);
    applyThemePreference(data.preferences.theme);
  }, []);

  // Load authoritative settings from /api/settings on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (res) => {
        if (cancelled) return;
        const json = (await res.json()) as SettingsQueryResult;
        if (cancelled) return;
        if (res.ok && json.status === 'ok') {
          applyServerPayload(json.data);
        }
      })
      .catch(() => {
        // Keep initial props fallback if network error occurs
      });

    return () => {
      cancelled = true;
    };
  }, [applyServerPayload]);

  const patchSettings = async (
    payload: Record<string, unknown>,
    successMessage: string
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as SettingsMutationResult;
      if (res.ok && json.status === 'ok') {
        applyServerPayload(json.data);
        showFeedback('success', successMessage);
        await onSettingsMutated?.();
        return true;
      }
      showFeedback(
        'error',
        json.status !== 'ok' ? json.message : 'Could not save settings.'
      );
      return false;
    } catch {
      showFeedback('error', 'Network error while saving settings.');
      return false;
    }
  };

  const handleTimezoneChange = async (nextTz: string) => {
    if (isSavingPreferences || nextTz === timezone) return;
    const prevTz = timezone;
    setTimezone(nextTz);
    setIsSavingPreferences(true);
    try {
      const ok = await patchSettings(
        { timezone: nextTz },
        `Timezone updated to ${nextTz}.`
      );
      if (!ok) {
        setTimezone(prevTz);
      }
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleWeekStartChange = async (nextDay: number) => {
    if (isSavingPreferences || nextDay === weekStartsOn) return;
    const prevDay = weekStartsOn;
    setWeekStartsOn(nextDay);
    setIsSavingPreferences(true);
    try {
      const dayLabel =
        WEEK_START_OPTIONS.find((o) => o.value === nextDay)?.label ?? 'Monday';
      const ok = await patchSettings(
        { weekStartsOn: nextDay },
        `Week start day set to ${dayLabel}.`
      );
      if (!ok) {
        setWeekStartsOn(prevDay);
      }
    } finally {
      setIsSavingPreferences(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622]">
            Settings
          </h1>
          <p className="text-sm sm:text-base text-[#171622]/65">
            Manage your profile, authentication, security, and app preferences.
          </p>
        </div>

        {/* Tab Switcher */}
        <div
          role="tablist"
          aria-label="Settings categories"
          className="inline-flex items-center gap-1.5 p-1 bg-[#171622]/6 rounded-2xl border border-[#171622]/8 self-start sm:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'account'}
            onClick={() => setActiveTab('account')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
              activeTab === 'account'
                ? 'bg-white text-[#171622] shadow-xs'
                : 'text-[#171622]/70 hover:text-[#171622] hover:bg-white/40'
            }`}
          >
            <Shield className="h-4 w-4 shrink-0 text-[#171622]" aria-hidden="true" />
            <span>Account & Security</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preferences'}
            onClick={() => setActiveTab('preferences')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
              activeTab === 'preferences'
                ? 'bg-white text-[#171622] shadow-xs'
                : 'text-[#171622]/70 hover:text-[#171622] hover:bg-white/40'
            }`}
          >
            <Sliders className="h-4 w-4 shrink-0 text-[#171622]" aria-hidden="true" />
            <span>App Preferences</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          role={feedbackBanner.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs sm:text-sm font-medium ${
            feedbackBanner.type === 'success'
              ? 'border-[#171622]/15 bg-[#C8F27C]/45 text-[#171622]'
              : 'border-[#B42318]/25 bg-[#FEF3F2] text-[#B42318]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            aria-label="Dismiss message"
            className="rounded-lg p-1 hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* TAB 1: Account & Security (UserProfile) */}
      {activeTab === 'account' && (
        <div className="w-full">
          <Suspense
            fallback={
              <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-[#171622]/10 bg-white p-8">
                <div className="flex items-center gap-3 text-sm font-medium text-[#171622]/70">
                  <Loader2 className="h-5 w-5 animate-spin text-[#171622]" aria-hidden="true" />
                  <span>Loading profile...</span>
                </div>
              </div>
            }
          >
              <UserProfile
                routing="hash"
                appearance={{
                  variables: {
                    colorPrimary: '#171622',
                    colorBackground: '#FFFFFF',
                    borderRadius: '0.75rem',
                    fontFamily: 'inherit',
                  },
                  elements: {
                    rootBox: 'w-full',
                    cardBox:
                      'w-full shadow-none border border-[#171622]/10 rounded-2xl bg-white overflow-hidden',
                    card: 'shadow-none border-none p-2 sm:p-6 w-full',
                    navbar: 'border-r border-[#171622]/8',
                    navbarButton:
                      'text-[#171622]/75 hover:text-[#171622] hover:bg-[#171622]/5 rounded-xl text-xs font-semibold py-2.5 px-3 transition-colors',
                    navbarButtonActive:
                      'bg-[#C8F27C] text-[#171622] font-bold shadow-none',
                    headerTitle: 'font-display font-bold text-[#171622] text-xl',
                    headerSubtitle: 'text-[#171622]/65 text-xs',
                    profileSectionTitleText:
                      'font-display font-bold text-[#171622] text-base',
                    badge:
                      'bg-[#C8F27C]/40 text-[#171622] font-semibold border border-[#171622]/10 text-xs',
                    formButtonPrimary:
                      'bg-[#171622] hover:bg-[#171622]/90 text-[#FAF9F6] rounded-xl text-xs font-semibold shadow-none py-2.5 px-4 transition-colors',
                    formButtonReset:
                      'border border-[#171622]/15 text-[#171622] rounded-xl hover:bg-[#FAF9F6] text-xs font-semibold shadow-none transition-colors',
                  },
                }}
              />
            </Suspense>
          </div>
        )}

      {/* TAB 2: App Preferences (LifeCraft DB) */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          {/* 1. Timezone & Week Start */}
          <section
            aria-labelledby="settings-preferences-heading"
            className="lifecraft-theme-surface rounded-2xl border border-[#171622]/10 bg-white p-6 sm:p-7 space-y-5"
          >
            <div className="space-y-1">
              <h2
                id="settings-preferences-heading"
                className="font-display text-base sm:text-lg font-bold text-[#171622]"
              >
                Calendar & Regional Preferences
              </h2>
              <p className="text-xs sm:text-sm text-[#171622]/65">
                Configure your time zone and starting day of the week for scheduling tasks and habits.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Timezone */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="settings-timezone"
                    className="block text-xs font-semibold text-[#171622]"
                  >
                    Timezone
                  </label>
                  {browserTimezone && browserTimezone !== timezone && (
                    <button
                      type="button"
                      disabled={isSavingPreferences}
                      onClick={() => handleTimezoneChange(browserTimezone)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5938B5] hover:text-[#171622] underline underline-offset-2"
                    >
                      <Globe className="h-3 w-3" aria-hidden="true" />
                      <span>Use {browserTimezone}</span>
                    </button>
                  )}
                </div>
                <select
                  id="settings-timezone"
                  value={timezone}
                  disabled={isSavingPreferences}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#171622] focus:bg-white focus:border-[#171622] focus:outline-none transition-colors disabled:opacity-60"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Week-start day */}
              <div className="space-y-1.5">
                <label
                  htmlFor="settings-week-start"
                  className="block text-xs font-semibold text-[#171622]"
                >
                  Week starts on
                </label>
                <select
                  id="settings-week-start"
                  value={weekStartsOn}
                  disabled={isSavingPreferences}
                  onChange={(e) => handleWeekStartChange(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#171622] focus:bg-white focus:border-[#171622] focus:outline-none transition-colors disabled:opacity-60"
                >
                  {WEEK_START_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 2. Session Sign Out */}
          <section
            aria-labelledby="settings-session-heading"
            className="lifecraft-theme-surface rounded-2xl border border-[#171622]/10 bg-white p-6 sm:p-7 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2
                  id="settings-session-heading"
                  className="font-display text-base font-bold text-[#171622]"
                >
                  Browser Session
                </h2>
                <p className="text-xs text-[#171622]/60">
                  End your current LifeCraft session on this browser.
                </p>
              </div>

              <button
                type="button"
                disabled={isSigningOut}
                onClick={onSignOut}
                className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#EBE8F8]/50 transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
              >
                {isSigningOut ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
