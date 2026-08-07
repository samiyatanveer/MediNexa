// backend/src/routes/kb.js
// Knowledge-base browse and search endpoints.
// All retrieval is keyword-based over the JSON KB — no DB, no vectors.

import { Router } from 'express';
import { kbLoader } from '../services/retrieval/JsonKBLoader.js';
import { retrieve } from '../services/retrieval/KeywordRetriever.js';
import { normalizeQuery } from '../services/retrieval/QueryNormalizer.js';
import { VALID_CATEGORIES } from '../services/retrieval/CategoryClassifier.js';

const router = Router();

// Ensure KB is loaded before handling any request
router.use((req, res, next) => {
  try {
    kbLoader.load();
    next();
  } catch (err) {
    next(err);
  }
});

// ── Validation helper ─────────────────────────────────────────────────────────
const PLURAL_CATEGORIES = ['patients', 'medicines', 'instruments', 'inventory'];
const SINGULAR_TO_PLURAL = {
  patient: 'patients', medicine: 'medicines',
  instrument: 'instruments', inventory: 'inventory',
};

function resolveCategory(param) {
  const p = param?.toLowerCase();
  if (PLURAL_CATEGORIES.includes(p)) return p;
  if (SINGULAR_TO_PLURAL[p]) return SINGULAR_TO_PLURAL[p];
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kb
// List all categories with record counts.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const summary = {};
  for (const cat of kbLoader.categories) {
    summary[cat] = kbLoader.getCategory(cat).length;
  }
  res.json({
    categories: summary,
    total: kbLoader.totalRecords,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kb/:category
// Browse records for a category with optional ?q= search and ?page= / ?limit= pagination.
//
// Query params:
//   q       — keyword search string (optional)
//   page    — 1-indexed page number (default 1)
//   limit   — records per page (default 20, max 100)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:category', async (req, res, next) => {
  try {
    const catName = resolveCategory(req.params.category);
    if (!catName) {
      return res.status(400).json({
        error: {
          message: `Invalid category '${req.params.category}'. Valid: ${PLURAL_CATEGORIES.join(', ')}`,
          status: 400,
        },
      });
    }

    const rawQuery = req.query.q?.toString().trim() ?? '';
    const page  = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));

    // If a search query is provided, run the retriever
    if (rawQuery) {
      const singularCat = catName === 'inventory' ? 'inventory' : catName.replace(/s$/, '');
      const result = await retrieve(rawQuery, singularCat);

      return res.json({
        category: catName,
        query: rawQuery,
        normalised: result.normalised,
        tokens: result.tokens,
        noResults: result.noResults,
        message: result.message,
        count: result.results.length,
        results: result.results,
      });
    }

    // No query → paginated browse
    const all = kbLoader.getCategory(catName);
    const total = all.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const records = all.slice(start, start + limit);

    res.json({
      category: catName,
      total,
      page,
      totalPages,
      limit,
      count: records.length,
      records,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kb/:category/:id
// Fetch a single record by its masked ID.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:category/:id', (req, res, next) => {
  try {
    const catName = resolveCategory(req.params.category);
    if (!catName) {
      return res.status(400).json({ error: { message: 'Invalid category', status: 400 } });
    }

    const ID_FIELDS = {
      patients: 'patient_id', medicines: 'medicine_id',
      instruments: 'instrument_id', inventory: 'item_id',
    };

    const idField = ID_FIELDS[catName];
    const records = kbLoader.getCategory(catName);
    const record = records.find(r => r[idField] === req.params.id);

    if (!record) {
      return res.status(404).json({ error: { message: `Record '${req.params.id}' not found in ${catName}`, status: 404 } });
    }

    res.json({ category: catName, record });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kb/search
// Cross-category search: { query, category? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/search', async (req, res, next) => {
  try {
    const { query, category } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: { message: "'query' string is required", status: 400 } });
    }

    // Validate optional category
    const catHint = category ? category.toLowerCase() : 'auto';
    const allowedHints = [...VALID_CATEGORIES, 'auto'];
    if (!allowedHints.includes(catHint)) {
      return res.status(400).json({
        error: { message: `Invalid category '${category}'. Valid: ${allowedHints.join(', ')}`, status: 400 },
      });
    }

    const result = await retrieve(query, catHint);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
