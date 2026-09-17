import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('outputs/index.html', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const scriptStart = html.indexOf('<script>') + '<script>'.length;
const scriptEnd = html.indexOf('</script>', scriptStart);

if (scriptStart < '<script>'.length || scriptEnd < 0) {
  throw new Error('Embedded application script was not found.');
}

new vm.Script(html.slice(scriptStart, scriptEnd), { filename: 'outputs/index.html' });
JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const schema = fs.readFileSync('db/schema.sql', 'utf8');

const requiredMarkers = [
  'QualityOS',
  'Burr height is trending above the upper control limit',
  'NCR-0264',
  'containmentChecklist',
  'evidenceRequestModal',
  'capaModal',
  'exportQualityPacket',
  'apiSyncModal',
  'apiRequest'
];

for (const marker of requiredMarkers) {
  if (!html.includes(marker)) throw new Error(`Required marker missing: ${marker}`);
}

for (const marker of ['CREATE TABLE workspaces', 'CREATE TABLE inspections', 'CREATE TABLE audit_events']) {
  if (!schema.includes(marker)) throw new Error(`Database schema marker missing: ${marker}`);
}

for (const marker of ['recordRoute', 'recordCollections', "['GET', 'POST', 'PATCH']"]) {
  if (!server.includes(marker)) throw new Error(`API route marker missing: ${marker}`);
}

console.log(`QualityOS validation passed (${html.length} HTML bytes).`);
