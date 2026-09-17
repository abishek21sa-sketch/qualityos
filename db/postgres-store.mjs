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

  async function read() {
    const pool = await getPool();
    const result = await pool.query('SELECT version, state, updated_at FROM workspace_state WHERE workspace_id = $1', [workspaceId]);
    return asWorkspace(result.rows[0]);
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
