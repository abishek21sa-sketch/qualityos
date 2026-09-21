import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qualityos-api-'));
const server = createServer({ workspaceFile: path.join(temporaryRoot, 'workspace.json'), apiToken: 'test-token', apiTokens: [{ token: 'supplier-token', subject: 'supplier-portal', role: 'supplier', workspaceId: 'qualityos-local-analysis' }, { token: 'wrong-workspace-token', subject: 'other-plant', role: 'quality_engineer', workspaceId: 'other-plant' }] });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.service, 'qualityos-api');
  assert.equal(health.status, 'ok');

  const overviewResponse = await fetch(`${baseUrl}/api/quality/overview`);
  assert.equal(overviewResponse.status, 200);
  const overview = await overviewResponse.json();
  assert.equal(overview.workspace.id, 'qualityos-local-analysis');
  assert.equal(overview.workspace.mode, 'offline-csv');
  assert.equal(overview.dataSource.connected, false);
  assert.equal(overview.dataSource.recordCount, 0);
  assert.equal(overview.metrics, null);

  const aliasResponse = await fetch(`${baseUrl}/api/workspace/overview`);
  assert.equal(aliasResponse.status, 200);

  const unauthorizedResponse = await fetch(`${baseUrl}/api/workspace`);
  assert.equal(unauthorizedResponse.status, 401);

  const sessionResponse = await fetch(`${baseUrl}/api/session`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.equal(session.subject, 'legacy-api-token');
  assert.equal(session.role, 'admin');
  assert.equal(session.permissions.mutate, true);

  const supplierSessionResponse = await fetch(`${baseUrl}/api/session`, { headers: { Authorization: 'Bearer supplier-token' } });
  assert.equal(supplierSessionResponse.status, 200);
  const supplierSession = await supplierSessionResponse.json();
  assert.equal(supplierSession.subject, 'supplier-portal');
  assert.equal(supplierSession.role, 'supplier');
  assert.equal(supplierSession.permissions.mutate, false);

  const wrongWorkspaceSessionResponse = await fetch(`${baseUrl}/api/session`, { headers: { Authorization: 'Bearer wrong-workspace-token' } });
  assert.equal(wrongWorkspaceSessionResponse.status, 403);

  const supplierWorkspaceReadResponse = await fetch(`${baseUrl}/api/workspace`, { headers: { Authorization: 'Bearer supplier-token' } });
  assert.equal(supplierWorkspaceReadResponse.status, 200);

  const initialWorkspaceResponse = await fetch(`${baseUrl}/api/workspace`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal(initialWorkspaceResponse.status, 200);
  const initialWorkspace = await initialWorkspaceResponse.json();
  assert.equal(initialWorkspace.format, 'QualityOS server workspace');
  assert.match(initialWorkspaceResponse.headers.get('etag') || '', /^"[a-f0-9]{64}"$/);

  const invalidWorkspaceResponse = await fetch(`${baseUrl}/api/workspace`, { method: 'PUT', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'Unsupported', version: 1, data: {} }) });
  assert.equal(invalidWorkspaceResponse.status, 400);

  const workspacePayload = { format: 'QualityOS browser workspace', version: 1, data: { actions: [{ id: 'CA-TEST', status: 'Open' }], auditFilter: 'All events' } };
  const writeResponse = await fetch(`${baseUrl}/api/workspace`, { method: 'PUT', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(workspacePayload) });
  assert.equal(writeResponse.status, 200);
  const savedWorkspace = await writeResponse.json();
  assert.equal(savedWorkspace.data.actions[0].id, 'CA-TEST');
  assert.match(savedWorkspace.updatedAt, /^20/);
  assert.notEqual(savedWorkspace.etag, initialWorkspace.etag);

  const staleWorkspaceResponse = await fetch(`${baseUrl}/api/workspace`, { method: 'PUT', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'If-Match': initialWorkspace.etag }, body: JSON.stringify(workspacePayload) });
  assert.equal(staleWorkspaceResponse.status, 409);
  assert.match((await staleWorkspaceResponse.json()).error, /changed since/);

  const readResponse = await fetch(`${baseUrl}/api/workspace`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal((await readResponse.json()).data.auditFilter, 'All events');

  const actionListResponse = await fetch(`${baseUrl}/api/records/actions`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal(actionListResponse.status, 200);
  const actionList = await actionListResponse.json();
  assert.equal(actionList.items[0].id, 'CA-TEST');
  assert.equal(actionList.etag, savedWorkspace.etag);

  const supplierActionListResponse = await fetch(`${baseUrl}/api/records/actions`, { headers: { Authorization: 'Bearer supplier-token' } });
  assert.equal(supplierActionListResponse.status, 200);

  const supplierCreateResponse = await fetch(`${baseUrl}/api/records/actions`, { method: 'POST', headers: { Authorization: 'Bearer supplier-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'CA-SUPPLIER-1', title: 'Should be denied' }) });
  assert.equal(supplierCreateResponse.status, 403);

  const createRecordResponse = await fetch(`${baseUrl}/api/records/actions`, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'If-Match': actionList.etag }, body: JSON.stringify({ id: 'CA-API-1', title: 'Verify API record path', status: 'Open' }) });
  assert.equal(createRecordResponse.status, 201);
  const createdRecord = await createRecordResponse.json();
  assert.equal(createdRecord.record.id, 'CA-API-1');
  assert.match(createdRecord.etag, /^"[a-f0-9]{64}"$/);

  const patchRecordResponse = await fetch(`${baseUrl}/api/records/actions/CA-API-1`, { method: 'PATCH', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'If-Match': createdRecord.etag }, body: JSON.stringify({ status: 'In progress' }) });
  assert.equal(patchRecordResponse.status, 200);
  const patchedRecord = await patchRecordResponse.json();
  assert.equal(patchedRecord.record.status, 'In progress');

  const staleRecordResponse = await fetch(`${baseUrl}/api/records/actions/CA-API-1`, { method: 'PATCH', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'If-Match': createdRecord.etag }, body: JSON.stringify({ status: 'Closed' }) });
  assert.equal(staleRecordResponse.status, 409);

  const readRecordResponse = await fetch(`${baseUrl}/api/records/actions/CA-API-1`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal((await readRecordResponse.json()).record.status, 'In progress');

  const raceBaseResponse = await fetch(`${baseUrl}/api/workspace`, { headers: { Authorization: 'Bearer test-token' } });
  const raceBase = await raceBaseResponse.json();
  const racePayload = marker => ({ format: 'QualityOS browser workspace', version: 1, data: { ...raceBase.data, concurrentWriteMarker: marker } });
  const racingWrites = await Promise.all(['writer-a', 'writer-b'].map(marker => fetch(`${baseUrl}/api/workspace`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'If-Match': raceBase.etag },
    body: JSON.stringify(racePayload(marker))
  })));
  assert.deepEqual(racingWrites.map(response => response.status).sort(), [200, 409]);
  const raceFinalResponse = await fetch(`${baseUrl}/api/workspace`, { headers: { Authorization: 'Bearer test-token' } });
  const raceFinal = await raceFinalResponse.json();
  assert.ok(['writer-a', 'writer-b'].includes(raceFinal.data.concurrentWriteMarker));

  const unsupportedCollectionResponse = await fetch(`${baseUrl}/api/records/users`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal(unsupportedCollectionResponse.status, 404);

  const staticResponse = await fetch(`${baseUrl}/`);
  assert.equal(staticResponse.status, 200);
  assert.match(await staticResponse.text(), /QualityOS/);

  const missingResponse = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(missingResponse.status, 404);
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log('QualityOS API smoke test passed.');
