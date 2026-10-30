-- LifeCraft Phase 4B — Hourly Calendar & Google Calendar Integration Migration
-- Scope: public schema only. The managed `neon_auth` schema is never modified.

ALTER TABLE "public"."tasks"
  ADD COLUMN IF NOT EXISTS "scheduled_start_at" timestamp with time zone;

ALTER TABLE "public"."tasks"
  ADD COLUMN IF NOT EXISTS "scheduled_end_at" timestamp with time zone;

ALTER TABLE "public"."tasks"
  ADD COLUMN IF NOT EXISTS "is_all_day" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."tasks"
  DROP CONSTRAINT IF EXISTS "tasks_scheduled_range_check";

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_scheduled_range_check"
  CHECK (
    ("scheduled_start_at" IS NULL AND "scheduled_end_at" IS NULL)
    OR (
      "scheduled_start_at" IS NOT NULL
      AND "scheduled_end_at" IS NOT NULL
      AND "scheduled_end_at" > "scheduled_start_at"
    )
  );

CREATE INDEX IF NOT EXISTS "tasks_user_scheduled_start_idx"
  ON "public"."tasks" USING btree ("user_id", "scheduled_start_at");

CREATE INDEX IF NOT EXISTS "tasks_user_scheduled_end_idx"
  ON "public"."tasks" USING btree ("user_id", "scheduled_end_at");

CREATE TABLE IF NOT EXISTS "public"."google_calendar_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "google_account_id" text NOT NULL,
  "google_email" text NOT NULL,
  "calendar_id" text DEFAULT 'primary' NOT NULL,
  "granted_scopes" text NOT NULL,
  "encrypted_refresh_token" text,
  "encrypted_access_token" text,
  "access_token_expires_at" timestamp with time zone,
  "status" text DEFAULT 'connected' NOT NULL,
  "last_error" text,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_connections_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "google_calendar_connections_status_check"
    CHECK ("status" IN ('connected', 'expired', 'revoked', 'error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_connections_user_id_unique"
  ON "public"."google_calendar_connections" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "public"."google_calendar_event_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "task_id" uuid NOT NULL,
  "google_calendar_id" text DEFAULT 'primary' NOT NULL,
  "google_event_id" text NOT NULL,
  "google_html_link" text,
  "exported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_event_mappings_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "google_calendar_event_mappings_task_id_tasks_id_fk"
    FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_event_mappings_user_task_unique"
  ON "public"."google_calendar_event_mappings" USING btree ("user_id", "task_id");

CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_event_mappings_user_event_unique"
  ON "public"."google_calendar_event_mappings" USING btree ("user_id", "google_calendar_id", "google_event_id");

CREATE INDEX IF NOT EXISTS "google_calendar_event_mappings_user_id_idx"
  ON "public"."google_calendar_event_mappings" USING btree ("user_id");
