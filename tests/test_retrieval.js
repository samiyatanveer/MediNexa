import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Patch env so JsonKBLoader finds the data directory ────────────────────────
process.env.KB_DATA_DIR = resolve(ROOT, 'data');
process.env.DATABASE_URL = 'postgresql://skip:skip@localhost:5432/skip';

// Helper: convert an absolute path to a file:// URL for dynamic import on Windows
function toFileUrl(absPath) {
  return pathToFileURL(absPath).href;
}

// ── Imports (after env patch) ─────────────────────────────────────────────────
const { normalizeQuery }  = await import(toFileUrl(resolve(ROOT, 'backend/src/services/retrieval/QueryNormalizer.js')));
const { classifyCategory, VALID_CATEGORIES } = await import(toFileUrl(resolve(ROOT, 'backend/src/services/retrieval/CategoryClassifier.js')));
const { kbLoader }        = await import(toFileUrl(resolve(ROOT, 'backend/src/services/retrieval/JsonKBLoader.js')));
const { retrieve }        = await import(toFileUrl(resolve(ROOT, 'backend/src/services/retrieval/KeywordRetriever.js')));

// ─────────────────────────────────────────────────────────────────────────────
describe('QueryNormalizer', () => {
  test('lowercases query', () => {
    const { tokens } = normalizeQuery('HYPERTENSION');
    assert.ok(tokens.includes('hypertension'));
  });

  test('strips punctuation', () => {
    const { tokens } = normalizeQuery('chest-pain, shortness of breath!');
    assert.ok(tokens.includes('chest'));
    assert.ok(tokens.includes('pain'));
    assert.ok(tokens.includes('shortness'));
    assert.ok(tokens.includes('breath'));
  });

  test('removes stop words', () => {
    const { tokens } = normalizeQuery('what is the patient status');
    assert.ok(!tokens.includes('what'));
    assert.ok(!tokens.includes('is'));
    assert.ok(!tokens.includes('the'));
    assert.ok(tokens.includes('status'));
  });

  test('deduplicates tokens', () => {
    const { tokens } = normalizeQuery('hypertension hypertension diabetes');
    assert.equal(tokens.filter(t => t === 'hypertension').length, 1);
  });

  test('handles empty string', () => {
    const result = normalizeQuery('');
    assert.deepEqual(result.tokens, []);
    assert.equal(result.normalised, '');
  });

  test('handles whitespace-only input', () => {
    const result = normalizeQuery('   ');
    assert.deepEqual(result.tokens, []);
  });

  test('handles non-string input gracefully', () => {
    const result = normalizeQuery(null);
    assert.deepEqual(result.tokens, []);
  });

  test('returns raw and normalised fields', () => {
    const result = normalizeQuery('Asthma treatment');
    assert.equal(result.raw, 'Asthma treatment');
    assert.ok(result.normalised.length > 0);
  });

  test('filters tokens shorter than 2 chars', () => {
    const { tokens } = normalizeQuery('a b c diabetes');
    assert.ok(!tokens.includes('a'));
    assert.ok(!tokens.includes('b'));
    assert.ok(!tokens.includes('c'));
    assert.ok(tokens.includes('diabetes'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('CategoryClassifier', () => {
  test('classifies patient query', () => {
    const { tokens } = normalizeQuery('patient with hypertension symptoms');
    const { category } = classifyCategory(tokens);
    assert.equal(category, 'patient');
  });

  test('classifies medicine query', () => {
    const { tokens } = normalizeQuery('medication dosage tablet stock');
    const { category } = classifyCategory(tokens);
    assert.equal(category, 'medicine');
  });

  test('classifies instrument query', () => {
    const { tokens } = normalizeQuery('ventilator maintenance calibration ICU');
    const { category } = classifyCategory(tokens);
    assert.equal(category, 'instrument');
  });

  test('classifies inventory query', () => {
    const { tokens } = normalizeQuery('inventory stock gloves PPE quantity reorder');
    const { category } = classifyCategory(tokens);
    assert.equal(category, 'inventory');
  });

  test('returns auto for ambiguous query', () => {
    const { tokens } = normalizeQuery('xyzabc123');
    const { category } = classifyCategory(tokens);
    assert.equal(category, 'auto');
  });

  test('returns auto on empty tokens', () => {
    const { category } = classifyCategory([]);
    assert.equal(category, 'auto');
  });

  test('explicit override wins regardless of tokens', () => {
    const { tokens } = normalizeQuery('ventilator calibration');
    const { category } = classifyCategory(tokens, 'medicine');
    assert.equal(category, 'medicine');
  });

  test('VALID_CATEGORIES includes expected values', () => {
    for (const c of ['patient', 'medicine', 'instrument', 'inventory', 'auto']) {
      assert.ok(VALID_CATEGORIES.includes(c), `Missing: ${c}`);
    }
  });

  test('returns confidence score', () => {
    const { tokens } = normalizeQuery('patient diagnosis hypertension');
    const { confidence } = classifyCategory(tokens);
    assert.ok(typeof confidence === 'number');
    assert.ok(confidence >= 0 && confidence <= 1);
  });

  test('returns scores object', () => {
    const { tokens } = normalizeQuery('tablet drug dosage');
    const { scores } = classifyCategory(tokens);
    assert.ok(typeof scores === 'object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('JsonKBLoader', () => {
  before(() => kbLoader.load());

  test('loads all four categories', () => {
    for (const cat of ['patients', 'medicines', 'instruments', 'inventory']) {
      const records = kbLoader.getCategory(cat);
      assert.ok(Array.isArray(records), `${cat} should be an array`);
      assert.ok(records.length > 0, `${cat} should not be empty`);
    }
  });

  test('patients: 600 records', () => {
    assert.equal(kbLoader.getCategory('patients').length, 600);
  });

  test('medicines: 250 records', () => {
    assert.equal(kbLoader.getCategory('medicines').length, 250);
  });

  test('instruments: 175 records', () => {
    assert.equal(kbLoader.getCategory('instruments').length, 175);
  });

  test('inventory: 175 records', () => {
    assert.equal(kbLoader.getCategory('inventory').length, 175);
  });

  test('totalRecords is 1200', () => {
    assert.equal(kbLoader.totalRecords, 1200);
  });

  test('getCategory throws on unknown category', () => {
    assert.throws(() => kbLoader.getCategory('unknown'), /Unknown category/);
  });

  test('getAll returns a Map with 4 entries', () => {
    const all = kbLoader.getAll();
    assert.ok(all instanceof Map);
    assert.equal(all.size, 4);
  });

  test('load is idempotent', () => {
    const before = kbLoader.totalRecords;
    kbLoader.load();  // second call — should not double-load
    assert.equal(kbLoader.totalRecords, before);
  });

  test('patients have required fields', () => {
    const rec = kbLoader.getCategory('patients')[0];
    for (const f of ['patient_id', 'age', 'gender', 'diagnoses', 'symptoms', 'keywords']) {
      assert.ok(f in rec, `Missing field: ${f}`);
    }
  });

  test('medicines have required fields', () => {
    const rec = kbLoader.getCategory('medicines')[0];
    for (const f of ['medicine_id', 'name', 'keywords', 'synonyms']) {
      assert.ok(f in rec, `Missing field: ${f}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('KeywordRetriever — basic results', () => {
  test('returns results for medicine query', async () => {
    const result = await retrieve('hypertension medication');
    assert.ok(result.results.length > 0, 'Should find medicine results');
    assert.ok(result.results[0].score > 0);
    assert.ok(Array.isArray(result.results[0].matched_terms));
  });

  test('returns results for instrument query', async () => {
    const result = await retrieve('ventilator ICU maintenance');
    assert.ok(result.results.length > 0, 'Should find instrument results');
  });

  test('returns results for patient query', async () => {
    const result = await retrieve('patient diabetes diagnosis');
    assert.ok(result.results.length > 0, 'Should find patient results');
  });

  test('returns results for inventory query', async () => {
    const result = await retrieve('gloves PPE stock inventory');
    assert.ok(result.results.length > 0, 'Should find inventory results');
  });

  test('result count does not exceed MAX_RESULTS (5)', async () => {
    const result = await retrieve('hypertension medication tablet dosage', 'auto');
    assert.ok(result.results.length <= 5, `Too many results: ${result.results.length}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('KeywordRetriever — result shape', () => {
  test('each result has required fields', async () => {
    const result = await retrieve('insulin diabetes');
    for (const r of result.results) {
      assert.ok('id' in r, 'Missing id');
      assert.ok('category' in r, 'Missing category');
      assert.ok('score' in r, 'Missing score');
      assert.ok('matched_terms' in r, 'Missing matched_terms');
      assert.ok('record' in r, 'Missing record');
    }
  });

  test('matched_terms is non-empty for a matching query', async () => {
    const result = await retrieve('insulin diabetes');
    assert.ok(result.results.length > 0);
    assert.ok(result.results[0].matched_terms.length > 0);
  });

  test('scores are sorted descending', async () => {
    const result = await retrieve('asthma inhaler salbutamol', 'auto');
    for (let i = 1; i < result.results.length; i++) {
      assert.ok(
        result.results[i - 1].score >= result.results[i].score,
        'Results not sorted by score descending'
      );
    }
  });

  test('response includes query metadata', async () => {
    const result = await retrieve('CT scanner radiology');
    assert.ok(result.query);
    assert.ok(Array.isArray(result.tokens));
    assert.ok(typeof result.category === 'string');
    assert.ok(typeof result.noResults === 'boolean');
    assert.ok(typeof result.totalSearched === 'number');
  });

  test('no duplicate IDs in results', async () => {
    const result = await retrieve('diabetes medication hypertension', 'auto');
    const ids = result.results.map(r => r.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, 'Duplicate IDs in results');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('KeywordRetriever — no-result and edge cases', () => {
  test('empty query returns noResults=true', async () => {
    const result = await retrieve('');
    assert.equal(result.noResults, true);
    assert.deepEqual(result.results, []);
  });

  test('stop-word-only query returns noResults=true', async () => {
    const result = await retrieve('the is a an for');
    assert.equal(result.noResults, true);
  });

  test('gibberish query returns noResults=true', async () => {
    const result = await retrieve('zzxyzzy999norecord999xyzzy');
    assert.equal(result.noResults, true);
    assert.deepEqual(result.results, []);
  });

  test('no-result message is a string', async () => {
    const result = await retrieve('zzxyzzy999norecord999xyzzy');
    assert.ok(typeof result.message === 'string');
    assert.ok(result.message.length > 0);
  });

  test('successful result has null message', async () => {
    const result = await retrieve('insulin diabetes type 2');
    assert.ok(result.results.length > 0);
    assert.equal(result.message, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('KeywordRetriever — category filtering', () => {
  test('explicit medicine category returns only medicine results', async () => {
    const result = await retrieve('tablet dosage drug', 'medicine');
    for (const r of result.results) {
      assert.equal(r.category, 'medicine', `Unexpected category: ${r.category}`);
    }
  });

  test('explicit patient category returns only patient results', async () => {
    const result = await retrieve('hypertension diagnosis age', 'patient');
    for (const r of result.results) {
      assert.equal(r.category, 'patient', `Unexpected category: ${r.category}`);
    }
  });

  test('explicit instrument category returns only instrument results', async () => {
    const result = await retrieve('scanner calibration status', 'instrument');
    for (const r of result.results) {
      assert.equal(r.category, 'instrument', `Unexpected category: ${r.category}`);
    }
  });

  test('explicit inventory category returns only inventory results', async () => {
    const result = await retrieve('gloves stock quantity', 'inventory');
    for (const r of result.results) {
      assert.equal(r.category, 'inventory', `Unexpected category: ${r.category}`);
    }
  });

  test('auto category can return mixed results', async () => {
    const result = await retrieve('hypertension lisinopril', 'auto');
    // Results may be medicine or patient — just check they exist
    assert.ok(result.results.length > 0);
  });

  test('maxResults parameter is respected', async () => {
    const result = await retrieve('patient diagnosis', 'auto', 3);
    assert.ok(result.results.length <= 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('KeywordRetriever — scoring correctness', () => {
  test('lisinopril query scores lisinopril medicine highly', async () => {
    const result = await retrieve('lisinopril', 'medicine');
    assert.ok(result.results.length > 0);
    const top = result.results[0];
    assert.ok(
      top.record.name?.toLowerCase().includes('lisinopril') ||
      top.record.keywords?.some(k => k.includes('lisinopril')),
      'Top result should be lisinopril'
    );
  });

  test('MRI query scores MRI instrument highly', async () => {
    const result = await retrieve('MRI machine magnetic resonance', 'instrument');
    assert.ok(result.results.length > 0);
    const names = result.results.map(r => r.record.name?.toLowerCase() ?? '');
    assert.ok(names.some(n => n.includes('mri')), 'MRI should be in top results');
  });

  test('normal saline query scores saline inventory highly', async () => {
    const result = await retrieve('normal saline IV fluid', 'inventory');
    assert.ok(result.results.length > 0);
  });

  test('higher score result ranks above lower score result', async () => {
    const result = await retrieve('insulin diabetes type 1 injectable', 'medicine');
    if (result.results.length >= 2) {
      assert.ok(result.results[0].score >= result.results[1].score);
    }
  });
});
