import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('outputs/index.html', 'utf8');
const qualityLabScript = fs.readFileSync('outputs/quality-lab.js', 'utf8');
const qualityLabModel = fs.readFileSync('outputs/quality-lab-model.js', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const postgresStore = fs.readFileSync('db/postgres-store.mjs', 'utf8');
const postgresStoreTest = fs.readFileSync('scripts/test-postgres-store.mjs', 'utf8');
const migrationRunner = fs.readFileSync('db/migration-runner.mjs', 'utf8');
const migrationCli = fs.readFileSync('scripts/migrate-postgres.mjs', 'utf8');
const migrationTest = fs.readFileSync('scripts/test-migrations.mjs', 'utf8');
const pagesWorkflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const evidenceMigration = fs.readFileSync('db/migrations/002_evidence_metadata.sql', 'utf8');
const auditMigration = fs.readFileSync('db/migrations/003_append_only_audit.sql', 'utf8');
new vm.Script(qualityLabScript, { filename: 'outputs/quality-lab.js' });
new vm.Script(qualityLabModel, { filename: 'outputs/quality-lab-model.js' });
for (const marker of ['quality-lab.css', 'quality-lab-model.js', 'quality-lab.js']) {
  if (!html.includes(marker)) throw new Error(`Quality Lab asset is not linked from the app: ${marker}`);
}
for (const marker of ['No inspection data is loaded', 'Select inspection CSV', 'not uploaded', 'no MES / PLC connection', 'Control limits are estimated from the selected data']) {
  if (!qualityLabScript.includes(marker)) throw new Error(`Quality Lab transparency marker missing: ${marker}`);
}
for (const marker of ['parseCsv', 'prepareMeasurements', 'I–MR', 'X̄–R', '8 consecutive points', '6 consecutive points', 'capability']) {
  if (!qualityLabModel.includes(marker)) throw new Error(`Quality Lab analysis marker missing: ${marker}`);
}
for (const marker of ['Instrument / gage', 'Calibration due date', 'Expired calibration rows']) {
  if (!qualityLabScript.includes(marker)) throw new Error(`Quality Lab traceability marker missing: ${marker}`);
}
if (server.includes('fixture-backed') || server.includes('activeSignals: 14')) throw new Error('API overview must not publish fixture-backed live-looking metrics.');
if (!html.includes('<body class="quality-lab-mode">')) throw new Error('The empty-by-default Quality Lab must be the visible app shell.');
for (const marker of ['Maya Chen', 'Apex Motion', 'NCR-0264', 'shift-handoff.js', 'shift-handoff-model.js']) {
  if (html.includes(marker)) throw new Error(`Legacy demo content must not ship in the visible app: ${marker}`);
}
const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
if (vercelConfig.outputDirectory !== 'outputs' || vercelConfig.framework !== null) {
  throw new Error('Vercel must serve the static outputs/ directory without framework detection.');
}
const vercelHeaders = vercelConfig.headers?.find(entry => entry.source === '/(.*)')?.headers || [];
for (const [key, value] of [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), geolocation=(), microphone=()']
]) {
  if (!vercelHeaders.some(header => header.key === key && header.value === value)) {
    throw new Error(`Vercel security header missing or changed: ${key}`);
  }
}
const schema = fs.readFileSync('db/schema.sql', 'utf8');

for (const marker of ['npm test', "vars.ENABLE_GITHUB_PAGES == 'true'", "github.ref == 'refs/heads/main'", 'actions/deploy-pages@v4']) {
  if (!pagesWorkflow.includes(marker)) throw new Error(`GitHub workflow marker missing: ${marker}`);
}

for (const marker of ['CREATE TABLE workspaces', 'CREATE TABLE inspections', 'CREATE TABLE audit_events', 'source_key text', 'audit_events_workspace_source_key_uq']) {
  if (!schema.includes(marker)) throw new Error(`Database schema marker missing: ${marker}`);
}

for (const marker of ['recordRoute', 'recordCollections', 'hasWorkspaceAccess', 'fileWriteQueue', "['GET', 'POST', 'PATCH']"]) {
  if (!server.includes(marker)) throw new Error(`API route marker missing: ${marker}`);
}

for (const marker of ['createPostgresWorkspaceStore', 'workspace_state', 'corrective_actions', 'syncActions', 'syncCapas', 'syncInspections', 'syncEvidence', 'syncAuditEvents', 'audit_events', 'workspaces WHERE id = $1 FOR UPDATE', 'capas', 'inspections', 'evidence', 'FOR UPDATE']) {
  if (!postgresStore.includes(marker)) throw new Error(`PostgreSQL adapter marker missing: ${marker}`);
}
for (const marker of ['poolFactory', 'readFrom', 'workspaceEtag']) {
  if (!postgresStore.includes(marker)) throw new Error(`PostgreSQL adapter test hook missing: ${marker}`);
}
for (const marker of ['fresh ETag from GET', 'old ETag', 'empty normalized collection']) {
  if (!postgresStoreTest.includes(marker)) throw new Error(`PostgreSQL adapter regression marker missing: ${marker}`);
}

for (const marker of ['qualityos_schema_migrations', 'baselineSchemaPath', 'to_regclass', 'pg_advisory_lock', 'BEGIN', 'COMMIT', 'ROLLBACK']) {
  if (!migrationRunner.includes(marker)) throw new Error(`Migration runner marker missing: ${marker}`);
}
for (const marker of ['DATABASE_URL', 'runMigrations', 'client.end']) {
  if (!migrationCli.includes(marker)) throw new Error(`Migration CLI marker missing: ${marker}`);
}
for (const marker of ['repeat migration run should be idempotent', 'existing schema must not replay baseline', 'failed migration should roll back']) {
  if (!migrationTest.includes(marker)) throw new Error(`Migration runner regression marker missing: ${marker}`);
}
if (!evidenceMigration.includes('ADD COLUMN IF NOT EXISTS metadata')) throw new Error('Evidence migration marker missing.');
if (!auditMigration.includes('ADD COLUMN IF NOT EXISTS source_key')) throw new Error('Audit migration marker missing.');

console.log(`QualityOS validation passed (${html.length} HTML bytes).`);
