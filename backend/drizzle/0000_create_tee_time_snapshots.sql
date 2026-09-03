CREATE TABLE IF NOT EXISTS "tee_time_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "course_id" text NOT NULL,
  "course_name" text NOT NULL,
  "provider" text NOT NULL,
  "play_date" date NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "observation_bucket" timestamp with time zone NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "lead_days" integer NOT NULL,
  "tee_time_count" integer,
  "total_available_spots" integer,
  "spots_known_count" integer,
  "morning_count" integer,
  "midday_count" integer,
  "afternoon_count" integer,
  "earliest_minute" integer,
  "latest_minute" integer,
  "minimum_price" real,
  "maximum_price" real,
  "error_message" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "tee_time_snapshots_course_date_bucket_unique"
  ON "tee_time_snapshots" ("course_id", "play_date", "observation_bucket");

CREATE INDEX IF NOT EXISTS "tee_time_snapshots_comparison_idx"
  ON "tee_time_snapshots" ("course_id", "play_date", "lead_days", "observed_at");
