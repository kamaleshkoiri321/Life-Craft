-- LifeCraft Phase 4E: Notes, Journaling & Personal Knowledge Management
-- Extends public.notes backward-compatibly and creates note_folders, note_tags, and note_tag_assignments.
-- Strictly preserves existing tables, notes, and user data. Never modifies neon_auth.

CREATE TABLE IF NOT EXISTS public.note_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT 'lime',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT note_folders_name_non_empty_check CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT note_folders_color_check CHECK (color IN ('lime', 'violet', 'emerald', 'amber', 'rose', 'sky', 'slate'))
);

CREATE UNIQUE INDEX IF NOT EXISTS note_folders_id_user_id_unique
  ON public.note_folders (id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS note_folders_user_name_ci_unique
  ON public.note_folders (user_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS note_folders_user_id_idx
  ON public.note_folders (user_id);

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.note_folders(id) ON DELETE SET NULL;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'note';

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS journal_date date;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS mood text;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS icon_style text NOT NULL DEFAULT 'leaf';

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS trashed_at timestamptz;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_entry_type_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_entry_type_check
  CHECK (entry_type IN ('note', 'journal'));

CREATE UNIQUE INDEX IF NOT EXISTS notes_id_user_id_unique
  ON public.notes (id, user_id);

CREATE INDEX IF NOT EXISTS notes_user_folder_idx
  ON public.notes (user_id, folder_id);

CREATE INDEX IF NOT EXISTS notes_user_entry_type_idx
  ON public.notes (user_id, entry_type, journal_date DESC);

CREATE INDEX IF NOT EXISTS notes_user_pinned_idx
  ON public.notes (user_id, is_pinned);

CREATE INDEX IF NOT EXISTS notes_user_archived_trashed_idx
  ON public.notes (user_id, archived_at, trashed_at);

CREATE TABLE IF NOT EXISTS public.note_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'violet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT note_tags_name_non_empty_check CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT note_tags_color_check CHECK (color IN ('lime', 'violet', 'emerald', 'amber', 'rose', 'sky', 'slate'))
);

CREATE UNIQUE INDEX IF NOT EXISTS note_tags_id_user_id_unique
  ON public.note_tags (id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS note_tags_user_name_ci_unique
  ON public.note_tags (user_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS note_tags_user_id_idx
  ON public.note_tags (user_id);

CREATE TABLE IF NOT EXISTS public.note_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT note_tag_assignments_note_owner_fk
    FOREIGN KEY (note_id, user_id)
    REFERENCES public.notes(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT note_tag_assignments_tag_owner_fk
    FOREIGN KEY (tag_id, user_id)
    REFERENCES public.note_tags(id, user_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS note_tag_assignments_unique
  ON public.note_tag_assignments (note_id, tag_id);

CREATE INDEX IF NOT EXISTS note_tag_assignments_user_id_idx
  ON public.note_tag_assignments (user_id);

CREATE INDEX IF NOT EXISTS note_tag_assignments_note_id_idx
  ON public.note_tag_assignments (note_id);

CREATE INDEX IF NOT EXISTS note_tag_assignments_tag_id_idx
  ON public.note_tag_assignments (tag_id);
