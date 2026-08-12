-- 002_retry_and_error_tracking.sql
--
-- Context: on 2026-07-07 the email provider stopped accepting sends. Every queued
-- event burned its 3 retries within 15 minutes, flipped to 'skipped', and the
-- reason was written only to a console nobody was reading. Five weeks of silent
-- outage followed, including the Perseids peak.
--
-- This migration moves retry bookkeeping out of the event_data JSON blob (where
-- it was invisible to queries) into real columns, and persists the failure reason
-- so the next outage can be diagnosed from the database alone.

ALTER TABLE event_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_queue ADD COLUMN next_attempt_at TEXT;
ALTER TABLE event_queue ADD COLUMN last_error TEXT;

-- Backfill attempt counts previously stuffed into event_data as "_attempts".
UPDATE event_queue
SET attempts = COALESCE(json_extract(event_data, '$._attempts'), 0)
WHERE json_valid(event_data);

-- The dispatcher polls this every 5 minutes; keep it cheap.
CREATE INDEX IF NOT EXISTS idx_queue_due
  ON event_queue(status, notify_at, next_attempt_at);
