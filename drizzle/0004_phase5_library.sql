-- LifeCraft Phase 5: Personal Library, Book Uploads, Collections & Reading Tracker
-- Creates library_items, library_collections, library_collection_items, library_bookmarks, and library_upload_sessions.
-- Strictly preserves existing tables and user data.

CREATE TABLE IF NOT EXISTS public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  author text,
  description text,
  item_type text NOT NULL,
  reading_status text NOT NULL DEFAULT 'to_read',
  storage_key text,
  storage_bucket text,
  original_filename text,
  mime_type text,
  file_size_bytes integer,
  external_url text,
  cover_style text NOT NULL DEFAULT 'forest',
  progress_percent integer NOT NULL DEFAULT 0,
  current_page integer,
  total_pages integer,
  reading_position text,
  last_opened_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_items_title_non_empty_check CHECK (char_length(btrim(title)) > 0),
  CONSTRAINT library_items_item_type_check CHECK (item_type IN ('pdf', 'epub', 'book', 'link')),
  CONSTRAINT library_items_reading_status_check CHECK (reading_status IN ('to_read', 'reading', 'completed', 'on_hold', 'archived')),
  CONSTRAINT library_items_progress_percent_check CHECK (progress_percent >= 0 AND progress_percent <= 100),
  CONSTRAINT library_items_file_size_check CHECK (file_size_bytes IS NULL OR (file_size_bytes > 0 AND file_size_bytes <= 52428800)),
  CONSTRAINT library_items_pages_check CHECK ((current_page IS NULL OR current_page >= 0) AND (total_pages IS NULL OR total_pages >= 1)),
  CONSTRAINT library_items_upload_metadata_check CHECK (
    (item_type IN ('pdf', 'epub') AND storage_key IS NOT NULL AND original_filename IS NOT NULL AND mime_type IS NOT NULL AND file_size_bytes IS NOT NULL)
    OR (item_type = 'link' AND external_url IS NOT NULL)
    OR (item_type = 'book')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS library_items_id_user_id_unique
  ON public.library_items (id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS library_items_storage_key_unique
  ON public.library_items (storage_key)
  WHERE storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS library_items_user_id_idx
  ON public.library_items (user_id);

CREATE INDEX IF NOT EXISTS library_items_user_status_idx
  ON public.library_items (user_id, reading_status);

CREATE INDEX IF NOT EXISTS library_items_user_type_idx
  ON public.library_items (user_id, item_type);

CREATE INDEX IF NOT EXISTS library_items_user_last_opened_idx
  ON public.library_items (user_id, last_opened_at DESC);

CREATE TABLE IF NOT EXISTS public.library_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT 'violet',
  icon text NOT NULL DEFAULT 'folder',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_collections_name_non_empty_check CHECK (char_length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS library_collections_id_user_id_unique
  ON public.library_collections (id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS library_collections_user_name_ci_unique
  ON public.library_collections (user_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS library_collections_user_id_idx
  ON public.library_collections (user_id);

CREATE TABLE IF NOT EXISTS public.library_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  library_item_id uuid NOT NULL,
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_collection_items_collection_owner_fk
    FOREIGN KEY (collection_id, user_id)
    REFERENCES public.library_collections(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT library_collection_items_item_owner_fk
    FOREIGN KEY (library_item_id, user_id)
    REFERENCES public.library_items(id, user_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS library_collection_items_unique
  ON public.library_collection_items (collection_id, library_item_id);

CREATE INDEX IF NOT EXISTS library_collection_items_user_id_idx
  ON public.library_collection_items (user_id);

CREATE INDEX IF NOT EXISTS library_collection_items_item_id_idx
  ON public.library_collection_items (library_item_id);

CREATE TABLE IF NOT EXISTS public.library_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_item_id uuid NOT NULL,
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  label text NOT NULL,
  position text NOT NULL,
  page_number integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_bookmarks_label_non_empty_check CHECK (char_length(btrim(label)) > 0),
  CONSTRAINT library_bookmarks_position_non_empty_check CHECK (char_length(btrim(position)) > 0),
  CONSTRAINT library_bookmarks_item_owner_fk
    FOREIGN KEY (library_item_id, user_id)
    REFERENCES public.library_items(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS library_bookmarks_item_created_idx
  ON public.library_bookmarks (library_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS library_bookmarks_user_id_idx
  ON public.library_bookmarks (user_id);

CREATE TABLE IF NOT EXISTS public.library_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  storage_bucket text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes integer NOT NULL,
  item_type text NOT NULL,
  title text NOT NULL,
  author text,
  description text,
  cover_style text NOT NULL DEFAULT 'forest',
  collection_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_upload_sessions_item_type_check CHECK (item_type IN ('pdf', 'epub')),
  CONSTRAINT library_upload_sessions_status_check CHECK (status IN ('pending', 'uploaded', 'finalized', 'failed')),
  CONSTRAINT library_upload_sessions_size_check CHECK (file_size_bytes > 0 AND file_size_bytes <= 52428800)
);

CREATE UNIQUE INDEX IF NOT EXISTS library_upload_sessions_storage_key_unique
  ON public.library_upload_sessions (storage_key);

CREATE INDEX IF NOT EXISTS library_upload_sessions_user_id_idx
  ON public.library_upload_sessions (user_id);
