// tests/test_patient_pipeline.js
// Regression tests for the patient response pipeline bug:
//   Groq returns bold-markdown SOAP labels (**Subjective:**) which were not parsed,
//   causing all SOAP fields to fall back to "Patient information not available".
//
// Also tests an end-to-end retrieval + format path for PAT-294c88c86812.
//
// Run: node --test tests/test_patient_pipeline.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const toUrl = p => pathToFileURL(resolve(ROOT, p)).href;

process.env.DATABASE_URL    = 'postgresql://skip:skip@localhost:5432/skip';
process.env.KB_DATA_DIR     = resolve(ROOT, 'data');
process.env.DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
process.env.MAX_RESULTS     = '5';

const { validateAndRepair } = await import(toUrl('backend/src/services/generation/TemplateValidator.js'));
const { formatSOAP }        = await import(toUrl('backend/src/services/generation/SOAPFormatter.js'));
const { retrieve }          = await import(toUrl('backend/src/services/retrieval/KeywordRetriever.js'));
const { buildPrompt }       = await import(toUrl('backend/src/services/generation/PromptBuilder.js'));

const TEST_PAT_ID = 'PAT-294c88c86812';

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: PAT-294c88c86812 retrieval', () => {
  test('retrieves exactly 1 record', async () => {
    const result = await retrieve(TEST_PAT_ID);
    assert.equal(result.noResults, false);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, TEST_PAT_ID);
  });
  test('record category is patient', async () => {
    const result = await retrieve(TEST_PAT_ID);
    assert.equal(result.results[0].category, 'patient');
  });
  test('record has correct demographics', async () => {
    const result = await retrieve(TEST_PAT_ID);
    const rec = result.results[0].record;
    assert.equal(rec.age, 72);
    assert.equal(rec.gender, 'Male');
    assert.equal(rec.blood_type, 'A-');
  });
  test('record has diagnoses including Stroke', async () => {
    const result = await retrieve(TEST_PAT_ID);
    const rec = result.results[0].record;
    assert.ok(Array.isArray(rec.diagnoses) && rec.diagnoses.length > 0);
    assert.ok(rec.diagnoses.includes('Stroke'));
  });
  test('record vitals has systolic_bp 132', async () => {
    const result = await retrieve(TEST_PAT_ID);
    const rec = result.results[0].record;
    assert.ok(rec.vitals);
    assert.equal(rec.vitals.systolic_bp, 132);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: prompt building for PAT-294c88c86812', () => {
  test('prompt includes patient ID', async () => {
    const retrieval = await retrieve(TEST_PAT_ID);
    const prompt = buildPrompt(TEST_PAT_ID, 'patient', retrieval.results);
    assert.ok(prompt.includes(TEST_PAT_ID));
  });
  test('prompt includes diagnosis data', async () => {
    const retrieval = await retrieve(TEST_PAT_ID);
    const prompt = buildPrompt(TEST_PAT_ID, 'patient', retrieval.results);
    assert.ok(prompt.includes('Pneumothorax') || prompt.includes('Stroke'));
  });
  test('prompt includes vitals (systolic 132)', async () => {
    const retrieval = await retrieve(TEST_PAT_ID);
    const prompt = buildPrompt(TEST_PAT_ID, 'patient', retrieval.results);
    assert.ok(prompt.includes('132'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: plain SOAP parsing', () => {
  const plainSOAP = `Subjective: 72-year-old male with polydipsia and insomnia. Blood type A-.
Objective: BP 132/77 mmHg | HR 68 bpm | Temp 38.2 C | SpO2 95%.
Assessment: Diagnoses: Pneumothorax, Gout, Parkinson Disease, Stroke.
Plan: Refer to specialist. Monitor vitals.
Sources: PAT-294c88c86812`;

  test('all SOAP fields parsed from plain text', () => {
    const result = validateAndRepair(plainSOAP, 'patient', [TEST_PAT_ID]);
    for (const f of ['Subjective', 'Objective', 'Assessment', 'Plan']) {
      assert.ok(result.fields[f] && result.fields[f].length > 0, f + ' must not be empty');
    }
  });
  test('Subjective not fallback (plain)', () => {
    const result = validateAndRepair(plainSOAP, 'patient', [TEST_PAT_ID]);
    assert.ok(!result.fields['Subjective'].includes('not available'));
  });
  test('Sources contains patient ID (plain)', () => {
    const result = validateAndRepair(plainSOAP, 'patient', [TEST_PAT_ID]);
    assert.ok(result.fields['Sources'].includes(TEST_PAT_ID));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: bold-markdown SOAP parsing (primary bug)', () => {
  const boldSOAP = `**Subjective:** 72-year-old male presenting with polydipsia and insomnia.
**Objective:** BP 132/77 mmHg | HR 68 bpm | Temp 38.2 C | SpO2 95%.
**Assessment:** Diagnoses include Pneumothorax, Gout, Parkinson Disease, Stroke.
**Plan:** Refer for Parkinson disease management. Continue medications.
**Sources:** PAT-294c88c86812`;

  test('all SOAP fields extracted (bold-markdown)', () => {
    const result = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    for (const f of ['Subjective', 'Objective', 'Assessment', 'Plan']) {
      assert.ok(result.fields[f] && result.fields[f].length > 0,
        f + ' empty. Got: ' + result.fields[f]);
    }
  });
  test('Subjective not fallback (bold-markdown)', () => {
    const result = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    assert.ok(!result.fields['Subjective'].includes('not available'),
      'Got: ' + result.fields['Subjective']);
  });
  test('Objective not fallback (bold-markdown)', () => {
    const result = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    assert.ok(!result.fields['Objective'].includes('not available'),
      'Got: ' + result.fields['Objective']);
  });
  test('Assessment contains diagnosis data (bold-markdown)', () => {
    const result = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    const a = result.fields['Assessment'];
    assert.ok(a.includes('Pneumothorax') || a.includes('Stroke') || a.includes('Parkinson'),
      'Got: ' + a);
  });
  test('valid=true and repaired=false for complete bold-markdown SOAP', () => {
    const result = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    assert.equal(result.repaired, false, 'repaired must be false');
    assert.equal(result.valid, true, 'valid must be true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: italic-markdown SOAP parsing', () => {
  const italicSOAP = `*Subjective:* 72-year-old male with polydipsia and insomnia.
*Objective:* BP 132/77 | HR 68 | Temp 38.2C | SpO2 95%.
*Assessment:* Pneumothorax, Stroke.
*Plan:* Specialist referral.
*Sources:* PAT-294c88c86812`;

  test('all SOAP fields extracted (italic-markdown)', () => {
    const result = validateAndRepair(italicSOAP, 'patient', [TEST_PAT_ID]);
    for (const f of ['Subjective', 'Objective', 'Assessment', 'Plan']) {
      assert.ok(result.fields[f] && result.fields[f].length > 0,
        f + ' empty after italic strip. Got: ' + result.fields[f]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: formatSOAP end-to-end for PAT-294c88c86812', () => {
  const boldSOAP = `**Subjective:** 72-year-old male presenting with polydipsia and insomnia.
**Objective:** BP 132/77 mmHg | HR 68 bpm | Temp 38.2 C | SpO2 95%.
**Assessment:** Diagnoses include Pneumothorax, Gout, Parkinson Disease, Stroke.
**Plan:** Refer for Parkinson disease management. Continue medications.
**Sources:** PAT-294c88c86812`;

  test('type is soap', () => {
    const validated = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    const formatted = formatSOAP(validated, [TEST_PAT_ID]);
    assert.equal(formatted.type, 'soap');
  });
  test('subjective has real data not fallback', () => {
    const validated = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    const formatted = formatSOAP(validated, [TEST_PAT_ID]);
    assert.ok(formatted.subjective.length > 5);
    assert.ok(!formatted.subjective.includes('not available'), 'Got: ' + formatted.subjective);
  });
  test('objective has real data not fallback', () => {
    const validated = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    const formatted = formatSOAP(validated, [TEST_PAT_ID]);
    assert.ok(!formatted.objective.includes('not available'), 'Got: ' + formatted.objective);
  });
  test('assessment has real data not fallback', () => {
    const validated = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    const formatted = formatSOAP(validated, [TEST_PAT_ID]);
    assert.ok(!formatted.assessment.includes('cannot be determined'), 'Got: ' + formatted.assessment);
  });
  test('sources includes patient ID', () => {
    const validated = validateAndRepair(boldSOAP, 'patient', [TEST_PAT_ID]);
    const formatted = formatSOAP(validated, [TEST_PAT_ID]);
    assert.ok(formatted.sources.includes(TEST_PAT_ID));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: non-patient categories unaffected', () => {
  test('bold medicine labels parse correctly', () => {
    const boldMed = `**Medicine:** Metformin
**Dosage:** 500mg
**Form:** Tablet
**Indications:** Type 2 Diabetes
**Contraindications:** Renal failure
**Stock:** 180 units
**Batch:** BATCH-m001
**Sources:** MED-abc123`;
    const result = validateAndRepair(boldMed, 'medicine', ['MED-abc123']);
    assert.ok(result.fields['Medicine'].includes('Metformin'));
    assert.ok(!result.fields['Medicine'].includes('not available'));
  });
  test('bold instrument labels parse correctly', () => {
    const boldIns = `**Instrument:** CT Scanner
**Category:** Diagnostic Imaging
**Department:** Radiology
**Operational Status:** Operational
**Maintenance:** Up to Date
**Calibration:** 2026-03-15
**Sources:** INS-zzz999`;
    const result = validateAndRepair(boldIns, 'instrument', ['INS-zzz999']);
    assert.ok(result.fields['Instrument'].includes('CT Scanner'));
    assert.ok(!result.fields['Department'].includes('not available'));
  });
  test('bold inventory labels parse correctly', () => {
    const boldInv = `**Item:** N95 Mask
**Category:** PPE
**Quantity:** 200 Box
**Location:** Pharmacy
**Reorder Level:** 30
**Status:** In Stock
**Sources:** INV-nnn111`;
    const result = validateAndRepair(boldInv, 'inventory', ['INV-nnn111']);
    assert.ok(result.fields['Item'].includes('N95 Mask'));
    assert.ok(!result.fields['Status'].includes('not available'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: validity logic after fix', () => {
  test('valid=false when Plan field missing', () => {
    const partial = `Subjective: Patient has headache.
Objective: BP 130/85.
Assessment: Hypertension.
Sources: PAT-xxx`;
    const result = validateAndRepair(partial, 'patient', ['PAT-xxx']);
    assert.equal(result.repaired, true);
    assert.equal(result.valid, false);
  });
  test('valid=true for complete plain SOAP', () => {
    const complete = `Subjective: 72yo male with polydipsia and insomnia.
Objective: BP 132/77 mmHg | HR 68 bpm | Temp 38.2 C | SpO2 95%.
Assessment: Pneumothorax, Gout, Parkinson Disease, Stroke.
Plan: Refer for Parkinson disease management. Continue medications.
Sources: PAT-294c88c86812`;
    const result = validateAndRepair(complete, 'patient', [TEST_PAT_ID]);
    assert.equal(result.repaired, false);
    assert.equal(result.valid, true);
  });
});
