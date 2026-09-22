import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const model = require('../outputs/quality-lab-model.js');

const parsed = model.parseCsv('"Station, cell",Measurement,Note\r\nPress 04,0.42,"tool ""wear"""\r\nPress 04,0.45,"second\nreading"');
assert.equal(parsed.delimiter, ',');
assert.deepEqual(parsed.headers, ['Station, cell', 'Measurement', 'Note']);
assert.equal(parsed.rows[0][2], 'tool "wear"');
assert.equal(parsed.rows[1][2], 'second\nreading');
assert.equal(model.parseNumber('0,42'), 0.42);
assert.equal(model.parseNumber('1,234.50'), 1234.5);
assert.equal(model.parseNumber('1.234,50'), 1234.5);
assert.equal(model.parseNumber('1,234'), null, 'ambiguous decimal/thousands separators are rejected instead of guessed');
assert.equal(model.parseNumber('1,234,567'), 1234567);
assert.equal(model.parseNumber('not a measurement'), null);
assert.throws(() => model.parseCsv('value,note\n1,"unfinished'), /inside a quoted field/);

const csv = model.parseCsv('timestamp,part,characteristic,lot,measurement,subgroup,lsl,usl\n2026-09-01T08:00:00Z,BRK-204,burr,LOT-1,9.9,A,8,12\n2026-09-01T08:01:00Z,BRK-204,burr,LOT-1,10.1,A,8,12\n2026-09-01T08:02:00Z,BRK-204,burr,LOT-1,10.0,B,8,12\n2026-09-01T08:03:00Z,BRK-204,burr,LOT-1,10.2,B,8,12\n2026-09-01T08:04:00Z,BRK-204,burr,LOT-1,9.8,C,8,12\n2026-09-01T08:05:00Z,BRK-204,burr,LOT-1,10.0,C,8,12\n2026-09-01T08:06:00Z,BRK-204,burr,LOT-1,broken,C,8,12');
const mapping = Object.fromEntries(['timestamp', 'part', 'characteristic', 'lot', 'value', 'subgroup', 'lsl', 'usl'].map(key => [key, model.suggestColumn(csv.headers, key)]));
assert.equal(mapping.value, 4);
const prepared = model.prepareMeasurements(csv, mapping, { filters: { characteristic: 'burr', part: 'BRK-204', lot: 'LOT-1' } });
assert.equal(prepared.measurements.length, 6);
assert.equal(prepared.rejectedRows[0].row, 8);
assert.equal(prepared.timeOrdered, true);
assert.equal(prepared.lowerSpec.value, 8);
assert.equal(prepared.upperSpec.value, 12);

const traceCsv = model.parseCsv('timestamp,value,instrument,operator,calibration_due\n2026-09-01T08:00:00Z,10,GAGE-1,Alice,2026-09-01\n2026-09-01T08:01:00Z,10.1,GAGE-1,,not-a-date\n2026-09-01T08:02:00Z,9.9,GAGE-2,Bob,2099-01-01');
const traceMapping = Object.fromEntries(['timestamp', 'value', 'instrument', 'operator', 'calibrationDue'].map(key => [key, model.suggestColumn(traceCsv.headers, key)]));
const tracePrepared = model.prepareMeasurements(traceCsv, traceMapping, { now: Date.parse('2026-09-02T00:00:00Z'), filters: { instrument: 'GAGE-1' } });
assert.equal(tracePrepared.measurements.length, 2);
assert.equal(tracePrepared.filteredRows, 1);
assert.deepEqual(tracePrepared.instrumentValues, ['GAGE-1']);
assert.equal(tracePrepared.missingOperatorRows, 1);
assert.equal(tracePrepared.invalidCalibrationDueRows, 1);
assert.equal(tracePrepared.expiredCalibrationRows, 1);
const traceResult = model.analyzeMeasurements(tracePrepared);
assert.ok(traceResult.warnings.some(warning => warning.includes('after the mapped calibration due date')));

const subgroupResult = model.analyzeMeasurements(prepared, { subgroup: true, lsl: 8, usl: 12 });
assert.equal(subgroupResult.method, 'X̄–R');
assert.equal(subgroupResult.count, 6);
assert.equal(subgroupResult.primaryPoints.length, 3);
assert.equal(subgroupResult.subgroupSize, 2);
assert.equal(subgroupResult.stable, true);
assert.ok(Math.abs(subgroupResult.capability.cp - (4 / (6 * (0.2 / 1.128)))) < 1e-9);
assert.equal(subgroupResult.specViolationCount, 0);
assert.equal(subgroupResult.rejectedRows.length, 1);

const individuals = model.prepareMeasurements(model.parseCsv('Measurement,LSL,USL\n1,0,10\n1.01,0,10\n1.03,0,10\n1.06,0,10\n1.1,0,10\n1.15,0,10\n1.21,0,10'), { value: 0, lsl: 1, usl: 2 });
const imrResult = model.analyzeMeasurements(individuals, { lsl: 0, usl: 10 });
assert.equal(imrResult.method, 'I–MR');
assert.ok(imrResult.signals.some(signal => signal.type.includes('6 consecutive points increasing')));
assert.equal(imrResult.count, 7);
assert.equal(imrResult.specViolationCount, 0);

const unstable = model.prepareMeasurements(model.parseCsv('value\n0\n1\n2\n3\n4\n5\n6\n7\n8\n9'), { value: 0 });
const unstableResult = model.analyzeMeasurements(unstable);
assert.equal(unstableResult.stable, false);
assert.ok(unstableResult.warnings.some(warning => warning.includes('Capability indices are preliminary')));

console.log('Quality lab parser and analysis tests passed.');
