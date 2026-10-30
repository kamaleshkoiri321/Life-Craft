-- LifeCraft Phase 4D — Goals, Milestones & Progress Tracking Migration
-- Scope: public schema only. The managed `neon_auth` schema is never modified.

ALTER TABLE "public"."goals"
  ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'Personal Growth' NOT NULL;

ALTER TABLE "public"."goals"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;

ALTER TABLE "public"."goals"
  DROP CONSTRAINT IF EXISTS "goals_status_check";

ALTER TABLE "public"."goals"
  ADD CONSTRAINT "goals_status_check"
  CHECK ("status" IN ('active', 'paused', 'completed', 'archived'));

ALTER TABLE "public"."goals"
  DROP CONSTRAINT IF EXISTS "goals_category_non_empty_check";

ALTER TABLE "public"."goals"
  ADD CONSTRAINT "goals_category_non_empty_check"
  CHECK (char_length(btrim("category")) > 0);

CREATE UNIQUE INDEX IF NOT EXISTS "goals_id_user_id_unique"
  ON "public"."goals" USING btree ("id", "user_id");

CREATE INDEX IF NOT EXISTS "goals_user_target_date_idx"
  ON "public"."goals" USING btree ("user_id", "target_date");

CREATE TABLE IF NOT EXISTS "public"."goal_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goal_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "target_date" date,
  "status" text DEFAULT 'pending' NOT NULL,
  "completed_at" timestamp with time zone,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goal_milestones_goal_id_goals_id_fk"
    FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "goal_milestones_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "goal_milestones_goal_user_ownership_fk"
    FOREIGN KEY ("goal_id", "user_id") REFERENCES "public"."goals"("id", "user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "goal_milestones_title_non_empty_check"
    CHECK (char_length(btrim("title")) > 0),
  CONSTRAINT "goal_milestones_status_check"
    CHECK ("status" IN ('pending', 'completed'))
);

CREATE INDEX IF NOT EXISTS "goal_milestones_goal_id_sort_idx"
  ON "public"."goal_milestones" USING btree ("goal_id", "sort_order");

CREATE INDEX IF NOT EXISTS "goal_milestones_user_id_idx"
  ON "public"."goal_milestones" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "public"."goal_progress_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goal_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "progress_percent" integer NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goal_progress_entries_goal_id_goals_id_fk"
    FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "goal_progress_entries_user_id_user_profiles_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "goal_progress_entries_goal_user_ownership_fk"
    FOREIGN KEY ("goal_id", "user_id") REFERENCES "public"."goals"("id", "user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "goal_progress_entries_progress_percent_check"
    CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100)
);

CREATE INDEX IF NOT EXISTS "goal_progress_entries_goal_created_idx"
  ON "public"."goal_progress_entries" USING btree ("goal_id", "created_at");

CREATE INDEX IF NOT EXISTS "goal_progress_entries_user_id_idx"
  ON "public"."goal_progress_entries" USING btree ("user_id");
