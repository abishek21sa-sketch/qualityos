import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('outputs/index.html', 'utf8');
const start = html.indexOf('    function createActivityEventId()');
const end = html.indexOf('    function loadActivityEvents()', start);
assert.ok(start >= 0 && end > start, 'audit event migration helper must remain embedded in the UI');
const helpers = html.slice(start, end);

let idCount = 0;
let storedValue = null;
let writeCount = 0;
const context = vm.createContext({
  crypto: { randomUUID: () => `audit-id-${++idCount}` },
  localStorage: {
    setItem(key, value) {
      assert.equal(key, 'qualityos-activity-events');
      storedValue = value;
      writeCount += 1;
    }
  }
});

context.legacyInput = [
  { title: 'Legacy event one', time: 'Just now' },
  null,
  { id: 'already-stable', title: 'Existing event' },
  { title: 'Legacy event two', time: 'Just now' }
];
vm.runInContext(`${helpers}\nglobalThis.normalized = normalizeLegacyActivityEvents(globalThis.legacyInput);`, context);
const normalized = JSON.parse(JSON.stringify(context.normalized));
assert.deepEqual(normalized.map(event => event.id), ['audit-id-1', 'already-stable', 'audit-id-2']);
assert.equal(writeCount, 1, 'migrated IDs should be saved once');

context.legacyInput = JSON.parse(storedValue);
vm.runInContext('globalThis.normalized = normalizeLegacyActivityEvents(globalThis.legacyInput);', context);
assert.deepEqual(JSON.parse(JSON.stringify(context.normalized)).map(event => event.id), ['audit-id-1', 'already-stable', 'audit-id-2']);
assert.equal(idCount, 2, 'reloading normalized history must not generate new IDs');
assert.equal(writeCount, 1, 'unchanged history should not be written again');

context.legacyInput = Array.from({ length: 205 }, (_, index) => ({ id: `event-${index}` }));
vm.runInContext('globalThis.normalized = normalizeLegacyActivityEvents(globalThis.legacyInput);', context);
assert.equal(context.normalized.length, 200, 'audit history should enforce the 200-event cap');
assert.equal(JSON.parse(storedValue).length, 200, 'capped history should be persisted');
assert.equal(writeCount, 2);

console.log('QualityOS browser audit event tests passed.');
