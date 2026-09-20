import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../db/migration-runner.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log('QualityOS database migration skipped: DATABASE_URL is not set.');
} else {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const result = await runMigrations(client, {
      migrationsRoot: path.join(projectRoot, 'db', 'migrations'),
      baselineSchemaPath: path.join(projectRoot, 'db', 'schema.sql')
    });
    console.log(`QualityOS database migrations checked (${result.checked} steps; ${result.applied.length} applied).`);
  } finally {
    await client.end();
  }
}
