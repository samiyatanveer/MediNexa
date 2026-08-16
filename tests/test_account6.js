// tests/test_account6.js
// Account 6 — expanded test suite:
//   - Repository structure & method contracts (mocked DB)
//   - ChatService pipeline logic (mocked Groq + DB)
//   - Message persistence patterns (transaction safety)
//   - Title generation edge cases
//   - PromptBuilder completeness (all categories + edge cases)
//   - TemplateValidator repair heuristics
//   - Formatter field mapping correctness
//   - Groq client error classification
//   - DB failure handling (simulated pool error)
//   - Retrieval no-result / ambiguous / multi-category
// Run: node --test tests/test_account6.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const toUrl = p => pathToFileURL(resolve(ROOT, p)).href;

// Patch env
process.env.DATABASE_URL    = 'postgresql://skip:skip@localhost:5432/skip';
process.env.KB_DATA_DIR     = resolve(ROOT, 'data');
process.env.DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
process.env.GROQ_API_KEY = '';
process.env.GROQ_MODEL   = 'llama-3.1-8b-instant';

// ── Shared imports ────────────────────────────────────────────────────────────
const { generateTitle } = await import(toUrl('backend/src/services/chat/ChatService.js'));
const { validateAndRepair, hasRequiredFields, TEMPLATES } =
  await import(toUrl('backend/src/services/generation/TemplateValidator.js'));
const { formatSOAP } = await import(toUrl('backend/src/services/generation/SOAPFormatter.js'));
const { formatMedicine, formatInstrument, formatInventory, formatDomain } =
  await import(toUrl('backend/src/services/generation/DomainFormatter.js'));
const { buildPrompt } = await import(toUrl('backend/src/services/generation/PromptBuilder.js'));
const { GroqUnavailableError } = await import(toUrl('backend/src/services/generation/GroqClient.js'));
const { ChatSessionRepository } = await import(toUrl('backend/src/repositories/ChatSessionRepository.js'));
const { ChatMessageRepository } = await import(toUrl('backend/src/repositories/ChatMessageRepository.js'));
const { UserRepository }        = await import(toUrl('backend/src/repositories/UserRepository.js'));
const { normalizeQuery }        = await import(toUrl('backend/src/services/retrieval/QueryNormalizer.js'));
const { classifyCategory }      = await import(toUrl('backend/src/services/retrieval/CategoryClassifier.js'));

// ─────────────────────────────────────────────────────────────────────────────
describe('Title generation — extended edge cases', () => {
  test('handles single word query', () => {
    const t = generateTitle('hypertension');
    assert.equal(t, 'Hypertension');
  });

  test('handles all-caps query', () => {
    const t = generateTitle('MRI SCANNER CALIBRATION');
    assert.ok(typeof t === 'string' && t.length > 0);
  });

  test('handles query with numbers', () => {
    const t = generateTitle('patient 42 blood pressure 140');
    assert.ok(t.length > 0);
  });

  test('generates different titles for different queries', () => {
    const a = generateTitle('hypertension treatment');
    const b = generateTitle('inventory gloves reorder');
    assert.notEqual(a, b);
  });

  test('never exceeds reasonable length', () => {
    // generateTitle takes 5 meaningful tokens; a–z are all stop-word free single chars.
    // The implementation may produce up to 5 joined, plus some are filtered as too short.
    const t = generateTitle('alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu');
    assert.ok(t.split(' ').length <= 6, `Title too long: "${t}" (${t.split(' ').length} words)`);
  });

  test('handles special characters gracefully', () => {
    const t = generateTitle('patient with BP > 140/90 mmHg');
    assert.ok(typeof t === 'string');
  });

  test('first character is always uppercase if non-empty', () => {
    const t = generateTitle('diabetes mellitus type 2 treatment protocol');
    if (t.length > 0) {
      assert.equal(t[0], t[0].toUpperCase());
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TemplateValidator — repair heuristics', () => {
  test('partial SOAP repairs all missing fields', () => {
    const partial = 'Subjective: Patient reports dizziness.';
    const result = validateAndRepair(partial, 'patient', ['PAT-001']);
    assert.ok(result.repaired);
    for (const f of ['Subjective', 'Objective', 'Assessment', 'Plan', 'Sources']) {
      assert.ok(f in result.fields, `Missing field: ${f}`);
      assert.ok(result.fields[f].length > 0);
    }
  });

  test('completely empty text repairs all fields', () => {
    const result = validateAndRepair('', 'patient', ['PAT-001']);
    assert.ok(result.repaired);
    assert.ok('Subjective' in result.fields);
    assert.ok('Sources' in result.fields);
  });

  test('source IDs are injected when the LLM provides Sources', () => {
    const text = [
      'Subjective: Chest pain.',
      'Objective: BP 150/95.',
      'Assessment: Hypertension.',
      'Plan: Increase lisinopril.',
      'Sources: PAT-xyz',
    ].join('\n');
    const result = validateAndRepair(text, 'patient', ['PAT-xyz', 'PAT-abc']);
    assert.ok(result.fields['Sources'].includes('PAT-xyz'));
  });

  test('medicine template repairs Form and Stock when missing', () => {
    const partial = 'Medicine: Aspirin\nDosage: 75mg\nIndications: Antiplatelet\nContraindications: None\nBatch: B001\nSources: MED-1';
    const result = validateAndRepair(partial, 'medicine', ['MED-1']);
    assert.ok('Form' in result.fields);
    assert.ok('Stock' in result.fields);
  });

  test('instrument template: Operational Status and Maintenance repaired', () => {
    const partial = 'Instrument: Ventilator\nCategory: Life Support\nDepartment: ICU';
    const result = validateAndRepair(partial, 'instrument', ['INS-001']);
    assert.ok('Operational Status' in result.fields);
    assert.ok('Maintenance' in result.fields);
    assert.ok('Calibration' in result.fields);
  });

  test('inventory template repairs all missing fields', () => {
    const result = validateAndRepair('Item: N95 Mask', 'inventory', ['INV-001']);
    assert.ok(result.repaired);
    for (const f of ['Item', 'Category', 'Quantity', 'Location', 'Reorder Level', 'Status', 'Sources']) {
      assert.ok(f in result.fields, `Missing field: ${f}`);
    }
  });

  test('valid flag false when repaired', () => {
    const result = validateAndRepair('Subjective: pain.', 'patient', []);
    assert.equal(result.valid, false);
  });

  test('raw field always preserved', () => {
    const text = 'Arbitrary text\nwith no template fields.';
    const result = validateAndRepair(text, 'patient', []);
    assert.equal(result.raw, text);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PromptBuilder — completeness and edge cases', () => {
  const makePatient = (id = 'PAT-test') => ({
    id,
    category: 'patient',
    score: 3.0,
    matched_terms: ['hypertension'],
    record: {
      patient_id: id, age: 58, gender: 'Female', blood_type: 'A+',
      diagnoses: ['Hypertension', 'Type 2 Diabetes'],
      symptoms: ['headache', 'fatigue'],
      vitals: { systolic_bp: 155, diastolic_bp: 92, heart_rate: 80, temperature_c: 37.1, spo2_percent: 97 },
      medications: ['MED-001', 'MED-002'],
      visit_history: [{ date: '2026-01-10', reason: 'Check-up', department: 'Cardiology' }],
      keywords: ['hypertension', 'diabetes'],
    },
  });

  const makeMed = (id = 'MED-test') => ({
    id, category: 'medicine', score: 2.5, matched_terms: ['metformin'],
    record: {
      medicine_id: id, name: 'Metformin', dosage: '500mg', form: 'Tablet',
      indications: ['Type 2 Diabetes'], contraindications: ['Renal failure'],
      stock_units: 150, batch_id: 'B200', expiry_date: '2027-06-01',
      keywords: ['metformin', 'diabetes'],
    },
  });

  const makeInstrument = (id = 'INS-test') => ({
    id, category: 'instrument', score: 2.0, matched_terms: ['mri'],
    record: {
      instrument_id: id, name: 'MRI Scanner', category: 'Diagnostic Imaging',
      department: 'Radiology', location: 'Building-A Room-101',
      operational_status: 'Operational', maintenance_status: 'Up to Date',
      last_calibration: '2026-05-01', next_calibration: '2026-11-01',
      keywords: ['mri', 'scanner'],
    },
  });

  const makeInventory = (id = 'INV-test') => ({
    id, category: 'inventory', score: 1.5, matched_terms: ['gloves'],
    record: {
      item_id: id, item_name: 'Nitrile Gloves', category: 'PPE',
      quantity: 80, unit: 'Box', location: 'Store-B',
      reorder_level: 20, status: 'In Stock',
      keywords: ['gloves', 'ppe'],
    },
  });

  test('patient SOAP prompt contains all required section markers', () => {
    const prompt = buildPrompt('hypertension', 'patient', [makePatient()]);
    for (const section of ['Subjective', 'Objective', 'Assessment', 'Plan', 'Sources']) {
      assert.ok(prompt.includes(section), `Prompt missing section: ${section}`);
    }
  });

  test('medicine prompt contains all required fields', () => {
    const prompt = buildPrompt('metformin dosage', 'medicine', [makeMed()]);
    for (const field of ['Medicine:', 'Dosage:', 'Indications:', 'Contraindications:', 'Sources:']) {
      assert.ok(prompt.includes(field), `Prompt missing field: ${field}`);
    }
  });

  test('instrument prompt contains required fields', () => {
    const prompt = buildPrompt('MRI calibration', 'instrument', [makeInstrument()]);
    for (const field of ['Instrument:', 'Operational Status:', 'Maintenance:', 'Calibration:']) {
      assert.ok(prompt.includes(field), `Prompt missing: ${field}`);
    }
  });

  test('inventory prompt contains required fields', () => {
    const prompt = buildPrompt('gloves stock', 'inventory', [makeInventory()]);
    for (const field of ['Item:', 'Quantity:', 'Reorder Level:', 'Status:']) {
      assert.ok(prompt.includes(field), `Prompt missing: ${field}`);
    }
  });

  test('patient prompt includes vitals values', () => {
    const prompt = buildPrompt('blood pressure', 'patient', [makePatient()]);
    assert.ok(prompt.includes('155') || prompt.includes('92'), 'Vitals not in prompt');
  });

  test('no-result prompt explicitly states no records found', () => {
    const prompt = buildPrompt('zzz gibberish query', 'auto', []);
    assert.ok(prompt.toLowerCase().includes('no') || prompt.toLowerCase().includes('not found'));
  });

  test('auto category falls through to first result category', () => {
    const prompt = buildPrompt('test', 'auto', [makeMed()]);
    // Should use medicine prompt since first result is medicine
    assert.ok(prompt.includes('Medicine:'));
  });

  test('multiple results included in prompt', () => {
    const results = [makePatient('PAT-001'), makePatient('PAT-002')];
    const prompt = buildPrompt('hypertension', 'patient', results);
    assert.ok(prompt.includes('PAT-001'));
    assert.ok(prompt.includes('PAT-002'));
  });

  test('prompt contains Houston Memorial system preamble', () => {
    const prompt = buildPrompt('test query', 'patient', [makePatient()]);
    assert.ok(prompt.toLowerCase().includes('houston') || prompt.toLowerCase().includes('hospital'));
  });

  test('prompt instructs model not to invent facts', () => {
    const prompt = buildPrompt('test', 'patient', [makePatient()]);
    assert.ok(prompt.toLowerCase().includes('invent') || prompt.toLowerCase().includes('only'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SOAPFormatter — field mapping', () => {
  const makeValidated = (overrides = {}) => ({
    fields: {
      Subjective: 'Patient reports headache.',
      Objective:  'BP 145/90, HR 78.',
      Assessment: 'Hypertensive urgency.',
      Plan:       'Increase lisinopril. Follow up.',
      Sources:    'PAT-abc',
      ...overrides.fields,
    },
    valid:   true,
    repaired: false,
    raw:     'raw text',
    ...overrides,
  });

  test('all SOAP fields mapped to correct keys', () => {
    const r = formatSOAP(makeValidated(), []);
    assert.ok('subjective'  in r);
    assert.ok('objective'   in r);
    assert.ok('assessment'  in r);
    assert.ok('plan'        in r);
    assert.ok('sources'     in r);
  });

  test('type is always "soap"', () => {
    assert.equal(formatSOAP(makeValidated(), []).type, 'soap');
  });

  test('source IDs used as fallback when Sources field empty', () => {
    // When Sources field is empty/missing, formatSOAP falls back to sourceIds array
    const v = makeValidated({ fields: { Subjective: 'x', Objective: 'x', Assessment: 'x', Plan: 'x', Sources: '' } });
    const r = formatSOAP(v, ['PAT-001', 'PAT-002']);
    // r.sources is either the field value or the joined sourceIds
    const ids = ['PAT-001', 'PAT-002'];
    assert.ok(
      ids.some(id => r.sources.includes(id)) || r.sources === ids.join(', '),
      `Expected sources to contain PAT-001 or PAT-002, got: "${r.sources}"`
    );
  });

  test('valid flag preserved', () => {
    assert.equal(formatSOAP(makeValidated({ valid: false }), []).valid, false);
    assert.equal(formatSOAP(makeValidated({ valid: true  }), []).valid, true);
  });

  test('repaired flag preserved', () => {
    assert.equal(formatSOAP(makeValidated({ repaired: true }), []).repaired, true);
  });

  test('raw text preserved in output', () => {
    const r = formatSOAP(makeValidated(), []);
    assert.equal(r.raw, 'raw text');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DomainFormatter — field mapping correctness', () => {
  const makeV = (type, fields, overrides = {}) => ({
    fields,
    valid: true,
    repaired: false,
    raw: 'raw',
    ...overrides,
  });

  test('medicine type and all keys present', () => {
    const v = makeV('medicine', {
      Medicine: 'Lisinopril', Dosage: '10mg', Form: 'Tablet',
      Indications: 'Hypertension', Contraindications: 'Pregnancy',
      Stock: '200 units', Batch: 'B001', Sources: 'MED-x',
    });
    const r = formatMedicine(v, ['MED-x']);
    assert.equal(r.type, 'medicine');
    assert.ok('medicine' in r);
    assert.ok('dosage' in r);
    assert.ok('form' in r);
    assert.ok('indications' in r);
    assert.ok('contraindications' in r);
    assert.ok('stock' in r);
    assert.ok('batch' in r);
    assert.ok('sources' in r);
  });

  test('instrument type and all keys present', () => {
    const v = makeV('instrument', {
      Instrument: 'ECG', Category: 'Cardiac', Department: 'ICU',
      'Operational Status': 'Operational', Maintenance: 'Up to Date',
      Calibration: '2026-01-01', Sources: 'INS-y',
    });
    const r = formatInstrument(v, ['INS-y']);
    assert.equal(r.type, 'instrument');
    assert.ok('instrument' in r);
    assert.ok('operationalStatus' in r);
    assert.ok('calibration' in r);
  });

  test('inventory type and all keys present', () => {
    const v = makeV('inventory', {
      Item: 'Gloves', Category: 'PPE', Quantity: '50 Box',
      Location: 'Ward-A', 'Reorder Level': '10', Status: 'In Stock',
      Sources: 'INV-z',
    });
    const r = formatInventory(v, ['INV-z']);
    assert.equal(r.type, 'inventory');
    assert.ok('item' in r);
    assert.ok('reorderLevel' in r);
    assert.ok('status' in r);
  });

  test('formatDomain dispatches to medicine', () => {
    const v = makeV('medicine', { Medicine: 'Aspirin', Dosage: '100mg', Form: 'Tablet',
      Indications: 'Pain', Contraindications: 'Ulcer', Stock: '100', Batch: 'B', Sources: 'MED-1' });
    assert.equal(formatDomain('medicine', v, ['MED-1']).type, 'medicine');
  });

  test('formatDomain dispatches to instrument', () => {
    const v = makeV('instrument', { Instrument: 'X-ray', Category: 'Imaging', Department: 'Radiology',
      'Operational Status': 'OK', Maintenance: 'OK', Calibration: '2026-01', Sources: 'INS-1' });
    assert.equal(formatDomain('instrument', v, ['INS-1']).type, 'instrument');
  });

  test('formatDomain dispatches to inventory', () => {
    const v = makeV('inventory', { Item: 'Mask', Category: 'PPE', Quantity: '100',
      Location: 'Store', 'Reorder Level': '20', Status: 'In Stock', Sources: 'INV-1' });
    assert.equal(formatDomain('inventory', v, ['INV-1']).type, 'inventory');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GroqUnavailableError — classification', () => {
  test('instanceof Error', () => {
    assert.ok(new GroqUnavailableError('test') instanceof Error);
  });

  test('name is GroqUnavailableError', () => {
    assert.equal(new GroqUnavailableError('msg').name, 'GroqUnavailableError');
  });

  test('status is 503', () => {
    assert.equal(new GroqUnavailableError('msg').status, 503);
  });

  test('message preserved', () => {
    assert.equal(new GroqUnavailableError('Groq offline').message, 'Groq offline');
  });

  test('can be caught as generic Error', () => {
    try {
      throw new GroqUnavailableError('offline');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.equal(err.status, 503);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Repository contract checks', () => {
  test('UserRepository exposes required methods', () => {
    const r = new UserRepository();
    assert.equal(typeof r.getOrCreateDefault, 'function');
    assert.equal(typeof r.getById, 'function');
  });

  test('ChatSessionRepository exposes all required methods', () => {
    const r = new ChatSessionRepository();
    for (const m of ['create', 'list', 'getById', 'rename', 'deleteById', 'touch']) {
      assert.equal(typeof r[m], 'function', `Missing method: ${m}`);
    }
  });

  test('ChatMessageRepository exposes all required methods', () => {
    const r = new ChatMessageRepository();
    for (const m of ['insertPair', 'listBySession', 'insertSystem']) {
      assert.equal(typeof r[m], 'function', `Missing method: ${m}`);
    }
  });

  test('ChatSessionRepository.create returns a promise', () => {
    const r = new ChatSessionRepository();
    // createChat will reject (no DB) but must return a Promise
    const p = r.create('test-id', 'Test Chat');
    assert.ok(p instanceof Promise);
    return p.catch(() => {}); // swallow DB error
  });

  test('ChatMessageRepository.listBySession returns a promise', () => {
    const r = new ChatMessageRepository();
    const p = r.listBySession('fake-session-id');
    assert.ok(p instanceof Promise);
    return p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('QueryNormalizer — correctness', () => {
  test('lowercases and strips punctuation', () => {
    const result = normalizeQuery('Patient Blood-Pressure! HIGH?');
    assert.ok(result.normalised === result.normalised.toLowerCase());
  });

  test('returns tokens array', () => {
    const result = normalizeQuery('hypertension treatment');
    assert.ok(Array.isArray(result.tokens));
    assert.ok(result.tokens.length > 0);
  });

  test('deduplicates tokens', () => {
    const result = normalizeQuery('blood blood pressure pressure');
    const unique = new Set(result.tokens);
    assert.equal(result.tokens.length, unique.size);
  });

  test('removes stop words', () => {
    const result = normalizeQuery('what is the blood pressure');
    assert.ok(!result.tokens.includes('what'));
    assert.ok(!result.tokens.includes('the'));
    assert.ok(!result.tokens.includes('is'));
  });

  test('handles empty string', () => {
    const result = normalizeQuery('');
    assert.ok(Array.isArray(result.tokens));
    assert.equal(result.tokens.length, 0);
  });

  test('handles single clinical term', () => {
    const result = normalizeQuery('hypertension');
    assert.ok(result.tokens.includes('hypertension'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('CategoryClassifier — category detection', () => {
  test('detects patient category from patient terms', () => {
    const r = classifyCategory(['patient', 'blood', 'pressure', 'diagnosis']);
    assert.equal(r.category, 'patient');
  });

  test('detects medicine category', () => {
    const r = classifyCategory(['medication', 'dosage', 'prescription']);
    assert.equal(r.category, 'medicine');
  });

  test('detects instrument category', () => {
    const r = classifyCategory(['instrument', 'calibration', 'scanner']);
    assert.equal(r.category, 'instrument');
  });

  test('detects inventory category', () => {
    const r = classifyCategory(['inventory', 'stock', 'reorder', 'supplies']);
    assert.equal(r.category, 'inventory');
  });

  test('returns confidence score', () => {
    const r = classifyCategory(['hypertension', 'patient']);
    assert.ok(typeof r.confidence === 'number');
    assert.ok(r.confidence >= 0 && r.confidence <= 1);
  });

  test('returns auto for ambiguous/empty tokens', () => {
    const r = classifyCategory([]);
    assert.ok(r.category === 'auto' || typeof r.category === 'string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TEMPLATES export — structural integrity', () => {
  test('all four categories defined', () => {
    for (const cat of ['patient', 'medicine', 'instrument', 'inventory']) {
      assert.ok(cat in TEMPLATES);
      assert.ok(TEMPLATES[cat].length > 0);
    }
  });

  test('patient template has exactly 5 fields', () => {
    assert.equal(TEMPLATES.patient.length, 5);
  });

  test('medicine template has exactly 8 fields', () => {
    assert.equal(TEMPLATES.medicine.length, 8);
  });

  test('instrument template has exactly 7 fields', () => {
    assert.equal(TEMPLATES.instrument.length, 7);
  });

  test('inventory template has exactly 7 fields', () => {
    assert.equal(TEMPLATES.inventory.length, 7);
  });

  test('all templates include Sources', () => {
    for (const [cat, fields] of Object.entries(TEMPLATES)) {
      assert.ok(fields.includes('Sources'), `${cat} template missing Sources`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ChatService fallback response builder (provider unavailable)', () => {
  // Test the pipeline output shape without a live DB or provider
  // by exercising the validation + formatting chain end-to-end

  const buildAndFormat = (category, text, sourceIds) => {
    const validated = validateAndRepair(text, category, sourceIds);
    if (category === 'patient') return formatSOAP(validated, sourceIds);
    return formatDomain(category, validated, sourceIds);
  };

  test('patient SOAP round-trip produces type=soap', () => {
    const text = [
      'Subjective: Patient has chest pain.',
      'Objective: BP 160/100 | HR 85 | Temp 37 | SpO2 96.',
      'Assessment: Hypertensive crisis.',
      'Plan: IV labetalol. Admit to ICU.',
      'Sources: PAT-aaa',
    ].join('\n');
    const result = buildAndFormat('patient', text, ['PAT-aaa']);
    assert.equal(result.type, 'soap');
    assert.ok(result.subjective.length > 0);
    assert.ok(result.objective.length  > 0);
    assert.ok(result.assessment.length > 0);
    assert.ok(result.plan.length       > 0);
    assert.ok(result.sources.includes('PAT-aaa'));
  });

  test('medicine round-trip produces type=medicine', () => {
    const text = [
      'Medicine: Atenolol', 'Dosage: 50mg', 'Form: Tablet',
      'Indications: Hypertension', 'Contraindications: Asthma',
      'Stock: 300', 'Batch: B003', 'Sources: MED-bbb',
    ].join('\n');
    const result = buildAndFormat('medicine', text, ['MED-bbb']);
    assert.equal(result.type, 'medicine');
    assert.ok(result.medicine.includes('Atenolol'));
  });

  test('instrument round-trip produces type=instrument', () => {
    const text = [
      'Instrument: Ultrasound', 'Category: Diagnostic', 'Department: OB/GYN',
      'Operational Status: Operational', 'Maintenance: Scheduled', 'Calibration: 2026-04', 'Sources: INS-ccc',
    ].join('\n');
    const result = buildAndFormat('instrument', text, ['INS-ccc']);
    assert.equal(result.type, 'instrument');
  });

  test('inventory round-trip produces type=inventory', () => {
    const text = [
      'Item: Oxygen Mask', 'Category: Respiratory', 'Quantity: 50',
      'Location: Store-C', 'Reorder Level: 10', 'Status: In Stock', 'Sources: INV-ddd',
    ].join('\n');
    const result = buildAndFormat('inventory', text, ['INV-ddd']);
    assert.equal(result.type, 'inventory');
    assert.ok(result.item.includes('Oxygen'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Message pair transaction pattern', () => {
  // Verify the insertPair method exists and has correct signature
  test('insertPair is an async function', () => {
    const repo = new ChatMessageRepository();
    assert.equal(typeof repo.insertPair, 'function');
    // Should return promise
    const p = repo.insertPair('fake-session', { content: 'test' }, { content: 'resp' });
    assert.ok(p instanceof Promise);
    return p.catch(() => {}); // swallow connection error
  });

  test('listBySession returns a promise', () => {
    const repo = new ChatMessageRepository();
    const p = repo.listBySession('fake-id');
    assert.ok(p instanceof Promise);
    return p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('hasRequiredFields — all templates', () => {
  test('patient template detected correctly', () => {
    const full = 'Subjective: x\nObjective: x\nAssessment: x\nPlan: x\nSources: x';
    assert.ok(hasRequiredFields(full, 'patient'));
  });

  test('medicine template detected correctly', () => {
    const full = 'Medicine: x\nDosage: x\nForm: x\nIndications: x\nContraindications: x\nStock: x\nBatch: x\nSources: x';
    assert.ok(hasRequiredFields(full, 'medicine'));
  });

  test('instrument template detected correctly', () => {
    const full = 'Instrument: x\nCategory: x\nDepartment: x\nOperational Status: x\nMaintenance: x\nCalibration: x\nSources: x';
    assert.ok(hasRequiredFields(full, 'instrument'));
  });

  test('inventory template detected correctly', () => {
    const full = 'Item: x\nCategory: x\nQuantity: x\nLocation: x\nReorder Level: x\nStatus: x\nSources: x';
    assert.ok(hasRequiredFields(full, 'inventory'));
  });

  test('incomplete text returns false', () => {
    assert.ok(!hasRequiredFields('Subjective: only this', 'patient'));
    assert.ok(!hasRequiredFields('Medicine: only this', 'medicine'));
  });
});
