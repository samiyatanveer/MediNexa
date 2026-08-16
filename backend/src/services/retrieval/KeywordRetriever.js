// backend/src/services/retrieval/KeywordRetriever.js
// Weighted keyword-overlap retrieval over the JSON KB.
// No vectors, no embeddings, no external APIs.

import { kbLoader } from './JsonKBLoader.js';
import { normalizeQuery } from './QueryNormalizer.js';
import { classifyCategory } from './CategoryClassifier.js';
import { env } from '../../config/env.js';

// ─── Stock threshold detection ────────────────────────────────────────────────

/**
 * Detect a numeric stock comparison in a raw query string.
 *
 * Supports:
 *   "below 100", "under 100", "less than 100"
 *   "above 100", "over 100",  "more than 100"
 *
 * @param {string} query
 * @returns {{ direction: 'below'|'above', threshold: number } | null}
 */
export function detectStockFilter(query) {
  if (!query || typeof query !== 'string') return null;

  // Match: (below|under|less than|fewer than) <number>
  const belowMatch = query.match(
    /\b(?:below|under|less\s+than|fewer\s+than)\s+(\d+(?:\.\d+)?)\b/i
  );
  if (belowMatch) {
    return { direction: 'below', threshold: parseFloat(belowMatch[1]) };
  }

  // Match: (above|over|more than|greater than) <number>
  const aboveMatch = query.match(
    /\b(?:above|over|more\s+than|greater\s+than)\s+(\d+(?:\.\d+)?)\b/i
  );
  if (aboveMatch) {
    return { direction: 'above', threshold: parseFloat(aboveMatch[1]) };
  }

  return null;
}

/**
 * Determine whether a raw query is a numeric stock-threshold query.
 * Returns true when the query contains medicine/stock vocabulary AND a
 * numeric comparison operator (below/above/under/over/less than/more than).
 *
 * @param {string} query  Raw (un-normalised) query string
 * @returns {boolean}
 */
export function isStockQuery(query) {
  if (!query || typeof query !== 'string') return false;
  const lower = query.toLowerCase();
  const hasMedicineSignal = /\b(?:medicine|medicines|drug|drugs|tablet|tablets|capsule|stock|stocks|medication|medications|pharmacy)\b/.test(lower);
  const hasStockSignal    = /\b(?:stock|units|supply|supplies|inventory|available|in stock|on hand)\b/.test(lower);
  return (hasMedicineSignal || hasStockSignal) && detectStockFilter(query) !== null;
}

/**
 * Detect a qualitative "low stock" / "running low" query that has NO
 * explicit numeric threshold. These are handled by comparing stock_units
 * against each medicine's own reorder_level.
 *
 * @param {string} query
 * @returns {boolean}
 */
export function isLowStockQuery(query) {
  if (!query || typeof query !== 'string') return false;
  // Must not already have a numeric threshold (those go to isStockQuery)
  if (detectStockFilter(query) !== null) return false;
  const lower = query.toLowerCase();
  const hasLowSignal = /\b(?:low(?:\s+in)?\s+stock|running\s+low|low\s+level|near\s+(?:reorder|threshold)|below\s+reorder|reorder\s+level|critical\s+stock|out\s+of\s+stock|stock\s+alert|needs?\s+restock(?:ing)?|almost\s+out|stock(?:ing)?\s+issue)\b/.test(lower);
  const hasMedicineSignal = /\b(?:medicine|medicines|drug|drugs|medication|medications|pharmacy|tablet|capsule)\b/.test(lower);
  // Accept "low stock" alone (no medicine word required — context is clear)
  return hasLowSignal && (hasMedicineSignal || /\b(?:stock|supply|supplies)\b/.test(lower));
}

/**
 * Return all medicines whose current stock_units are at or below their
 * own reorder_level (i.e. genuinely low-stock or out-of-stock).
 *
 * @param {string} query  Raw user query (for metadata)
 * @returns {RetrievalResult}
 */
export function retrieveLowStock(query) {
  const loader = kbLoader;
  loader.load();

  const medicines = loader.getCategory('medicines');

  const matches = medicines.filter(m => {
    const stock   = typeof m.stock_units   === 'number' ? m.stock_units   : parseFloat(m.stock_units);
    const reorder = typeof m.reorder_level === 'number' ? m.reorder_level : parseFloat(m.reorder_level);
    return Number.isFinite(stock) && Number.isFinite(reorder) && stock <= reorder;
  });

  const results = matches
    .map(m => ({
      id:            m.medicine_id,
      category:      'medicine',
      score:         1,
      matched_terms: ['stock_units', 'reorder_level'],
      record:        { ...m },
    }))
    .sort((a, b) => a.record.stock_units - b.record.stock_units);  // lowest first

  return {
    query,
    normalised:       query,
    tokens:           ['stock', 'low'],
    category:         'medicine',
    confidence:       1,
    classifierScores: {},
    results,
    totalSearched:    medicines.length,
    noResults:        results.length === 0,
    isListQuery:      true,
    listLabel:        'Medicines at or below reorder level',
    message: results.length === 0
      ? 'No medicines found at or below their reorder level.'
      : null,
  };
}

// ─── Scoring weights ──────────────────────────────────────────────────────────
// Higher weight = stronger signal for that field.
const FIELD_WEIGHTS = {
  keywords:         3.0,   // curated KB keywords — strongest signal
  synonyms:         2.5,   // domain synonyms — very strong
  name:             2.0,   // instrument / medicine name
  item_name:        2.0,   // inventory item name
  diagnoses:        1.8,   // patient diagnoses list
  indications:      1.8,   // medicine indications
  symptoms:         1.5,   // patient symptoms list
  contraindications:1.2,   // medicine contraindications
  category:         1.2,   // instrument / inventory category
  department:       1.0,   // instrument department
  location:         0.8,   // instrument / inventory location
  operational_status:0.6,
  maintenance_status:0.6,
  status:           0.6,   // inventory status
  form:             0.8,   // medicine form (Tablet / Injectable …)
};

// ─── Per-category ID fields ───────────────────────────────────────────────────
const ID_FIELD = {
  patients:    'patient_id',
  medicines:   'medicine_id',
  instruments: 'instrument_id',
  inventory:   'item_id',
};

// ─── Explicit ID prefix → category mapping ────────────────────────────────────
const ID_PREFIXES = {
  'PAT-': 'patients',
  'MED-': 'medicines',
  'INS-': 'instruments',
  'INV-': 'inventory',
};

/**
 * Extract an explicit masked ID from a raw query string.
 * The ID is preserved exactly as-is (case-sensitive, hyphens intact).
 * Matches the first occurrence of PAT-/MED-/INS-/INV- followed by hex chars.
 *
 * @param {string} query
 * @returns {{ id: string, category: string } | null}
 */
function extractExplicitId(query) {
  if (!query || typeof query !== 'string') return null;
  // Match PAT-/MED-/INS-/INV- followed by 1+ hex or alphanumeric chars
  const match = query.match(/\b(PAT|MED|INS|INV)-([a-zA-Z0-9]+)\b/);
  if (!match) return null;
  const id = match[0];                         // e.g. PAT-619b0bbe6b22
  const prefix = match[1] + '-';               // e.g. PAT-
  const category = ID_PREFIXES[prefix] ?? null;
  if (!category) return null;
  return { id, category };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return all string tokens from a field value.
 * Handles strings, arrays of strings, and nested objects (shallow).
 */
function fieldTokens(value) {
  if (!value) return [];
  if (typeof value === 'string') return value.toLowerCase().split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) {
    return value.flatMap(v => fieldTokens(v));
  }
  return [];
}

/**
 * Score one record against the query tokens.
 * Returns { score, matchedTerms } where matchedTerms is a de-duped list.
 */
function scoreRecord(record, queryTokens) {
  if (queryTokens.length === 0) return { score: 0, matchedTerms: [] };

  const matchedTerms = new Set();
  let totalScore = 0;

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (!(field in record)) continue;
    const tokens = fieldTokens(record[field]);
    if (tokens.length === 0) continue;

    for (const qt of queryTokens) {
      for (const ft of tokens) {
        // Exact match
        if (ft === qt) {
          totalScore += weight;
          matchedTerms.add(qt);
          break;
        }
        // Prefix match (e.g. "hypertens" → "hypertension") — partial credit
        if (ft.length > 3 && qt.length > 3 && (ft.startsWith(qt) || qt.startsWith(ft))) {
          totalScore += weight * 0.5;
          matchedTerms.add(qt);
          break;
        }
      }
    }
  }

  // Normalise by query length so longer queries don't always win
  const normScore = queryTokens.length > 0 ? totalScore / queryTokens.length : 0;

  return { score: Math.round(normScore * 100) / 100, matchedTerms: [...matchedTerms] };
}

// ─── Main retriever ───────────────────────────────────────────────────────────

/**
 * Main retrieval function.
 *
 * @param {string}  query           Raw user query string
 * @param {string}  [categoryHint]  Optional explicit category override
 * @param {number}  [maxResults]    Max results to return (default: env.MAX_RESULTS)
 * @returns {Promise<RetrievalResult>}
 */
/**
 * Stock-threshold fast-path for medicine queries.
 * Filters medicines by stock_units and returns all matching records directly,
 * bypassing keyword scoring entirely.
 *
 * @param {string} query            Raw user query
 * @param {{ direction: 'below'|'above', threshold: number }} stockFilter
 * @returns {RetrievalResult}
 */
export function retrieveByStockThreshold(query, stockFilter) {
  const loader = kbLoader;
  loader.load();

  const medicines = loader.getCategory('medicines');
  const { direction, threshold } = stockFilter;

  const matches = medicines.filter(m => {
    const stock = typeof m.stock_units === 'number' ? m.stock_units : parseFloat(m.stock_units);
    if (!Number.isFinite(stock)) return false;
    return direction === 'below' ? stock < threshold : stock > threshold;
  });

  const results = matches.map(m => ({
    id:            m.medicine_id,
    category:      'medicine',
    score:         1,
    matched_terms: ['stock_units'],
    record: {
      name:       m.name,
      stock_units:m.stock_units,
      batch_id:   m.batch_id,
      medicine_id:m.medicine_id,
      // Include full record for prompt building
      ...m,
    },
  }));

  // Sort by stock ascending for 'below', descending for 'above'
  results.sort((a, b) =>
    direction === 'below'
      ? a.record.stock_units - b.record.stock_units
      : b.record.stock_units - a.record.stock_units
  );

  const label = direction === 'below' ? `below ${threshold}` : `above ${threshold}`;

  return {
    query,
    normalised:       query,
    tokens:           ['stock_units'],
    category:         'medicine',
    confidence:       1,
    classifierScores: {},
    results,
    totalSearched:    medicines.length,
    noResults:        results.length === 0,
    isListQuery:      true,
    listLabel:        `Medicines with stock ${label} units`,
    message: results.length === 0
      ? `No medicines found with stock ${label} units.`
      : null,
    stockFilter,
  };
}

export async function retrieve(query, categoryHint, maxResults) {
  const limit = maxResults ?? env.MAX_RESULTS ?? 5;

  // ── Numeric stock threshold fast-path ────────────────────────────────────
  // Run before normalisation so the raw numeric is preserved.
  const stockFilter = detectStockFilter(query ?? '');
  if (stockFilter && isStockQuery(query ?? '')) {
    return retrieveByStockThreshold(query, stockFilter);
  }
  // ── End numeric stock threshold fast-path ────────────────────────────────

  // ── Qualitative low-stock fast-path ──────────────────────────────────────
  if (isLowStockQuery(query ?? '')) {
    return retrieveLowStock(query);
  }
  // ── End qualitative low-stock fast-path ──────────────────────────────────

  // ── Explicit ID fast-path ─────────────────────────────────────────────────
  // Must run BEFORE normalization — the normalizer strips hyphens and
  // lowercases IDs, destroying them before they can be matched.
  const explicitId = extractExplicitId(query ?? '');
  if (explicitId) {
    const loader = kbLoader;
    loader.load();
    const { id, category: idCategory } = explicitId;
    const records = loader.getCategory(idCategory);
    const idField = ID_FIELD[idCategory];
    const singularCat = idCategory === 'inventory' ? 'inventory' : idCategory.replace(/s$/, '');

    const match = records.find(r => r[idField] === id);
    const results = match
      ? [{ id: match[idField], category: singularCat, score: 99, matched_terms: [id], record: match }]
      : [];

    return {
      query,
      normalised: id,
      tokens: [id],
      category: singularCat,
      confidence: 1,
      classifierScores: {},
      results,
      totalSearched: records.length,
      noResults: results.length === 0,
      message: results.length === 0
        ? `No record found with ID "${id}". Verify the ID is correct.`
        : null,
    };
  }
  // ── End explicit ID fast-path ─────────────────────────────────────────────

  // 1. Normalise the query
  const { tokens, raw, normalised } = normalizeQuery(query);

  // 2. Classify category
  const { category, confidence, scores: classifierScores } = classifyCategory(tokens, categoryHint);

  // 3. Determine which KB categories to search
  const loader = kbLoader;
  loader.load();

  let searchCategories;
  if (category === 'auto') {
    searchCategories = loader.categories;  // search all 4
  } else {
    // Singular category name → plural file name
    const catMap = { patient: 'patients', medicine: 'medicines', instrument: 'instruments', inventory: 'inventory' };
    searchCategories = [catMap[category] ?? category];
  }

  // 4. Handle empty query — return empty result set
  if (tokens.length === 0) {
    return {
      query: raw,
      normalised: '',
      tokens: [],
      category,
      confidence,
      results: [],
      totalSearched: 0,
      noResults: true,
      message: 'Query is empty or contains only stop words.',
    };
  }

  // 5. Score records across all target categories
  const allScored = [];

  for (const catName of searchCategories) {
    const records = loader.getCategory(catName);
    const singularCat = catName === 'inventory' ? 'inventory' : catName.replace(/s$/, '');

    for (const record of records) {
      const { score, matchedTerms } = scoreRecord(record, tokens);
      if (score <= 0) continue;

      const id = record[ID_FIELD[catName]];
      allScored.push({
        id,
        category: singularCat,
        score,
        matched_terms: matchedTerms,
        record,
      });
    }
  }

  // 6. Deduplicate by ID (keep highest score if same ID appears twice)
  const deduped = new Map();
  for (const item of allScored) {
    if (!deduped.has(item.id) || deduped.get(item.id).score < item.score) {
      deduped.set(item.id, item);
    }
  }

  // 7. Sort descending by score, take top N
  const results = [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const totalSearched = searchCategories.reduce(
    (sum, c) => sum + loader.getCategory(c).length, 0
  );

  return {
    query: raw,
    normalised,
    tokens,
    category,
    confidence: Math.round(confidence * 100) / 100,
    classifierScores,
    results,
    totalSearched,
    noResults: results.length === 0,
    message: results.length === 0
      ? `No records found matching "${raw}". Try a different term.`
      : null,
  };
}

/**
 * Typed result shape (JSDoc only — no runtime cost).
 * @typedef {{
 *   id: string,
 *   category: string,
 *   score: number,
 *   matched_terms: string[],
 *   record: object
 * }} RetrievalHit
 *
 * @typedef {{
 *   query: string,
 *   normalised: string,
 *   tokens: string[],
 *   category: string,
 *   confidence: number,
 *   results: RetrievalHit[],
 *   totalSearched: number,
 *   noResults: boolean,
 *   message: string|null
 * }} RetrievalResult
 */

export default retrieve;
