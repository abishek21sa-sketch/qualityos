(function attachQualityOsHandoffModel(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QualityOSHandoffModel = model;
})(typeof globalThis === 'object' ? globalThis : this, function createQualityOsHandoffModel() {
  const SHIFT_HANDOFF_ITEMS = Object.freeze([
    Object.freeze({ id: 'lot-hold', title: 'Keep the affected lot on hold', reference: 'NCR-0264 · L240908-17', instruction: 'Do not release the 48-piece lot until Quality confirms disposition.', tone: 'stop' }),
    Object.freeze({ id: 'burr-sort', title: 'Finish the 100% burr-height sort', reference: 'BRK-204 · 0.42 mm upper control limit', instruction: 'Record accepted / rejected counts and attach the sort results before the next review.', tone: 'watch' }),
    Object.freeze({ id: 'supplier-proof', title: 'Review supplier setup and tool-change evidence', reference: 'Northstar Precision · Deburr Station 2', instruction: 'Compare the setup sheet and tool-change interval with the suspected wear mechanism.', tone: 'review' })
  ]);

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function createShiftHandoffDraft(now = new Date()) {
    return { date: localDateValue(now), shift: 'Shift B', outgoing: 'Maya Chen', incoming: 'Jordan Lee', note: '' };
  }

  function createShiftHandoffRecord(draft, { id, issuedAt = new Date().toISOString() } = {}) {
    const normalized = {
      date: String(draft?.date || '').trim(),
      shift: String(draft?.shift || '').trim(),
      outgoing: String(draft?.outgoing || '').trim(),
      incoming: String(draft?.incoming || '').trim(),
      note: String(draft?.note || '').trim()
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) throw new Error('Choose a valid handoff date.');
    if (!normalized.shift || !normalized.outgoing || !normalized.incoming) throw new Error('Add the shift and both operator names before issuing the handoff.');
    if (normalized.outgoing.length > 80 || normalized.incoming.length > 80) throw new Error('Operator names must be 80 characters or fewer.');
    if (normalized.note.length > 2000) throw new Error('The handoff note must be 2,000 characters or fewer.');
    return {
      id: String(id || `SH-${Date.now().toString(36).toUpperCase()}`),
      ...normalized,
      items: SHIFT_HANDOFF_ITEMS.map(item => ({ id: item.id, acknowledged: false })),
      issuedAt: new Date(issuedAt).toISOString(),
      acceptedAt: '',
      acceptedBy: ''
    };
  }

  function acknowledgeShiftHandoffItem(record, itemId, acknowledged = true) {
    if (!record || !Array.isArray(record.items) || !record.items.some(item => item.id === itemId)) {
      throw new Error('That handoff item could not be found.');
    }
    if (record.acceptedAt) throw new Error('An accepted handoff is read-only.');
    return { ...record, items: record.items.map(item => item.id === itemId ? { ...item, acknowledged: Boolean(acknowledged) } : { ...item }) };
  }

  function canAcceptShiftHandoff(record, acceptedBy) {
    return Boolean(record && !record.acceptedAt && String(acceptedBy || '').trim().toLocaleLowerCase() === String(record.incoming || '').trim().toLocaleLowerCase() && Array.isArray(record.items) && record.items.length > 0 && record.items.every(item => item.acknowledged === true));
  }

  function acceptShiftHandoff(record, { acceptedBy, acceptedAt = new Date().toISOString() } = {}) {
    if (!record || record.acceptedAt) throw new Error('This handoff is not awaiting acceptance.');
    if (String(acceptedBy || '').trim().toLocaleLowerCase() !== String(record.incoming || '').trim().toLocaleLowerCase()) {
      throw new Error(`Only the named incoming operator (${record.incoming}) can accept this handoff.`);
    }
    if (!Array.isArray(record.items) || record.items.length === 0 || record.items.some(item => item.acknowledged !== true)) {
      throw new Error('Review and acknowledge every follow-up before accepting the handoff.');
    }
    return { ...record, acceptedBy: record.incoming, acceptedAt: new Date(acceptedAt).toISOString(), items: record.items.map(item => ({ ...item })) };
  }

  function shiftHandoffStatus(record) {
    if (!record) return 'draft';
    if (record.acceptedAt) return 'accepted';
    if (Array.isArray(record.items) && record.items.length > 0 && record.items.every(item => item.acknowledged === true)) return 'ready-to-accept';
    return 'awaiting-receipt';
  }

  return Object.freeze({ SHIFT_HANDOFF_ITEMS, createShiftHandoffDraft, createShiftHandoffRecord, acknowledgeShiftHandoffItem, canAcceptShiftHandoff, acceptShiftHandoff, shiftHandoffStatus });
});
