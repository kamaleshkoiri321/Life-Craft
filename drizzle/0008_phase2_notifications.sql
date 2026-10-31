-- LifeCraft Phase 2 - Calendar Event Notifications & Email Tracking Migration

ALTER TABLE "public"."user_preferences" 
  ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "default_reminder_minutes" integer DEFAULT 15 NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."calendar_event_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "event_id" uuid NOT NULL,
  "reminder_minutes" integer NOT NULL,
  "channel" text DEFAULT 'email' NOT NULL,
  "recipient_email" text,
  "scheduled_for" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "sent_at" timestamp with time zone,
  "error_message" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "message_id" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "calendar_event_notifications_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "calendar_event_notifications_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "calendar_event_notifications_status_check"
    CHECK ("status" IN ('pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_notifications_idempotency_unique"
  ON "public"."calendar_event_notifications" USING btree ("idempotency_key");

CREATE INDEX IF NOT EXISTS "calendar_event_notifications_scheduled_status_idx"
  ON "public"."calendar_event_notifications" USING btree ("status", "scheduled_for");

CREATE INDEX IF NOT EXISTS "calendar_event_notifications_user_id_idx"
  ON "public"."calendar_event_notifications" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "calendar_event_notifications_event_id_idx"
  ON "public"."calendar_event_notifications" USING btree ("event_id");

