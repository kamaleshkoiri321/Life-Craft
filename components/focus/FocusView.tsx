'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  Flag,
  Flame,
  Hourglass,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  SkipForward,
  Sliders,
  Sparkles,
  Square,
  Target,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ALARM_SOUND_OPTIONS,
  FOCUS_PRESETS,
  computeCountdownState,
  computeElapsedActiveSeconds,
  computeNextBreakType,
  computeNextStopwatchLap,
  formatCountdownDisplay,
  formatStopwatchDisplay,
  type AlarmSoundId,
  type FocusPresetId,
  type FocusSessionType,
  type FocusWorkspaceViewModel,
  type SerializedFocusSession,
  type StopwatchLapItem,
} from '@/lib/focus/focus-utils';
import {
  playFocusAlarmSound,
  stopActiveAlarm,
  unlockFocusAudio,
} from '@/lib/focus/focus-audio';
import type { FocusWorkspaceResult } from '@/lib/queries/focus';

interface FocusViewProps {
  searchQuery?: string;
  onDataMutated?: () => void;
}

type CountdownPhase = 'focus' | 'short_break' | 'long_break';

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => void | Promise<void>;
}

const SOUND_PREFS_STORAGE_KEY = 'lifecraft_focus_sound_prefs_v1';

interface FocusSoundPreferences {
  soundEnabled: boolean;
  alarmSoundId: AlarmSoundId;
  breakAlarmSoundId: AlarmSoundId;
  playBreakSound: boolean;
  volumePercent: number;
  autoStartNext: boolean;
}

const DEFAULT_SOUND_PREFS: FocusSoundPreferences = {
  soundEnabled: true,
  alarmSoundId: 'bell',
  breakAlarmSoundId: 'chime',
  playBreakSound: true,
  volumePercent: 70,
  autoStartNext: false,
};

function PomodoroTimerIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <Timer className={className} aria-hidden="true" />;
}

export default function FocusView({
  searchQuery = '',
  onDataMutated,
}: FocusViewProps) {
  const [workspace, setWorkspace] = useState<FocusWorkspaceViewModel | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);

  // Selected top mode & preset
  const [selectedPresetId, setSelectedPresetId] =
    useState<FocusPresetId>('pomodoro');
  const [currentPhase, setCurrentPhase] = useState<CountdownPhase>('focus');

  // Custom preset durations (minutes)
  const [customFocusMinutes, setCustomFocusMinutes] = useState<number>(25);
  const [customShortBreakMinutes, setCustomShortBreakMinutes] =
    useState<number>(5);
  const [customLongBreakMinutes, setCustomLongBreakMinutes] =
    useState<number>(20);

  // Selected linked task ID
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Bottom settings sub-tab ('stopwatch' by default so Stopwatch card is immediately visible, or preset tabs)
  const [settingsSubTab, setSettingsSubTab] =
    useState<FocusPresetId>('stopwatch');

  // Sound & Alarm preferences
  const [soundPrefs, setSoundPrefs] = useState<FocusSoundPreferences>(() => {
    if (typeof window === 'undefined') return DEFAULT_SOUND_PREFS;
    try {
      const raw = window.localStorage.getItem(SOUND_PREFS_STORAGE_KEY);
      if (!raw) return DEFAULT_SOUND_PREFS;
      const parsed = JSON.parse(raw) as Partial<FocusSoundPreferences>;
      return {
        soundEnabled:
          typeof parsed.soundEnabled === 'boolean'
            ? parsed.soundEnabled
            : DEFAULT_SOUND_PREFS.soundEnabled,
        alarmSoundId:
          parsed.alarmSoundId &&
          ['bell', 'digital', 'chime', 'soft'].includes(parsed.alarmSoundId)
            ? parsed.alarmSoundId
            : DEFAULT_SOUND_PREFS.alarmSoundId,
        breakAlarmSoundId:
          parsed.breakAlarmSoundId &&
          ['bell', 'digital', 'chime', 'soft'].includes(
            parsed.breakAlarmSoundId
          )
            ? parsed.breakAlarmSoundId
            : DEFAULT_SOUND_PREFS.breakAlarmSoundId,
        playBreakSound:
          typeof parsed.playBreakSound === 'boolean'
            ? parsed.playBreakSound
            : DEFAULT_SOUND_PREFS.playBreakSound,
        volumePercent:
          typeof parsed.volumePercent === 'number'
            ? Math.max(0, Math.min(100, parsed.volumePercent))
            : DEFAULT_SOUND_PREFS.volumePercent,
        autoStartNext:
          typeof parsed.autoStartNext === 'boolean'
            ? parsed.autoStartNext
            : DEFAULT_SOUND_PREFS.autoStartNext,
      };
    } catch {
      return DEFAULT_SOUND_PREFS;
    }
  });
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [audioStatusNotice, setAudioStatusNotice] = useState<string | null>(
    null
  );

  // Completion banner state after a countdown hits 0
  const [completedBanner, setCompletedBanner] = useState<{
    sessionType: CountdownPhase;
    nextPhase: CountdownPhase;
    nextDurationMinutes: number;
  } | null>(null);

  // Confirmation modal state
  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmDialogState | null>(null);

  // Recent sessions "View all" toggle
  const [showAllRecent, setShowAllRecent] = useState(false);

  // Wall-clock tick timestamp (updates every 250ms and on visibilitychange)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const settingsCardRef = useRef<HTMLDivElement | null>(null);
  const completingSessionIdRef = useRef<string | null>(null);
  const playedAlarmSessionIdsRef = useRef<Set<string>>(new Set());
  const hydratedActiveSessionIdRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  }, []);

  const hydrateFromActiveCountdown = useCallback(
    (data: FocusWorkspaceViewModel) => {
      const countdown = data.activeCountdownSession;
      if (!countdown) return;
      if (hydratedActiveSessionIdRef.current === countdown.id) return;
      hydratedActiveSessionIdRef.current = countdown.id;

      if (countdown.presetId !== 'stopwatch') {
        setSelectedPresetId(countdown.presetId);
      }
      if (
        countdown.sessionType === 'focus' ||
        countdown.sessionType === 'short_break' ||
        countdown.sessionType === 'long_break'
      ) {
        setCurrentPhase(countdown.sessionType);
      }
      if (countdown.taskId) {
        setSelectedTaskId(countdown.taskId);
      }
    },
    []
  );

  const updateSoundPrefs = (patch: Partial<FocusSoundPreferences>) => {
    setSoundPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(
          SOUND_PREFS_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Stop any playing sound on unmount
  useEffect(() => {
    return () => {
      stopActiveAlarm();
    };
  }, []);

  // High-accuracy wall-clock ticker + visibilitychange listener
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, []);

  const fetchFocusWorkspace = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setIsLoading(true);
      }
      try {
        const res = await fetch('/api/focus', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const json = (await res.json()) as FocusWorkspaceResult;
        if (res.ok && json.status === 'ok') {
          setWorkspace(json.data);
          hydrateFromActiveCountdown(json.data);
          setErrorMessage(null);
        } else {
          setErrorMessage(
            json.status !== 'ok'
              ? json.message
              : 'Unable to load Focus Studio right now.'
          );
        }
      } catch {
        setErrorMessage('Network error while loading Focus Studio.');
      } finally {
        setIsLoading(false);
      }
    },
    [hydrateFromActiveCountdown]
  );

  // Initial fetch on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/focus', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (res) => {
        if (cancelled) return;
        const json = (await res.json()) as FocusWorkspaceResult;
        if (cancelled) return;
        if (res.ok && json.status === 'ok') {
          setWorkspace(json.data);
          hydrateFromActiveCountdown(json.data);
          setErrorMessage(null);
        } else {
          setErrorMessage(
            json.status !== 'ok'
              ? json.message
              : 'Unable to load Focus Studio right now.'
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Network error while loading Focus Studio.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateFromActiveCountdown]);

  const activeCountdown = workspace?.activeCountdownSession ?? null;
  const activeStopwatch = workspace?.activeStopwatchSession ?? null;

  // Compute planned duration seconds for idle countdown state
  const configuredDurationSeconds = useMemo(() => {
    const presetKey =
      selectedPresetId === 'stopwatch' ? 'pomodoro' : selectedPresetId;
    const preset = FOCUS_PRESETS[presetKey] ?? FOCUS_PRESETS.pomodoro;

    const focusMins =
      presetKey === 'custom' ? customFocusMinutes : preset.focusMinutes;
    const shortMins =
      presetKey === 'custom'
        ? customShortBreakMinutes
        : preset.shortBreakMinutes;
    const longMins =
      presetKey === 'custom' ? customLongBreakMinutes : preset.longBreakMinutes;

    if (currentPhase === 'short_break') return shortMins * 60;
    if (currentPhase === 'long_break') return longMins * 60;
    return focusMins * 60;
  }, [
    currentPhase,
    customFocusMinutes,
    customLongBreakMinutes,
    customShortBreakMinutes,
    selectedPresetId,
  ]);

  // Derive live countdown state from timestamps
  const liveCountdown = useMemo(() => {
    if (!activeCountdown) {
      return {
        elapsedSeconds: 0,
        remainingSeconds: configuredDurationSeconds,
        progressRatio: 0,
        isReachedZero: false,
      };
    }

    return computeCountdownState({
      plannedDurationSeconds: activeCountdown.plannedDurationSeconds,
      status: activeCountdown.status,
      actualDurationSeconds: activeCountdown.actualDurationSeconds,
      lastResumedAt: activeCountdown.lastResumedAt,
      nowMs,
    });
  }, [activeCountdown, configuredDurationSeconds, nowMs]);

  // Derive live stopwatch elapsed seconds from timestamps
  const liveStopwatchElapsedSeconds = useMemo(() => {
    if (!activeStopwatch) return 0;
    return computeElapsedActiveSeconds({
      status: activeStopwatch.status,
      actualDurationSeconds: activeStopwatch.actualDurationSeconds,
      lastResumedAt: activeStopwatch.lastResumedAt,
      nowMs,
    });
  }, [activeStopwatch, nowMs]);

  const triggerSessionAlarm = async (finishedType: CountdownPhase) => {
    const isBreak =
      finishedType === 'short_break' || finishedType === 'long_break';
    if (!soundPrefs.soundEnabled) return;
    if (isBreak && !soundPrefs.playBreakSound) return;

    const chosenSound = isBreak
      ? soundPrefs.breakAlarmSoundId
      : soundPrefs.alarmSoundId;

    setIsAlarmRinging(true);
    const result = await playFocusAlarmSound({
      soundId: chosenSound,
      volumePercent: soundPrefs.volumePercent,
      onFinished: () => {
        setIsAlarmRinging(false);
      },
    });

    if (!result.played && result.message) {
      setIsAlarmRinging(false);
      setAudioStatusNotice(result.message);
    }
  };

  const handleDismissAlarm = () => {
    stopActiveAlarm();
    setIsAlarmRinging(false);
    setIsPreviewPlaying(false);
  };

  // Auto-complete active countdown session exactly once when remainingSeconds reaches 0
  useEffect(() => {
    if (!activeCountdown) return;
    if (activeCountdown.status !== 'running') return;
    if (!liveCountdown.isReachedZero) return;
    if (completingSessionIdRef.current === activeCountdown.id) return;

    completingSessionIdRef.current = activeCountdown.id;
    const finishedSession = activeCountdown;
    const finishedPhase = (
      finishedSession.sessionType === 'short_break' ||
      finishedSession.sessionType === 'long_break'
        ? finishedSession.sessionType
        : 'focus'
    ) as CountdownPhase;

    async function finalizeCompletedCountdown() {
      try {
        const res = await fetch(`/api/focus/sessions/${finishedSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'complete',
            actualDurationSeconds: finishedSession.plannedDurationSeconds,
          }),
        });

        const json = (await res.json()) as {
          status: string;
          workspace?: FocusWorkspaceViewModel;
          message?: string;
        };

        if (res.ok && json.status === 'ok' && json.workspace) {
          setWorkspace(json.workspace);
          onDataMutated?.();

          // Play alarm once per completed session ID
          if (!playedAlarmSessionIdsRef.current.has(finishedSession.id)) {
            playedAlarmSessionIdsRef.current.add(finishedSession.id);
            void triggerSessionAlarm(finishedPhase);
          }

          // Determine recommended next interval
          const presetKey =
            finishedSession.presetId === 'stopwatch'
              ? 'pomodoro'
              : finishedSession.presetId;
          const preset = FOCUS_PRESETS[presetKey] ?? FOCUS_PRESETS.pomodoro;

          if (finishedPhase === 'focus') {
            const newCompletedCount =
              json.workspace.summary.completedFocusSessionsToday;
            const nextBreak = computeNextBreakType(
              newCompletedCount,
              preset.longBreakInterval
            );
            const breakMins =
              nextBreak === 'long_break'
                ? presetKey === 'custom'
                  ? customLongBreakMinutes
                  : preset.longBreakMinutes
                : presetKey === 'custom'
                  ? customShortBreakMinutes
                  : preset.shortBreakMinutes;

            setCurrentPhase(nextBreak);
            setCompletedBanner({
              sessionType: 'focus',
              nextPhase: nextBreak,
              nextDurationMinutes: breakMins,
            });
            showToast(
              nextBreak === 'long_break'
                ? 'Focus session complete! Time for a 20-minute long break.'
                : 'Focus session complete! Ready for a short break.'
            );
          } else {
            const focusMins =
              presetKey === 'custom' ? customFocusMinutes : preset.focusMinutes;
            setCurrentPhase('focus');
            setCompletedBanner({
              sessionType: finishedPhase,
              nextPhase: 'focus',
              nextDurationMinutes: focusMins,
            });
            showToast('Break finished! Ready for your next focus session.');
          }
        }
      } catch {
        showToast('Could not save session completion — please retry.');
      } finally {
        completingSessionIdRef.current = null;
      }
    }

    void finalizeCompletedCountdown();
  });

  // Start a new countdown session (or resume if paused)
  const handleStartOrResumeCountdown = async (
    overridePhase?: CountdownPhase,
    overrideDurationSeconds?: number
  ) => {
    if (isActionBusy) return;
    handleDismissAlarm();
    setCompletedBanner(null);

    const unlockRes = await unlockFocusAudio();
    if (!unlockRes.unlocked && unlockRes.reason) {
      setAudioStatusNotice(unlockRes.reason);
    } else {
      setAudioStatusNotice(null);
    }

    // If an active countdown session is paused and no override phase was requested, resume it
    if (activeCountdown && activeCountdown.status === 'paused' && !overridePhase) {
      setIsActionBusy(true);
      try {
        const res = await fetch(`/api/focus/sessions/${activeCountdown.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'resume',
            taskId: selectedTaskId,
          }),
        });
        const json = (await res.json()) as {
          status: string;
          workspace?: FocusWorkspaceViewModel;
          message?: string;
        };
        if (res.ok && json.status === 'ok' && json.workspace) {
          setWorkspace(json.workspace);
          setNowMs(Date.now());
        } else {
          showToast(json.message || 'Could not resume session.');
        }
      } finally {
        setIsActionBusy(false);
      }
      return;
    }

    const phaseToStart = overridePhase ?? currentPhase;
    const presetForCountdown =
      selectedPresetId === 'stopwatch' ? 'pomodoro' : selectedPresetId;
    const plannedDuration =
      overrideDurationSeconds ?? configuredDurationSeconds;

    setIsActionBusy(true);
    try {
      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionType: phaseToStart,
          presetId: presetForCountdown,
          plannedDurationSeconds: plannedDuration,
          taskId: phaseToStart === 'focus' ? selectedTaskId : null,
        }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
        message?: string;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
        setNowMs(Date.now());
      } else {
        showToast(json.message || 'Could not start focus session.');
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const handlePauseCountdown = async () => {
    if (!activeCountdown || activeCountdown.status !== 'running' || isActionBusy)
      return;
    setIsActionBusy(true);
    try {
      const res = await fetch(`/api/focus/sessions/${activeCountdown.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'pause' }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
        message?: string;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
        setNowMs(Date.now());
      } else {
        showToast(json.message || 'Could not pause timer.');
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const executeInterruptCountdown = async (nextCallback?: () => void) => {
    handleDismissAlarm();
    setCompletedBanner(null);

    if (!activeCountdown) {
      nextCallback?.();
      return;
    }

    setIsActionBusy(true);
    try {
      const res = await fetch(`/api/focus/sessions/${activeCountdown.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'interrupt' }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
        setNowMs(Date.now());
        onDataMutated?.();
      }
      nextCallback?.();
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleResetCountdown = () => {
    if (!activeCountdown) {
      handleDismissAlarm();
      setCompletedBanner(null);
      return;
    }

    if (liveCountdown.elapsedSeconds >= 10) {
      setConfirmDialog({
        title: 'Reset active session?',
        message:
          'Resetting now will mark this in-progress session as interrupted and reset the countdown timer.',
        confirmLabel: 'Reset session',
        isDanger: true,
        onConfirm: async () => {
          setConfirmDialog(null);
          await executeInterruptCountdown();
          showToast('Session reset.');
        },
      });
    } else {
      void executeInterruptCountdown();
    }
  };

  const handleSkipCountdownPhase = () => {
    const nextPhase: CountdownPhase =
      currentPhase === 'focus'
        ? (workspace?.summary.nextRecommendedBreakType ?? 'short_break')
        : 'focus';

    if (activeCountdown && liveCountdown.elapsedSeconds >= 10) {
      setConfirmDialog({
        title: 'Skip current interval?',
        message:
          'Skipping before the timer finishes will mark the current interval as interrupted and switch to the next phase.',
        confirmLabel: 'Skip interval',
        onConfirm: async () => {
          setConfirmDialog(null);
          await executeInterruptCountdown(() => {
            setCurrentPhase(nextPhase);
          });
        },
      });
      return;
    }

    void executeInterruptCountdown(() => {
      setCurrentPhase(nextPhase);
    });
  };

  const handleExtendCountdown5Min = async () => {
    if (activeCountdown) {
      if (isActionBusy) return;
      setIsActionBusy(true);
      try {
        const res = await fetch(`/api/focus/sessions/${activeCountdown.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'extend',
            addSeconds: 300,
          }),
        });
        const json = (await res.json()) as {
          status: string;
          workspace?: FocusWorkspaceViewModel;
        };
        if (res.ok && json.status === 'ok' && json.workspace) {
          setWorkspace(json.workspace);
          showToast('Added 5 minutes to current session.');
        }
      } finally {
        setIsActionBusy(false);
      }
      return;
    }

    // If idle, switch to Custom and add 5 minutes
    const currentMins = Math.round(configuredDurationSeconds / 60);
    if (currentPhase === 'focus') {
      setCustomFocusMinutes(Math.min(180, currentMins + 5));
    } else if (currentPhase === 'short_break') {
      setCustomShortBreakMinutes(Math.min(60, currentMins + 5));
    } else {
      setCustomLongBreakMinutes(Math.min(60, currentMins + 5));
    }
    setSelectedPresetId('custom');
    showToast('Added 5 minutes.');
  };

  // Deliberate preset / mode selection handler (never silently discards active progress)
  const handleSelectPreset = (nextPresetId: FocusPresetId) => {
    if (nextPresetId === selectedPresetId) return;

    if (nextPresetId === 'stopwatch') {
      setSettingsSubTab('stopwatch');
    } else {
      setSettingsSubTab(nextPresetId);
    }

    if (activeCountdown && liveCountdown.elapsedSeconds >= 5 && nextPresetId !== 'stopwatch') {
      setConfirmDialog({
        title: `Switch to ${FOCUS_PRESETS[nextPresetId].label}?`,
        message:
          'You have an active countdown session in progress. Switching presets will mark the current session as interrupted.',
        confirmLabel: `Switch to ${FOCUS_PRESETS[nextPresetId].label}`,
        onConfirm: async () => {
          setConfirmDialog(null);
          await executeInterruptCountdown(() => {
            setSelectedPresetId(nextPresetId);
            setCurrentPhase('focus');
          });
        },
      });
      return;
    }

    if (activeCountdown && nextPresetId !== 'stopwatch') {
      void executeInterruptCountdown(() => {
        setSelectedPresetId(nextPresetId);
        setCurrentPhase('focus');
      });
      return;
    }

    setSelectedPresetId(nextPresetId);
    if (nextPresetId !== 'stopwatch') {
      setCurrentPhase('focus');
    }
  };

  const handleTaskChange = async (newTaskId: string | null) => {
    setSelectedTaskId(newTaskId);
    const targetSession =
      selectedPresetId === 'stopwatch' ? activeStopwatch : activeCountdown;
    if (!targetSession) return;

    const res = await fetch(`/api/focus/sessions/${targetSession.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        action: 'update_meta',
        taskId: newTaskId,
      }),
    });
    const json = (await res.json()) as {
      status: string;
      workspace?: FocusWorkspaceViewModel;
    };
    if (res.ok && json.status === 'ok' && json.workspace) {
      setWorkspace(json.workspace);
    }
  };

  // ---------------- STOPWATCH HANDLERS ----------------

  const handleStartOrResumeStopwatch = async () => {
    if (isActionBusy) return;
    setIsActionBusy(true);
    try {
      if (activeStopwatch && activeStopwatch.status === 'paused') {
        const res = await fetch(`/api/focus/sessions/${activeStopwatch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'resume',
            taskId: selectedTaskId,
          }),
        });
        const json = (await res.json()) as {
          status: string;
          workspace?: FocusWorkspaceViewModel;
        };
        if (res.ok && json.status === 'ok' && json.workspace) {
          setWorkspace(json.workspace);
          setNowMs(Date.now());
        }
        return;
      }

      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionType: 'stopwatch',
          presetId: 'stopwatch',
          plannedDurationSeconds: 0,
          taskId: selectedTaskId,
        }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
        setNowMs(Date.now());
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const handlePauseStopwatch = async () => {
    if (!activeStopwatch || activeStopwatch.status !== 'running' || isActionBusy)
      return;
    setIsActionBusy(true);
    try {
      const res = await fetch(`/api/focus/sessions/${activeStopwatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'pause' }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
        setNowMs(Date.now());
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleRecordStopwatchLap = async () => {
    if (!activeStopwatch || liveStopwatchElapsedSeconds < 1 || isActionBusy)
      return;
    const nextLap: StopwatchLapItem = computeNextStopwatchLap(
      activeStopwatch.laps,
      liveStopwatchElapsedSeconds
    );
    const updatedLaps = [...activeStopwatch.laps, nextLap];

    setIsActionBusy(true);
    try {
      const res = await fetch(`/api/focus/sessions/${activeStopwatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_meta',
          laps: updatedLaps,
        }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleClearStopwatchLaps = () => {
    if (!activeStopwatch || activeStopwatch.laps.length === 0) return;
    setConfirmDialog({
      title: 'Clear lap history?',
      message:
        'This will remove all recorded laps for the current stopwatch session while keeping the elapsed timer running.',
      confirmLabel: 'Clear laps',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/focus/sessions/${activeStopwatch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'update_meta',
            laps: [],
          }),
        });
        const json = (await res.json()) as {
          status: string;
          workspace?: FocusWorkspaceViewModel;
        };
        if (res.ok && json.status === 'ok' && json.workspace) {
          setWorkspace(json.workspace);
          showToast('Lap history cleared.');
        }
      },
    });
  };

  const handleSaveStopwatchSession = async () => {
    if (!activeStopwatch || liveStopwatchElapsedSeconds < 1 || isActionBusy)
      return;
    setIsActionBusy(true);
    try {
      const res = await fetch(`/api/focus/sessions/${activeStopwatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'complete',
          actualDurationSeconds: liveStopwatchElapsedSeconds,
          taskId: selectedTaskId,
          laps: activeStopwatch.laps,
        }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
        onDataMutated?.();
        showToast('Stopwatch session saved to your focus history!');
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleResetStopwatch = () => {
    if (!activeStopwatch) return;
    if (liveStopwatchElapsedSeconds >= 5) {
      setConfirmDialog({
        title: 'Reset stopwatch?',
        message:
          'Do you want to discard the current stopwatch timer without saving it to your completed focus history, or cancel and click Save Session instead?',
        confirmLabel: 'Reset stopwatch',
        isDanger: true,
        onConfirm: async () => {
          setConfirmDialog(null);
          const res = await fetch(`/api/focus/sessions/${activeStopwatch.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'interrupt' }),
          });
          const json = (await res.json()) as {
            status: string;
            workspace?: FocusWorkspaceViewModel;
          };
          if (res.ok && json.status === 'ok' && json.workspace) {
            setWorkspace(json.workspace);
            showToast('Stopwatch reset.');
          }
        },
      });
      return;
    }

    void fetch(`/api/focus/sessions/${activeStopwatch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'interrupt' }),
    }).then(async (res) => {
      const json = (await res.json()) as {
        status: string;
        workspace?: FocusWorkspaceViewModel;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        setWorkspace(json.workspace);
      }
    });
  };

  const handleDeleteHistorySession = async (sessionId: string) => {
    const res = await fetch(`/api/focus/sessions/${sessionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const json = (await res.json()) as {
      status: string;
      workspace?: FocusWorkspaceViewModel;
    };
    if (res.ok && json.status === 'ok' && json.workspace) {
      setWorkspace(json.workspace);
      showToast('Session removed from history.');
      onDataMutated?.();
    }
  };

  const handlePreviewSound = async (soundId: AlarmSoundId) => {
    if (isPreviewPlaying) {
      handleDismissAlarm();
      return;
    }
    setAudioStatusNotice(null);
    setIsPreviewPlaying(true);
    const res = await playFocusAlarmSound({
      soundId,
      volumePercent: Math.max(15, soundPrefs.volumePercent),
      onFinished: () => {
        setIsPreviewPlaying(false);
      },
    });
    if (!res.played && res.message) {
      setIsPreviewPlaying(false);
      setAudioStatusNotice(res.message);
    }
  };

  const filteredRecentSessions = useMemo(() => {
    const list = workspace?.recentSessions ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.sessionType.toLowerCase().includes(q) ||
        (s.taskTitle && s.taskTitle.toLowerCase().includes(q)) ||
        s.presetId.toLowerCase().includes(q)
    );
  }, [searchQuery, workspace]);

  if (isLoading && !workspace) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded-xl bg-[#171622]/8" />
            <div className="h-4 w-64 animate-pulse rounded-lg bg-[#171622]/6" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-xl bg-[#171622]/8" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-[460px] animate-pulse rounded-3xl bg-white border border-[#171622]/8" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="h-72 animate-pulse rounded-3xl bg-white border border-[#171622]/8" />
              <div className="h-72 animate-pulse rounded-3xl bg-white border border-[#171622]/8" />
            </div>
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="h-52 animate-pulse rounded-3xl bg-white border border-[#171622]/8" />
            <div className="h-56 animate-pulse rounded-3xl bg-white border border-[#171622]/8" />
            <div className="h-72 animate-pulse rounded-3xl bg-white border border-[#171622]/8" />
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage && !workspace) {
    return (
      <div className="rounded-3xl border border-[#171622]/12 bg-white p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg font-bold text-[#171622]">
          Unable to Load Focus Studio
        </h2>
        <p className="text-xs sm:text-sm text-[#171622]/70 max-w-md mx-auto">
          {errorMessage}
        </p>
        <button
          type="button"
          onClick={() => void fetchFocusWorkspace(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#171622]/90"
        >
          Retry
        </button>
      </div>
    );
  }

  const summary = workspace?.summary ?? {
    todayLocalDate: '',
    todayFormattedDate: '',
    completedFocusSessionsToday: 0,
    focusedSecondsToday: 0,
    focusedMinutesToday: 0,
    focusedTodayFormatted: '0 min',
    interruptedSessionsToday: 0,
    focusStreakDays: 0,
    weeklyFocusedSeconds: 0,
    weeklyFocusedMinutes: 0,
    weeklyTotalFormatted: '0 min',
    totalCompletedFocusSessions: 0,
    totalInterruptedSessions: 0,
    completedCyclesInSet: 0,
    nextRecommendedBreakType: 'short_break' as const,
  };

  const weeklyDays = workspace?.weeklyDays ?? [];
  const linkableTasks = workspace?.linkableTasks ?? [];
  const displayedRecent = showAllRecent
    ? filteredRecentSessions
    : filteredRecentSessions.slice(0, 5);

  const isTopStopwatch = selectedPresetId === 'stopwatch';
  const effectivePhase = activeCountdown
    ? (activeCountdown.sessionType as CountdownPhase)
    : currentPhase;

  // Progress Ring SVG geometry
  const ringRadius = 116;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgressRatio = isTopStopwatch
    ? (liveStopwatchElapsedSeconds % 60) / 60
    : liveCountdown.progressRatio;
  const ringStrokeDashoffset =
    ringCircumference * (1 - Math.min(1, Math.max(0, ringProgressRatio)));

  const ringStrokeColor = isTopStopwatch
    ? '#5938B5'
    : effectivePhase === 'short_break'
      ? '#5938B5'
      : effectivePhase === 'long_break'
        ? '#D97706'
        : '#52B748';

  const currentCycleIndex = (summary.completedFocusSessionsToday % 4) + 1;
  const maxWeeklyMinutes = Math.max(
    60,
    ...weeklyDays.map((d) => d.focusedMinutes)
  );

  const stopwatchLaps = activeStopwatch?.laps ?? [];
  const reversedStopwatchLaps = [...stopwatchLaps].reverse();

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-2xl border border-[#171622]/12 bg-[#171622] px-4 py-3 text-xs font-semibold text-[#FAF9F6] shadow-xl"
        >
          <CheckCircle2 className="h-4 w-4 text-[#C8F27C]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622]">
            Focus Studio
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#171622]/65">
            One thing at a time. Make it count.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            settingsCardRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }}
          className="inline-flex items-center gap-2 rounded-2xl border border-[#171622]/12 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] shadow-2xs transition-colors hover:bg-[#FAF9F6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <Settings className="h-4 w-4 text-[#171622]/75" />
          <span>Focus Settings</span>
        </button>
      </div>

      {/* Active Ringing Alarm Banner */}
      {isAlarmRinging && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#52B748]/40 bg-[#EAF8E6] px-5 py-3.5 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#52B748] text-white">
              <Bell className="h-4 w-4 animate-bounce" />
            </span>
            <div>
              <p className="text-xs sm:text-sm font-bold text-[#171622]">
                Timer finished!
              </p>
              <p className="text-[11px] text-[#171622]/70">
                Your selected alarm sound is playing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissAlarm}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-white hover:bg-[#171622]/90"
          >
            <VolumeX className="h-3.5 w-3.5" />
            Dismiss Alarm
          </button>
        </div>
      )}

      {/* Main 12-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Primary Focus Studio Card */}
          <section
            aria-label="Focus Timer Studio"
            className="rounded-3xl border border-[#171622]/8 bg-white p-4 sm:p-6 shadow-2xs space-y-6"
          >
            {/* 5 Mode / Preset Selector Pills */}
            <div
              role="tablist"
              aria-label="Focus timer presets and modes"
              className="grid grid-cols-2 gap-2 sm:grid-cols-5 rounded-2xl bg-[#F5F4F8] p-1.5"
            >
              {(
                [
                  {
                    id: 'pomodoro',
                    label: 'Pomodoro',
                    sub: '25 min / 5 min',
                  },
                  {
                    id: 'deep_focus',
                    label: 'Deep Focus',
                    sub: '50 min / 10 min',
                  },
                  {
                    id: 'extended_focus',
                    label: 'Extended Focus',
                    sub: '90 min / 20 min',
                  },
                  {
                    id: 'custom',
                    label: 'Custom',
                    sub: `${customFocusMinutes}m / ${customShortBreakMinutes}m`,
                  },
                  {
                    id: 'stopwatch',
                    label: 'Stopwatch',
                    sub: 'Manual timer',
                  },
                ] as { id: FocusPresetId; label: string; sub: string }[]
              ).map((tab) => {
                const isSelected = selectedPresetId === tab.id;
                const isStopwatchTab = tab.id === 'stopwatch';
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => handleSelectPreset(tab.id)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                      isSelected
                        ? isStopwatchTab
                          ? 'border border-[#5938B5]/40 bg-[#F3F0FC] text-[#171622] shadow-2xs'
                          : 'border border-[#52B748]/35 bg-[#E7F6DF] text-[#171622] shadow-2xs'
                        : isStopwatchTab
                          ? 'border border-[#5938B5]/20 bg-white/80 text-[#171622]/80 hover:bg-white'
                          : 'border border-transparent text-[#171622]/75 hover:bg-white/70'
                    }`}
                  >
                    <span className="shrink-0">
                      {tab.id === 'pomodoro' ? (
                        <PomodoroTimerIcon className="h-5 w-5 text-[#EF5350]" />
                      ) : tab.id === 'deep_focus' ? (
                        <Target className="h-4 w-4 text-[#5938B5]" />
                      ) : tab.id === 'extended_focus' ? (
                        <Hourglass className="h-4 w-4 text-[#2563EB]" />
                      ) : tab.id === 'custom' ? (
                        <Sliders className="h-4 w-4 text-[#5938B5]" />
                      ) : (
                        <Timer className="h-4 w-4 text-[#5938B5]" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#171622]">
                        {tab.label}
                      </p>
                      <p className="truncate text-[10px] text-[#171622]/55">
                        {tab.sub}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Completed Interval Offer Banner (Short Break / Long Break / Next Focus) */}
            {completedBanner && !activeCountdown && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#52B748]/30 bg-[#EFFAE6] px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-[#2D7A25]" />
                  <p className="text-xs font-semibold text-[#171622]">
                    {completedBanner.sessionType === 'focus'
                      ? completedBanner.nextPhase === 'long_break'
                        ? '4 focus sessions completed! Ready for your 20-minute long break?'
                        : `Focus session recorded! Take a ${completedBanner.nextDurationMinutes}-minute short break?`
                      : 'Break complete! Ready to start your next focus session?'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void handleStartOrResumeCountdown(
                        completedBanner.nextPhase,
                        completedBanner.nextDurationMinutes * 60
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#52B748] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#46a33d]"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>
                      Start{' '}
                      {completedBanner.nextPhase === 'long_break'
                        ? 'Long Break'
                        : completedBanner.nextPhase === 'short_break'
                          ? 'Short Break'
                          : 'Focus'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletedBanner(null)}
                    aria-label="Dismiss break offer"
                    className="rounded-lg p-1 text-[#171622]/50 hover:text-[#171622]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Center Stage: Botanical Ring Left + Current Session Metadata Card Right */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12 items-center rounded-3xl bg-gradient-to-br from-[#F4F8EC] via-[#F9FAF4] to-[#F3F5EC] p-5 sm:p-7 border border-[#171622]/6 relative overflow-hidden">
              {/* Decorative Botanical SVG Illustration */}
              <svg
                aria-hidden="true"
                viewBox="0 0 600 360"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
                preserveAspectRatio="none"
              >
                <circle cx="430" cy="65" r="34" fill="#FBE8C2" opacity="0.85" />
                <path
                  d="M0 290 Q150 245 310 285 T600 265 L600 360 L0 360 Z"
                  fill="#E4F0D3"
                  opacity="0.7"
                />
                <path
                  d="M0 320 Q200 280 420 315 T600 300 L600 360 L0 360 Z"
                  fill="#D4E8BD"
                  opacity="0.65"
                />
                {/* Soft left botanical leaves */}
                <g fill="#7BB662" opacity="0.45">
                  <ellipse
                    cx="42"
                    cy="165"
                    rx="14"
                    ry="32"
                    transform="rotate(-28 42 165)"
                  />
                  <ellipse
                    cx="68"
                    cy="145"
                    rx="12"
                    ry="28"
                    transform="rotate(18 68 145)"
                  />
                  <ellipse
                    cx="35"
                    cy="225"
                    rx="13"
                    ry="26"
                    transform="rotate(-35 35 225)"
                  />
                  <ellipse
                    cx="78"
                    cy="240"
                    rx="15"
                    ry="30"
                    transform="rotate(24 78 240)"
                  />
                </g>
              </svg>

              {/* Left 7 Cols: Circular Progress Ring */}
              <div className="relative z-10 md:col-span-7 flex flex-col items-center justify-center">
                <div className="relative flex h-[268px] w-[268px] sm:h-[288px] sm:w-[288px] items-center justify-center rounded-full bg-white/90 shadow-lg border border-[#171622]/6">
                  <svg
                    className="h-full w-full -rotate-90 transform p-2"
                    viewBox="0 0 260 260"
                    aria-hidden="true"
                  >
                    {/* Background Track */}
                    <circle
                      cx="130"
                      cy="130"
                      r={ringRadius}
                      fill="none"
                      stroke="#E9E8EE"
                      strokeWidth="12"
                    />
                    {/* Animated Progress Ring */}
                    <circle
                      cx="130"
                      cy="130"
                      r={ringRadius}
                      fill="none"
                      stroke={ringStrokeColor}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringStrokeDashoffset}
                      className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
                    />
                  </svg>

                  {/* Inner Countdown / Stopwatch Readout */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                    <div className="mb-1.5 flex items-center justify-center">
                      {isTopStopwatch ? (
                        <Timer className="h-7 w-7 text-[#5938B5]" />
                      ) : effectivePhase === 'short_break' ? (
                        <Coffee className="h-7 w-7 text-[#5938B5]" />
                      ) : effectivePhase === 'long_break' ? (
                        <Sparkles className="h-7 w-7 text-[#D97706]" />
                      ) : (
                        <PomodoroTimerIcon className="h-8 w-8 text-[#EF5350]" />
                      )}
                    </div>

                    <p className="text-xs font-semibold text-[#171622]/70">
                      {isTopStopwatch
                        ? 'Stopwatch'
                        : effectivePhase === 'short_break'
                          ? 'Short Break'
                          : effectivePhase === 'long_break'
                            ? 'Long Break'
                            : 'Focus Time'}
                    </p>

                    <div
                      role="timer"
                      aria-live="off"
                      aria-label={
                        isTopStopwatch
                          ? `Stopwatch elapsed time ${formatStopwatchDisplay(
                              liveStopwatchElapsedSeconds
                            )}`
                          : `Remaining time ${formatCountdownDisplay(
                              liveCountdown.remainingSeconds
                            )}`
                      }
                      className="my-1 font-display text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight text-[#171622]"
                    >
                      {isTopStopwatch
                        ? formatStopwatchDisplay(liveStopwatchElapsedSeconds)
                        : formatCountdownDisplay(liveCountdown.remainingSeconds)}
                    </div>

                    <span className="mt-1 inline-flex items-center rounded-full bg-[#F2F1F6] px-3 py-1 text-[11px] font-semibold text-[#171622]/75">
                      {isTopStopwatch
                        ? `Stopwatch • ${stopwatchLaps.length} laps`
                        : `${
                            FOCUS_PRESETS[selectedPresetId]?.label ??
                            FOCUS_PRESETS.pomodoro.label
                          } • ${
                            effectivePhase === 'focus'
                              ? `Focus Session ${currentCycleIndex}/4`
                              : effectivePhase === 'short_break'
                                ? 'Short Break'
                                : 'Long Break (20m)'
                          }`}
                    </span>

                    <span
                      className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${
                        (isTopStopwatch ? activeStopwatch?.status : activeCountdown?.status) ===
                        'running'
                          ? 'bg-[#DCF5D3] text-[#24661D]'
                          : (isTopStopwatch
                                ? activeStopwatch?.status
                                : activeCountdown?.status) === 'paused'
                            ? 'bg-[#FEF3C7] text-[#92400E]'
                            : 'bg-[#E6F7DC] text-[#2B6E23]'
                      }`}
                    >
                      {(isTopStopwatch
                        ? activeStopwatch?.status
                        : activeCountdown?.status) === 'running'
                        ? isTopStopwatch
                          ? 'Counting up...'
                          : effectivePhase === 'focus'
                            ? 'Focusing...'
                            : 'On break...'
                        : (isTopStopwatch
                              ? activeStopwatch?.status
                              : activeCountdown?.status) === 'paused'
                          ? 'Paused'
                          : 'Ready to focus?'}
                    </span>

                    {/* 4-dot session cycle indicator */}
                    <div
                      aria-label={`${summary.completedCyclesInSet} of 4 focus sessions completed in current cycle`}
                      className="mt-2.5 flex items-center gap-1.5"
                    >
                      {[0, 1, 2, 3].map((dotIdx) => {
                        const completed = dotIdx < summary.completedCyclesInSet;
                        return (
                          <span
                            key={dotIdx}
                            className={`h-2 w-2 rounded-full transition-colors ${
                              completed
                                ? 'bg-[#52B748]'
                                : 'bg-[#171622]/15'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Current Session Details & Linked Task Card */}
              <div className="relative z-10 md:col-span-5 rounded-2xl border border-[#171622]/8 bg-white/95 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-bold text-[#171622]">
                    Current Session
                  </h2>

                  {/* Phase Switcher Pills (Focus / Short Break / Long Break) when in countdown mode */}
                  {!isTopStopwatch && !activeCountdown && (
                    <div className="inline-flex items-center rounded-lg bg-[#FAF9F6] p-0.5 border border-[#171622]/8">
                      {(
                        [
                          { id: 'focus', label: 'Focus' },
                          { id: 'short_break', label: 'Short' },
                          { id: 'long_break', label: 'Long' },
                        ] as { id: CountdownPhase; label: string }[]
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setCurrentPhase(p.id)}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                            currentPhase === p.id
                              ? 'bg-[#171622] text-white'
                              : 'text-[#171622]/60 hover:text-[#171622]'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 text-xs">
                  {/* Type Row */}
                  <div className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#171622]/55" />
                    <div>
                      <p className="font-semibold text-[#171622]">Type</p>
                      <p className="text-[#171622]/65">
                        {isTopStopwatch
                          ? 'Stopwatch (Manual Timer)'
                          : effectivePhase === 'short_break'
                            ? 'Short Break'
                            : effectivePhase === 'long_break'
                              ? 'Long Break'
                              : 'Focus Work'}
                      </p>
                    </div>
                  </div>

                  {/* Duration Row (or Custom Duration Inputs) */}
                  <div className="flex items-start gap-2.5">
                    <Timer className="mt-0.5 h-4 w-4 shrink-0 text-[#171622]/55" />
                    <div className="flex-1">
                      <p className="font-semibold text-[#171622]">Duration</p>
                      {isTopStopwatch ? (
                        <p className="text-[#171622]/65">
                          Counts upward from 00:00:00
                        </p>
                      ) : selectedPresetId === 'custom' && !activeCountdown ? (
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                          <label className="block">
                            <span className="text-[10px] text-[#171622]/55">
                              Focus (m)
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={180}
                              value={customFocusMinutes}
                              onChange={(e) =>
                                setCustomFocusMinutes(
                                  Math.max(
                                    1,
                                    Math.min(180, Number(e.target.value) || 25)
                                  )
                                )
                              }
                              className="mt-0.5 w-full rounded-lg border border-[#171622]/15 bg-[#FAF9F6] px-2 py-1 text-xs font-semibold text-[#171622]"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-[#171622]/55">
                              Short (m)
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={customShortBreakMinutes}
                              onChange={(e) =>
                                setCustomShortBreakMinutes(
                                  Math.max(
                                    1,
                                    Math.min(60, Number(e.target.value) || 5)
                                  )
                                )
                              }
                              className="mt-0.5 w-full rounded-lg border border-[#171622]/15 bg-[#FAF9F6] px-2 py-1 text-xs font-semibold text-[#171622]"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-[#171622]/55">
                              Long (m)
                            </span>
                            <input
                              type="number"
                              min={5}
                              max={60}
                              value={customLongBreakMinutes}
                              onChange={(e) =>
                                setCustomLongBreakMinutes(
                                  Math.max(
                                    5,
                                    Math.min(60, Number(e.target.value) || 20)
                                  )
                                )
                              }
                              className="mt-0.5 w-full rounded-lg border border-[#171622]/15 bg-[#FAF9F6] px-2 py-1 text-xs font-semibold text-[#171622]"
                            />
                          </label>
                        </div>
                      ) : (
                        <p className="text-[#171622]/65">
                          {Math.round(
                            (activeCountdown
                              ? activeCountdown.plannedDurationSeconds
                              : configuredDurationSeconds) / 60
                          )}{' '}
                          minutes
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Session Cycle Row */}
                  <div className="flex items-start gap-2.5">
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#171622]/55" />
                    <div>
                      <p className="font-semibold text-[#171622]">Session</p>
                      <p className="text-[#171622]/65">
                        {currentCycleIndex} of 4 (until long break)
                      </p>
                    </div>
                  </div>

                  {/* Linked Task Selector */}
                  <div className="pt-1 space-y-1.5 border-t border-[#171622]/8">
                    <label
                      htmlFor="focus-linked-task-select"
                      className="flex items-center gap-1.5 font-semibold text-[#171622]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#171622]/70" />
                      <span>Linked Task</span>
                    </label>
                    <div className="relative flex items-center gap-1.5">
                      <select
                        id="focus-linked-task-select"
                        value={selectedTaskId ?? ''}
                        onChange={(e) =>
                          void handleTaskChange(e.target.value || null)
                        }
                        className="w-full rounded-xl border border-[#171622]/12 bg-[#FAF9F6] px-3 py-2 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
                      >
                        <option value="">No task linked (General Focus)</option>
                        {linkableTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                      {selectedTaskId && (
                        <button
                          type="button"
                          onClick={() => void handleTaskChange(null)}
                          aria-label="Unlink task"
                          title="Unlink task"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#171622]/10 bg-[#FAF9F6] text-[#171622]/55 hover:bg-white hover:text-[#171622]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-[#171622]/50">
                      Optional: Link a task to track your focus time
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Timer Action Buttons Row */}
            {isTopStopwatch ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                {activeStopwatch?.status === 'running' ? (
                  <button
                    type="button"
                    onClick={() => void handlePauseStopwatch()}
                    disabled={isActionBusy}
                    className="inline-flex min-w-[130px] items-center justify-center gap-2 rounded-full border border-[#171622]/15 bg-white px-6 py-3 text-xs sm:text-sm font-bold text-[#171622] shadow-xs hover:bg-[#FAF9F6] disabled:opacity-50"
                  >
                    <Pause className="h-4 w-4" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleStartOrResumeStopwatch()}
                    disabled={isActionBusy}
                    className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-full bg-[#52B748] px-7 py-3 text-xs sm:text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#46a33d] disabled:opacity-50"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>
                      {activeStopwatch?.status === 'paused'
                        ? 'Resume'
                        : 'Start'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleRecordStopwatchLap()}
                  disabled={!activeStopwatch || liveStopwatchElapsedSeconds < 1}
                  className="inline-flex min-w-[110px] items-center justify-center gap-2 rounded-full border border-[#171622]/12 bg-white px-5 py-3 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#FAF9F6] disabled:opacity-40"
                >
                  <Flag className="h-4 w-4" />
                  <span>Lap</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetStopwatch}
                  disabled={!activeStopwatch}
                  className="inline-flex min-w-[110px] items-center justify-center gap-2 rounded-full border border-[#171622]/12 bg-white px-5 py-3 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#FAF9F6] disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleSaveStopwatchSession()}
                  disabled={!activeStopwatch || liveStopwatchElapsedSeconds < 1}
                  className="inline-flex min-w-[130px] items-center justify-center gap-2 rounded-full bg-[#171622] px-5 py-3 text-xs sm:text-sm font-semibold text-white hover:bg-[#171622]/90 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                  <span>Save Session</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleStartOrResumeCountdown()}
                  disabled={
                    isActionBusy || activeCountdown?.status === 'running'
                  }
                  className="inline-flex min-w-[135px] items-center justify-center gap-2 rounded-full bg-[#52B748] px-7 py-3 text-xs sm:text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#46a33d] disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>
                    {activeCountdown?.status === 'paused' ? 'Resume' : 'Start'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handlePauseCountdown()}
                  disabled={
                    isActionBusy || activeCountdown?.status !== 'running'
                  }
                  className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-full border border-[#171622]/12 bg-white px-6 py-3 text-xs sm:text-sm font-semibold text-[#171622] shadow-2xs transition-colors hover:bg-[#FAF9F6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                >
                  <Pause className="h-4 w-4" />
                  <span>Pause</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetCountdown}
                  disabled={isActionBusy || !activeCountdown}
                  className="inline-flex min-w-[115px] items-center justify-center gap-2 rounded-full border border-[#171622]/12 bg-white px-5 py-3 text-xs sm:text-sm font-semibold text-[#171622] shadow-2xs transition-colors hover:bg-[#FAF9F6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={handleSkipCountdownPhase}
                  disabled={isActionBusy}
                  className="inline-flex min-w-[115px] items-center justify-center gap-2 rounded-full border border-[#171622]/12 bg-white px-5 py-3 text-xs sm:text-sm font-semibold text-[#171622] shadow-2xs transition-colors hover:bg-[#FAF9F6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                >
                  <SkipForward className="h-4 w-4" />
                  <span>Skip</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleExtendCountdown5Min()}
                  disabled={isActionBusy}
                  className="inline-flex min-w-[115px] items-center justify-center gap-1.5 rounded-full border border-[#171622]/12 bg-white px-5 py-3 text-xs sm:text-sm font-semibold text-[#171622] shadow-2xs transition-colors hover:bg-[#FAF9F6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
                >
                  <Plus className="h-4 w-4" />
                  <span>5 min</span>
                </button>
              </div>
            )}
          </section>

          {/* Bottom 2-Column Sub-Grid: Timer Settings & Stopwatch Mode + Sound & Notifications */}
          <div
            ref={settingsCardRef}
            className="grid grid-cols-1 gap-6 md:grid-cols-12"
          >
            {/* Left Sub-Card (7 Cols): Timer Settings & Stopwatch Mode */}
            <section
              aria-labelledby="timer-settings-heading"
              className="md:col-span-7 rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#171622]" />
                <h2
                  id="timer-settings-heading"
                  className="font-display text-sm font-bold text-[#171622]"
                >
                  Timer Settings
                </h2>
              </div>

              {/* Sub-navigation pills */}
              <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-[#F4F3F8] p-1">
                {(
                  [
                    { id: 'pomodoro', label: 'Pomodoro' },
                    { id: 'deep_focus', label: 'Deep Focus' },
                    { id: 'extended_focus', label: 'Extended Focus' },
                    { id: 'custom', label: 'Custom' },
                    { id: 'stopwatch', label: 'Stopwatch' },
                  ] as { id: FocusPresetId; label: string }[]
                ).map((t) => {
                  const active = settingsSubTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSettingsSubTab(t.id)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-[#E5DDFB] text-[#4C2FA6] font-bold shadow-2xs'
                          : 'text-[#171622]/65 hover:text-[#171622]'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {settingsSubTab === 'stopwatch' ? (
                /* Dedicated Stopwatch Mode Card */
                <div className="rounded-2xl border border-[#5938B5]/15 bg-[#F6F4FD] p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8E2FA] text-[#5938B5]">
                        <Timer className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-[#171622]">
                          Stopwatch Mode
                        </h3>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[#171622]/60">
                          Track time manually for any activity. Useful for
                          meetings, study, or custom work sessions.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 items-center">
                    {/* Stopwatch Readout & Controls */}
                    <div className="sm:col-span-6 space-y-3 text-center sm:text-left">
                      <div
                        role="timer"
                        aria-label={`Stopwatch ${formatStopwatchDisplay(
                          liveStopwatchElapsedSeconds
                        )}`}
                        className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight text-[#171622]"
                      >
                        {formatStopwatchDisplay(liveStopwatchElapsedSeconds)}
                      </div>

                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        {activeStopwatch?.status === 'running' ? (
                          <button
                            type="button"
                            onClick={() => void handlePauseStopwatch()}
                            disabled={isActionBusy}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#171622] px-4 py-2 text-xs font-bold text-white hover:bg-[#171622]/90"
                          >
                            <Pause className="h-3.5 w-3.5" />
                            <span>Pause</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleStartOrResumeStopwatch()}
                            disabled={isActionBusy}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#52B748] px-4 py-2 text-xs font-bold text-white hover:bg-[#46a33d]"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>
                              {activeStopwatch?.status === 'paused'
                                ? 'Resume'
                                : 'Start'}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleRecordStopwatchLap()}
                          disabled={
                            !activeStopwatch || liveStopwatchElapsedSeconds < 1
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#171622]/12 bg-white px-3.5 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6] disabled:opacity-40"
                        >
                          <Flag className="h-3.5 w-3.5" />
                          <span>Lap</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleResetStopwatch}
                          disabled={!activeStopwatch}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#171622]/12 bg-white px-3.5 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6] disabled:opacity-40"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reset</span>
                        </button>
                      </div>

                      {activeStopwatch && liveStopwatchElapsedSeconds >= 1 && (
                        <button
                          type="button"
                          onClick={() => void handleSaveStopwatchSession()}
                          disabled={isActionBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#5938B5] px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#4a2d9c]"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Save to Focus History</span>
                        </button>
                      )}
                    </div>

                    {/* Lap Times Panel */}
                    <div className="sm:col-span-6 rounded-2xl border border-[#171622]/8 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#171622]">
                          Lap Times
                        </span>
                        {stopwatchLaps.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearStopwatchLaps}
                            className="text-[11px] font-semibold text-[#5938B5] hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {reversedStopwatchLaps.length === 0 ? (
                        <p className="py-5 text-center text-[11px] text-[#171622]/45">
                          Start the stopwatch and click Lap to record split and
                          cumulative times.
                        </p>
                      ) : (
                        <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                          {reversedStopwatchLaps.map((lap) => (
                            <div
                              key={lap.lapNumber}
                              className="flex items-center justify-between text-[11px] tabular-nums text-[#171622]/80"
                            >
                              <span className="font-semibold text-[#171622]">
                                Lap {lap.lapNumber}
                              </span>
                              <span>
                                {formatStopwatchDisplay(lap.splitSeconds)}
                              </span>
                              <span className="text-[#171622]/55">
                                {formatStopwatchDisplay(lap.totalSeconds)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Preset Configuration Inspector */
                <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-[#171622]">
                        {FOCUS_PRESETS[settingsSubTab].label} Preset
                      </h3>
                      <p className="text-[11px] text-[#171622]/60">
                        {settingsSubTab === 'custom'
                          ? 'Customize your focus and break durations below.'
                          : 'Standard focus and break intervals for this preset.'}
                      </p>
                    </div>
                    {selectedPresetId !== settingsSubTab && (
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(settingsSubTab)}
                        className="rounded-xl bg-[#171622] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#171622]/90"
                      >
                        Use Preset
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[#171622]/8 bg-white p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#171622]/50">
                        Focus
                      </span>
                      {settingsSubTab === 'custom' ? (
                        <input
                          type="number"
                          min={1}
                          max={180}
                          value={customFocusMinutes}
                          onChange={(e) =>
                            setCustomFocusMinutes(
                              Math.max(
                                1,
                                Math.min(180, Number(e.target.value) || 25)
                              )
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-[#171622]/15 px-2 py-1 text-sm font-bold text-[#171622]"
                        />
                      ) : (
                        <p className="mt-1 font-display text-lg font-bold text-[#171622]">
                          {FOCUS_PRESETS[settingsSubTab].focusMinutes} min
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#171622]/8 bg-white p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#171622]/50">
                        Short Break
                      </span>
                      {settingsSubTab === 'custom' ? (
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={customShortBreakMinutes}
                          onChange={(e) =>
                            setCustomShortBreakMinutes(
                              Math.max(
                                1,
                                Math.min(60, Number(e.target.value) || 5)
                              )
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-[#171622]/15 px-2 py-1 text-sm font-bold text-[#171622]"
                        />
                      ) : (
                        <p className="mt-1 font-display text-lg font-bold text-[#171622]">
                          {FOCUS_PRESETS[settingsSubTab].shortBreakMinutes} min
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#171622]/8 bg-white p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#171622]/50">
                        Long Break
                      </span>
                      {settingsSubTab === 'custom' ? (
                        <input
                          type="number"
                          min={5}
                          max={60}
                          value={customLongBreakMinutes}
                          onChange={(e) =>
                            setCustomLongBreakMinutes(
                              Math.max(
                                5,
                                Math.min(60, Number(e.target.value) || 20)
                              )
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-[#171622]/15 px-2 py-1 text-sm font-bold text-[#171622]"
                        />
                      ) : (
                        <p className="mt-1 font-display text-lg font-bold text-[#171622]">
                          {FOCUS_PRESETS[settingsSubTab].longBreakMinutes} min
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Right Sub-Card (5 Cols): Sound & Alarm Controls */}
            <section
              aria-labelledby="sound-alarm-heading"
              className="md:col-span-5 rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-[#171622]" />
                  <h2
                    id="sound-alarm-heading"
                    className="font-display text-sm font-bold text-[#171622]"
                  >
                    Sound &amp; Alarms
                  </h2>
                </div>
                {(isAlarmRinging || isPreviewPlaying) && (
                  <button
                    type="button"
                    onClick={handleDismissAlarm}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-100"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    Stop sound
                  </button>
                )}
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Toggle: Play sound when session ends */}
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-[#171622]/85">
                    Play sound when session ends
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundPrefs.soundEnabled}
                    aria-label="Play sound when session ends"
                    onClick={() =>
                      updateSoundPrefs({
                        soundEnabled: !soundPrefs.soundEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      soundPrefs.soundEnabled
                        ? 'bg-[#52B748]'
                        : 'bg-[#171622]/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                        soundPrefs.soundEnabled
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Focus Alarm Sound Selector + Play Preview */}
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Focus alarm sound"
                    value={soundPrefs.alarmSoundId}
                    onChange={(e) =>
                      updateSoundPrefs({
                        alarmSoundId: e.target.value as AlarmSoundId,
                      })
                    }
                    className="flex-1 rounded-xl border border-[#171622]/12 bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
                  >
                    {ALARM_SOUND_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      void handlePreviewSound(soundPrefs.alarmSoundId)
                    }
                    aria-label="Play alarm sound preview"
                    title="Play Preview"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#171622]/12 bg-[#FAF9F6] text-[#171622] hover:bg-white"
                  >
                    {isPreviewPlaying ? (
                      <Square className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                  </button>
                </div>

                {/* Volume Control (0 - 100%) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSoundPrefs({
                          volumePercent:
                            soundPrefs.volumePercent === 0 ? 70 : 0,
                        })
                      }
                      className="inline-flex items-center gap-1.5 font-medium text-[#171622]/80 hover:text-[#171622]"
                    >
                      {soundPrefs.volumePercent === 0 ? (
                        <VolumeX className="h-3.5 w-3.5 text-[#171622]/50" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 text-[#171622]/70" />
                      )}
                      <span>Volume</span>
                    </button>
                    <span className="tabular-nums font-semibold text-[#171622]/75">
                      {soundPrefs.volumePercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={soundPrefs.volumePercent}
                    aria-label="Alarm volume percentage"
                    onChange={(e) =>
                      updateSoundPrefs({
                        volumePercent: Number(e.target.value),
                      })
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#E4F2DD] accent-[#52B748]"
                  />
                </div>

                {/* Break Alarm Type Selector + Preview */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-medium text-[#171622]/80">
                    Break alarm
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="Break alarm sound"
                      value={soundPrefs.breakAlarmSoundId}
                      onChange={(e) =>
                        updateSoundPrefs({
                          breakAlarmSoundId: e.target.value as AlarmSoundId,
                        })
                      }
                      className="rounded-xl border border-[#171622]/12 bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#171622] focus:outline-none"
                    >
                      {ALARM_SOUND_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label.replace(' (Default)', '')}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        void handlePreviewSound(soundPrefs.breakAlarmSoundId)
                      }
                      aria-label="Preview break alarm sound"
                      title="Preview break alarm"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#171622]/12 bg-[#FAF9F6] text-[#171622] hover:bg-white"
                    >
                      <Play className="h-3 w-3 fill-current" />
                    </button>
                  </div>
                </div>

                {/* Toggle: Play sound for breaks */}
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-[#171622]/85">
                    Play sound for breaks
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundPrefs.playBreakSound}
                    aria-label="Play sound for breaks"
                    onClick={() =>
                      updateSoundPrefs({
                        playBreakSound: !soundPrefs.playBreakSound,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      soundPrefs.playBreakSound
                        ? 'bg-[#52B748]'
                        : 'bg-[#171622]/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                        soundPrefs.playBreakSound
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle: Auto start next session */}
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-[#171622]/85">
                    Auto start next session
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundPrefs.autoStartNext}
                    aria-label="Auto start next session"
                    onClick={() =>
                      updateSoundPrefs({
                        autoStartNext: !soundPrefs.autoStartNext,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      soundPrefs.autoStartNext
                        ? 'bg-[#52B748]'
                        : 'bg-[#171622]/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                        soundPrefs.autoStartNext
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {audioStatusNotice && (
                  <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-[11px] font-medium text-[#92400E]">
                    {audioStatusNotice}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* RIGHT COLUMN (4 Cols): Today's Focus, This Week, Recent Sessions */}
        <aside className="lg:col-span-4 space-y-6">
          {/* Card 1: Today's Focus */}
          <section
            aria-labelledby="todays-focus-heading"
            className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[#171622]" />
                <h2
                  id="todays-focus-heading"
                  className="font-display text-sm font-bold text-[#171622]"
                >
                  Today&apos;s Focus
                </h2>
              </div>
              <span className="text-xs font-medium text-[#171622]/55">
                {summary.todayFormattedDate}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {/* Tile 1: Completed sessions */}
              <div className="rounded-2xl bg-[#EEF8E8] p-3 text-center space-y-1">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#DCF1D0] text-[#2D7A25]">
                  <Target className="h-4 w-4" />
                </div>
                <p className="font-display text-xl font-extrabold text-[#171622]">
                  {summary.completedFocusSessionsToday}
                </p>
                <p className="text-[10px] leading-tight font-medium text-[#171622]/65">
                  Completed sessions
                </p>
              </div>

              {/* Tile 2: Focused today */}
              <div className="rounded-2xl bg-[#F2EFFC] p-3 text-center space-y-1">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#E3DCF8] text-[#5938B5]">
                  <Clock className="h-4 w-4" />
                </div>
                <p className="font-display text-xl font-extrabold text-[#171622]">
                  {summary.focusedTodayFormatted}
                </p>
                <p className="text-[10px] leading-tight font-medium text-[#171622]/65">
                  Focused today
                </p>
              </div>

              {/* Tile 3: Day streak */}
              <div className="rounded-2xl bg-[#FDF2EB] p-3 text-center space-y-1">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#FBE2D0] text-[#D95D1E]">
                  <Flame className="h-4 w-4" />
                </div>
                <p className="font-display text-xl font-extrabold text-[#171622]">
                  {summary.focusStreakDays}
                </p>
                <p className="text-[10px] leading-tight font-medium text-[#171622]/65">
                  Day streak
                </p>
              </div>
            </div>

            {/* Progress bar toward 4 daily focus sessions */}
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#171622]/8">
                <div
                  className="h-full rounded-full bg-[#52B748] transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (summary.completedFocusSessionsToday / 4) * 100
                      )
                    )}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-[#EEF8E8] px-3 py-2 text-xs font-semibold text-[#24661D]">
                <span>
                  {summary.completedFocusSessionsToday > 0
                    ? 'Great progress! Keep it going!'
                    : 'Start your first focus session today'}
                </span>
                <span className="text-[10px] text-[#171622]/55">
                  {summary.totalCompletedFocusSessions} done •{' '}
                  {summary.totalInterruptedSessions} interrupted
                </span>
              </div>
            </div>
          </section>

          {/* Card 2: This Week */}
          <section
            aria-labelledby="this-week-focus-heading"
            className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#171622]" />
                <h2
                  id="this-week-focus-heading"
                  className="font-display text-sm font-bold text-[#171622]"
                >
                  This Week
                </h2>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-extrabold text-[#171622]">
                  {summary.weeklyTotalFormatted}
                </p>
                <p className="text-[10px] font-medium text-[#171622]/55">
                  Total focus time
                </p>
              </div>
            </div>

            {/* 7-Day Bar Chart */}
            <div className="grid grid-cols-7 gap-2 pt-2 items-end h-36">
              {weeklyDays.map((day) => {
                const heightPct =
                  day.focusedMinutes > 0
                    ? Math.max(
                        18,
                        Math.min(
                          100,
                          Math.round(
                            (day.focusedMinutes / maxWeeklyMinutes) * 100
                          )
                        )
                      )
                    : 14;
                return (
                  <div
                    key={day.dateKey}
                    title={`${day.dayShortLabel} (${day.dateKey}): ${day.focusedMinutes} min (${day.completedSessionsCount} sessions)`}
                    className="flex h-full flex-col items-center justify-end gap-1.5"
                  >
                    <div className="flex w-full flex-1 items-end justify-center">
                      <div
                        className={`w-full max-w-[28px] rounded-t-xl transition-all ${
                          day.focusedMinutes > 0
                            ? day.isToday
                              ? 'bg-[#52B748]'
                              : 'bg-[#94D87D]'
                            : 'bg-[#E9F5E3]'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-semibold ${
                        day.isToday
                          ? 'text-[#171622] font-bold'
                          : 'text-[#171622]/55'
                      }`}
                    >
                      {day.dayShortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Card 3: Recent Sessions */}
          <section
            aria-labelledby="recent-sessions-heading"
            className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#171622]" />
                <h2
                  id="recent-sessions-heading"
                  className="font-display text-sm font-bold text-[#171622]"
                >
                  Recent Sessions
                </h2>
              </div>
              {filteredRecentSessions.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllRecent((v) => !v)}
                  className="text-xs font-semibold text-[#5938B5] hover:underline"
                >
                  {showAllRecent ? 'Show less' : 'View all →'}
                </button>
              )}
            </div>

            {displayedRecent.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#171622]/12 bg-[#FAF9F6] p-6 text-center space-y-1.5">
                <p className="text-xs font-bold text-[#171622]">
                  No focus sessions recorded yet
                </p>
                <p className="text-[11px] text-[#171622]/55">
                  Start a Pomodoro focus timer or stopwatch session and your
                  completed history will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#171622]/6">
                {displayedRecent.map((s) => {
                  const isInterrupted = s.status === 'interrupted';
                  const typeLabel =
                    s.sessionType === 'short_break'
                      ? 'Short Break'
                      : s.sessionType === 'long_break'
                        ? 'Long Break'
                        : s.sessionType === 'stopwatch'
                          ? 'Stopwatch Session'
                          : 'Focus Session';

                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            s.sessionType === 'short_break'
                              ? 'bg-[#F2EFFC] text-[#5938B5]'
                              : s.sessionType === 'long_break'
                                ? 'bg-[#FEF3C7] text-[#D97706]'
                                : s.sessionType === 'stopwatch'
                                  ? 'bg-[#EEF5FD] text-[#2563EB]'
                                  : 'bg-[#FDECEB]'
                          }`}
                        >
                          {s.sessionType === 'short_break' ? (
                            <Coffee className="h-4 w-4" />
                          ) : s.sessionType === 'long_break' ? (
                            <Sparkles className="h-4 w-4" />
                          ) : s.sessionType === 'stopwatch' ? (
                            <Timer className="h-4 w-4" />
                          ) : (
                            <PomodoroTimerIcon className="h-4 w-4 text-[#EF5350]" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-[#171622]">
                              {typeLabel}
                            </p>
                            {isInterrupted && (
                              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                                Interrupted
                              </span>
                            )}
                          </div>
                          {s.taskTitle ? (
                            <p className="truncate text-[11px] text-[#171622]/60">
                              {s.taskTitle}
                            </p>
                          ) : s.sessionType === 'stopwatch' &&
                            s.laps.length > 0 ? (
                            <p className="truncate text-[11px] text-[#171622]/55">
                              {s.laps.length} laps recorded
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <div className="text-[11px] tabular-nums">
                          <span className="font-semibold text-[#171622]/75">
                            {s.durationSummaryLabel}
                          </span>
                          <span className="mx-1.5 text-[#171622]/25">•</span>
                          <span className="text-[#171622]/50">
                            {s.formattedTimeLabel}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteHistorySession(s.id)}
                          aria-label={`Delete ${typeLabel} from history`}
                          title="Remove from history"
                          className="rounded-lg p-1 text-[#171622]/35 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Confirmation Dialog Modal */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="focus-confirm-dialog-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl">
            <h2
              id="focus-confirm-dialog-title"
              className="text-base font-bold text-[#171622]"
            >
              {confirmDialog.title}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#171622]/65">
              {confirmDialog.message}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDialog.onConfirm()}
                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white ${
                  confirmDialog.isDanger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#171622] hover:bg-[#171622]/90'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
