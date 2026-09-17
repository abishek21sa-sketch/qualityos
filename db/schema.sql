-- QualityOS production migration starting point.
-- PostgreSQL 15+; run through a reviewed migration tool before production use.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE quality_role AS ENUM ('admin', 'quality_manager', 'quality_engineer', 'operator', 'supplier');
CREATE TYPE record_status AS ENUM ('open', 'in_progress', 'effectiveness_check', 'closed');
CREATE TYPE evidence_status AS ENUM ('requested', 'review', 'rejected', 'verified');

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_state (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role quality_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  supplier_code text NOT NULL,
  name text NOT NULL,
  site text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, supplier_code)
);

CREATE TABLE parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  part_number text NOT NULL,
  description text NOT NULL,
  revision text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, part_number, revision)
);

CREATE TABLE lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  part_id uuid NOT NULL REFERENCES parts(id),
  supplier_lot text,
  disposition text NOT NULL DEFAULT 'hold',
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, lot_number)
);

CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES lots(id),
  characteristic text NOT NULL,
  measured_value numeric(12, 4),
  unit text NOT NULL,
  result text NOT NULL,
  defect_code text,
  operator_id uuid REFERENCES users(id),
  notes text,
  spc_rule text,
  spc_limit numeric(12, 4),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quality_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  signal_code text NOT NULL,
  title text NOT NULL,
  characteristic text NOT NULL,
  source_inspection_id uuid REFERENCES inspections(id),
  severity numeric(4, 2),
  status text NOT NULL DEFAULT 'new',
  owner_id uuid REFERENCES users(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (workspace_id, signal_code)
);

CREATE TABLE nonconformances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ncr_number text NOT NULL,
  title text NOT NULL,
  lot_id uuid REFERENCES lots(id),
  signal_id uuid REFERENCES quality_signals(id),
  owner_id uuid REFERENCES users(id),
  status record_status NOT NULL DEFAULT 'open',
  risk_rpn integer,
  root_cause text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ncr_number)
);

CREATE TABLE containment_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ncr_id uuid NOT NULL REFERENCES nonconformances(id) ON DELETE CASCADE,
  label text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz
);

CREATE TABLE corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action_number text NOT NULL,
  ncr_id uuid REFERENCES nonconformances(id),
  title text NOT NULL,
  owner_id uuid REFERENCES users(id),
  priority text NOT NULL DEFAULT 'medium',
  status record_status NOT NULL DEFAULT 'open',
  due_at date,
  acceptance_criteria text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, action_number)
);

CREATE TABLE capas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  capa_number text NOT NULL,
  ncr_id uuid REFERENCES nonconformances(id),
  method text NOT NULL,
  owner_id uuid REFERENCES users(id),
  status record_status NOT NULL DEFAULT 'open',
  problem_statement text NOT NULL,
  effectiveness_target numeric(12, 4),
  effectiveness_current numeric(12, 4),
  effectiveness_outcome text,
  due_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, capa_number)
);

CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ncr_id uuid REFERENCES nonconformances(id),
  action_id uuid REFERENCES corrective_actions(id),
  capa_id uuid REFERENCES capas(id),
  lot_id uuid REFERENCES lots(id),
  file_name text NOT NULL,
  content_type text NOT NULL,
  object_key text,
  status evidence_status NOT NULL DEFAULT 'requested',
  requested_by uuid REFERENCES users(id),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  entity_type text NOT NULL,
  entity_id uuid,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quality_signals_workspace_status_idx ON quality_signals (workspace_id, status, detected_at DESC);
CREATE INDEX inspections_lot_recorded_idx ON inspections (lot_id, recorded_at DESC);
CREATE INDEX evidence_workspace_status_idx ON evidence (workspace_id, status, created_at DESC);
CREATE INDEX audit_events_workspace_created_idx ON audit_events (workspace_id, created_at DESC);
