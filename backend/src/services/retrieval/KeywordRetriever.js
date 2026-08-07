// backend/src/services/retrieval/KeywordRetriever.js
// Weighted keyword-overlap retrieval over the JSON KB.
// No vectors, no embeddings, no external APIs.

import { kbLoader } from './JsonKBLoader.js';
import { normalizeQuery } from './QueryNormalizer.js';
import { classifyCategory } from './CategoryClassifier.js';
import { env } from '../../config/env.js';

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
export async function retrieve(query, categoryHint, maxResults) {
  const limit = maxResults ?? env.MAX_RESULTS ?? 5;

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
