(function attachQualityOsLabModel(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QualityOSLabModel = model;
})(typeof globalThis === 'object' ? globalThis : this, function createQualityOsLabModel() {
  const subgroupConstants = Object.freeze({
    2: { a2: 1.88, d2: 1.128, d3: 0, d4: 3.267 },
    3: { a2: 1.023, d2: 1.693, d3: 0, d4: 2.574 },
    4: { a2: 0.729, d2: 2.059, d3: 0, d4: 2.282 },
    5: { a2: 0.577, d2: 2.326, d3: 0, d4: 2.114 },
    6: { a2: 0.483, d2: 2.534, d3: 0, d4: 2.004 },
    7: { a2: 0.419, d2: 2.704, d3: 0.076, d4: 1.924 },
    8: { a2: 0.373, d2: 2.847, d3: 0.136, d4: 1.864 },
    9: { a2: 0.337, d2: 2.970, d3: 0.184, d4: 1.816 },
    10: { a2: 0.308, d2: 3.078, d3: 0.223, d4: 1.777 }
  });

  function detectDelimiter(text) {
    const candidates = [',', ';', '\t'];
    const counts = new Map(candidates.map(delimiter => [delimiter, 0]));
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && (char === '\n' || char === '\r')) break;
      else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
    }
    return candidates.sort((left, right) => counts.get(right) - counts.get(left))[0];
  }

  function parseCsv(text, delimiter) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('The selected file is empty.');
    const separator = delimiter || detectDelimiter(text);
    if (![',', ';', '\t'].includes(separator)) throw new Error('Unsupported CSV delimiter.');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') {
        if (field.length) throw new Error(`Unexpected quote near character ${index + 1}.`);
        quoted = true;
      } else if (char === separator) {
        row.push(field); field = '';
      } else if (char === '\n' || char === '\r') {
        row.push(field); field = '';
        if (row.some(value => String(value).trim() !== '')) rows.push(row);
        row = [];
        if (char === '\r' && text[index + 1] === '\n') index += 1;
      } else field += char;
    }
    if (quoted) throw new Error('The CSV ends inside a quoted field. Check for an unmatched double quote.');
    row.push(field);
    if (row.some(value => String(value).trim() !== '')) rows.push(row);
    if (rows.length < 2) throw new Error('Add a header row and at least one measurement row.');

    const seen = new Map();
    const headers = rows.shift().map((value, index) => {
      const base = String(value).replace(/^\uFEFF/, '').trim() || `Column ${index + 1}`;
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      return count === 1 ? base : `${base} (${count})`;
    });
    if (!headers.length) throw new Error('No CSV columns were found.');
    return { headers, rows, delimiter: separator };
  }

  function normalizeHeader(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  function suggestColumn(headers, field) {
    const aliases = {
      timestamp: ['timestamp', 'datetime', 'sampletime', 'recordedat', 'date', 'time'],
      value: ['measurement', 'measuredvalue', 'value', 'reading', 'result', 'observed'],
      characteristic: ['characteristic', 'qualitycharacteristic', 'metric', 'feature', 'ctq', 'property'],
      part: ['partnumber', 'partno', 'part', 'item', 'sku'],
      lot: ['lotnumber', 'lot', 'batchnumber', 'batch', 'batchid'],
      subgroup: ['subgroup', 'subgroupid', 'rationalgroup', 'samplegroup'],
      unit: ['unit', 'units', 'measurementunit'],
      instrument: ['instrument', 'instrumentid', 'gage', 'gageid', 'measuringinstrument', 'measurementdevice'],
      operator: ['operator', 'operatorid', 'inspector', 'inspectorid', 'technician'],
      calibrationDue: ['calibrationdue', 'calibrationduedate', 'caldue', 'calibrationexpiry', 'calibrationexpiration'],
      lsl: ['lsl', 'lowerlimit', 'lowerspeclimit', 'lowerspecificationlimit'],
      usl: ['usl', 'upperlimit', 'upperspeclimit', 'upperspecificationlimit']
    };
    const normalized = headers.map(normalizeHeader);
    const exact = normalized.findIndex(value => aliases[field].includes(value));
    if (exact >= 0) return exact;
    return normalized.findIndex(value => aliases[field].some(alias => alias.length > 4 && value.includes(alias)));
  }

  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let text = String(value ?? '').trim().replace(/[\u00a0\s]/g, '');
    if (!text || !/[0-9]/.test(text)) return null;
    const comma = text.lastIndexOf(',');
    const period = text.lastIndexOf('.');
    if (comma >= 0 && period >= 0) {
      if (comma > period) text = text.replace(/\./g, '').replace(',', '.');
      else text = text.replace(/,/g, '');
    } else if (comma >= 0) {
      if (/^[+-]?\d{1,3}(,\d{3}){2,}$/.test(text)) text = text.replace(/,/g, '');
      else if (/^[+-]?\d{1,3},\d{3}$/.test(text)) return null;
      else if ((text.match(/,/g) || []).length === 1) text = text.replace(',', '.');
      else return null;
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function uniqueColumnValues(parsed, columnIndex, limit = 100) {
    if (!Number.isInteger(columnIndex) || columnIndex < 0) return [];
    const found = new Set();
    for (const row of parsed.rows) {
      const value = String(row[columnIndex] ?? '').trim();
      if (value) found.add(value);
      if (found.size >= limit) break;
    }
    return [...found];
  }

  function constantSpec(values, field) {
    if (!Number.isInteger(field) || field < 0) return { value: null, varying: false, invalid: 0, present: false };
    const numbers = [];
    let invalid = 0;
    for (const row of values) {
      const raw = String(row[field] ?? '').trim();
      if (!raw) continue;
      const value = parseNumber(raw);
      if (value === null) invalid += 1;
      else numbers.push(value);
    }
    const distinct = [...new Set(numbers.map(value => Number(value.toPrecision(12))))];
    return { value: distinct.length === 1 && !invalid ? distinct[0] : null, varying: distinct.length > 1, invalid, present: numbers.length > 0 };
  }

  function prepareMeasurements(parsed, mapping, { characteristicName = '', filters = {}, now = Date.now() } = {}) {
    if (!Number.isInteger(mapping.value) || mapping.value < 0) throw new Error('Map the required measurement-value column.');
    const measurements = [];
    const rejectedRows = [];
    let filteredRows = 0;
    let invalidTimestampRows = 0;
    let missingSubgroupRows = 0;
    let missingOperatorRows = 0;
    let invalidCalibrationDueRows = 0;
    let expiredCalibrationRows = 0;
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const row = parsed.rows[index];
      const get = key => Number.isInteger(mapping[key]) && mapping[key] >= 0 ? String(row[mapping[key]] ?? '').trim() : '';
      const characteristic = get('characteristic') || String(characteristicName).trim();
      const part = get('part');
      const lot = get('lot');
      const unit = get('unit');
      const instrument = get('instrument');
      const operator = get('operator');
      const calibrationDue = get('calibrationDue');
      if ((filters.characteristic && characteristic !== filters.characteristic) || (filters.part && filters.part !== '__all__' && part !== filters.part) || (filters.lot && filters.lot !== '__all__' && lot !== filters.lot) || (filters.unit && filters.unit !== unit) || (filters.instrument && filters.instrument !== '__all__' && instrument !== filters.instrument)) {
        filteredRows += 1;
        continue;
      }
      const value = parseNumber(row[mapping.value]);
      const sourceRow = index + 2;
      if (value === null) {
        rejectedRows.push({ row: sourceRow, reason: 'Measurement is blank or not a valid number.' });
        continue;
      }
      let timestamp = null;
      let timestampMs = null;
      if (Number.isInteger(mapping.timestamp) && mapping.timestamp >= 0) {
        timestamp = get('timestamp');
        timestampMs = timestamp ? Date.parse(timestamp) : NaN;
        if (!Number.isFinite(timestampMs)) { timestampMs = null; invalidTimestampRows += 1; }
      }
      const subgroup = get('subgroup');
      if (Number.isInteger(mapping.subgroup) && mapping.subgroup >= 0 && !subgroup) missingSubgroupRows += 1;
      if (Number.isInteger(mapping.operator) && mapping.operator >= 0 && !operator) missingOperatorRows += 1;
      let calibrationDueMs = null;
      if (Number.isInteger(mapping.calibrationDue) && mapping.calibrationDue >= 0 && calibrationDue) {
        const calibrationDateValue = /^\d{4}-\d{2}-\d{2}$/.test(calibrationDue) ? `${calibrationDue}T23:59:59.999Z` : calibrationDue;
        calibrationDueMs = Date.parse(calibrationDateValue);
        if (!Number.isFinite(calibrationDueMs)) { calibrationDueMs = null; invalidCalibrationDueRows += 1; }
        else if (calibrationDueMs < now) expiredCalibrationRows += 1;
      }
      measurements.push({ sourceRow, value, timestamp, timestampMs, characteristic: characteristic || 'Unspecified characteristic', part, lot, unit, instrument, operator, calibrationDue, calibrationDueMs, subgroup });
    }
    const timeOrdered = measurements.length > 0 && Number.isInteger(mapping.timestamp) && measurements.every(item => item.timestampMs !== null);
    if (timeOrdered) measurements.sort((left, right) => left.timestampMs - right.timestampMs || left.sourceRow - right.sourceRow);
    const selectedRows = measurements.map(item => parsed.rows[item.sourceRow - 2]);
    const lowerSpec = constantSpec(selectedRows, mapping.lsl);
    const upperSpec = constantSpec(selectedRows, mapping.usl);
    const instrumentValues = [...new Set(measurements.map(item => item.instrument).filter(Boolean))];
    const operatorValues = [...new Set(measurements.map(item => item.operator).filter(Boolean))];
    return { measurements, rejectedRows, filteredRows, invalidTimestampRows, missingSubgroupRows, missingOperatorRows, invalidCalibrationDueRows, expiredCalibrationRows, instrumentValues, operatorValues, timeOrdered, lowerSpec, upperSpec, sourceRowCount: parsed.rows.length };
  }

  function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
  function sampleStandardDeviation(values) {
    if (values.length < 2) return null;
    const center = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
  }
  function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function runSignals(points, center, lcl, ucl, seriesName) {
    const signals = [];
    const flags = Array(points.length).fill(false);
    for (let index = 0; index < points.length; index += 1) {
      if (points[index].value > ucl || points[index].value < lcl) {
        flags[index] = true;
        signals.push({ type: `${seriesName}: point beyond control limit`, start: index, end: index, label: points[index].label });
      }
    }
    let side = 0;
    let sideStart = 0;
    let sideCount = 0;
    let runReported = false;
    for (let index = 0; index < points.length; index += 1) {
      const nextSide = points[index].value > center ? 1 : points[index].value < center ? -1 : 0;
      if (!nextSide) { side = 0; sideCount = 0; runReported = false; continue; }
      if (nextSide !== side) { side = nextSide; sideStart = index; sideCount = 1; runReported = false; }
      else sideCount += 1;
      if (sideCount === 8 && !runReported) {
        signals.push({ type: `${seriesName}: 8 consecutive points on one side of center`, start: sideStart, end: index, label: `${points[sideStart].label}–${points[index].label}` });
        for (let flag = sideStart; flag <= index; flag += 1) flags[flag] = true;
        runReported = true;
      }
    }
    let direction = 0;
    let trendStart = 0;
    let trendCount = 1;
    let trendReported = false;
    for (let index = 1; index < points.length; index += 1) {
      const delta = points[index].value - points[index - 1].value;
      const nextDirection = delta > 0 ? 1 : delta < 0 ? -1 : 0;
      if (!nextDirection) { direction = 0; trendCount = 1; trendReported = false; continue; }
      if (nextDirection !== direction) { direction = nextDirection; trendStart = index - 1; trendCount = 2; trendReported = false; }
      else trendCount += 1;
      if (trendCount === 6 && !trendReported) {
        signals.push({ type: `${seriesName}: 6 consecutive points ${direction > 0 ? 'increasing' : 'decreasing'}`, start: trendStart, end: index, label: `${points[trendStart].label}–${points[index].label}` });
        for (let flag = trendStart; flag <= index; flag += 1) flags[flag] = true;
        trendReported = true;
      }
    }
    return { signals, flags };
  }

  function analyzeMeasurements(prepared, { subgroup = false, lsl = null, usl = null } = {}) {
    const measurements = prepared.measurements;
    if (measurements.length < 2) throw new Error(`At least two valid measurements are required; ${measurements.length} were available.`);
    const values = measurements.map(item => item.value);
    const overallMean = mean(values);
    const overallSigma = sampleStandardDeviation(values);
    let chartType;
    let primaryPoints;
    let rangePoints;
    let center;
    let lcl;
    let ucl;
    let rangeCenter;
    let rangeLcl;
    let rangeUcl;
    let withinSigma;

    if (subgroup) {
      if (prepared.missingSubgroupRows) throw new Error(`${prepared.missingSubgroupRows} selected row(s) have no subgroup ID. Fix the mapping/data or use an Individuals–Moving Range chart.`);
      const grouped = new Map();
      for (const item of measurements) {
        if (!item.subgroup) throw new Error('Every selected measurement needs a subgroup ID.');
        if (!grouped.has(item.subgroup)) grouped.set(item.subgroup, []);
        grouped.get(item.subgroup).push(item);
      }
      const groups = [...grouped.entries()].map(([name, items]) => ({ name, items }));
      const sizes = [...new Set(groups.map(group => group.items.length))];
      if (sizes.length !== 1 || !subgroupConstants[sizes[0]] || groups.length < 2) throw new Error('X̄–R needs at least two complete subgroups, each with the same size from 2 to 10. Unmap subgroup to analyze individuals instead.');
      const constants = subgroupConstants[sizes[0]];
      primaryPoints = groups.map(group => ({ label: group.name, value: mean(group.items.map(item => item.value)), range: Math.max(...group.items.map(item => item.value)) - Math.min(...group.items.map(item => item.value)), sourceRows: group.items.map(item => item.sourceRow) }));
      rangePoints = primaryPoints.map(point => ({ label: point.label, value: point.range }));
      chartType = 'X̄–R';
      center = mean(primaryPoints.map(point => point.value));
      rangeCenter = mean(rangePoints.map(point => point.value));
      lcl = center - constants.a2 * rangeCenter;
      ucl = center + constants.a2 * rangeCenter;
      rangeLcl = Math.max(0, constants.d3 * rangeCenter);
      rangeUcl = constants.d4 * rangeCenter;
      withinSigma = rangeCenter / constants.d2;
    } else {
      const movingRanges = values.slice(1).map((value, index) => Math.abs(value - values[index]));
      rangeCenter = mean(movingRanges);
      withinSigma = rangeCenter / subgroupConstants[2].d2;
      chartType = 'I–MR';
      primaryPoints = measurements.map((item, index) => ({ label: prepared.timeOrdered ? new Date(item.timestampMs).toISOString() : `Row ${item.sourceRow}`, value: item.value, sourceRows: [item.sourceRow] }));
      rangePoints = movingRanges.map((value, index) => ({ label: `${measurements[index].sourceRow}–${measurements[index + 1].sourceRow}`, value, sourceRows: [measurements[index].sourceRow, measurements[index + 1].sourceRow] }));
      center = overallMean;
      lcl = center - 2.66 * rangeCenter;
      ucl = center + 2.66 * rangeCenter;
      rangeLcl = 0;
      rangeUcl = 3.267 * rangeCenter;
    }

    const primaryRules = runSignals(primaryPoints, center, lcl, ucl, chartType === 'I–MR' ? 'Individuals chart' : 'Subgroup-mean chart');
    const rangeRules = rangePoints.map(point => point.value > rangeUcl || point.value < rangeLcl);
    const signals = [...primaryRules.signals];
    rangeRules.forEach((outside, index) => {
      if (outside) signals.push({ type: `${chartType === 'I–MR' ? 'Moving-range' : 'Range chart'}: point beyond control limit`, start: index, end: index, label: rangePoints[index].label });
    });
    const lower = Number.isFinite(lsl) ? lsl : null;
    const upper = Number.isFinite(usl) ? usl : null;
    const specViolations = measurements.filter(item => (lower !== null && item.value < lower) || (upper !== null && item.value > upper));
    const stable = signals.length === 0;
    const safeRatio = denominator => denominator > 0 ? denominator : null;
    const capability = { cp: null, cpk: null, pp: null, ppk: null, cpu: null, cpl: null, ppu: null, ppl: null };
    if (withinSigma > 0) {
      if (lower !== null && upper !== null && upper > lower) {
        capability.cp = (upper - lower) / (6 * withinSigma);
        capability.cpk = Math.min((upper - overallMean) / (3 * withinSigma), (overallMean - lower) / (3 * withinSigma));
      } else if (upper !== null) capability.cpu = (upper - overallMean) / (3 * withinSigma);
      else if (lower !== null) capability.cpl = (overallMean - lower) / (3 * withinSigma);
    }
    if (overallSigma > 0) {
      if (lower !== null && upper !== null && upper > lower) {
        capability.pp = (upper - lower) / (6 * overallSigma);
        capability.ppk = Math.min((upper - overallMean) / (3 * overallSigma), (overallMean - lower) / (3 * overallSigma));
      } else if (upper !== null) capability.ppu = (upper - overallMean) / (3 * overallSigma);
      else if (lower !== null) capability.ppl = (overallMean - lower) / (3 * overallSigma);
    }
    const sorted = [...values].sort((left, right) => left - right);
    const warnings = [];
    if (!prepared.timeOrdered && !subgroup) warnings.push('No complete, parseable timestamp column was used; order follows CSV row order. Verify the source is chronologically ordered before interpreting trends.');
    if (!stable) warnings.push('Control-chart rules flagged potential special causes. Capability indices are preliminary and should not be interpreted as a stable-process forecast.');
    if (lower === null && upper === null) warnings.push('Specification limits were not provided; capability and conformance calculations are omitted.');
    if (prepared.lowerSpec.varying || prepared.upperSpec.varying) warnings.push('Mapped specification limits vary in this selection. Narrow the scope or provide a verified single limit; capability is not calculated from changing limits.');
    if (prepared.lowerSpec.invalid || prepared.upperSpec.invalid) warnings.push('Some mapped specification-limit values could not be parsed. Confirm the limit columns before interpreting capability.');
    if (prepared.rejectedRows.length) warnings.push(`${prepared.rejectedRows.length} row(s) with invalid measurements were excluded; inspect the row report.`);
    if (prepared.invalidTimestampRows) warnings.push(`${prepared.invalidTimestampRows} timestamp value(s) were unparseable; CSV row order was retained.`);
    if (!prepared.instrumentValues.length) warnings.push('Measurement-system identity was not provided; variation cannot be attributed to a specific instrument or gage.');
    if (prepared.missingOperatorRows) warnings.push(`${prepared.missingOperatorRows} selected row(s) have no operator / inspector value.`);
    if (prepared.invalidCalibrationDueRows) warnings.push(`${prepared.invalidCalibrationDueRows} calibration due date value(s) were unparseable.`);
    if (prepared.expiredCalibrationRows) warnings.push(`${prepared.expiredCalibrationRows} selected row(s) were measured after the mapped calibration due date; review measurement validity.`);
    if (withinSigma === 0) warnings.push('Within-process variation is zero in this sample; capability ratios are undefined. Check resolution and repeated values.');
    return {
      method: chartType,
      count: values.length,
      mean: overallMean,
      median: median(values),
      sampleSigma: overallSigma,
      withinSigma: safeRatio(withinSigma),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      center, lcl, ucl, rangeCenter, rangeLcl, rangeUcl,
      primaryPoints: primaryPoints.map((point, index) => ({ ...point, flagged: primaryRules.flags[index] })),
      rangePoints: rangePoints.map((point, index) => ({ ...point, flagged: rangeRules[index] })),
      signals, stable,
      lsl: lower, usl: upper,
      specViolationCount: specViolations.length,
      specViolationRows: specViolations.map(item => item.sourceRow),
      capability,
      warnings,
      sourceRowCount: prepared.sourceRowCount,
      rejectedRows: prepared.rejectedRows,
      filteredRows: prepared.filteredRows,
      timeOrdered: prepared.timeOrdered,
      subgroupSize: subgroup ? primaryPoints[0]?.sourceRows.length || 0 : null
    };
  }

  return Object.freeze({ detectDelimiter, parseCsv, normalizeHeader, suggestColumn, parseNumber, uniqueColumnValues, prepareMeasurements, analyzeMeasurements });
});
