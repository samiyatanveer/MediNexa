// backend/src/services/generation/DomainFormatter.js
// Formats validated domain field maps into canonical medicine/instrument/inventory responses.

/**
 * Format a list of medicine retrieval hits (stock-filter / low-stock queries).
 * Bypasses the LLM field-template entirely — data comes straight from the KB.
 *
 * @param {Array}  results   RetrievalHit[] from KeywordRetriever
 * @param {string} label     Human-readable description (e.g. "Medicines with stock below 100 units")
 * @returns {{ type: 'medicine-list', label, count, items, sources }}
 */
export function formatMedicineList(results, label = 'Medicines') {
  const items = results.map(r => ({
    name:    r.record.name        ?? 'Unknown',
    dosage:  r.record.dosage      ?? '—',
    form:    r.record.form        ?? '—',
    stock:   r.record.stock_units ?? 0,
    batch:   r.record.batch_id    ?? '—',
    source:  r.id,
  }));

  const sources = results.map(r => r.id).join(', ');

  return {
    type:    'medicine-list',
    label,
    count:   items.length,
    items,
    sources,
  };
}

/**
 * Format a medicine validated result.
 * @param {{ fields: object, valid: boolean, repaired: boolean, raw: string }} validated
 * @param {string[]} sourceIds
 */
export function formatMedicine(validated, sourceIds = []) {
  const { fields, valid, repaired, raw } = validated;
  return {
    type:             'medicine',
    medicine:         fields['Medicine']         ?? '',
    dosage:           fields['Dosage']           ?? '',
    form:             fields['Form']             ?? '',
    indications:      fields['Indications']      ?? '',
    contraindications:fields['Contraindications'] ?? '',
    stock:            fields['Stock']            ?? '',
    batch:            fields['Batch']            ?? '',
    sources:          fields['Sources']          ?? sourceIds.join(', '),
    valid,
    repaired,
    raw,
  };
}

/**
 * Format an instrument validated result.
 * @param {{ fields: object, valid: boolean, repaired: boolean, raw: string }} validated
 * @param {string[]} sourceIds
 */
export function formatInstrument(validated, sourceIds = []) {
  const { fields, valid, repaired, raw } = validated;
  return {
    type:              'instrument',
    instrument:        fields['Instrument']        ?? '',
    category:          fields['Category']          ?? '',
    department:        fields['Department']        ?? '',
    operationalStatus: fields['Operational Status'] ?? '',
    maintenance:       fields['Maintenance']       ?? '',
    calibration:       fields['Calibration']       ?? '',
    sources:           fields['Sources']           ?? sourceIds.join(', '),
    valid,
    repaired,
    raw,
  };
}

/**
 * Format an inventory validated result.
 * @param {{ fields: object, valid: boolean, repaired: boolean, raw: string }} validated
 * @param {string[]} sourceIds
 */
export function formatInventory(validated, sourceIds = []) {
  const { fields, valid, repaired, raw } = validated;
  return {
    type:         'inventory',
    item:         fields['Item']          ?? '',
    category:     fields['Category']      ?? '',
    quantity:     fields['Quantity']      ?? '',
    location:     fields['Location']      ?? '',
    reorderLevel: fields['Reorder Level'] ?? '',
    status:       fields['Status']        ?? '',
    sources:      fields['Sources']       ?? sourceIds.join(', '),
    valid,
    repaired,
    raw,
  };
}

/**
 * Select the correct formatter for a category and apply it.
 * @param {string} category
 * @param {{ fields: object, valid: boolean, repaired: boolean, raw: string }} validated
 * @param {string[]} sourceIds
 */
export function formatDomain(category, validated, sourceIds = []) {
  switch (category) {
    case 'medicine':      return formatMedicine(validated, sourceIds);
    case 'instrument':    return formatInstrument(validated, sourceIds);
    case 'inventory':     return formatInventory(validated, sourceIds);
    default:              return formatMedicine(validated, sourceIds);
  }
}

export default formatDomain;
