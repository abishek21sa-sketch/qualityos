import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

const server = createServer();
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

  const staticResponse = await fetch(`${baseUrl}/`);
  assert.equal(staticResponse.status, 200);
  assert.match(await staticResponse.text(), /QualityOS/);

  const missingResponse = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(missingResponse.status, 404);
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('QualityOS API smoke test passed.');
