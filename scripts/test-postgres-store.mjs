import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPostgresWorkspaceStore } from '../db/postgres-store.mjs';

function etag(workspace) {
  return `"${createHash('sha256').update(JSON.stringify(workspace)).digest('hex')}"`;
}

function createFakePool() {
  const state = { workspace: null, actions: [], evidence: [], auditEvents: [] };

  async function query(sql, params = []) {
    const statement = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (['begin', 'commit', 'rollback'].includes(statement)) return { rows: [], rowCount: 0 };
    if (statement.startsWith('insert into workspaces')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('select id from workspaces where id = $1 for update')) return { rows: [{ id: params[0] }], rowCount: 1 };
    if (statement.startsWith('select version, state, updated_at from workspace_state')) {
      return { rows: state.workspace ? [{ ...state.workspace }] : [], rowCount: state.workspace ? 1 : 0 };
    }
    if (statement.startsWith('delete from corrective_actions')) {
      state.actions = [];
      return { rows: [], rowCount: 0 };
    }
    if (statement.startsWith('insert into corrective_actions')) {
      const [workspaceId, actionNumber, title, priority, status, dueAt, acceptanceCriteria, metadata] = params;
      state.actions.push({ workspace_id: workspaceId, action_number: actionNumber, title, priority, status, due_at: dueAt, acceptance_criteria: acceptanceCriteria, metadata: JSON.parse(metadata) });
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes('from corrective_actions')) return { rows: state.actions.map(row => ({ ...row })), rowCount: state.actions.length };
    if (statement.startsWith('delete from evidence')) {
      state.evidence = [];
      return { rows: [], rowCount: 0 };
    }
    if (statement.startsWith('insert into evidence')) {
      const [workspaceId, fileName, contentType, objectKey, status, metadata] = params;
      state.evidence.push({ id: `evidence-${state.evidence.length + 1}`, workspace_id: workspaceId, file_name: fileName, content_type: contentType, object_key: objectKey, status, metadata: JSON.parse(metadata) });
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes('from evidence where')) return { rows: state.evidence.map(row => ({ ...row })), rowCount: state.evidence.length };
    if (statement.startsWith('insert into audit_events')) {
      const [workspaceId, sourceKey, eventType, detail, createdAt] = params;
      if (!state.auditEvents.some(row => row.workspace_id === workspaceId && row.source_key === sourceKey)) {
        state.auditEvents.push({ id: `audit-${state.auditEvents.length + 1}`, workspace_id: workspaceId, source_key: sourceKey, entity_type: 'workspace', event_type: eventType, detail: JSON.parse(detail), created_at: createdAt });
      }
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes('from audit_events where')) {
      const rows = state.auditEvents.slice().sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at) || right.id.localeCompare(left.id)).slice(0, 200);
      return { rows: rows.map(row => ({ ...row })), rowCount: rows.length };
    }
    if (statement.includes('from capas where')) return { rows: [], rowCount: 0 };
    if (statement.includes('from inspections i join lots')) return { rows: [], rowCount: 0 };
    if (statement.startsWith('insert into workspace_state')) {
      const [workspaceId, version, jsonState, updatedAt] = params;
      state.workspace = { workspace_id: workspaceId, version, state: JSON.parse(jsonState), updated_at: updatedAt };
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected fake PostgreSQL query: ${statement}`);
  }

  return { query, connect: async () => ({ query, release() {} }) };
}

const pool = createFakePool();
const store = createPostgresWorkspaceStore({ databaseUrl: 'postgres://qualityos-test', poolFactory: () => pool });
const initial = await store.read();
const initialTag = etag(initial);

const firstPayload = {
  data: {
    actions: [{ id: 'CA-TEST-1', title: 'Confirm ETag round-trip', status: 'In progress' }],
    evidenceRequests: [{ supplier: 'Northstar', kind: 'Setup sheet', status: 'Requested' }],
    localEvidence: [{ id: 'LE-TEST-1', name: 'setup.pdf', type: 'application/pdf', size: 128, status: 'Review', dataUrl: 'data:application/pdf;base64,VEVTVA==' }],
    activityEvents: [{ id: 'AE-TEST-1', icon: '✓', tone: 'green', title: 'Evidence reviewed', detail: 'Setup sheet accepted', time: 'Sep 20, 2026, 10:30 AM', occurredAt: '2026-09-20T15:30:00.000Z' }]
  }
};
const firstWrite = await store.write(firstPayload, initialTag);
assert.equal(firstWrite.conflict, undefined);
assert.equal(firstWrite.workspace.data.actions[0].priority, 'Medium');
assert.equal(firstWrite.workspace.data.evidenceRequests[0].id, 'EV-1');
assert.equal(firstWrite.workspace.data.activityEvents[0].id, 'AE-TEST-1');

const persistedEvidence = pool.query ? await pool.query('SELECT id, file_name, content_type, status, metadata FROM evidence WHERE workspace_id = $1', []) : { rows: [] };
assert.equal(persistedEvidence.rows.find(row => row.metadata.recordType === 'attachment').metadata.dataUrl, undefined);

const canonicalRead = await store.read();
assert.equal(etag(canonicalRead), firstWrite.etag, 'the ETag returned by PUT must match the subsequent canonical GET');
const updatedPayload = { data: { ...canonicalRead.data, actions: [{ ...canonicalRead.data.actions[0], status: 'Closed' }] } };
const secondWrite = await store.write(updatedPayload, firstWrite.etag);
assert.equal(secondWrite.conflict, undefined, 'a fresh ETag from GET must allow the next write');
assert.equal(etag(await store.read()), secondWrite.etag);
assert.equal(secondWrite.workspace.data.activityEvents.length, 1, 'syncing the same audit event again must not duplicate it');

const withSecondEvent = await store.read();
const appendPayload = { data: { ...withSecondEvent.data, activityEvents: [
  { id: 'AE-TEST-2', icon: '!', tone: 'red', title: 'Containment escalated', detail: 'Lot remains on hold', time: 'Sep 20, 2026, 10:32 AM', occurredAt: '2026-09-20T15:32:00.000Z' },
  ...withSecondEvent.data.activityEvents
] } };
const appendResult = await store.write(appendPayload, etag(withSecondEvent));
assert.equal(appendResult.conflict, undefined);
assert.equal(appendResult.workspace.data.activityEvents.length, 2);

const staleWrite = await store.write(updatedPayload, firstWrite.etag);
assert.equal(staleWrite.conflict, true, 'an old ETag must still be rejected after the canonicalization fix');

const current = await store.read();
const cleared = await store.write({ data: { ...current.data, actions: [], evidenceRequests: [], localEvidence: [], activityEvents: [] } }, etag(current));
assert.deepEqual(cleared.workspace.data.actions, []);
assert.deepEqual(cleared.workspace.data.evidenceRequests, []);
assert.deepEqual((await store.read()).data.actions, [], 'an empty normalized collection must not revive stale JSON records');
assert.equal((await store.read()).data.activityEvents.length, 2, 'shorter local history must not delete the append-only server audit copy');

console.log('QualityOS PostgreSQL workspace adapter tests passed.');
