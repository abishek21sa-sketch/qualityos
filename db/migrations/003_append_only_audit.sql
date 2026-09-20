-- QualityOS migration 003: add an idempotency key for browser/API audit events.
-- Existing audit rows remain untouched; newly synced events are append-only.

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_workspace_source_key_uq
  ON audit_events (workspace_id, source_key)
  WHERE source_key IS NOT NULL;
