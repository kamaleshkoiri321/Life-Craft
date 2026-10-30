-- LifeCraft Phase 3 — Tracked PostgreSQL Foundation Migration
-- Scope: public schema only. The managed `neon_auth` schema is never modified.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
  "user_id" text PRIMARY KEY NOT NULL,
  "display_name" text,
  "timezone" text DEFAULT 'Asia/Kathmandu' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
  "user_id" text PRIMARY KEY NOT NULL,
  "theme" text DEFAULT 'light' NOT NULL,
  "week_starts_on" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_preferences_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_preferences_theme_check"
    CHECK ("theme" IN ('light', 'dark', 'system')),
  CONSTRAINT "user_preferences_week_starts_on_check"
    CHECK ("week_starts_on" >= 0 AND "week_starts_on" <= 6)
);

CREATE TABLE IF NOT EXISTS "public"."tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'todo' NOT NULL,
  "priority" text DEFAULT 'medium' NOT NULL,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tasks_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "tasks_title_non_empty_check"
    CHECK (char_length(btrim("title")) > 0),
  CONSTRAINT "tasks_status_check"
    CHECK ("status" IN ('todo', 'in_progress', 'completed', 'archived')),
  CONSTRAINT "tasks_priority_check"
    CHECK ("priority" IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS "tasks_user_id_idx"
  ON "public"."tasks" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "tasks_user_due_at_idx"
  ON "public"."tasks" USING btree ("user_id", "due_at");
CREATE INDEX IF NOT EXISTS "tasks_user_status_idx"
  ON "public"."tasks" USING btree ("user_id", "status");

CREATE TABLE IF NOT EXISTS "public"."habits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "target_per_week" integer DEFAULT 7 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "habits_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "habits_title_non_empty_check"
    CHECK (char_length(btrim("title")) > 0),
  CONSTRAINT "habits_target_per_week_check"
    CHECK ("target_per_week" >= 1 AND "target_per_week" <= 7)
);

CREATE INDEX IF NOT EXISTS "habits_user_id_idx"
  ON "public"."habits" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "habits_user_active_idx"
  ON "public"."habits" USING btree ("user_id", "is_active");

CREATE TABLE IF NOT EXISTS "public"."habit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "habit_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "completed_on" date NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "habit_logs_habit_id_habits_id_fk"
    FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "habit_logs_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "habit_logs_status_check"
    CHECK ("status" IN ('completed', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "habit_logs_habit_completed_on_unique"
  ON "public"."habit_logs" USING btree ("habit_id", "completed_on");
CREATE INDEX IF NOT EXISTS "habit_logs_user_completed_on_idx"
  ON "public"."habit_logs" USING btree ("user_id", "completed_on");
CREATE INDEX IF NOT EXISTS "habit_logs_habit_completed_on_idx"
  ON "public"."habit_logs" USING btree ("habit_id", "completed_on");

CREATE TABLE IF NOT EXISTS "public"."goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "target_date" date,
  "progress_percent" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goals_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "goals_title_non_empty_check"
    CHECK (char_length(btrim("title")) > 0),
  CONSTRAINT "goals_status_check"
    CHECK ("status" IN ('active', 'paused', 'completed')),
  CONSTRAINT "goals_progress_percent_check"
    CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100)
);

CREATE INDEX IF NOT EXISTS "goals_user_id_idx"
  ON "public"."goals" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "goals_user_status_idx"
  ON "public"."goals" USING btree ("user_id", "status");

CREATE TABLE IF NOT EXISTS "public"."notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notes_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "notes_title_non_empty_check"
    CHECK (char_length(btrim("title")) > 0)
);

CREATE INDEX IF NOT EXISTS "notes_user_id_idx"
  ON "public"."notes" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "notes_user_updated_at_idx"
  ON "public"."notes" USING btree ("user_id", "updated_at");
