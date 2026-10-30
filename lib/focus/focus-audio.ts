'use client';

import type { AlarmSoundId } from './focus-utils';

let sharedAudioCtx: AudioContext | null = null;
let activeStopCallbacks: (() => void)[] = [];
let activeTimeoutIds: ReturnType<typeof setTimeout>[] = [];

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx && sharedAudioCtx.state !== 'closed') {
    return sharedAudioCtx;
  }

  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtxClass) return null;

  try {
    sharedAudioCtx = new AudioCtxClass();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Unlocks the Web Audio API context during a user gesture (e.g., Start, Resume, Preview).
 */
export async function unlockFocusAudio(): Promise<{
  unlocked: boolean;
  reason?: string;
}> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) {
    return {
      unlocked: false,
      reason: 'Web Audio API is not supported in this browser.',
    };
  }

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return {
      unlocked: ctx.state === 'running',
      reason:
        ctx.state === 'running'
          ? undefined
          : 'Audio playback requires a click or tap interaction first.',
    };
  } catch {
    return {
      unlocked: false,
      reason: 'Browser blocked audio playback until you interact with the page.',
    };
  }
}

/**
 * Immediately stops any currently playing alarm or preview sound.
 */
export function stopActiveAlarm(): void {
  for (const tid of activeTimeoutIds) {
    clearTimeout(tid);
  }
  activeTimeoutIds = [];

  const callbacks = [...activeStopCallbacks];
  activeStopCallbacks = [];
  for (const stopFn of callbacks) {
    try {
      stopFn();
    } catch {
      // Ignore already-stopped oscillator
    }
  }
}

function scheduleNote(
  ctx: AudioContext,
  params: {
    freq: number;
    type: OscillatorType;
    startTime: number;
    duration: number;
    peakGain: number;
    attack?: number;
  }
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = params.type;
  osc.frequency.setValueAtTime(params.freq, params.startTime);

  const attack = params.attack ?? 0.015;
  const safePeak = Math.max(0.0001, Math.min(0.6, params.peakGain));

  gain.gain.setValueAtTime(0.0001, params.startTime);
  gain.gain.linearRampToValueAtTime(safePeak, params.startTime + attack);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    params.startTime + params.duration
  );

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(params.startTime);
  osc.stop(params.startTime + params.duration + 0.02);

  activeStopCallbacks.push(() => {
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.stop(ctx.currentTime + 0.01);
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignore
    }
  });
}

/**
 * Plays one of the 4 original synthesized alarm sounds using the Web Audio API.
 * Returns a result indicating whether playback started and its total duration in ms.
 */
export async function playFocusAlarmSound(params: {
  soundId: AlarmSoundId;
  volumePercent: number;
  onFinished?: () => void;
}): Promise<{ played: boolean; message?: string }> {
  stopActiveAlarm();

  const clampedVol = Math.max(0, Math.min(100, params.volumePercent)) / 100;
  if (clampedVol <= 0.001) {
    params.onFinished?.();
    return { played: false, message: 'Volume is set to 0%.' };
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) {
    params.onFinished?.();
    return {
      played: false,
      message: 'Web Audio API is unavailable in this browser.',
    };
  }

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch {
    params.onFinished?.();
    return {
      played: false,
      message:
        'Audio permission was blocked by the browser. Click anywhere in Focus Studio to enable sound.',
    };
  }

  if (ctx.state !== 'running') {
    params.onFinished?.();
    return {
      played: false,
      message:
        'Audio context is suspended. Click Play Preview or Start to unlock sound.',
    };
  }

  const now = ctx.currentTime + 0.02;
  const masterGain = clampedVol * 0.36;
  let totalDurationMs = 2600;

  if (params.soundId === 'bell') {
    // 3 resonant bell strikes
    const strikeOffsets = [0, 0.95, 1.9];
    for (const offset of strikeOffsets) {
      const t = now + offset;
      scheduleNote(ctx, {
        freq: 783.99, // G5 fundamental
        type: 'sine',
        startTime: t,
        duration: 0.85,
        peakGain: masterGain,
        attack: 0.01,
      });
      scheduleNote(ctx, {
        freq: 1567.98, // G6 harmonic
        type: 'triangle',
        startTime: t,
        duration: 0.45,
        peakGain: masterGain * 0.4,
        attack: 0.008,
      });
      scheduleNote(ctx, {
        freq: 2351.97, // D7 shimmer
        type: 'sine',
        startTime: t,
        duration: 0.25,
        peakGain: masterGain * 0.2,
        attack: 0.005,
      });
    }
    totalDurationMs = 2850;
  } else if (params.soundId === 'digital') {
    // Classic crisp digital double-beep cadence (3 pairs)
    const pairs = [0, 0.75, 1.5];
    for (const pairOffset of pairs) {
      scheduleNote(ctx, {
        freq: 1046.5, // C6
        type: 'triangle',
        startTime: now + pairOffset,
        duration: 0.14,
        peakGain: masterGain * 0.9,
        attack: 0.006,
      });
      scheduleNote(ctx, {
        freq: 1318.5, // E6
        type: 'triangle',
        startTime: now + pairOffset + 0.18,
        duration: 0.16,
        peakGain: masterGain * 0.95,
        attack: 0.006,
      });
    }
    totalDurationMs = 2100;
  } else if (params.soundId === 'chime') {
    // Ascending pentatonic harmonic chime (C5 - D5 - E5 - G5 - C6)
    const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.28;
      scheduleNote(ctx, {
        freq,
        type: 'sine',
        startTime: t,
        duration: 0.9,
        peakGain: masterGain * 0.85,
        attack: 0.02,
      });
    });
    totalDurationMs = 2400;
  } else {
    // Soft Alarm: warm mellow major 7th chord swell x2
    const chord = [440, 554.37, 659.25, 830.61]; // A4, C#5, E5, G#5
    for (const swellOffset of [0, 1.25]) {
      for (const freq of chord) {
        scheduleNote(ctx, {
          freq,
          type: 'sine',
          startTime: now + swellOffset,
          duration: 1.05,
          peakGain: masterGain * 0.45,
          attack: 0.12,
        });
      }
    }
    totalDurationMs = 2500;
  }

  const finishTid = setTimeout(() => {
    params.onFinished?.();
  }, totalDurationMs);
  activeTimeoutIds.push(finishTid);

  return { played: true };
}
