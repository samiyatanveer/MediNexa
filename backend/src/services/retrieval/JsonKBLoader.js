// backend/src/services/retrieval/JsonKBLoader.js
// Loads all four JSON knowledge-base files once and caches them in memory.
// Re-reading only happens if the cache is explicitly cleared (for testing).

import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve the data directory relative to this file (or via env override). */
function resolveDataDir() {
  if (env.KB_DATA_DIR && env.KB_DATA_DIR !== '../data') {
    return resolve(env.KB_DATA_DIR);
  }
  // Default: four levels up from src/services/retrieval → project root / data
  return resolve(__dirname, '../../../../data');
}

const CATEGORIES = ['patients', 'medicines', 'instruments', 'inventory'];

class JsonKBLoader {
  constructor() {
    /** @type {Map<string, Array>} */
    this._cache = new Map();
    this._loaded = false;
    this._dataDir = resolveDataDir();
  }

  /**
   * Load and cache all four KB files.  Idempotent — safe to call repeatedly.
   * @returns {void}
   */
  load() {
    if (this._loaded) return;
    for (const cat of CATEGORIES) {
      const filePath = join(this._dataDir, `${cat}.json`);
      try {
        const raw = readFileSync(filePath, 'utf8');
        this._cache.set(cat, JSON.parse(raw));
      } catch (err) {
        throw new Error(`[JsonKBLoader] Failed to load ${filePath}: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Retrieve all records for one category.
   * @param {'patients'|'medicines'|'instruments'|'inventory'} category
   * @returns {Array}
   */
  getCategory(category) {
    if (!this._loaded) this.load();
    if (!this._cache.has(category)) {
      throw new Error(`[JsonKBLoader] Unknown category: ${category}`);
    }
    return this._cache.get(category);
  }

  /**
   * Retrieve all records across all categories as a flat map.
   * @returns {Map<string, Array>}
   */
  getAll() {
    if (!this._loaded) this.load();
    return this._cache;
  }

  /** Clear the cache (used in tests to reload with fresh data). */
  clear() {
    this._cache.clear();
    this._loaded = false;
  }

  /** Return category names. */
  get categories() {
    return CATEGORIES;
  }

  /** Total record count across all categories. */
  get totalRecords() {
    if (!this._loaded) this.load();
    return CATEGORIES.reduce((sum, cat) => sum + (this._cache.get(cat)?.length ?? 0), 0);
  }
}

// Singleton instance shared across the application
export const kbLoader = new JsonKBLoader();
export default JsonKBLoader;
