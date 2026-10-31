-- LifeCraft Phase 1 - Calendar & Event Management Schema Migration

CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "notes" text,
  "category" text DEFAULT 'General' NOT NULL,
  "color" text DEFAULT '#5938B5' NOT NULL,
  "start_at" timestamp with time zone NOT NULL,
  "end_at" timestamp with time zone NOT NULL,
  "is_all_day" boolean DEFAULT false NOT NULL,
  "timezone" text DEFAULT 'Asia/Kathmandu' NOT NULL,
  "meeting_url" text,
  "recurrence_rule" jsonb,
  "recurring_event_id" uuid,
  "reminders" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "calendar_events_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "calendar_events_end_after_start_check"
    CHECK ("end_at" >= "start_at")
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_id_user_id_unique"
  ON "public"."calendar_events" USING btree ("id", "user_id");

CREATE INDEX IF NOT EXISTS "calendar_events_user_id_idx"
  ON "public"."calendar_events" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "calendar_events_user_start_end_idx"
  ON "public"."calendar_events" USING btree ("user_id", "start_at", "end_at");

CREATE INDEX IF NOT EXISTS "calendar_events_user_category_idx"
  ON "public"."calendar_events" USING btree ("user_id", "category");

CREATE TABLE IF NOT EXISTS "public"."calendar_event_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "file_name" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "storage_bucket" text NOT NULL,
  "storage_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "calendar_event_attachments_event_id_calendar_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "calendar_event_attachments_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_attachments_id_user_id_unique"
  ON "public"."calendar_event_attachments" USING btree ("id", "user_id");

CREATE INDEX IF NOT EXISTS "calendar_event_attachments_event_id_idx"
  ON "public"."calendar_event_attachments" USING btree ("event_id");

CREATE INDEX IF NOT EXISTS "calendar_event_attachments_user_id_idx"
  ON "public"."calendar_event_attachments" USING btree ("user_id");

