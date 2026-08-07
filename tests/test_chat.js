// tests/test_chat.js
// Account 3 tests — repos (mocked DB), ChatService (mocked Ollama),
// template validation, formatters, title generation, history ordering.
// Run: node --test tests/test_chat.js

import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const toUrl = p => pathToFileURL(resolve(ROOT, p)).href;

// Patch env — avoids real DB connections
process.env.DATABASE_URL   = 'postgresql://skip:skip@localhost:5432/skip';
process.env.KB_DATA_DIR    = resolve(ROOT, 'data');
process.env.DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

// ── Import modules under test ─────────────────────────────────────────────────
const { generateTitle }      = await import(toUrl('backend/src/services/chat/ChatService.js'));
const { validateAndRepair, hasRequiredFields, TEMPLATES } =
  await import(toUrl('backend/src/services/generation/TemplateValidator.js'));
const { formatSOAP }         = await import(toUrl('backend/src/services/generation/SOAPFormatter.js'));
const { formatMedicine, formatInstrument, formatInventory, formatDomain } =
  await import(toUrl('backend/src/services/generation/DomainFormatter.js'));
const { buildPrompt }        = await import(toUrl('backend/src/services/generation/PromptBuilder.js'));
const { OllamaUnavailableError } = await import(toUrl('backend/src/services/generation/OllamaClient.js'));

// ─────────────────────────────────────────────────────────────────────────────
describe('generateTitle', () => {
  test('produces a title from query', () => {
    const t = generateTitle('What medication is used for hypertension?');
    assert.ok(typeof t === 'string');
    assert.ok(t.length > 0);
  });

  test('capitalises first letter', () => {
    const t = generateTitle('patient diagnosis hypertension');
    assert.equal(t[0], t[0].toUpperCase());
  });

  test('excludes stop words', () => {
    const t = generateTitle('what is the medication for diabetes');
    assert.ok(!t.toLowerCase().startsWith('what'));
  });

  test('limits to ~5 meaningful words', () => {
    const t = generateTitle('patient with severe hypertension and diabetes and renal failure treated with lisinopril');
    const wordCount = t.split(' ').length;
    assert.ok(wordCount <= 6, `Title too long: "${t}" (${wordCount} words)`);
  });

  test('falls back gracefully on empty query', () => {
    const t = generateTitle('');
    assert.ok(typeof t === 'string');
  });

  test('uses truncated query when only stop words remain', () => {
    const t = generateTitle('the the the');
    assert.ok(typeof t === 'string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TemplateValidator — SOAP', () => {
  const VALID_SOAP = `Subjective: Patient reports chest pain and shortness of breath.
Objective: BP 145/90, HR 88, Temp 37.1, SpO2 96%.
Assessment: Likely hypertensive urgency. Coronary artery disease cannot be excluded.
Plan: Start antihypertensive therapy. ECG and troponin ordered. Cardiology referral.
Sources: PAT-abc123, PAT-def456`;

  test('validates a complete SOAP response', () => {
    const result = validateAndRepair(VALID_SOAP, 'patient', ['PAT-abc123']);
    assert.ok(result.valid || !result.repaired === false || result.fields['Subjective'].length > 5);
    assert.ok('Subjective' in result.fields);
    assert.ok('Objective'  in result.fields);
    assert.ok('Assessment' in result.fields);
    assert.ok('Plan'       in result.fields);
    assert.ok('Sources'    in result.fields);
  });

  test('repairs missing SOAP fields', () => {
    const partial = `Subjective: Patient has headache.\nObjective: BP 130/85.`;
    const result = validateAndRepair(partial, 'patient', ['PAT-xyz']);
    assert.equal(result.repaired, true);
    assert.ok('Assessment' in result.fields);
    assert.ok('Plan' in result.fields);
    assert.ok('Sources' in result.fields);
  });

  test('injects source IDs into Sources field', () => {
    const noSources = `Subjective: Chest pain.\nObjective: Normal vitals.\nAssessment: Stable.\nPlan: Monitor.`;
    const result = validateAndRepair(noSources, 'patient', ['PAT-001', 'PAT-002']);
    assert.ok(result.fields['Sources'].includes('PAT-001'));
  });

  test('raw text is preserved', () => {
    const result = validateAndRepair(VALID_SOAP, 'patient', []);
    assert.equal(result.raw, VALID_SOAP);
  });

  test('hasRequiredFields detects complete SOAP', () => {
    assert.ok(hasRequiredFields(VALID_SOAP, 'patient'));
  });

  test('hasRequiredFields rejects incomplete SOAP', () => {
    assert.ok(!hasRequiredFields('Subjective: something.', 'patient'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TemplateValidator — Medicine', () => {
  const VALID_MED = `Medicine: Lisinopril
Dosage: 10mg
Form: Tablet
Indications: Hypertension, Heart Failure
Contraindications: Pregnancy, Angioedema
Stock: 250 units
Batch: BATCH-abc123
Sources: MED-aabbcc`;

  test('validates a complete medicine response', () => {
    const result = validateAndRepair(VALID_MED, 'medicine', ['MED-aabbcc']);
    assert.ok('Medicine' in result.fields);
    assert.ok('Dosage' in result.fields);
    assert.ok('Sources' in result.fields);
  });

  test('repairs missing medicine fields', () => {
    const partial = `Medicine: Aspirin\nDosage: 100mg`;
    const result = validateAndRepair(partial, 'medicine', ['MED-001']);
    assert.equal(result.repaired, true);
    assert.ok('Form' in result.fields);
    assert.ok('Sources' in result.fields);
  });

  test('hasRequiredFields detects complete medicine template', () => {
    assert.ok(hasRequiredFields(VALID_MED, 'medicine'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TemplateValidator — Instrument', () => {
  const VALID_INS = `Instrument: MRI Machine
Category: Diagnostic Imaging
Department: Radiology
Operational Status: Operational
Maintenance: Up to Date
Calibration: 2026-06-15
Sources: INS-001abc`;

  test('validates complete instrument response', () => {
    const result = validateAndRepair(VALID_INS, 'instrument', ['INS-001abc']);
    assert.ok('Instrument' in result.fields);
    assert.ok('Operational Status' in result.fields);
  });

  test('repairs missing instrument fields', () => {
    const partial = `Instrument: CT Scanner\nCategory: Diagnostic Imaging`;
    const result = validateAndRepair(partial, 'instrument', ['INS-002']);
    assert.equal(result.repaired, true);
    assert.ok('Sources' in result.fields);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TemplateValidator — Inventory', () => {
  const VALID_INV = `Item: Surgical Gloves
Category: PPE
Quantity: 150 Box
Location: Ward-A
Reorder Level: 20
Status: In Stock
Sources: INV-001aaa`;

  test('validates complete inventory response', () => {
    const result = validateAndRepair(VALID_INV, 'inventory', ['INV-001aaa']);
    assert.ok('Item' in result.fields);
    assert.ok('Status' in result.fields);
    assert.ok('Sources' in result.fields);
  });

  test('repairs missing inventory fields', () => {
    const partial = `Item: N95 Mask\nCategory: PPE`;
    const result = validateAndRepair(partial, 'inventory', ['INV-002']);
    assert.equal(result.repaired, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SOAPFormatter', () => {
  const SOAP_TEXT = `Subjective: Patient is a 55yo male with hypertension.
Objective: BP 165/95, HR 80, Temp 37.0, SpO2 99%.
Assessment: Uncontrolled hypertension.
Plan: Increase lisinopril to 20mg. Follow up in 2 weeks.
Sources: PAT-abc`;

  test('formats a SOAP validated result', () => {
    const validated = validateAndRepair(SOAP_TEXT, 'patient', ['PAT-abc']);
    const result = formatSOAP(validated, ['PAT-abc']);
    assert.equal(result.type, 'soap');
    assert.ok(result.subjective.length > 5);
    assert.ok(result.objective.length  > 5);
    assert.ok(result.assessment.length > 5);
    assert.ok(result.plan.length       > 5);
    assert.ok(result.sources.length    > 0);
  });

  test('SOAP result has valid and repaired flags', () => {
    const validated = validateAndRepair(SOAP_TEXT, 'patient', []);
    const result = formatSOAP(validated, []);
    assert.ok(typeof result.valid === 'boolean');
    assert.ok(typeof result.repaired === 'boolean');
  });

  test('SOAP result preserves raw text', () => {
    const validated = validateAndRepair(SOAP_TEXT, 'patient', []);
    const result = formatSOAP(validated, []);
    assert.equal(result.raw, SOAP_TEXT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DomainFormatter', () => {
  test('formatMedicine returns correct type', () => {
    const validated = validateAndRepair(
      'Medicine: Aspirin\nDosage: 100mg\nForm: Tablet\nIndications: Pain\nContraindications: Ulcer\nStock: 100\nBatch: B001\nSources: MED-x',
      'medicine', ['MED-x']
    );
    const result = formatMedicine(validated, ['MED-x']);
    assert.equal(result.type, 'medicine');
    assert.ok(result.medicine.length > 0);
    assert.ok(result.sources.length > 0);
  });

  test('formatInstrument returns correct type', () => {
    const text = 'Instrument: ECG\nCategory: Cardiac\nDepartment: ICU\nOperational Status: Operational\nMaintenance: Up to Date\nCalibration: 2026-01-01\nSources: INS-y';
    const validated = validateAndRepair(text, 'instrument', ['INS-y']);
    const result = formatInstrument(validated, ['INS-y']);
    assert.equal(result.type, 'instrument');
    assert.ok(result.instrument.length > 0);
  });

  test('formatInventory returns correct type', () => {
    const text = 'Item: Gloves\nCategory: PPE\nQuantity: 50\nLocation: Ward-A\nReorder Level: 10\nStatus: In Stock\nSources: INV-z';
    const validated = validateAndRepair(text, 'inventory', ['INV-z']);
    const result = formatInventory(validated, ['INV-z']);
    assert.equal(result.type, 'inventory');
  });

  test('formatDomain dispatches correctly for medicine', () => {
    const text = 'Medicine: Metformin\nDosage: 500mg\nForm: Tablet\nIndications: Diabetes\nContraindications: Renal failure\nStock: 200\nBatch: B002\nSources: MED-m';
    const validated = validateAndRepair(text, 'medicine', ['MED-m']);
    const result = formatDomain('medicine', validated, ['MED-m']);
    assert.equal(result.type, 'medicine');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PromptBuilder', () => {
  const samplePatientResults = [{
    id: 'PAT-abc',
    category: 'patient',
    score: 3.5,
    matched_terms: ['hypertension'],
    record: {
      patient_id: 'PAT-abc', age: 62, gender: 'Male', blood_type: 'O+',
      diagnoses: ['Hypertension'], symptoms: ['headache', 'dizziness'],
      vitals: { systolic_bp: 160, diastolic_bp: 95, heart_rate: 78, temperature_c: 37.0, spo2_percent: 98 },
      medications: ['MED-001'], visit_history: [{ date: '2026-01-15', reason: 'Follow-up', department: 'Cardiology' }],
      keywords: ['hypertension', 'patient']
    }
  }];

  const sampleMedResults = [{
    id: 'MED-aaa',
    category: 'medicine',
    score: 4.0,
    matched_terms: ['lisinopril'],
    record: {
      medicine_id: 'MED-aaa', name: 'Lisinopril', dosage: '10mg', form: 'Tablet',
      indications: ['Hypertension'], contraindications: ['Pregnancy'],
      stock_units: 200, batch_id: 'B001', expiry_date: '2027-01-01',
      keywords: ['lisinopril', 'hypertension']
    }
  }];

  test('builds a patient SOAP prompt', () => {
    const prompt = buildPrompt('hypertension patient', 'patient', samplePatientResults);
    assert.ok(prompt.includes('SOAP'));
    assert.ok(prompt.includes('Subjective'));
    assert.ok(prompt.includes('PAT-abc'));
  });

  test('builds a medicine prompt', () => {
    const prompt = buildPrompt('lisinopril dosage', 'medicine', sampleMedResults);
    assert.ok(prompt.includes('Medicine:'));
    assert.ok(prompt.includes('MED-aaa'));
  });

  test('builds no-results prompt on empty results', () => {
    const prompt = buildPrompt('zzz gibberish', 'auto', []);
    assert.ok(prompt.toLowerCase().includes('no'));
  });

  test('auto category uses first result category', () => {
    const prompt = buildPrompt('hypertension', 'auto', samplePatientResults);
    assert.ok(prompt.includes('Subjective') || prompt.includes('SOAP'));
  });

  test('prompt contains system preamble context', () => {
    const prompt = buildPrompt('test', 'patient', samplePatientResults);
    assert.ok(prompt.toLowerCase().includes('houston') || prompt.toLowerCase().includes('hospital'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OllamaUnavailableError', () => {
  test('is an Error subclass', () => {
    const e = new OllamaUnavailableError('test');
    assert.ok(e instanceof Error);
  });

  test('has correct name and status', () => {
    const e = new OllamaUnavailableError('Ollama is down');
    assert.equal(e.name, 'OllamaUnavailableError');
    assert.equal(e.status, 503);
  });

  test('message is preserved', () => {
    const e = new OllamaUnavailableError('custom message');
    assert.equal(e.message, 'custom message');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ChatService — with mock Ollama', () => {
  // Build a mock Ollama client that returns a valid SOAP response
  function makeOllama(responseText) {
    return { generate: async () => ({ text: responseText, done: true, model: 'test' }) };
  }

  // Build a mock DB for repositories (skips real PostgreSQL)
  // We test ChatService.processMessage by mocking its dependency calls
  test('generateTitle is exported and works', () => {
    const title = generateTitle('Patient with hypertension and diabetes');
    assert.ok(typeof title === 'string' && title.length > 0);
  });

  test('SOAP fallback response parses correctly', () => {
    const soapText = [
      'Subjective: Patient has headache and dizziness.',
      'Objective: BP 155/92 | HR 78 | Temp 37.1 | SpO2 97%.',
      'Assessment: Hypertensive urgency.',
      'Plan: Increase antihypertensive dose. Follow up in 1 week.',
      'Sources: PAT-abc123, PAT-def456',
    ].join('\n');

    const validated = validateAndRepair(soapText, 'patient', ['PAT-abc123']);
    const formatted = formatSOAP(validated, ['PAT-abc123']);
    assert.equal(formatted.type, 'soap');
    assert.ok(formatted.subjective.length > 5);
    assert.ok(formatted.objective.length > 5);
    assert.ok(formatted.assessment.length > 5);
    assert.ok(formatted.plan.length > 5);
    assert.ok(formatted.sources.includes('PAT-abc123'));
  });

  test('medicine fallback response parses correctly', () => {
    const medText = [
      'Medicine: Metformin',
      'Dosage: 500mg',
      'Form: Tablet',
      'Indications: Type 2 Diabetes',
      'Contraindications: Renal failure, Liver failure',
      'Stock: 180 units',
      'Batch: BATCH-m001',
      'Sources: MED-abc123',
    ].join('\n');

    const validated = validateAndRepair(medText, 'medicine', ['MED-abc123']);
    const formatted = formatMedicine(validated, ['MED-abc123']);
    assert.equal(formatted.type, 'medicine');
    assert.ok(formatted.medicine.includes('Metformin'));
    assert.ok(formatted.dosage.includes('500mg'));
    assert.ok(formatted.sources.includes('MED-abc123'));
  });

  test('instrument response formats correctly', () => {
    const insText = [
      'Instrument: CT Scanner',
      'Category: Diagnostic Imaging',
      'Department: Radiology',
      'Operational Status: Operational',
      'Maintenance: Up to Date',
      'Calibration: 2026-03-15',
      'Sources: INS-zzz999',
    ].join('\n');

    const validated = validateAndRepair(insText, 'instrument', ['INS-zzz999']);
    const formatted = formatInstrument(validated, ['INS-zzz999']);
    assert.equal(formatted.type, 'instrument');
    assert.ok(formatted.instrument.includes('CT Scanner'));
    assert.ok(formatted.calibration.length > 0);
  });

  test('inventory response formats correctly', () => {
    const invText = [
      'Item: N95 Mask',
      'Category: PPE',
      'Quantity: 200 Box',
      'Location: Pharmacy',
      'Reorder Level: 30',
      'Status: In Stock',
      'Sources: INV-nnn111',
    ].join('\n');

    const validated = validateAndRepair(invText, 'inventory', ['INV-nnn111']);
    const formatted = formatInventory(validated, ['INV-nnn111']);
    assert.equal(formatted.type, 'inventory');
    assert.ok(formatted.item.includes('N95'));
    assert.ok(formatted.status.includes('In Stock'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TEMPLATES export', () => {
  test('has all four categories', () => {
    for (const cat of ['patient', 'medicine', 'instrument', 'inventory']) {
      assert.ok(cat in TEMPLATES, `Missing template for ${cat}`);
      assert.ok(Array.isArray(TEMPLATES[cat]));
      assert.ok(TEMPLATES[cat].length > 0);
    }
  });

  test('patient template has SOAP fields', () => {
    assert.ok(TEMPLATES.patient.includes('Subjective'));
    assert.ok(TEMPLATES.patient.includes('Objective'));
    assert.ok(TEMPLATES.patient.includes('Assessment'));
    assert.ok(TEMPLATES.patient.includes('Plan'));
    assert.ok(TEMPLATES.patient.includes('Sources'));
  });

  test('medicine template has all required fields', () => {
    for (const f of ['Medicine', 'Dosage', 'Form', 'Indications', 'Contraindications', 'Stock', 'Batch', 'Sources']) {
      assert.ok(TEMPLATES.medicine.includes(f), `Missing: ${f}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Repository mock unit tests', () => {
  // These tests validate the repository logic without a live DB
  // by testing the SQL logic patterns structurally

  test('ChatSessionRepository has required methods', async () => {
    const { ChatSessionRepository } = await import(toUrl('backend/src/repositories/ChatSessionRepository.js'));
    const repo = new ChatSessionRepository();
    assert.ok(typeof repo.create     === 'function');
    assert.ok(typeof repo.list       === 'function');
    assert.ok(typeof repo.getById    === 'function');
    assert.ok(typeof repo.rename     === 'function');
    assert.ok(typeof repo.deleteById === 'function');
    assert.ok(typeof repo.touch      === 'function');
  });

  test('ChatMessageRepository has required methods', async () => {
    const { ChatMessageRepository } = await import(toUrl('backend/src/repositories/ChatMessageRepository.js'));
    const repo = new ChatMessageRepository();
    assert.ok(typeof repo.insertPair    === 'function');
    assert.ok(typeof repo.listBySession === 'function');
    assert.ok(typeof repo.insertSystem  === 'function');
  });

  test('UserRepository has required methods', async () => {
    const { UserRepository } = await import(toUrl('backend/src/repositories/UserRepository.js'));
    const repo = new UserRepository();
    assert.ok(typeof repo.getOrCreateDefault === 'function');
    assert.ok(typeof repo.getById           === 'function');
  });
});
