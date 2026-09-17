import { createHash } from 'node:crypto';

const workspaceFormat = 'QualityOS server workspace';
const workspaceVersion = 1;
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000001';

function defaultWorkspace() {
  return { format: workspaceFormat, version: workspaceVersion, updatedAt: null, data: {} };
}

function workspaceEtag(workspace) {
  const digest = createHash('sha256').update(JSON.stringify(workspace)).digest('hex');
  return `"${digest}"`;
}

function asWorkspace(row) {
  if (!row) return defaultWorkspace();
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ? new Date(row.updated_at).toISOString() : null;
  return {
    format: workspaceFormat,
    version: Number(row.version) || workspaceVersion,
    updatedAt,
    data: row.state && typeof row.state === 'object' && !Array.isArray(row.state) ? row.state : {}
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function actionStatus(value) {
  const normalized = String(value || '').toLowerCase().replace(/\s+/g, '_');
  return ['open', 'in_progress', 'effectiveness_check', 'closed'].includes(normalized) ? normalized : 'open';
}

function actionPriority(value) {
  const normalized = String(value || '').toLowerCase();
  return ['high', 'medium', 'low'].includes(normalized) ? normalized : 'medium';
}

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
}

function displayActionStatus(value) {
  return { open: 'Open', in_progress: 'In progress', effectiveness_check: 'Effectiveness check', closed: 'Closed' }[value] || 'Open';
}

function displayActionPriority(value) {
  return String(value || 'medium').replace(/^./, letter => letter.toUpperCase());
}

function mapAction(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const { __qualityos_order: ignoredOrder, ...record } = metadata;
  return {
    ...record,
    id: row.action_number,
    title: row.title,
    priority: displayActionPriority(row.priority),
    status: displayActionStatus(row.status),
    due: record.due || (row.due_at ? new Date(row.due_at).toISOString().slice(0, 10) : 'No due date')
  };
}

function mapCapa(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const { __qualityos_order: ignoredOrder, ...record } = metadata;
  return {
    ...record,
    id: row.capa_number,
    method: row.method,
    status: displayActionStatus(row.status),
    problem: row.problem_statement,
    due: record.due || (row.due_at ? new Date(row.due_at).toISOString().slice(0, 10) : 'No due date')
  };
}

function numericValue(value) {
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function inspectionTimestamp(value) {
  const parsed = Date.parse(String(value || '').replace(' · ', ' '));
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

function mapInspection(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const { __qualityos_order: ignoredOrder, ...record } = metadata;
  const measured = row.measured_value === null || row.measured_value === undefined ? '' : `${Number(row.measured_value).toFixed(3)} ${row.unit}`;
  return {
    ...record,
    id: record.id || row.id,
    recordedAt: record.recordedAt || (row.recorded_at ? new Date(row.recorded_at).toISOString() : ''),
    part: record.part || row.part_number,
    lot: record.lot || row.lot_number,
    characteristic: row.characteristic,
    value: record.value || measured,
    result: row.result,
    defectCode: row.defect_code || record.defectCode || 'No defect',
    operator: record.operator || '',
    notes: row.notes || record.notes || '',
    ...(row.spc_rule ? { spcSignal: record.spcSignal || { rule: row.spc_rule, limit: row.spc_limit === null ? '' : `${Number(row.spc_limit).toFixed(2)} ${row.unit}`, observed: measured, reason: 'Persisted SPC context' } } : {})
  };
}

export function createPostgresWorkspaceStore({ databaseUrl, workspaceId = defaultWorkspaceId, workspaceSlug = 'qualityos-default', workspaceName = 'QualityOS' } = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the PostgreSQL workspace store.');
  if (!isUuid(workspaceId)) throw new Error('QUALITYOS_DATABASE_WORKSPACE_ID must be a valid UUID.');
  let poolPromise;

  async function getPool() {
    if (!poolPromise) {
      poolPromise = import('pg').then(({ Pool }) => new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30000 }));
    }
    return poolPromise;
  }

  async function ensureWorkspace(client) {
    await client.query('INSERT INTO workspaces (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [workspaceId, workspaceSlug, workspaceName]);
  }

  async function syncActions(client, records) {
    if (!Array.isArray(records)) return;
    await client.query('DELETE FROM corrective_actions WHERE workspace_id = $1', [workspaceId]);
    const seen = new Set();
    for (const [index, source] of records.entries()) {
      if (!source || typeof source !== 'object') continue;
      const actionNumber = String(source.id || `API-${index + 1}`).slice(0, 80);
      if (seen.has(actionNumber)) continue;
      seen.add(actionNumber);
      const metadata = { ...source, id: actionNumber, __qualityos_order: index };
      await client.query(`INSERT INTO corrective_actions
        (workspace_id, action_number, title, priority, status, due_at, acceptance_criteria, metadata)
        VALUES ($1, $2, $3, $4, $5::record_status, $6, $7, $8::jsonb)`, [
        workspaceId,
        actionNumber,
        String(source.title || 'Untitled corrective action').slice(0, 240),
        actionPriority(source.priority),
        actionStatus(source.status),
        isoDate(source.due),
        String(source.acceptanceCriteria || source.note || '').slice(0, 4000),
        JSON.stringify(metadata)
      ]);
    }
  }

  async function syncCapas(client, records) {
    if (!Array.isArray(records)) return;
    await client.query('DELETE FROM capas WHERE workspace_id = $1', [workspaceId]);
    const seen = new Set();
    for (const [index, source] of records.entries()) {
      if (!source || typeof source !== 'object') continue;
      const capaNumber = String(source.id || `CAPA-${index + 1}`).slice(0, 80);
      if (seen.has(capaNumber)) continue;
      seen.add(capaNumber);
      const metadata = { ...source, id: capaNumber, __qualityos_order: index };
      await client.query(`INSERT INTO capas
        (workspace_id, capa_number, method, status, problem_statement, due_at, metadata)
        VALUES ($1, $2, $3, $4::record_status, $5, $6, $7::jsonb)`, [
        workspaceId,
        capaNumber,
        String(source.method || 'CAPA').slice(0, 40),
        actionStatus(source.status),
        String(source.problem || source.problemStatement || 'Unspecified quality problem').slice(0, 4000),
        isoDate(source.due),
        JSON.stringify(metadata)
      ]);
    }
  }

  async function syncInspections(client, records) {
    if (!Array.isArray(records)) return;
    await client.query('DELETE FROM inspections WHERE workspace_id = $1', [workspaceId]);
    const seen = new Set();
    for (const [index, source] of records.entries()) {
      if (!source || typeof source !== 'object') continue;
      const inspectionNumber = String(source.id || `INSP-${index + 1}`).slice(0, 80);
      if (seen.has(inspectionNumber)) continue;
      seen.add(inspectionNumber);
      const partNumber = String(source.part || `PART-${index + 1}`).slice(0, 80);
      const lotNumber = String(source.lot || `LOT-UNSPECIFIED-${index + 1}`).slice(0, 80);
      const partResult = await client.query(`INSERT INTO parts (workspace_id, part_number, description, revision)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (workspace_id, part_number, revision) DO UPDATE SET description = EXCLUDED.description
        RETURNING id`, [workspaceId, partNumber, `${partNumber} migrated from browser workspace`, 'prototype']);
      const partId = partResult.rows[0].id;
      const lotResult = await client.query(`INSERT INTO lots (workspace_id, lot_number, part_id, disposition)
        VALUES ($1, $2, $3, 'hold')
        ON CONFLICT (workspace_id, lot_number) DO UPDATE SET part_id = EXCLUDED.part_id
        RETURNING id`, [workspaceId, lotNumber, partId]);
      const metadata = { ...source, id: inspectionNumber, __qualityos_order: index };
      const measuredValue = numericValue(source.value);
      const unit = /\bGU\b/i.test(String(source.value || '')) ? 'GU' : 'mm';
      await client.query(`INSERT INTO inspections
        (workspace_id, lot_id, characteristic, measured_value, unit, result, defect_code, notes, spc_rule, spc_limit, metadata, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`, [
        workspaceId,
        lotResult.rows[0].id,
        String(source.characteristic || 'Unspecified characteristic').slice(0, 160),
        measuredValue,
        unit,
        String(source.result || 'Review').slice(0, 40),
        String(source.defectCode || '').slice(0, 80) || null,
        String(source.notes || '').slice(0, 4000),
        source.spcSignal?.rule ? String(source.spcSignal.rule).slice(0, 80) : null,
        numericValue(source.spcSignal?.limit),
        JSON.stringify(metadata),
        inspectionTimestamp(source.recordedAt)
      ]);
    }
  }

  async function read() {
    const pool = await getPool();
    const result = await pool.query('SELECT version, state, updated_at FROM workspace_state WHERE workspace_id = $1', [workspaceId]);
    const workspace = asWorkspace(result.rows[0]);
    const actions = await pool.query(`SELECT action_number, title, priority, status, due_at, metadata
      FROM corrective_actions WHERE workspace_id = $1
      ORDER BY NULLIF(metadata->>'__qualityos_order', '')::integer ASC NULLS LAST, updated_at DESC`, [workspaceId]);
    if (actions.rows.length) workspace.data = { ...workspace.data, actions: actions.rows.map(mapAction) };
    const capas = await pool.query(`SELECT capa_number, method, status, problem_statement, due_at, metadata
      FROM capas WHERE workspace_id = $1
      ORDER BY NULLIF(metadata->>'__qualityos_order', '')::integer ASC NULLS LAST, updated_at DESC`, [workspaceId]);
    if (capas.rows.length) workspace.data = { ...workspace.data, capas: capas.rows.map(mapCapa) };
    const inspections = await pool.query(`SELECT i.id, i.characteristic, i.measured_value, i.unit, i.result, i.defect_code, i.notes, i.spc_rule, i.spc_limit, i.recorded_at, i.metadata, l.lot_number, p.part_number
      FROM inspections i JOIN lots l ON l.id = i.lot_id JOIN parts p ON p.id = l.part_id
      WHERE i.workspace_id = $1
      ORDER BY NULLIF(i.metadata->>'__qualityos_order', '')::integer ASC NULLS LAST, i.recorded_at DESC`, [workspaceId]);
    if (inspections.rows.length) workspace.data = { ...workspace.data, inspectionRecords: inspections.rows.map(mapInspection) };
    return workspace;
  }

  async function write(payload, expectedEtag = '') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureWorkspace(client);
      const result = await client.query('SELECT version, state, updated_at FROM workspace_state WHERE workspace_id = $1 FOR UPDATE', [workspaceId]);
      const current = asWorkspace(result.rows[0]);
      const currentEtag = workspaceEtag(current);
      if (expectedEtag && expectedEtag !== '*' && expectedEtag !== currentEtag) {
        await client.query('ROLLBACK');
        return { conflict: true, workspace: current, etag: currentEtag };
      }
      const next = { format: workspaceFormat, version: workspaceVersion, updatedAt: new Date().toISOString(), data: payload.data };
      await syncActions(client, next.data.actions);
      await syncCapas(client, next.data.capas);
      await syncInspections(client, next.data.inspectionRecords);
      await client.query(`INSERT INTO workspace_state (workspace_id, version, state, updated_at)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (workspace_id) DO UPDATE SET version = EXCLUDED.version, state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`, [workspaceId, next.version, JSON.stringify(next.data), next.updatedAt]);
      await client.query('COMMIT');
      return { workspace: next, etag: workspaceEtag(next) };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve the original database error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  return { kind: 'postgres', read, write };
}
