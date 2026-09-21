import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const model = require('../outputs/shift-handoff-model.js');
const draft = model.createShiftHandoffDraft(new Date('2026-09-21T15:30:00Z'));
assert.match(draft.date, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(draft.shift, 'Shift B');

const record = model.createShiftHandoffRecord(draft, { id: 'SH-TEST-1', issuedAt: '2026-09-21T15:00:00.000Z' });
assert.equal(record.id, 'SH-TEST-1');
assert.equal(model.shiftHandoffStatus(record), 'awaiting-receipt');
assert.equal(model.canAcceptShiftHandoff(record, record.incoming), false, 'all follow-ups must be acknowledged');
assert.throws(() => model.createShiftHandoffRecord({ ...draft, incoming: '' }), /both operator names/);
assert.throws(() => model.createShiftHandoffRecord({ ...draft, note: 'x'.repeat(2001) }), /2,000 characters/);
assert.throws(() => model.acceptShiftHandoff(record, { acceptedBy: record.incoming }), /acknowledge every follow-up/);
assert.throws(() => model.acknowledgeShiftHandoffItem(record, 'missing-item'), /could not be found/);

let reviewed = record;
for (const item of model.SHIFT_HANDOFF_ITEMS) reviewed = model.acknowledgeShiftHandoffItem(reviewed, item.id);
assert.equal(model.shiftHandoffStatus(reviewed), 'ready-to-accept');
assert.equal(model.canAcceptShiftHandoff(reviewed, 'someone else'), false, 'only the named operator can accept');
assert.throws(() => model.acceptShiftHandoff(reviewed, { acceptedBy: 'someone else' }), /Only the named incoming operator/);

const accepted = model.acceptShiftHandoff(reviewed, { acceptedBy: record.incoming, acceptedAt: '2026-09-21T16:00:00.000Z' });
assert.equal(model.shiftHandoffStatus(accepted), 'accepted');
assert.equal(accepted.acceptedBy, 'Jordan Lee');
assert.equal(accepted.acceptedAt, '2026-09-21T16:00:00.000Z');
assert.equal(record.acceptedAt, '', 'model updates are immutable');
assert.throws(() => model.acknowledgeShiftHandoffItem(accepted, 'lot-hold', false), /read-only/);

console.log('Shift handoff model tests passed.');
