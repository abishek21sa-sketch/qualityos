import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsRoot = path.join(projectRoot, 'db', 'migrations');
const baselineSchemaPath = path.join(projectRoot, 'db', 'schema.sql');
const databaseUrl = process.env.DATABASE_URL;
const baselineMigrationId = '000_baseline_schema';

if (!databaseUrl) {
  console.log('QualityOS database migration skipped: DATABASE_URL is not set.');
  process.exit(0);
}

const { Client } = await import('pg');
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['qualityos-schema-migrations']);
  await client.query(`CREATE TABLE IF NOT EXISTS qualityos_schema_migrations (
    migration_id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const baseline = await client.query('SELECT 1 FROM qualityos_schema_migrations WHERE migration_id = $1', [baselineMigrationId]);
  if (!baseline.rowCount) {
    const schemaState = await client.query("SELECT to_regclass('public.workspaces') AS workspaces_table");
    if (!schemaState.rows[0]?.workspaces_table) {
      const baselineSql = await fs.readFile(baselineSchemaPath, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(baselineSql);
        await client.query('INSERT INTO qualityos_schema_migrations (migration_id) VALUES ($1)', [baselineMigrationId]);
        await client.query('COMMIT');
        console.log('Applied QualityOS baseline PostgreSQL schema.');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } else {
      await client.query('INSERT INTO qualityos_schema_migrations (migration_id) VALUES ($1) ON CONFLICT DO NOTHING', [baselineMigrationId]);
      console.log('Existing QualityOS PostgreSQL schema detected; baseline SQL was not replayed.');
    }
  }

  const migrationFiles = (await fs.readdir(migrationsRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => entry.name)
    .sort();

  for (const migrationId of migrationFiles) {
    const existing = await client.query('SELECT 1 FROM qualityos_schema_migrations WHERE migration_id = $1', [migrationId]);
    if (existing.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsRoot, migrationId), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO qualityos_schema_migrations (migration_id) VALUES ($1)', [migrationId]);
      await client.query('COMMIT');
      console.log(`Applied QualityOS database migration: ${migrationId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log(`QualityOS database migrations checked (${migrationFiles.length + 1} step${migrationFiles.length === 0 ? '' : 's'} including baseline).`);
} finally {
  await client.end();
}
