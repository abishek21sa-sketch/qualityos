import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '../db/migration-runner.mjs';

class FakeMigrationClient {
  constructor({ hasBaselineSchema = false, applied = [] } = {}) {
    this.hasBaselineSchema = hasBaselineSchema;
    this.applied = new Set(applied);
    this.executedSql = [];
    this.rollbacks = 0;
    this.locks = 0;
    this.unlocks = 0;
  }

  async query(sql, params = []) {
    const statement = sql.trim();
    if (statement.startsWith('SELECT pg_advisory_lock')) {
      this.locks += 1;
      return { rows: [] };
    }
    if (statement.startsWith('SELECT pg_advisory_unlock')) {
      this.unlocks += 1;
      return { rows: [] };
    }
    if (statement.startsWith('SELECT 1 FROM qualityos_schema_migrations')) {
      return { rows: this.applied.has(params[0]) ? [{ '?column?': 1 }] : [] };
    }
    if (statement.startsWith("SELECT to_regclass('public.workspaces')")) {
      return { rows: [{ workspaces_table: this.hasBaselineSchema ? 'workspaces' : null }] };
    }
    if (statement === 'ROLLBACK') {
      this.rollbacks += 1;
      return { rows: [] };
    }
    if (statement.startsWith('INSERT INTO qualityos_schema_migrations')) {
      this.applied.add(params[0]);
      return { rows: [] };
    }
    if (statement === 'BEGIN' || statement === 'COMMIT' || statement.startsWith('CREATE TABLE IF NOT EXISTS qualityos_schema_migrations')) {
      return { rows: [] };
    }
    if (statement.includes('FAIL_MIGRATION')) throw new Error('synthetic migration failure');
    this.executedSql.push(statement);
    if (statement.includes('FAKE_BASELINE_SCHEMA')) this.hasBaselineSchema = true;
    return { rows: [] };
  }
}

async function createFixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qualityos-migrations-'));
  const migrationsRoot = path.join(root, 'migrations');
  await fs.mkdir(migrationsRoot);
  const baselineSchemaPath = path.join(root, 'schema.sql');
  await fs.writeFile(baselineSchemaPath, 'FAKE_BASELINE_SCHEMA;');
  for (const [name, contents] of Object.entries(files)) {
    await fs.writeFile(path.join(migrationsRoot, name), contents);
  }
  return { root, migrationsRoot, baselineSchemaPath };
}

const logger = { log() {} };

try {
  const fresh = await createFixture({
    '002_second.sql': 'FAKE_MIGRATION_002;',
    '001_first.sql': 'FAKE_MIGRATION_001;'
  });
  try {
    const client = new FakeMigrationClient();
    const firstRun = await runMigrations(client, { ...fresh, logger });
    assert.deepEqual(firstRun.applied, ['000_baseline_schema', '001_first.sql', '002_second.sql']);
    assert.equal(firstRun.checked, 3);
    assert.equal(client.executedSql[0], 'FAKE_BASELINE_SCHEMA;');
    assert.deepEqual(client.locks, 1);
    assert.deepEqual(client.unlocks, 1);

    const secondRun = await runMigrations(client, { ...fresh, logger });
    assert.deepEqual(secondRun.applied, [], 'repeat migration run should be idempotent');
    assert.equal(client.executedSql.length, 3, 'repeat migration run must not reapply SQL');
    assert.equal(client.locks, 2);
    assert.equal(client.unlocks, 2);
  } finally {
    await fs.rm(fresh.root, { recursive: true, force: true });
  }

  const existing = await createFixture({ '001_upgrade.sql': 'FAKE_MIGRATION_UPGRADE;' });
  try {
    const client = new FakeMigrationClient({ hasBaselineSchema: true });
    const result = await runMigrations(client, { ...existing, logger });
    assert.deepEqual(result.applied, ['001_upgrade.sql']);
    assert.equal(client.executedSql.includes('FAKE_BASELINE_SCHEMA;'), false, 'existing schema must not replay baseline');
    assert.equal(client.applied.has('000_baseline_schema'), true, 'existing schema must be marked as baseline');
  } finally {
    await fs.rm(existing.root, { recursive: true, force: true });
  }

  const failing = await createFixture({ '001_failure.sql': 'FAIL_MIGRATION;' });
  try {
    const client = new FakeMigrationClient();
    await assert.rejects(runMigrations(client, { ...failing, logger }), /synthetic migration failure/);
    assert.equal(client.rollbacks, 1, 'failed migration should roll back its transaction');
    assert.equal(client.applied.has('001_failure.sql'), false, 'failed migration must not be marked applied');
    assert.equal(client.unlocks, 1, 'advisory lock should be released after failure');
  } finally {
    await fs.rm(failing.root, { recursive: true, force: true });
  }

  console.log('PostgreSQL migration runner tests passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
