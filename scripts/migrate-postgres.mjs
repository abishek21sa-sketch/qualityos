import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsRoot = path.join(projectRoot, 'db', 'migrations');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log('QualityOS database migration skipped: DATABASE_URL is not set.');
  process.exit(0);
}

const { Client } = await import('pg');
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS qualityos_schema_migrations (
    migration_id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

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

  console.log(`QualityOS database migrations checked (${migrationFiles.length} file${migrationFiles.length === 1 ? '' : 's'}).`);
} finally {
  await client.end();
}
