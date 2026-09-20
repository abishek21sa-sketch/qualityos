import fs from 'node:fs/promises';
import path from 'node:path';

const advisoryLockKey = 'qualityos-schema-migrations';
const baselineMigrationId = '000_baseline_schema';

export async function runMigrations(client, { migrationsRoot, baselineSchemaPath, logger = console } = {}) {
  if (!client || !migrationsRoot || !baselineSchemaPath) throw new Error('A connected PostgreSQL client and migration paths are required.');
  let advisoryLockAcquired = false;
  const applied = [];

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [advisoryLockKey]);
    advisoryLockAcquired = true;
    await client.query(`CREATE TABLE IF NOT EXISTS qualityos_schema_migrations (
      migration_id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const baseline = await client.query('SELECT 1 FROM qualityos_schema_migrations WHERE migration_id = $1', [baselineMigrationId]);
    if (!baseline.rows.length) {
      const schemaState = await client.query("SELECT to_regclass('public.workspaces') AS workspaces_table");
      if (!schemaState.rows[0]?.workspaces_table) {
        const baselineSql = await fs.readFile(baselineSchemaPath, 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(baselineSql);
          await client.query('INSERT INTO qualityos_schema_migrations (migration_id) VALUES ($1)', [baselineMigrationId]);
          await client.query('COMMIT');
          applied.push(baselineMigrationId);
          logger.log('Applied QualityOS baseline PostgreSQL schema.');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } else {
        await client.query('INSERT INTO qualityos_schema_migrations (migration_id) VALUES ($1) ON CONFLICT DO NOTHING', [baselineMigrationId]);
        logger.log('Existing QualityOS PostgreSQL schema detected; baseline SQL was not replayed.');
      }
    }

    const migrationFiles = (await fs.readdir(migrationsRoot, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
      .map(entry => entry.name)
      .sort();

    for (const migrationId of migrationFiles) {
      const existing = await client.query('SELECT 1 FROM qualityos_schema_migrations WHERE migration_id = $1', [migrationId]);
      if (existing.rows.length) continue;
      const sql = await fs.readFile(path.join(migrationsRoot, migrationId), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO qualityos_schema_migrations (migration_id) VALUES ($1)', [migrationId]);
        await client.query('COMMIT');
        applied.push(migrationId);
        logger.log(`Applied QualityOS database migration: ${migrationId}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return { applied, checked: migrationFiles.length + 1 };
  } finally {
    if (advisoryLockAcquired) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [advisoryLockKey]);
  }
}
