import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('outputs/index.html', 'utf8');
const scriptStart = html.indexOf('<script>') + '<script>'.length;
const scriptEnd = html.indexOf('</script>', scriptStart);

if (scriptStart < '<script>'.length || scriptEnd < 0) {
  throw new Error('Embedded application script was not found.');
}

new vm.Script(html.slice(scriptStart, scriptEnd), { filename: 'outputs/index.html' });
JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

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

console.log(`QualityOS validation passed (${html.length} HTML bytes).`);
