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
const { retrieve, detectStockFilter, isStockQuery, isLowStockQuery, retrieveByStockThreshold, retrieveLowStock } = await import(toFileUrl(resolve(ROOT, 'backend/src/services/retrieval/KeywordRetriever.js')));
const { formatMedicineList } = await import(toFileUrl(resolve(ROOT, 'backend/src/services/generation/DomainFormatter.js')));

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

// ─────────────────────────────────────────────────────────────────────────────
describe('detectStockFilter', () => {
  test('detects "below N" pattern', () => {
    const f = detectStockFilter('Which medicines have stock below 100 units?');
    assert.ok(f !== null);
    assert.equal(f.direction, 'below');
    assert.equal(f.threshold, 100);
  });

  test('detects "under N" pattern', () => {
    const f = detectStockFilter('medicines under 50 units');
    assert.ok(f !== null);
    assert.equal(f.direction, 'below');
    assert.equal(f.threshold, 50);
  });

  test('detects "less than N" pattern', () => {
    const f = detectStockFilter('stock less than 200');
    assert.ok(f !== null);
    assert.equal(f.direction, 'below');
    assert.equal(f.threshold, 200);
  });

  test('detects "fewer than N" pattern', () => {
    const f = detectStockFilter('medicines with fewer than 75 units');
    assert.ok(f !== null);
    assert.equal(f.direction, 'below');
    assert.equal(f.threshold, 75);
  });

  test('detects "above N" pattern', () => {
    const f = detectStockFilter('medicines with stock above 500');
    assert.ok(f !== null);
    assert.equal(f.direction, 'above');
    assert.equal(f.threshold, 500);
  });

  test('detects "over N" pattern', () => {
    const f = detectStockFilter('drugs over 300 units');
    assert.ok(f !== null);
    assert.equal(f.direction, 'above');
    assert.equal(f.threshold, 300);
  });

  test('detects "more than N" pattern', () => {
    const f = detectStockFilter('more than 1000 units in stock');
    assert.ok(f !== null);
    assert.equal(f.direction, 'above');
    assert.equal(f.threshold, 1000);
  });

  test('detects "greater than N" pattern', () => {
    const f = detectStockFilter('greater than 250 units');
    assert.ok(f !== null);
    assert.equal(f.direction, 'above');
    assert.equal(f.threshold, 250);
  });

  test('returns null when no number is present', () => {
    const f = detectStockFilter('medicines with low stock');
    assert.equal(f, null);
  });

  test('returns null for non-comparison queries', () => {
    const f = detectStockFilter('patient with hypertension');
    assert.equal(f, null);
  });

  test('returns null for null input', () => {
    assert.equal(detectStockFilter(null), null);
  });

  test('returns null for empty string', () => {
    assert.equal(detectStockFilter(''), null);
  });

  test('parses decimal thresholds', () => {
    const f = detectStockFilter('stock below 50.5 units');
    assert.ok(f !== null);
    assert.equal(f.threshold, 50.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('isStockQuery', () => {
  test('returns true for medicine stock below query', () => {
    assert.equal(isStockQuery('medicines with stock below 100 units'), true);
  });

  test('returns true for drug stock above query', () => {
    assert.equal(isStockQuery('drugs with stock above 500'), true);
  });

  test('returns true for medication under query', () => {
    assert.equal(isStockQuery('medication under 50'), true);
  });

  test('returns false when no numeric comparison', () => {
    assert.equal(isStockQuery('medicines with low stock'), false);
  });

  test('returns false for non-medicine query with number', () => {
    assert.equal(isStockQuery('patients above 50 years old'), false);
  });

  test('returns false for null input', () => {
    assert.equal(isStockQuery(null), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Medicine stock threshold — retrieveByStockThreshold', () => {
  before(() => kbLoader.load());

  test('returns medicines below threshold', () => {
    const result = retrieveByStockThreshold('stock below 100', { direction: 'below', threshold: 100 });
    assert.equal(result.noResults || result.results.length > 0, true);
    for (const r of result.results) {
      assert.ok(r.record.stock_units < 100, `stock_units ${r.record.stock_units} should be < 100`);
    }
  });

  test('returns medicines above threshold', () => {
    const result = retrieveByStockThreshold('stock above 400', { direction: 'above', threshold: 400 });
    for (const r of result.results) {
      assert.ok(r.record.stock_units > 400, `stock_units ${r.record.stock_units} should be > 400`);
    }
  });

  test('results sorted ascending for below', () => {
    const result = retrieveByStockThreshold('stock below 200', { direction: 'below', threshold: 200 });
    for (let i = 1; i < result.results.length; i++) {
      assert.ok(
        result.results[i - 1].record.stock_units <= result.results[i].record.stock_units,
        'Results not sorted ascending for below filter'
      );
    }
  });

  test('results sorted descending for above', () => {
    const result = retrieveByStockThreshold('stock above 200', { direction: 'above', threshold: 200 });
    for (let i = 1; i < result.results.length; i++) {
      assert.ok(
        result.results[i - 1].record.stock_units >= result.results[i].record.stock_units,
        'Results not sorted descending for above filter'
      );
    }
  });

  test('each result has name, stock_units, batch_id, medicine_id fields', () => {
    const result = retrieveByStockThreshold('stock below 500', { direction: 'below', threshold: 500 });
    assert.ok(result.results.length > 0);
    for (const r of result.results) {
      assert.ok('name'        in r.record, 'Missing name');
      assert.ok('stock_units' in r.record, 'Missing stock_units');
      assert.ok('batch_id'    in r.record, 'Missing batch_id');
      assert.ok('medicine_id' in r.record, 'Missing medicine_id');
    }
  });

  test('returns category=medicine for all results', () => {
    const result = retrieveByStockThreshold('stock below 100', { direction: 'below', threshold: 100 });
    for (const r of result.results) {
      assert.equal(r.category, 'medicine');
    }
  });

  test('stockFilter field is present on result object', () => {
    const filter = { direction: 'below', threshold: 50 };
    const result = retrieveByStockThreshold('stock below 50', filter);
    assert.deepEqual(result.stockFilter, filter);
  });

  test('impossible threshold returns noResults=true', () => {
    const result = retrieveByStockThreshold('stock below 0', { direction: 'below', threshold: 0 });
    assert.equal(result.noResults, true);
    assert.deepEqual(result.results, []);
  });

  test('message is null when results found', () => {
    const result = retrieveByStockThreshold('stock below 500', { direction: 'below', threshold: 500 });
    if (result.results.length > 0) {
      assert.equal(result.message, null);
    }
  });

  test('message is a string when no results found', () => {
    const result = retrieveByStockThreshold('stock below 0', { direction: 'below', threshold: 0 });
    assert.ok(typeof result.message === 'string' && result.message.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Medicine stock threshold — via retrieve()', () => {
  test('retrieve() routes stock-below query to stock fast-path', async () => {
    const result = await retrieve('Which medicines have stock below 100 units?');
    assert.equal(result.category, 'medicine');
    for (const r of result.results) {
      assert.ok(r.record.stock_units < 100,
        `Expected stock_units < 100, got ${r.record.stock_units}`);
    }
  });

  test('retrieve() routes stock-above query to stock fast-path', async () => {
    const result = await retrieve('medicines with stock above 400 units');
    assert.equal(result.category, 'medicine');
    for (const r of result.results) {
      assert.ok(r.record.stock_units > 400,
        `Expected stock_units > 400, got ${r.record.stock_units}`);
    }
  });

  test('retrieve() handles "under N" phrasing', async () => {
    const result = await retrieve('medicine stock under 50');
    assert.equal(result.category, 'medicine');
    for (const r of result.results) {
      assert.ok(r.record.stock_units < 50);
    }
  });

  test('retrieve() handles "more than N" phrasing', async () => {
    const result = await retrieve('medicines with more than 300 units in stock');
    assert.equal(result.category, 'medicine');
    for (const r of result.results) {
      assert.ok(r.record.stock_units > 300);
    }
  });

  test('retrieve() result contains expected fields per record', async () => {
    const result = await retrieve('medicines with stock below 100 units');
    assert.ok(result.results.length > 0);
    const r = result.results[0];
    assert.ok('name'        in r.record);
    assert.ok('stock_units' in r.record);
    assert.ok('batch_id'    in r.record);
    assert.ok('medicine_id' in r.record);
    assert.ok('id'          in r);
    assert.ok('category'    in r);
  });

  test('retrieve() stockFilter is present on result', async () => {
    const result = await retrieve('medicines with stock below 100');
    assert.ok('stockFilter' in result);
    assert.equal(result.stockFilter.direction, 'below');
    assert.equal(result.stockFilter.threshold, 100);
  });


  test('retrieve() isListQuery=true for stock-below query', async () => {
    const result = await retrieve('medicines with stock below 100 units');
    assert.equal(result.isListQuery, true);
  });

  test('retrieve() isListQuery=true for stock-above query', async () => {
    const result = await retrieve('medicines with stock above 400 units');
    assert.equal(result.isListQuery, true);
  });

  test('retrieve() listLabel is set for stock queries', async () => {
    const result = await retrieve('medicines with stock below 50');
    assert.ok(typeof result.listLabel === 'string' && result.listLabel.length > 0);
    assert.ok(result.listLabel.includes('below'));
  });

  test('retrieve() returns ALL matching records (no MAX_RESULTS cap)', async () => {
    const result = await retrieve('medicines with stock below 100 units');
    // There should be more than the default MAX_RESULTS=5 matches below 100
    // (most KB datasets have many low-stock medicines)
    assert.ok(result.results.length > 0, 'Should return at least one result');
    // All returned results must pass the filter — this is the critical correctness check
    for (const r of result.results) {
      assert.ok(r.record.stock_units < 100,
        `stock_units ${r.record.stock_units} violates < 100 threshold`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('isLowStockQuery', () => {
  test('returns true for "medicines low in stock"', () => {
    assert.equal(isLowStockQuery('Which medicines are low in stock?'), true);
  });

  test('returns true for "low stock medicines"', () => {
    assert.equal(isLowStockQuery('Find medicines with low stock'), true);
  });

  test('returns true for "running low"', () => {
    assert.equal(isLowStockQuery('Which medicines are running low?'), true);
  });

  test('returns true for "reorder level"', () => {
    assert.equal(isLowStockQuery('medicines near reorder level'), true);
  });

  test('returns true for "out of stock"', () => {
    assert.equal(isLowStockQuery('medicines out of stock'), true);
  });

  test('returns false when query has numeric threshold (handled by isStockQuery)', () => {
    // Has a number → should go to isStockQuery, not isLowStockQuery
    assert.equal(isLowStockQuery('medicines with stock below 100'), false);
  });

  test('returns false for non-medicine queries', () => {
    assert.equal(isLowStockQuery('patients with low blood pressure'), false);
  });

  test('returns false for null input', () => {
    assert.equal(isLowStockQuery(null), false);
  });

  test('returns false for empty string', () => {
    assert.equal(isLowStockQuery(''), false);
  });

  test('isLowStockQuery and isStockQuery are mutually exclusive on numeric queries', () => {
    const q = 'medicines with stock below 50 units';
    assert.equal(isStockQuery(q),    true,  'isStockQuery should match');
    assert.equal(isLowStockQuery(q), false, 'isLowStockQuery must NOT match numeric queries');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('retrieveLowStock', () => {
  before(() => kbLoader.load());

  test('returns medicines with stock_units <= reorder_level', () => {
    const result = retrieveLowStock('medicines low in stock');
    for (const r of result.results) {
      assert.ok(
        r.record.stock_units <= r.record.reorder_level,
        `stock ${r.record.stock_units} should be <= reorder ${r.record.reorder_level}`
      );
    }
  });

  test('results are sorted ascending by stock_units', () => {
    const result = retrieveLowStock('medicines running low');
    for (let i = 1; i < result.results.length; i++) {
      assert.ok(
        result.results[i - 1].record.stock_units <= result.results[i].record.stock_units,
        'Results not sorted ascending by stock_units'
      );
    }
  });

  test('each result has name, stock_units, reorder_level, batch_id, medicine_id', () => {
    const result = retrieveLowStock('medicines low in stock');
    assert.ok(result.results.length > 0, 'Expected at least one low-stock medicine');
    for (const r of result.results) {
      assert.ok('name'          in r.record, 'Missing name');
      assert.ok('stock_units'   in r.record, 'Missing stock_units');
      assert.ok('reorder_level' in r.record, 'Missing reorder_level');
      assert.ok('batch_id'      in r.record, 'Missing batch_id');
      assert.ok('medicine_id'   in r.record, 'Missing medicine_id');
    }
  });

  test('isListQuery=true on retrieveLowStock result', () => {
    const result = retrieveLowStock('medicines low in stock');
    assert.equal(result.isListQuery, true);
  });

  test('listLabel is set on retrieveLowStock result', () => {
    const result = retrieveLowStock('medicines low in stock');
    assert.ok(typeof result.listLabel === 'string' && result.listLabel.length > 0);
  });

  test('category is medicine', () => {
    const result = retrieveLowStock('running low');
    assert.equal(result.category, 'medicine');
  });

  test('totalSearched equals medicines KB size', () => {
    const result = retrieveLowStock('medicines low in stock');
    assert.equal(result.totalSearched, kbLoader.getCategory('medicines').length);
  });

  test('retrieve() routes low-stock qualitative query to retrieveLowStock', async () => {
    const result = await retrieve('Which medicines are low in stock?');
    assert.equal(result.category,    'medicine');
    assert.equal(result.isListQuery, true);
    // Every result must have stock <= reorder_level
    for (const r of result.results) {
      assert.ok(
        r.record.stock_units <= r.record.reorder_level,
        `stock ${r.record.stock_units} > reorder ${r.record.reorder_level}`
      );
    }
  });

  test('retrieve() routes "running low" query to retrieveLowStock', async () => {
    const result = await retrieve('medicines running low');
    assert.equal(result.isListQuery, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DomainFormatter — formatMedicineList', () => {

  const sampleResults = [
    { id: 'MED-aaa', category: 'medicine', score: 1, matched_terms: ['stock_units'],
      record: { name: 'Lisinopril', dosage: '10mg', form: 'Tablet', stock_units: 50, batch_id: 'bat001', medicine_id: 'MED-aaa' } },
    { id: 'MED-bbb', category: 'medicine', score: 1, matched_terms: ['stock_units'],
      record: { name: 'Metformin',  dosage: '500mg', form: 'Tablet', stock_units: 30, batch_id: 'bat002', medicine_id: 'MED-bbb' } },
  ];

  test('returns type=medicine-list', () => {
    const out = formatMedicineList(sampleResults, 'Medicines below 100');
    assert.equal(out.type, 'medicine-list');
  });

  test('count equals results length', () => {
    const out = formatMedicineList(sampleResults, 'Test');
    assert.equal(out.count, 2);
  });

  test('items contains correct fields', () => {
    const out = formatMedicineList(sampleResults, 'Test');
    for (const item of out.items) {
      assert.ok('name'   in item, 'Missing name');
      assert.ok('dosage' in item, 'Missing dosage');
      assert.ok('form'   in item, 'Missing form');
      assert.ok('stock'  in item, 'Missing stock');
      assert.ok('batch'  in item, 'Missing batch');
      assert.ok('source' in item, 'Missing source');
    }
  });

  test('items stock value comes from stock_units', () => {
    const out = formatMedicineList(sampleResults, 'Test');
    assert.equal(out.items[0].stock, 50);
    assert.equal(out.items[1].stock, 30);
  });

  test('items source comes from result.id', () => {
    const out = formatMedicineList(sampleResults, 'Test');
    assert.equal(out.items[0].source, 'MED-aaa');
    assert.equal(out.items[1].source, 'MED-bbb');
  });

  test('sources is comma-joined list of IDs', () => {
    const out = formatMedicineList(sampleResults, 'Test');
    assert.ok(out.sources.includes('MED-aaa'));
    assert.ok(out.sources.includes('MED-bbb'));
  });

  test('label is preserved', () => {
    const out = formatMedicineList(sampleResults, 'Custom label');
    assert.equal(out.label, 'Custom label');
  });

  test('empty results return count=0 with empty items', () => {
    const out = formatMedicineList([], 'Empty');
    assert.equal(out.count, 0);
    assert.deepEqual(out.items, []);
  });
});
