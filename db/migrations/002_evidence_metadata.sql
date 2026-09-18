-- QualityOS migration 002: preserve evidence metadata outside the workspace blob.
-- The baseline schema already includes this column for new databases; this
-- migration keeps existing PostgreSQL deployments safe to upgrade.

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS evidence_workspace_created_idx
  ON evidence (workspace_id, created_at DESC);
