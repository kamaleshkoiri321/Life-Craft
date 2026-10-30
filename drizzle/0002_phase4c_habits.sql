-- LifeCraft Phase 4C — Habits, Routines, Streaks & Analytics Migration
-- Scope: public schema only. The managed `neon_auth` schema is never modified.

ALTER TABLE "public"."habits"
  ADD COLUMN IF NOT EXISTS "scheduled_days" integer[];

ALTER TABLE "public"."habits"
  DROP CONSTRAINT IF EXISTS "habits_scheduled_days_check";

ALTER TABLE "public"."habits"
  ADD CONSTRAINT "habits_scheduled_days_check"
  CHECK (
    "scheduled_days" IS NULL
    OR (
      array_length("scheduled_days", 1) >= 1
      AND array_length("scheduled_days", 1) <= 7
      AND "scheduled_days" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::integer[]
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "habits_id_user_id_unique"
  ON "public"."habits" USING btree ("id", "user_id");

ALTER TABLE "public"."habit_logs"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."habit_logs"
  DROP CONSTRAINT IF EXISTS "habit_logs_habit_user_ownership_fk";

ALTER TABLE "public"."habit_logs"
  ADD CONSTRAINT "habit_logs_habit_user_ownership_fk"
  FOREIGN KEY ("habit_id", "user_id")
  REFERENCES "public"."habits"("id", "user_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
