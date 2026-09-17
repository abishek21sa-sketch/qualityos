import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qualityos-api-'));
const server = createServer({ workspaceFile: path.join(temporaryRoot, 'workspace.json'), apiToken: 'test-token' });
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
  assert.equal(overview.workspace.id, 'apex-motion-plant-04');
  assert.equal(overview.metrics.activeSignals, 14);

  const aliasResponse = await fetch(`${baseUrl}/api/workspace/overview`);
  assert.equal(aliasResponse.status, 200);

  const unauthorizedResponse = await fetch(`${baseUrl}/api/workspace`);
  assert.equal(unauthorizedResponse.status, 401);

  const initialWorkspaceResponse = await fetch(`${baseUrl}/api/workspace`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal(initialWorkspaceResponse.status, 200);
  const initialWorkspace = await initialWorkspaceResponse.json();
  assert.equal(initialWorkspace.format, 'QualityOS server workspace');

  const invalidWorkspaceResponse = await fetch(`${baseUrl}/api/workspace`, { method: 'PUT', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'Unsupported', version: 1, data: {} }) });
  assert.equal(invalidWorkspaceResponse.status, 400);

  const workspacePayload = { format: 'QualityOS browser workspace', version: 1, data: { actions: [{ id: 'CA-TEST', status: 'Open' }], auditFilter: 'All events' } };
  const writeResponse = await fetch(`${baseUrl}/api/workspace`, { method: 'PUT', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(workspacePayload) });
  assert.equal(writeResponse.status, 200);
  const savedWorkspace = await writeResponse.json();
  assert.equal(savedWorkspace.data.actions[0].id, 'CA-TEST');
  assert.match(savedWorkspace.updatedAt, /^20/);

  const readResponse = await fetch(`${baseUrl}/api/workspace`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal((await readResponse.json()).data.auditFilter, 'All events');

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
