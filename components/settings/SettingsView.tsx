'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { UserProfile } from '@clerk/nextjs';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Globe,
  Info,
  Loader2,
  LogOut,
  Mail,
  Send,
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

const REMINDER_PRESET_OPTIONS = [
  { value: 0, label: 'At event start time' },
  { value: 5, label: '5 minutes before' },
  { value: 8, label: '8 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 20, label: '20 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 45, label: '45 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 10080, label: '1 week before' },
];

export default function SettingsView({
  initialTimezone,
  initialTheme,
  initialWeekStartsOn,
  onSignOut,
  isSigningOut,
  onSettingsMutated,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'account' | 'preferences' | 'notifications'>('account');

  // Preferences state hydrated from props and /api/settings
  const [theme, setTheme] = useState<SettingsTheme>(initialTheme);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [weekStartsOn, setWeekStartsOn] = useState<number>(initialWeekStartsOn);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [defaultReminderMinutes, setDefaultReminderMinutes] = useState(15);

  // SMTP status state
  const [smtpStatus, setSmtpStatus] = useState<{
    isConfigured: boolean;
    connectionHealthy: boolean;
    connectionError?: string;
    fromName: string;
    testMode: boolean;
    testRecipientConfigured: boolean;
    testRecipient?: string;
  } | null>(null);
  const [isLoadingSmtpStatus, setIsLoadingSmtpStatus] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailBanner, setTestEmailBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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
    setEmailNotificationsEnabled(data.preferences.emailNotificationsEnabled ?? true);
    setDefaultReminderMinutes(data.preferences.defaultReminderMinutes ?? 15);
    applyThemePreference(data.preferences.theme);
  }, []);

  // Fetch SMTP status
  const fetchSmtpStatus = useCallback(async () => {
    setIsLoadingSmtpStatus(true);
    try {
      const res = await fetch('/api/notifications/status', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSmtpStatus(data);
      }
    } catch {
      // Network error handled gracefully
    } finally {
      setIsLoadingSmtpStatus(false);
    }
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

  useEffect(() => {
    if (activeTab === 'notifications') {
      void fetchSmtpStatus();
    }
  }, [activeTab, fetchSmtpStatus]);

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

  const handleToggleEmailNotifications = async (enabled: boolean) => {
    const prev = emailNotificationsEnabled;
    setEmailNotificationsEnabled(enabled);
    setIsSavingPreferences(true);
    try {
      const ok = await patchSettings(
        { emailNotificationsEnabled: enabled },
        enabled ? 'Email notifications enabled.' : 'Email notifications disabled.'
      );
      if (!ok) {
        setEmailNotificationsEnabled(prev);
      }
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleDefaultReminderMinutesChange = async (mins: number) => {
    const prev = defaultReminderMinutes;
    setDefaultReminderMinutes(mins);
    setIsSavingPreferences(true);
    try {
      const ok = await patchSettings(
        { defaultReminderMinutes: mins },
        `Default reminder set to ${mins} minutes before.`
      );
      if (!ok) {
        setDefaultReminderMinutes(prev);
      }
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true);
    setTestEmailBanner(null);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setTestEmailBanner({
          type: 'success',
          message: data.message || 'Test email dispatched successfully!',
        });
      } else {
        setTestEmailBanner({
          type: 'error',
          message: data.message || 'Failed to send test email. Please check server logs.',
        });
      }
    } catch {
      setTestEmailBanner({
        type: 'error',
        message: 'Network error while requesting test email.',
      });
    } finally {
      setIsSendingTestEmail(false);
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
            Manage your profile, authentication, regional settings, and email notifications.
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

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'notifications'}
            onClick={() => setActiveTab('notifications')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
              activeTab === 'notifications'
                ? 'bg-white text-[#171622] shadow-xs'
                : 'text-[#171622]/70 hover:text-[#171622] hover:bg-white/40'
            }`}
          >
            <Bell className="h-4 w-4 shrink-0 text-[#5938B5]" aria-hidden="true" />
            <span>Notifications</span>
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
          {/* Timezone & Week Start */}
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

          {/* Session Sign Out */}
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

      {/* TAB 3: Notifications & Email Testing */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* SMTP Service Status Banner */}
          <section className="rounded-2xl border border-[#171622]/10 bg-white p-6 sm:p-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display text-base sm:text-lg font-bold text-[#171622] flex items-center gap-2">
                  <Mail className="h-5 w-5 text-[#5938B5]" />
                  <span>Email Notification Delivery Service</span>
                </h2>
                <p className="text-xs sm:text-sm text-[#171622]/65">
                  Automated reminders are delivered using Gmail SMTP with STARTTLS encryption.
                </p>
              </div>

              <div>
                {isLoadingSmtpStatus ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#171622]/60">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Checking SMTP status...</span>
                  </span>
                ) : smtpStatus?.isConfigured && smtpStatus.connectionHealthy ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Gmail SMTP Connected</span>
                  </span>
                ) : smtpStatus?.isConfigured && !smtpStatus.connectionHealthy ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    <span>Authentication Error</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#171622]/5 border border-[#171622]/10 px-3 py-1 text-xs font-medium text-[#171622]/70">
                    <span>Credentials Needed in .env.local</span>
                  </span>
                )}
              </div>
            </div>

            {/* Test Mode Notice Banner */}
            {smtpStatus?.testMode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-bold">
                  <Info className="h-4 w-4 text-amber-700" />
                  <span>Testing Mode Enabled (EMAIL_TEST_MODE=true)</span>
                </div>
                <p className="text-amber-800">
                  All automated calendar reminders are currently restricted from sending to external users and will be redirected exclusively to your testing address: <strong className="font-mono">{smtpStatus.testRecipient || 'Not configured in EMAIL_TEST_RECIPIENT'}</strong>.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="rounded-xl border border-[#171622]/8 bg-[#FAF9F6] p-3 space-y-0.5">
                <span className="text-[#171622]/50 font-medium block">Sender Display Name</span>
                <span className="font-bold text-[#171622]">{smtpStatus?.fromName || 'LifeCraft'}</span>
              </div>
              <div className="rounded-xl border border-[#171622]/8 bg-[#FAF9F6] p-3 space-y-0.5">
                <span className="text-[#171622]/50 font-medium block">SMTP Host / Protocol</span>
                <span className="font-bold text-[#171622]">smtp.gmail.com:587 (STARTTLS)</span>
              </div>
              <div className="rounded-xl border border-[#171622]/8 bg-[#FAF9F6] p-3 space-y-0.5">
                <span className="text-[#171622]/50 font-medium block">Recipient Authentication</span>
                <span className="font-bold text-[#171622]">Clerk Verified Primary Email</span>
              </div>
            </div>
          </section>

          {/* User Notification Preferences Card */}
          <section className="rounded-2xl border border-[#171622]/10 bg-white p-6 sm:p-7 space-y-5">
            <div className="space-y-1">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#171622]">
                Calendar Reminder Preferences
              </h2>
              <p className="text-xs sm:text-sm text-[#171622]/65">
                Customize whether you receive email notifications and your default reminder interval for new events.
              </p>
            </div>

            <div className="space-y-4">
              {/* Toggle Email Notifications */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#171622]/10 bg-[#FAF9F6]">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#171622] block">
                    Enable Calendar Reminder Emails
                  </span>
                  <span className="text-[11px] text-[#171622]/60 block">
                    Receive scheduled alerts for your upcoming meetings, tasks, and calendar events.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotificationsEnabled}
                    disabled={isSavingPreferences}
                    onChange={(e) => handleToggleEmailNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5938B5]"></div>
                </label>
              </div>

              {/* Default Reminder Selector */}
              <div className="space-y-1.5">
                <label htmlFor="settings-default-reminder" className="block text-xs font-semibold text-[#171622]">
                  Default Reminder Interval for New Events
                </label>
                <select
                  id="settings-default-reminder"
                  value={defaultReminderMinutes}
                  disabled={isSavingPreferences}
                  onChange={(e) => handleDefaultReminderMinutesChange(Number(e.target.value))}
                  className="w-full sm:w-80 rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#171622] focus:bg-white focus:border-[#5938B5] focus:outline-none transition-colors"
                >
                  {REMINDER_PRESET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Test Email Delivery Card */}
          <section className="rounded-2xl border border-[#171622]/10 bg-white p-6 sm:p-7 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#171622] flex items-center gap-2">
                <Send className="h-4 w-4 text-[#5938B5]" />
                <span>Test Email Delivery</span>
              </h2>
              <p className="text-xs sm:text-sm text-[#171622]/65">
                Dispatch an immediate test email to verify Gmail SMTP connectivity, template rendering, and Clerk recipient routing.
              </p>
            </div>

            {testEmailBanner && (
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                  testEmailBanner.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                {testEmailBanner.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{testEmailBanner.message}</span>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTestEmail}
                className="inline-flex items-center gap-2 rounded-xl bg-[#5938B5] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-2xs hover:bg-[#4a2e9b] transition-all disabled:opacity-50"
              >
                {isSendingTestEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>{isSendingTestEmail ? 'Sending Test Email...' : 'Send Test Email'}</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
