// tests/test_explicit_id.js
// Focused tests for explicit masked-ID retrieval (PAT-/MED-/INS-/INV-).
// Verifies the fast-path added to KeywordRetriever.js:
//   - exact match returns the correct single record
//   - surrounding words (SOAP, details, report, etc.) do not interfere
//   - wrong/nonexistent IDs return noResults
//   - no cross-category results for explicit IDs
// Run: node --test tests/test_explicit_id.js

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

const { retrieve } = await import(toUrl('backend/src/services/retrieval/KeywordRetriever.js'));

// ── Known IDs sampled from real KB data ──────────────────────────────────────
const PAT_ID  = 'PAT-619b0bbe6b22';   // confirmed in data/patients.json
const PAT_ID2 = 'PAT-b720aa36c5ee';   // first patient record
const MED_ID  = 'MED-0b94b8673859';   // first medicine record
const INS_ID  = 'INS-19f263f6ba2a';   // first instrument record
const INV_ID  = 'INV-af02991ac1c1';   // first inventory record

// ─────────────────────────────────────────────────────────────────────────────
describe('Explicit ID — bare ID lookup', () => {
  test('PAT-619b0bbe6b22 bare returns exactly 1 patient record', async () => {
    const result = await retrieve(PAT_ID);
    assert.equal(result.noResults, false, 'Should find the record');
    assert.equal(result.results.length, 1, 'Should return exactly 1 result');
    assert.equal(result.results[0].id, PAT_ID);
    assert.equal(result.results[0].category, 'patient');
  });

  test('PAT-619b0bbe6b22 — record contains expected ID field', async () => {
    const result = await retrieve(PAT_ID);
    assert.equal(result.results[0].record.patient_id, PAT_ID);
  });

  test('PAT-619b0bbe6b22 — score is sentinel 99 (bypassed keyword scoring)', async () => {
    const result = await retrieve(PAT_ID);
    assert.equal(result.results[0].score, 99);
  });

  test('PAT-619b0bbe6b22 — matched_terms contains the ID itself', async () => {
    const result = await retrieve(PAT_ID);
    assert.ok(result.results[0].matched_terms.includes(PAT_ID));
  });

  test('PAT-619b0bbe6b22 — category is patient', async () => {
    const result = await retrieve(PAT_ID);
    assert.equal(result.category, 'patient');
  });

  test('PAT-619b0bbe6b22 — confidence is 1 (exact match)', async () => {
    const result = await retrieve(PAT_ID);
    assert.equal(result.confidence, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Explicit ID — ID embedded in natural language queries', () => {
  test('"Show details for patient PAT-619b0bbe6b22" returns the correct record', async () => {
    const result = await retrieve('Show details for patient PAT-619b0bbe6b22');
    assert.equal(result.noResults, false);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, PAT_ID);
  });

  test('"Generate a SOAP clinical report for patient PAT-619b0bbe6b22" returns correct record', async () => {
    const result = await retrieve('Generate a SOAP clinical report for patient PAT-619b0bbe6b22');
    assert.equal(result.noResults, false);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, PAT_ID);
    assert.equal(result.results[0].category, 'patient');
  });

  test('"clinical note for PAT-619b0bbe6b22" does not return unrelated records', async () => {
    const result = await retrieve('clinical note for PAT-619b0bbe6b22');
    assert.equal(result.results.length, 1, 'Should have exactly 1 result');
    assert.equal(result.results[0].id, PAT_ID);
  });

  test('"SOAP report PAT-619b0bbe6b22" — surrounding words do not contaminate', async () => {
    const result = await retrieve('SOAP report PAT-619b0bbe6b22');
    assert.equal(result.results[0].id, PAT_ID);
    // Must not contain any other patient IDs
    assert.ok(result.results.every(r => r.id === PAT_ID));
  });

  test('"details information records PAT-619b0bbe6b22" stops at the ID', async () => {
    const result = await retrieve('details information records PAT-619b0bbe6b22');
    assert.equal(result.results[0].id, PAT_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Explicit ID — no cross-category results', () => {
  test('PAT- prefix never returns medicine/instrument/inventory records', async () => {
    const result = await retrieve(PAT_ID);
    assert.ok(result.results.every(r => r.category === 'patient'));
  });

  test('MED- prefix never returns patient records', async () => {
    const result = await retrieve(MED_ID);
    assert.ok(result.results.every(r => r.category === 'medicine'));
  });

  test('INS- prefix never returns patient or inventory records', async () => {
    const result = await retrieve(INS_ID);
    assert.ok(result.results.every(r => r.category === 'instrument'));
  });

  test('INV- prefix never returns patient or medicine records', async () => {
    const result = await retrieve(INV_ID);
    assert.ok(result.results.every(r => r.category === 'inventory'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Explicit ID — all four category prefixes exact-match', () => {
  test('PAT-b720aa36c5ee (first patient) returns 1 record', async () => {
    const result = await retrieve(PAT_ID2);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, PAT_ID2);
  });

  test('MED-0b94b8673859 (first medicine) returns 1 record', async () => {
    const result = await retrieve(MED_ID);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, MED_ID);
    assert.equal(result.results[0].category, 'medicine');
  });

  test('INS-19f263f6ba2a (first instrument) returns 1 record', async () => {
    const result = await retrieve(INS_ID);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, INS_ID);
    assert.equal(result.results[0].category, 'instrument');
  });

  test('INV-af02991ac1c1 (first inventory) returns 1 record', async () => {
    const result = await retrieve(INV_ID);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, INV_ID);
    assert.equal(result.results[0].category, 'inventory');
  });

  test('MED- query embedded in sentence retrieves the medicine', async () => {
    const result = await retrieve(`prescribing info for ${MED_ID}`);
    assert.equal(result.results[0].id, MED_ID);
    assert.equal(result.results[0].category, 'medicine');
  });

  test('INS- query with noise words retrieves the instrument', async () => {
    const result = await retrieve(`show maintenance status of instrument ${INS_ID}`);
    assert.equal(result.results[0].id, INS_ID);
    assert.equal(result.results[0].category, 'instrument');
  });

  test('INV- query with noise words retrieves the inventory item', async () => {
    const result = await retrieve(`check stock level for ${INV_ID}`);
    assert.equal(result.results[0].id, INV_ID);
    assert.equal(result.results[0].category, 'inventory');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Explicit ID — nonexistent and invalid IDs', () => {
  test('nonexistent PAT-ID returns noResults = true', async () => {
    const result = await retrieve('PAT-000000000000');
    assert.equal(result.noResults, true);
    assert.equal(result.results.length, 0);
  });

  test('nonexistent MED-ID returns noResults = true', async () => {
    const result = await retrieve('MED-000000000000');
    assert.equal(result.noResults, true);
  });

  test('nonexistent INS-ID returns message with the ID', async () => {
    const result = await retrieve('INS-ffffffffffff');
    assert.ok(result.message.includes('INS-ffffffffffff'));
  });

  test('nonexistent ID category is correct even when no match', async () => {
    const result = await retrieve('INV-ffffffffffff');
    assert.equal(result.category, 'inventory');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Normal keyword retrieval unchanged by ID fast-path', () => {
  test('plain keyword query "hypertension" still returns results', async () => {
    const result = await retrieve('hypertension');
    assert.equal(result.noResults, false);
    assert.ok(result.results.length > 0);
  });

  test('plain query "metformin diabetes" returns medicine records', async () => {
    const result = await retrieve('metformin diabetes');
    assert.ok(result.results.length > 0);
  });

  test('plain query "ventilator calibration" returns instrument records', async () => {
    const result = await retrieve('ventilator calibration');
    assert.ok(result.results.length > 0);
  });

  test('plain query without an ID does not trigger fast-path (score < 99)', async () => {
    const result = await retrieve('hypertension treatment');
    assert.ok(result.results.every(r => r.score < 99));
  });
});
