(function installQualityOsShiftHandoff() {
  const model = globalThis.QualityOSHandoffModel;
  if (!model || typeof setView !== 'function' || typeof mainContent === 'undefined' || typeof phaseViews === 'undefined') return;

  const storageKey = 'qualityos-shift-handoffs-v1';
  const emptyState = () => ({ version: 1, draft: model.createShiftHandoffDraft(), records: [] });
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || saved.version !== 1 || !saved.draft || !Array.isArray(saved.records)) return emptyState();
      const defaults = model.createShiftHandoffDraft();
      const draft = { ...defaults };
      for (const field of ['date', 'shift', 'outgoing', 'incoming', 'note']) {
        if (typeof saved.draft[field] === 'string') draft[field] = saved.draft[field].slice(0, field === 'note' ? 2000 : 80);
      }
      const records = saved.records.filter(record => record && typeof record.id === 'string' && typeof record.incoming === 'string' && Array.isArray(record.items)).slice(0, 20);
      return { version: 1, draft, records };
    } catch { return emptyState(); }
  }

  let state = loadState();
  function persistState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      const status = document.getElementById('shiftSaveState');
      if (status) status.textContent = 'Draft saved in this browser';
      return true;
    } catch {
      const status = document.getElementById('shiftSaveState');
      if (status) status.textContent = 'Browser storage unavailable · print before leaving';
      return false;
    }
  }

  function getPendingRecord() { return state.records.find(record => !record.acceptedAt) || null; }
  function getLatestRecord() { return state.records[0] || null; }

  function draftMarkup() {
    const draft = state.draft;
    return `<form id="shiftDraftForm" class="shift-draft-form" autocomplete="on">
      <div class="shift-field"><label for="shiftDate">Handoff date</label><input id="shiftDate" type="date" data-draft-field="date" value="${escapeHtml(draft.date)}" required /></div>
      <div class="shift-field"><label for="shiftCode">Shift</label><select id="shiftCode" data-draft-field="shift"><option${draft.shift === 'Shift A' ? ' selected' : ''}>Shift A</option><option${draft.shift === 'Shift B' ? ' selected' : ''}>Shift B</option><option${draft.shift === 'Shift C' ? ' selected' : ''}>Shift C</option></select></div>
      <div class="shift-field"><label for="shiftOutgoing">Outgoing operator</label><input id="shiftOutgoing" data-draft-field="outgoing" maxlength="80" value="${escapeHtml(draft.outgoing)}" required /></div>
      <div class="shift-field"><label for="shiftIncoming">Incoming operator</label><input id="shiftIncoming" data-draft-field="incoming" maxlength="80" value="${escapeHtml(draft.incoming)}" required /></div>
      <div class="shift-field wide"><label for="shiftNote">What changed this shift? (optional)</label><textarea id="shiftNote" data-draft-field="note" maxlength="2000" placeholder="Add the latest measurement, decision, or blocker the next operator needs.">${escapeHtml(draft.note)}</textarea></div>
      <div id="shiftSaveState" class="shift-save-state" role="status">Draft stays on this browser only.</div>
    </form>`;
  }

  function openItemsMarkup(record) {
    const itemStates = new Map((record?.items || []).map(item => [item.id, item]));
    return model.SHIFT_HANDOFF_ITEMS.map((item, index) => `<div class="shift-item">
      <div class="shift-item-index">0${index + 1}</div>
      <div><div class="shift-item-title">${escapeHtml(item.title)}</div><div class="shift-item-ref">${escapeHtml(item.reference)}</div><div class="shift-item-instruction">${escapeHtml(item.instruction)}</div></div>
      <div class="shift-item-tag ${escapeHtml(item.tone)}">${item.tone === 'stop' ? 'Hold point' : item.tone === 'watch' ? 'Next check' : 'Evidence'}</div>
    </div>`).join('');
  }

  function receiptMarkup(record) {
    if (!record) return `<section class="shift-receipt"><div class="shift-receipt-head"><div><div class="shift-section-kicker">Incoming side · sign-off</div><h3>No transfer issued yet</h3></div><div class="shift-receipt-status">Draft only</div></div><div class="shift-empty">Issue the outgoing handoff to freeze a snapshot of these follow-ups. The next shift must review each instruction before taking ownership.</div></section>`;
    const pending = !record.acceptedAt;
    const checkedCount = record.items.filter(item => item.acknowledged === true).length;
    const statusText = pending ? `${checkedCount} / ${record.items.length} acknowledged` : `Accepted by ${escapeHtml(record.acceptedBy)} · ${escapeHtml(new Date(record.acceptedAt).toLocaleString())}`;
    const items = model.SHIFT_HANDOFF_ITEMS.map(item => {
      const checked = record.items.find(saved => saved.id === item.id)?.acknowledged === true;
      return `<div class="shift-receipt-item"><input id="received-${escapeHtml(record.id)}-${escapeHtml(item.id)}" type="checkbox" data-receive-item="${escapeHtml(item.id)}"${checked ? ' checked' : ''}${pending ? '' : ' disabled'} /><label for="received-${escapeHtml(record.id)}-${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.reference)} — ${escapeHtml(item.instruction)}</small></label></div>`;
    }).join('');
    const receivingControl = pending
      ? `<div class="shift-field"><label for="shiftAcceptName">Type your name to accept · assigned to ${escapeHtml(record.incoming)}</label><input id="shiftAcceptName" value="${escapeHtml(record.incoming)}" autocomplete="name" /></div><button class="shift-button" id="acceptShiftHandoff" type="button" disabled>Accept & take ownership</button>`
      : `<button class="shift-button secondary shift-no-print" id="prepareNextHandoff" type="button">Prepare next transfer</button>`;
    const note = record.note ? `<p><strong>Outgoing note:</strong> ${escapeHtml(record.note)}</p>` : '';
    return `<section class="shift-receipt ${pending ? 'pending' : ''}" aria-labelledby="shiftReceiptHeading">
      <div class="shift-receipt-head"><div><div class="shift-section-kicker">Incoming side · ${pending ? 'receipt required' : 'closed transfer'}</div><h3 id="shiftReceiptHeading">${escapeHtml(record.shift)} · ${escapeHtml(record.date)}</h3><div class="shift-item-instruction">From ${escapeHtml(record.outgoing)} to ${escapeHtml(record.incoming)} · Ref ${escapeHtml(record.id)}</div></div><div class="shift-receipt-status" id="shiftReceiptProgress">${statusText}</div></div>
      ${note}<div class="shift-receipt-items">${items}</div>
      <div class="shift-receipt-foot"><p>${pending ? 'Acknowledgement means you received these instructions; it does not certify a sort, release a lot, or replace your plant’s controlled quality records.' : 'This acceptance is a local demonstration record, not an authenticated electronic signature.'}</p><div class="shift-field shift-no-print">${receivingControl}</div></div>
    </section>`;
  }

  function historyMarkup() {
    if (!state.records.length) return '';
    const entries = state.records.slice(0, 5).map(record => `<span class="shift-history-entry">${escapeHtml(record.id)} · ${escapeHtml(record.shift)} · ${record.acceptedAt ? 'accepted' : 'awaiting receipt'}</span>`).join('');
    return `<div class="shift-history"><strong>Recent local transfers</strong>${entries}</div>`;
  }

  function renderShiftHandoff() {
    const root = document.getElementById('shiftHandoffRoot');
    if (!root) return;
    const pending = getPendingRecord();
    const latest = pending || getLatestRecord();
    root.innerHTML = `<div class="shift-stage"><article class="shift-paper">
      <div class="shift-serial"><span>QualityOS / shop-floor traveler</span><span>Local demo · not a controlled record</span></div>
      <header class="shift-hero"><div><div class="shift-kicker">The quality record that crosses the shift boundary</div><h1>Shift handoff</h1><p>Carry the hold, the next check, and the reason forward—then have the incoming operator acknowledge what they’ve received.</p></div><div class="shift-stamp">Plant 04<br />Transfer sheet</div></header>
      <div class="shift-body">
        <div class="shift-section-head"><div><div class="shift-section-kicker">01 / outgoing operator</div><h2>Write down what must not get lost.</h2></div><p>Keep the case attached to its lot and process. A handoff is not complete just because someone left a note.</p></div>
        ${draftMarkup()}
        <section class="shift-worklist" aria-labelledby="shiftWorklistHeading"><div class="shift-worklist-head"><h3 id="shiftWorklistHeading">Carry-forward instructions</h3><span class="shift-fixture">Illustrative NCR-0264 case · verify against actual plant records</span></div>
          ${openItemsMarkup(latest)}
          <div class="shift-issue-row"><div class="shift-issue-note">Issuing creates a frozen handoff in this browser. It does not notify another person or synchronize to a server.</div><button class="shift-button" type="button" id="issueShiftHandoff"${pending ? ' disabled' : ''}>${pending ? 'Waiting for incoming receipt' : 'Issue handoff to next shift'}</button></div>
        </section>
        <div id="shiftReceiptArea">${receiptMarkup(latest)}</div>
        ${historyMarkup()}
        <footer class="shift-disclaimer"><span><strong>Demo boundary:</strong> this browser-local handoff is not shared across devices and is not a controlled production record.</span><button class="shift-button secondary shift-no-print" id="printShiftHandoff" type="button">Print / save PDF</button></footer>
      </div>
    </article></div>`;
    bindDraftForm();
    bindIssueButton();
    bindReceipt(latest, pending);
    document.getElementById('printShiftHandoff')?.addEventListener('click', () => window.print());
  }

  function bindDraftForm() {
    const form = document.getElementById('shiftDraftForm');
    if (!form) return;
    form.addEventListener('submit', event => event.preventDefault());
    form.querySelectorAll('[data-draft-field]').forEach(field => {
      const save = () => { state.draft[field.dataset.draftField] = field.value; persistState(); };
      field.addEventListener('input', save);
      field.addEventListener('change', save);
    });
  }

  function bindIssueButton() {
    document.getElementById('issueShiftHandoff')?.addEventListener('click', () => {
      if (getPendingRecord()) return;
      try {
        const record = model.createShiftHandoffRecord(state.draft, { id: `SH-${Date.now().toString(36).toUpperCase()}` });
        state.records.unshift(record);
        state.records = state.records.slice(0, 20);
        persistState();
        recordEvent('⇄', 'amber', 'Shift handoff issued', `${record.id} · ${record.shift} · NCR-0264 / L240908-17`);
        showToast(`Handoff ${record.id} issued in this browser; the incoming operator must acknowledge each item.`);
        renderShiftHandoff();
      } catch (error) { showToast(error.message); }
    });
  }

  function bindReceipt(record, pending) {
    if (!record) return;
    const acceptanceName = document.getElementById('shiftAcceptName');
    const acceptButton = document.getElementById('acceptShiftHandoff');
    const updateAcceptState = () => { if (acceptButton) acceptButton.disabled = !model.canAcceptShiftHandoff(record, acceptanceName?.value); };
    document.querySelectorAll('[data-receive-item]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (!pending) return;
        try {
          const updated = model.acknowledgeShiftHandoffItem(record, checkbox.dataset.receiveItem, checkbox.checked);
          state.records = state.records.map(item => item.id === updated.id ? updated : item);
          record = updated;
          persistState();
          const count = record.items.filter(item => item.acknowledged).length;
          const progress = document.getElementById('shiftReceiptProgress');
          if (progress) progress.textContent = `${count} / ${record.items.length} acknowledged`;
          updateAcceptState();
        } catch (error) { showToast(error.message); }
      });
    });
    acceptanceName?.addEventListener('input', updateAcceptState);
    acceptButton?.addEventListener('click', () => {
      try {
        const accepted = model.acceptShiftHandoff(record, { acceptedBy: acceptanceName?.value });
        state.records = state.records.map(item => item.id === accepted.id ? accepted : item);
        persistState();
        recordEvent('✓', 'green', 'Incoming shift accepted handoff', `${accepted.id} · ${accepted.acceptedBy} · all follow-ups acknowledged`);
        showToast(`Handoff accepted by ${accepted.acceptedBy}.`);
        renderShiftHandoff();
      } catch (error) { showToast(error.message); }
    });
    document.getElementById('prepareNextHandoff')?.addEventListener('click', () => {
      const nextShift = state.draft.shift === 'Shift A' ? 'Shift B' : state.draft.shift === 'Shift B' ? 'Shift C' : 'Shift A';
      state.draft = { ...model.createShiftHandoffDraft(), shift: nextShift, outgoing: record.acceptedBy || record.incoming, incoming: '', note: '' };
      persistState();
      renderShiftHandoff();
      document.getElementById('shiftIncoming')?.focus();
    });
    updateAcceptState();
  }

  phaseViews.handoff = '<div class="phase-view" id="shiftHandoffRoot"></div>';
  viewLabels.handoff = 'Shift handoff';
  const nav = document.querySelector('.sidebar nav');
  if (nav && !document.querySelector('[data-view="handoff"]')) {
    const group = document.createElement('div');
    group.className = 'nav-group';
    group.innerHTML = '<div class="nav-title">Shop floor</div><button class="nav-item" data-view="handoff"><span class="nav-icon" aria-hidden="true">⇄</span><span>Shift handoff</span></button>';
    nav.appendChild(group);
    group.querySelector('[data-view="handoff"]').addEventListener('click', () => {
      setView('handoff', viewLabels.handoff);
      renderShiftHandoff();
    });
  }
})();
