// backend/src/services/generation/TemplateValidator.js
// Validates and deterministically repairs SOAP / domain template responses.

// ─── SOAP ─────────────────────────────────────────────────────────────────────
const SOAP_FIELDS = ['Subjective', 'Objective', 'Assessment', 'Plan', 'Sources'];
const MEDICINE_FIELDS   = ['Medicine', 'Dosage', 'Form', 'Indications', 'Contraindications', 'Stock', 'Batch', 'Sources'];
const INSTRUMENT_FIELDS = ['Instrument', 'Category', 'Department', 'Operational Status', 'Maintenance', 'Calibration', 'Sources'];
const INVENTORY_FIELDS  = ['Item', 'Category', 'Quantity', 'Location', 'Reorder Level', 'Status', 'Sources'];

const TEMPLATE_FIELDS = {
  patient:    SOAP_FIELDS,
  medicine:   MEDICINE_FIELDS,
  instrument: INSTRUMENT_FIELDS,
  inventory:  INVENTORY_FIELDS,
};

const FALLBACK_VALUES = {
  'Subjective':          'Patient information not available in retrieved records.',
  'Objective':           'Vital signs not available in retrieved records.',
  'Assessment':          'Assessment cannot be determined from available records.',
  'Plan':                'No plan data available in retrieved records.',
  'Medicine':            'Not available',
  'Dosage':              'Not available',
  'Form':                'Not available',
  'Indications':         'Not available',
  'Contraindications':   'Not available',
  'Stock':               'Not available',
  'Batch':               'Not available',
  'Instrument':          'Not available',
  'Category':            'Not available',
  'Department':          'Not available',
  'Operational Status':  'Not available',
  'Maintenance':         'Not available',
  'Calibration':         'Not available',
  'Item':                'Not available',
  'Quantity':            'Not available',
  'Location':            'Not available',
  'Reorder Level':       'Not available',
  'Status':              'Not available',
  'Sources':             'No sources available',
};

/**
 * Parse a raw LLM response string into a field→value map.
 * Handles "Field:\nValue" and "Field: Value" patterns.
 * @param {string} text
 * @param {string[]} fields
 * @returns {Map<string, string>}
 */
function parseFields(text, fields) {
  const result = new Map();
  const sortedFields = [...fields].sort((a, b) => b.length - a.length); // longest first for greedy match

  // Build a regex pattern for each field label
  for (const field of sortedFields) {
    const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `${escapedField}\\s*:\\s*([\\s\\S]*?)(?=(?:${
        fields.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:').join('|')
      })|$)`,
      'i'
    );
    const match = text.match(pattern);
    if (match) {
      result.set(field, match[1].trim());
    }
  }
  return result;
}

/**
 * Validate a raw response text against a category's template.
 * Returns a repaired, complete structured object.
 *
 * @param {string} text         Raw Ollama response
 * @param {string} category     'patient'|'medicine'|'instrument'|'inventory'
 * @param {string[]} sourceIds  Masked source IDs to inject if Sources field empty
 * @returns {{ valid: boolean, repaired: boolean, fields: object, raw: string }}
 */
export function validateAndRepair(text, category, sourceIds = []) {
  const fields = TEMPLATE_FIELDS[category] ?? SOAP_FIELDS;
  const parsed = parseFields(text, fields);

  let repaired = false;
  const output = {};

  for (const field of fields) {
    const value = parsed.get(field);
    if (value && value.length > 2) {
      output[field] = value;
    } else {
      // Inject source IDs into the Sources field, otherwise use fallback
      if (field === 'Sources' && sourceIds.length > 0) {
        output[field] = sourceIds.join(', ');
      } else {
        output[field] = FALLBACK_VALUES[field] ?? 'Not available';
      }
      repaired = true;
    }
  }

  // Ensure Sources always contains the real IDs if present
  if (sourceIds.length > 0) {
    const currentSources = output['Sources'] ?? '';
    const missing = sourceIds.filter(id => !currentSources.includes(id));
    if (missing.length > 0) {
      output['Sources'] = `${currentSources}${currentSources ? '; ' : ''}${missing.join(', ')}`;
      repaired = true;
    }
  }

  const allFieldsPresent = fields.every(f => f in output && output[f].length > 2);

  return {
    valid:    allFieldsPresent && !repaired,
    repaired,
    fields:   output,
    raw:      text,
  };
}

/**
 * Quick check — does a text string contain all required fields for a category?
 * @param {string} text
 * @param {string} category
 * @returns {boolean}
 */
export function hasRequiredFields(text, category) {
  const fields = TEMPLATE_FIELDS[category] ?? SOAP_FIELDS;
  return fields.every(field =>
    new RegExp(`${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'i').test(text)
  );
}

export const TEMPLATES = TEMPLATE_FIELDS;
export default validateAndRepair;
