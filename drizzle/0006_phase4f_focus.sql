-- LifeCraft Phase 4F: Pomodoro Focus Studio & Stopwatch Session Tracking
-- Creates public.focus_sessions scoped to public.user_profiles(user_id).
-- Strictly preserves all existing tables and data. Never modifies neon_auth.

CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  session_type text NOT NULL,
  preset_id text NOT NULL DEFAULT 'pomodoro',
  status text NOT NULL DEFAULT 'running',
  planned_duration_seconds integer NOT NULL DEFAULT 1500,
  actual_duration_seconds integer NOT NULL DEFAULT 0,
  laps_json text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_resumed_at timestamptz,
  ended_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT focus_sessions_session_type_check
    CHECK (session_type IN ('focus', 'short_break', 'long_break', 'stopwatch')),
  CONSTRAINT focus_sessions_preset_id_check
    CHECK (preset_id IN ('pomodoro', 'deep_focus', 'extended_focus', 'custom', 'stopwatch')),
  CONSTRAINT focus_sessions_status_check
    CHECK (status IN ('running', 'paused', 'completed', 'interrupted')),
  CONSTRAINT focus_sessions_planned_duration_check
    CHECK (
      (session_type = 'stopwatch' AND planned_duration_seconds = 0)
      OR (session_type IN ('focus', 'short_break', 'long_break') AND planned_duration_seconds >= 60 AND planned_duration_seconds <= 43200)
    ),
  CONSTRAINT focus_sessions_actual_duration_check
    CHECK (actual_duration_seconds >= 0 AND actual_duration_seconds <= 86400)
);

CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_id_user_id_unique
  ON public.focus_sessions (id, user_id);

CREATE INDEX IF NOT EXISTS focus_sessions_user_started_idx
  ON public.focus_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS focus_sessions_user_status_idx
  ON public.focus_sessions (user_id, status);

CREATE INDEX IF NOT EXISTS focus_sessions_user_completed_idx
  ON public.focus_sessions (user_id, session_type, status, completed_at DESC);

CREATE INDEX IF NOT EXISTS focus_sessions_user_task_idx
  ON public.focus_sessions (user_id, task_id);
