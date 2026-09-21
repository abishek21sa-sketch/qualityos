(function startQualityOsLocalAnalysis() {
  const model = globalThis.QualityOSLabModel;
  if (!model) return;

  const maxFileBytes = 15 * 1024 * 1024;
  const schema = [
    { key: 'timestamp', label: 'Timestamp', hint: 'Optional; used to order observations.' },
    { key: 'value', label: 'Measurement value', hint: 'Required numeric observation.', required: true },
    { key: 'characteristic', label: 'Characteristic', hint: 'Optional column; otherwise name it below.' },
    { key: 'part', label: 'Part / process', hint: 'Optional; separate unlike processes.' },
    { key: 'lot', label: 'Lot / batch', hint: 'Optional; choose or explicitly pool lots.' },
    { key: 'subgroup', label: 'Rational subgroup ID', hint: 'Optional; use only for true contemporaneous subgroups.' },
    { key: 'unit', label: 'Unit', hint: 'Optional; do not mix units.' },
    { key: 'lsl', label: 'Lower specification limit', hint: 'Optional customer / engineering limit.' },
    { key: 'usl', label: 'Upper specification limit', hint: 'Optional customer / engineering limit.' }
  ];
  const scopeKeys = ['characteristic', 'part', 'lot', 'unit'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const state = { file: null, parsed: null, mapping: {}, filters: {}, characteristicName: '', unitName: '', manualLsl: '', manualUsl: '', prepared: null, analysis: null, error: '' };
  const root = document.createElement('div');
  root.id = 'qualityLabApp';
  root.setAttribute('aria-live', 'polite');
  document.body.classList.add('quality-lab-mode');
  document.querySelector('.app')?.setAttribute('aria-hidden', 'true');
  document.body.appendChild(root);

  const columnValues = key => Number.isInteger(state.mapping[key]) && state.mapping[key] >= 0
    ? model.uniqueColumnValues(state.parsed, state.mapping[key]) : [];

  function defaultForColumn(key) {
    const values = columnValues(key);
    state.filters[key] = values.length === 1 ? values[0] : '';
  }

  function setFile(file, text) {
    if (file.size > maxFileBytes) throw new Error('Choose a CSV file smaller than 15 MB for this browser-local analysis.');
    const parsed = model.parseCsv(text);
    state.file = { name: file.name, size: file.size, lastModified: file.lastModified || 0, importedAt: new Date().toISOString() };
    state.parsed = parsed;
    state.mapping = Object.fromEntries(schema.map(field => [field.key, model.suggestColumn(parsed.headers, field.key)]));
    state.filters = {};
    state.characteristicName = '';
    state.unitName = '';
    state.manualLsl = '';
    state.manualUsl = '';
    state.prepared = null;
    state.analysis = null;
    state.error = '';
    for (const key of scopeKeys) defaultForColumn(key);
  }

  function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatNumber(value, digits = 5) {
    return Number.isFinite(value) ? new Intl.NumberFormat(undefined, { maximumSignificantDigits: digits }).format(value) : '—';
  }

  function fieldOptions(field) {
    const selected = state.mapping[field.key];
    return `<select id="map-${field.key}" data-map-column="${field.key}" aria-label="Map ${esc(field.label)} column">
      <option value="-1"${selected < 0 ? ' selected' : ''}>— Not mapped —</option>
      ${state.parsed.headers.map((header, index) => `<option value="${index}"${selected === index ? ' selected' : ''}>${esc(header)}</option>`).join('')}
    </select>`;
  }

  function scopeSelect(key, label, values, allowAll = false) {
    if (!values.length) return '';
    const selected = state.filters[key] || '';
    const allValue = '__all__';
    const options = values.map(value => `<option value="${esc(value)}"${selected === value ? ' selected' : ''}>${esc(value)}</option>`).join('');
    const all = allowAll && values.length > 1 ? `<option value="${allValue}"${selected === allValue ? ' selected' : ''}>All ${esc(label.toLowerCase())} · pooled</option>` : '';
    return `<label class="ql-scope-field"><span>${esc(label)}${values.length > 1 ? ' · choose scope' : ''}</span><select data-scope-filter="${key}" aria-label="Filter by ${esc(label)}"><option value=""${!selected ? ' selected' : ''}>${values.length > 1 ? 'Select one…' : 'Select…'}</option>${options}${all}</select></label>`;
  }

  function scopeMarkup() {
    const pieces = [];
    const characteristicValues = columnValues('characteristic');
    if (Number.isInteger(state.mapping.characteristic) && state.mapping.characteristic >= 0 && characteristicValues.length) pieces.push(scopeSelect('characteristic', 'Characteristic', characteristicValues));
    else pieces.push(`<label class="ql-scope-field"><span>Measurement name · required</span><input id="manualCharacteristic" maxlength="80" value="${esc(state.characteristicName)}" placeholder="e.g. Shaft diameter" /></label>`);
    if (!Number.isInteger(state.mapping.unit) || state.mapping.unit < 0 || !columnValues('unit').length) pieces.push(`<label class="ql-scope-field"><span>Measurement unit · optional</span><input id="manualUnit" maxlength="24" value="${esc(state.unitName)}" placeholder="e.g. mm" /></label>`);
    for (const key of ['part', 'lot', 'unit']) {
      if (!Number.isInteger(state.mapping[key]) || state.mapping[key] < 0) continue;
      const values = columnValues(key);
      if (key === 'unit' && values.length > 1) pieces.push(scopeSelect(key, 'Unit · never pool', values));
      else pieces.push(scopeSelect(key, key === 'part' ? 'Part / process' : key === 'lot' ? 'Lot / batch' : 'Unit', values, true));
    }
    return pieces.join('');
  }

  function mappingReady() {
    if (!state.parsed || !Number.isInteger(state.mapping.value) || state.mapping.value < 0) return false;
    const hasCharacteristicValues = Number.isInteger(state.mapping.characteristic) && state.mapping.characteristic >= 0 && columnValues('characteristic').length > 0;
    if (!hasCharacteristicValues && !state.characteristicName.trim()) return false;
    for (const key of scopeKeys) {
      if (Number.isInteger(state.mapping[key]) && state.mapping[key] >= 0 && columnValues(key).length > 1 && !state.filters[key]) return false;
    }
    return true;
  }

  function previewMarkup() {
    const headings = state.parsed.headers;
    const rows = state.parsed.rows.slice(0, 5);
    return `<div class="ql-preview-wrap"><table class="ql-preview"><thead><tr><th>Source row</th>${headings.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr><th>${index + 2}</th>${headings.map((_, column) => `<td>${esc(row[column] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="ql-table-note">Preview only · first ${rows.length} nonblank data row(s) · original file is not uploaded.</div>`;
  }

  function warningsMarkup(warnings) {
    if (!warnings.length) return '';
    return `<ul class="ql-warnings">${warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul>`;
  }

  function chartSvg(title, points, center, lcl, ucl, lowerSpec, upperSpec, unit = '') {
    const width = 960;
    const height = 290;
    const left = 78;
    const right = 20;
    const top = 25;
    const bottom = 224;
    const finite = [...points.map(point => point.value), center, lcl, ucl, lowerSpec, upperSpec].filter(Number.isFinite);
    let low = Math.min(...finite);
    let high = Math.max(...finite);
    if (low === high) { const pad = Math.max(Math.abs(low) * 0.05, 0.001); low -= pad; high += pad; }
    else { const pad = (high - low) * 0.12; low -= pad; high += pad; }
    const x = index => points.length < 2 ? (left + width - right) / 2 : left + index * (width - left - right) / (points.length - 1);
    const y = value => bottom - (value - low) * (bottom - top) / (high - low);
    const stride = Math.max(1, Math.ceil(points.length / 750));
    const shown = points.map((point, index) => ({ point, index })).filter(({ point, index }) => index % stride === 0 || point.flagged || index === points.length - 1);
    const path = shown.map(({ point, index }) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    const ticks = Array.from({ length: 5 }, (_, index) => low + (high - low) * index / 4);
    const horizontal = (value, kind, label) => Number.isFinite(value) ? `<line class="ql-line ${kind}" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"/><text class="ql-line-label ${kind}" x="${width - right - 2}" y="${y(value) - 5}" text-anchor="end">${label} ${formatNumber(value, 5)}</text>` : '';
    const circles = shown.map(({ point, index }) => `<circle class="ql-point${point.flagged ? ' flagged' : ''}" cx="${x(index)}" cy="${y(point.value)}" r="${point.flagged ? 4.2 : 3}"><title>${esc(point.label)} · ${formatNumber(point.value, 7)}${esc(unit)} · source row(s) ${esc(point.sourceRows.join(', '))}</title></circle>`).join('');
    const xLabels = points.length ? [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((index, place, all) => all.indexOf(index) === place).map(index => { const label = String(points[index].label); const concise = label.length > 17 ? `${label.slice(0, 16).replace('T', ' ')}…` : label; return `<text class="ql-axis-label" x="${x(index)}" y="249" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}">${esc(concise)}</text>`; }).join('') : '';
    const yGrid = ticks.map(value => `<line class="ql-grid" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"/><text class="ql-axis-label" x="${left - 9}" y="${y(value) + 3}" text-anchor="end">${formatNumber(value, 5)}</text>`).join('');
    return `<figure class="ql-chart-figure"><figcaption>${esc(title)} <span>${points.length > shown.length ? `displaying ${shown.length} of ${points.length} points` : `${points.length} plotted points`}</span></figcaption><svg class="ql-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)} based on ${points.length} imported values">${yGrid}${horizontal(ucl, 'control', 'UCL')}${horizontal(center, 'center', 'CENTER')}${horizontal(lcl, 'control', 'LCL')}${horizontal(upperSpec, 'spec', 'USL')}${horizontal(lowerSpec, 'spec', 'LSL')}<polyline class="ql-series" points="${path}"/>${circles}${xLabels}</svg><div class="ql-legend"><span><i class="legend-sample"/>Imported observations</span><span><i class="legend-control"/>Estimated control limits</span>${Number.isFinite(lowerSpec) || Number.isFinite(upperSpec) ? '<span><i class="legend-spec"/>Supplied specification</span>' : ''}</div></figure>`;
  }

  function capabilityMarkup(analysis) {
    const values = analysis.capability;
    const rows = [];
    if (analysis.lsl !== null && analysis.usl !== null) rows.push(['Cp', values.cp], ['Cpk', values.cpk], ['Pp', values.pp], ['Ppk', values.ppk]);
    else if (analysis.usl !== null) rows.push(['Cpu', values.cpu], ['Ppu', values.ppu]);
    else if (analysis.lsl !== null) rows.push(['Cpl', values.cpl], ['Ppl', values.ppl]);
    const observed = analysis.lsl !== null || analysis.usl !== null
      ? `<div class="ql-observed"><span>Observed outside supplied spec</span><strong>${analysis.specViolationCount} / ${analysis.count} · ${((analysis.specViolationCount / analysis.count) * 100).toFixed(2)}%</strong><small>Observed sample fraction only · no distribution extrapolation</small></div>`
      : `<div class="ql-observed"><span>Capability</span><strong>Not calculated</strong><small>Provide verified specification limits to calculate capability.</small></div>`;
    return `<section class="ql-capability"><div class="ql-section-label">Specification & capability</div><h3>Capability is conditional on stability.</h3><p>Limits below are customer / engineering specifications—not statistical control limits.</p><dl>${rows.map(([name, value]) => `<div><dt>${name}</dt><dd>${Number.isFinite(value) ? formatNumber(value, 5) : '—'}</dd></div>`).join('')}</dl>${observed}<p class="ql-caveat">Cp/Cpk use within-process sigma estimated from moving ranges or subgroup ranges; Pp/Ppk use overall sample sigma. Indices assume a stable, approximately normal process. No normality test or release decision is made here.</p></section>`;
  }

  function resultsMarkup(analysis, prepared) {
    const unit = prepared.measurements.find(item => item.unit)?.unit || state.unitName.trim();
    const characteristic = prepared.measurements[0]?.characteristic || state.characteristicName || 'Measurement';
    const primaryChart = chartSvg(`${analysis.method} · ${characteristic}`, analysis.primaryPoints, analysis.center, analysis.lcl, analysis.ucl, analysis.lsl, analysis.usl, unit ? ` ${unit}` : '');
    const rangeTitle = analysis.method === 'I–MR' ? 'Moving range chart · consecutive absolute differences' : `R chart · within-subgroup ranges (n = ${analysis.subgroupSize})`;
    const rangeChart = chartSvg(rangeTitle, analysis.rangePoints, analysis.rangeCenter, analysis.rangeLcl, analysis.rangeUcl, null, null, unit ? ` ${unit}` : '');
    const signalItems = analysis.signals.length
      ? `<ol class="ql-signal-list">${analysis.signals.slice(0, 30).map(signal => `<li><strong>${esc(signal.type)}</strong><span>${esc(signal.label)}</span></li>`).join('')}</ol>${analysis.signals.length > 30 ? `<p class="ql-table-note">${analysis.signals.length - 30} additional rule hits in exported report.</p>` : ''}`
      : '<p class="ql-no-signal">No selected chart rule fired in this window. That is not proof of stability.</p>';
    const excludedRows = analysis.rejectedRows.length
      ? `<details class="ql-exclusions"><summary>Inspect excluded rows (${analysis.rejectedRows.length})</summary><ul>${analysis.rejectedRows.slice(0, 40).map(item => `<li>Source row ${item.row}: ${esc(item.reason)}</li>`).join('')}</ul></details>` : '';
    const stableText = analysis.stable ? 'No selected rule fired' : `${analysis.signals.length} potential special-cause rule hit(s)`;
    return `<section class="ql-results" aria-labelledby="qlResultsHeading">
      <header class="ql-results-head"><div><div class="ql-section-label">03 / calculated from selected rows</div><h2 id="qlResultsHeading">${esc(characteristic)} <span>${esc(unit)}</span></h2><p>${analysis.count} observations · ${esc(analysis.method)} · ${analysis.timeOrdered ? 'time ordered from mapped timestamps' : 'CSV row order'}</p></div><button type="button" class="ql-button quiet" id="exportAnalysis">Export analysis JSON</button></header>
      <div class="ql-provenance"><span><b>Source</b> ${esc(state.file.name)}</span><span><b>Imported</b> ${new Date(state.file.importedAt).toLocaleString()}</span><span><b>Rows</b> ${analysis.count} included · ${analysis.rejectedRows.length} rejected · ${analysis.filteredRows} outside selected scope</span><span><b>Chart rule review</b> ${esc(stableText)}</span></div>
      ${warningsMarkup(analysis.warnings)}
      <div class="ql-method-grid"><div class="ql-chart-panel">${primaryChart}${rangeChart}</div><aside class="ql-results-aside">${capabilityMarkup(analysis)}<section class="ql-signal-panel"><div class="ql-section-label">Rule hits · sequence review</div><h3>${analysis.signals.length ? `${analysis.signals.length} review item(s)` : 'No rule hits'}</h3>${signalItems}</section></aside></div>
      <section class="ql-quality-report"><div><div class="ql-section-label">04 / data quality & provenance</div><h3>Know what entered the calculation.</h3></div><dl><div><dt>Nonblank source rows</dt><dd>${analysis.sourceRowCount}</dd></div><div><dt>Included measurements</dt><dd>${analysis.count}</dd></div><div><dt>Excluded invalid measurements</dt><dd>${analysis.rejectedRows.length}</dd></div><div><dt>Rows filtered by chosen scope</dt><dd>${analysis.filteredRows}</dd></div><div><dt>Unparsed mapped timestamps</dt><dd>${prepared.invalidTimestampRows}</dd></div><div><dt>Missing subgroup identifiers</dt><dd>${prepared.missingSubgroupRows}</dd></div><div><dt>Mean / median</dt><dd>${formatNumber(analysis.mean)} / ${formatNumber(analysis.median)}${unit ? ` ${esc(unit)}` : ''}</dd></div><div><dt>Sample σ / within σ</dt><dd>${formatNumber(analysis.sampleSigma)} / ${formatNumber(analysis.withinSigma)}${unit ? ` ${esc(unit)}` : ''}</dd></div></dl>${excludedRows}</section>
      <footer class="ql-results-foot">Analysis is deterministic browser-side batch SPC on the selected file. It does not refresh, stream, contact a server, infer missing readings, or release product.</footer>
    </section>`;
  }

  function importedMarkup() {
    const file = state.file;
    return `<div class="ql-file-strip"><div><div class="ql-section-label">Source artifact</div><strong>${esc(file.name)}</strong><span>${formatBytes(file.size)} · ${state.parsed.rows.length} nonblank data rows · local browser memory</span></div><label class="ql-button quiet ql-replace-file">Replace CSV<input type="file" data-file-input accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden /></label></div>
      <section class="ql-step"><div class="ql-step-no">02</div><div class="ql-step-content"><h2>Map the measurement contract.</h2><p>We infer likely columns from headers. Confirm every mapping; nothing is inferred from sample numbers.</p><div class="ql-map-grid">${schema.map(field => `<label class="ql-map-field"><span>${esc(field.label)}${field.required ? ' <b>required</b>' : ''}</span>${fieldOptions(field)}<small>${esc(field.hint)}</small></label>`).join('')}</div></div></section>
      <section class="ql-step"><div class="ql-step-no">03</div><div class="ql-step-content"><h2>Choose one comparable population.</h2><p>Do not combine different characteristics, units, or parts in a single control chart.</p><div class="ql-scope-grid">${scopeMarkup()}</div>${!columnValues('characteristic').length ? '<p class="ql-map-hint">No usable characteristic values mapped: enter the measurement name below.</p>' : ''}${!columnValues('unit').length ? '<p class="ql-map-hint">No usable unit values mapped. Add a unit if known; never combine different units.</p>' : ''}${!columnValues('part').length ? '<p class="ql-map-hint">No part / process column mapped. If the file contains multiple processes, the analysis cannot separate them.</p>' : ''}${state.filters.part === '__all__' || state.filters.lot === '__all__' ? '<p class="ql-caution">Multiple parts or lots are pooled by your explicit selection. Confirm they represent the same process and measurement system.</p>' : ''}</div></section>
      <section class="ql-step"><div class="ql-step-no">04</div><div class="ql-step-content"><h2>Supply verified specifications.</h2><p>Limits are optional, but capability and observed conformance are withheld unless limits are supplied or mapped.</p><div class="ql-spec-grid"><label class="ql-map-field"><span>Lower spec · optional</span><input id="specLsl" inputmode="decimal" value="${esc(state.manualLsl)}" placeholder="Use constant mapped LSL, or enter one" /></label><label class="ql-map-field"><span>Upper spec · optional</span><input id="specUsl" inputmode="decimal" value="${esc(state.manualUsl)}" placeholder="Use constant mapped USL, or enter one" /></label>${!Number.isInteger(state.mapping.subgroup) || state.mapping.subgroup < 0 ? '<label class="ql-map-field"><span>Chart method</span><div class="ql-method-choice">Individuals–Moving Range (I–MR) · measurements are treated as ordered individuals.</div></label>' : '<div class="ql-method-choice">Subgroup column mapped · X̄–R will be used. It requires complete, constant-size rational subgroups (n = 2–10).</div>'}</div><p class="ql-caution">Control limits are estimated from the selected data. They are not specification limits and must not be used as acceptance criteria.</p></div></section>
      <div class="ql-actions"><div class="ql-error" role="alert">${esc(state.error)}</div><button class="ql-button primary" id="runAnalysis" type="button"${mappingReady() ? '' : ' disabled'}>Calculate selected population <span aria-hidden="true">→</span></button><button class="ql-button text-button" id="discardCsv" type="button">Clear file</button></div>
      <section class="ql-preview-section"><div class="ql-section-label">Raw sample · unchanged source values</div>${previewMarkup()}</section>
      ${state.analysis && state.prepared ? resultsMarkup(state.analysis, state.prepared) : ''}`;
  }

  function shellMarkup() {
    return `<header class="ql-topbar"><a class="ql-wordmark" href="/" aria-label="QualityOS local analysis"><span class="ql-logo-mark">Q</span><span>QualityOS<small>PROCESS EVIDENCE LAB</small></span></a><div class="ql-source-state"><span class="ql-state-dot"></span><span>${state.file ? 'BATCH FILE LOADED' : 'NO DATA SOURCE CONNECTED'}</span><small>Offline · browser-only · no streaming feed</small></div></header>
      <main class="ql-main"><section class="ql-intro"><div class="ql-section-label">QUALITY ENGINEERING / LOCAL ANALYSIS</div><h1>Start with measured evidence.</h1><p>Import an inspection export, verify its structure, then calculate control behavior from the actual observations. There are no seeded readings or simulated metrics.</p><div class="ql-step-rail"><span class="${state.parsed ? 'done' : 'current'}"><i>01</i> SOURCE</span><b></b><span class="${state.parsed ? 'current' : ''}"><i>02</i> MAP</span><b></b><span class="${state.parsed ? (state.analysis ? 'done' : 'current') : ''}"><i>03</i> ANALYZE</span><b></b><span class="${state.analysis ? 'current' : ''}"><i>04</i> REVIEW</span></div></section>
      <div class="ql-workspace"><section class="ql-workbench" aria-label="Inspection data analysis">${state.parsed ? importedMarkup() : uploadMarkup()}</section><aside class="ql-method-aside"><div class="ql-aside-index">METHOD NOTE / 01</div><h2>What this analysis does.</h2><ol><li><b>Preserves sequence.</b> Uses mapped timestamps when every selected row has a valid one; otherwise it follows source row order and says so.</li><li><b>Chooses the chart from the sampling plan.</b> I–MR for ordered individual observations; X̄–R only for complete, equal-sized subgroups (2–10).</li><li><b>Separates process from specification.</b> Control limits come from the selected sample; customer / engineering limits must be supplied independently.</li><li><b>Shows exclusions.</b> Invalid values and filtered rows are counted; excluded row numbers are inspectable and included in the report.</li></ol><div class="ql-method-warning"><b>Not a release system.</b> SPC rules are screening signals, not proof of root cause or product acceptance.</div><div class="ql-privacy-note"><span class="ql-privacy-icon">LOCAL</span><p><b>Your file stays here.</b><br />Parsing and calculation run in this tab. The CSV is not uploaded or retained after reload. Export any report you want to keep.</p></div></aside></div>
      <footer class="ql-footer"><span>QualityOS · Local process analysis</span><span>Batch analysis only · no MES / PLC connection · no real-time feed</span><span>Version 0.2 · data provenance first</span></footer></main>`;
  }

  function uploadMarkup() {
    return `<div class="ql-empty"><div class="ql-empty-graphic" aria-hidden="true"><div class="ql-file-outline"><span>CSV</span><i></i><i></i><i></i><b>+</b></div><div class="ql-axis-glyph"><i></i><i></i><i></i><i></i><i></i><span></span></div></div><div class="ql-section-label">01 / bring your own source</div><h2>No inspection data is loaded.</h2><p>This workspace starts empty on purpose. Choose a real CSV export from your gauge log, inspection system, or quality database.</p><label class="ql-button primary ql-upload-button">Select inspection CSV<input type="file" data-file-input accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden /></label><div class="ql-drop-hint">or drop a CSV file here · maximum 15 MB</div><div class="ql-schema-example"><span>COMMON COLUMNS</span><code>timestamp, characteristic, part, lot, value, subgroup, unit, lsl, usl</code></div><div class="ql-no-source"><b>Not connected:</b> no sensor, MES, historian, or backend is feeding this page.</div></div>`;
  }

  function saveScope(key, value) {
    state.filters[key] = value;
    state.analysis = null;
    state.prepared = null;
    state.error = '';
    render();
  }

  function runAnalysis() {
    state.error = '';
    try {
      const prepared = model.prepareMeasurements(state.parsed, state.mapping, {
        characteristicName: state.characteristicName,
        filters: state.filters
      });
      const enteredLsl = state.manualLsl.trim() ? model.parseNumber(state.manualLsl) : null;
      const enteredUsl = state.manualUsl.trim() ? model.parseNumber(state.manualUsl) : null;
      if (state.manualLsl.trim() && enteredLsl === null) throw new Error('Lower specification must be a valid number.');
      if (state.manualUsl.trim() && enteredUsl === null) throw new Error('Upper specification must be a valid number.');
      const lsl = enteredLsl ?? prepared.lowerSpec.value;
      const usl = enteredUsl ?? prepared.upperSpec.value;
      if (lsl !== null && usl !== null && lsl >= usl) throw new Error('Lower specification must be below upper specification.');
      const analysis = model.analyzeMeasurements(prepared, { subgroup: Number.isInteger(state.mapping.subgroup) && state.mapping.subgroup >= 0, lsl, usl });
      state.prepared = prepared;
      state.analysis = analysis;
      render();
      document.getElementById('qlResultsHeading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      state.error = error.message || 'The selected data could not be analyzed.';
      render();
    }
  }

  function exportReport() {
    if (!state.analysis || !state.prepared) return;
    const report = {
      reportType: 'QualityOS local inspection-data analysis',
      generatedAt: new Date().toISOString(),
      source: { fileName: state.file.name, fileBytes: state.file.size, importedAt: state.file.importedAt, transport: 'browser-local file read; not uploaded', mapping: state.mapping, mappedHeaders: Object.fromEntries(Object.entries(state.mapping).map(([key, index]) => [key, Number.isInteger(index) && index >= 0 ? state.parsed.headers[index] : null])), filters: state.filters, characteristicName: state.characteristicName || null, unitName: state.unitName || null, manuallyProvidedSpecs: { lsl: state.manualLsl || null, usl: state.manualUsl || null }, delimiter: state.parsed.delimiter },
      method: { chart: state.analysis.method, order: state.analysis.timeOrdered ? 'mapped timestamp' : 'CSV row order', rules: ['one point beyond estimated control limit', '8 consecutive points on one side of center', '6 consecutive points strictly increasing/decreasing'], capabilityCaveat: 'Cp/Cpk require a stable, approximately normal process; no normality test is performed.' },
      quality: { inputRows: state.analysis.sourceRowCount, includedRows: state.analysis.count, rejectedRows: state.analysis.rejectedRows, filteredRows: state.analysis.filteredRows, invalidTimestampRows: state.prepared.invalidTimestampRows, missingSubgroupRows: state.prepared.missingSubgroupRows },
      analysis: state.analysis,
      includedMeasurements: state.prepared.measurements
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-')}-quality-analysis.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind() {
    root.querySelectorAll('[data-file-input]').forEach(input => input.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try { if (file.size > maxFileBytes) throw new Error('Choose a CSV file smaller than 15 MB for this browser-local analysis.'); setFile(file, await file.text()); }
      catch (error) { state.error = error.message || 'Could not read this file.'; }
      render();
    }));
    const dropzone = root.querySelector('.ql-empty');
    if (dropzone) {
      dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('dragging'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
      dropzone.addEventListener('drop', async event => {
        event.preventDefault(); dropzone.classList.remove('dragging');
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        try { if (file.size > maxFileBytes) throw new Error('Choose a CSV file smaller than 15 MB for this browser-local analysis.'); setFile(file, await file.text()); }
        catch (error) { state.error = error.message || 'Could not read this file.'; }
        render();
      });
    }
    root.querySelectorAll('[data-map-column]').forEach(select => select.addEventListener('change', () => {
      const key = select.dataset.mapColumn;
      state.mapping[key] = Number(select.value) >= 0 ? Number(select.value) : null;
      if (scopeKeys.includes(key)) defaultForColumn(key);
      state.analysis = null; state.prepared = null; state.error = ''; render();
    }));
    root.querySelectorAll('[data-scope-filter]').forEach(select => select.addEventListener('change', () => saveScope(select.dataset.scopeFilter, select.value)));
    const invalidateResults = () => { state.analysis = null; state.prepared = null; root.querySelector('.ql-results')?.remove(); };
    root.querySelector('#manualCharacteristic')?.addEventListener('input', event => { state.characteristicName = event.target.value; invalidateResults(); const button = root.querySelector('#runAnalysis'); if (button) button.disabled = !mappingReady(); });
    root.querySelector('#manualUnit')?.addEventListener('input', event => { state.unitName = event.target.value; invalidateResults(); });
    root.querySelector('#specLsl')?.addEventListener('input', event => { state.manualLsl = event.target.value; invalidateResults(); });
    root.querySelector('#specUsl')?.addEventListener('input', event => { state.manualUsl = event.target.value; invalidateResults(); });
    root.querySelector('#runAnalysis')?.addEventListener('click', runAnalysis);
    root.querySelector('#exportAnalysis')?.addEventListener('click', exportReport);
    root.querySelector('#discardCsv')?.addEventListener('click', () => {
      if (!window.confirm('Clear the imported file and calculated results from this tab?')) return;
      state.file = null; state.parsed = null; state.mapping = {}; state.filters = {}; state.prepared = null; state.analysis = null; state.error = '';
      render();
    });
  }

  function render() {
    root.innerHTML = shellMarkup();
    if (state.error) {
      const target = root.querySelector('.ql-workbench');
      if (target && !target.querySelector('.ql-error')) target.insertAdjacentHTML('afterbegin', `<div class="ql-error ql-global-error" role="alert">${esc(state.error)}</div>`);
    }
    bind();
  }

  render();
})();
