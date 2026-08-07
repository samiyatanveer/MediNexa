// backend/src/services/retrieval/QueryNormalizer.js
// Normalises a raw user query into clean tokens for keyword matching.

/** Common English stop words — also include clinical stop words that add no search value. */
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'shall','can','need','dare','ought','used','it','its','this','that',
  'these','those','i','me','my','we','our','us','you','your','he','she',
  'him','her','they','them','their','what','which','who','whom','when',
  'where','why','how','all','any','both','each','few','more','most',
  'other','some','such','no','not','only','same','so','than','too',
  'very','just','about','tell','show','give','get','find','list','search',
  'look','information','info','details','data','records','record','report',
  'please','want','need','know','give','me','us','about','regarding',
  'related','using','use','using','what','is','are','the','patient',
]);

/**
 * Normalise a raw query string into lowercase tokens with stop words removed.
 *
 * Pipeline:
 *   1. Lowercase
 *   2. Replace punctuation / special chars with spaces
 *   3. Split on whitespace
 *   4. Remove tokens shorter than 2 chars
 *   5. Remove stop words
 *   6. Deduplicate (preserve order)
 *
 * @param {string} query
 * @returns {{ tokens: string[], raw: string, normalised: string }}
 */
export function normalizeQuery(query) {
  if (typeof query !== 'string' || !query.trim()) {
    return { tokens: [], raw: '', normalised: '' };
  }

  const raw = query.trim();
  const lower = raw.toLowerCase();

  // Replace punctuation / non-alpha-numeric (keep hyphens inside words)
  const cleaned = lower
    .replace(/[^a-z0-9\s-]/g, ' ')   // strip punctuation except hyphens
    .replace(/-+/g, ' ')              // expand hyphens to spaces
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();

  const allTokens = cleaned.split(' ').filter(t => t.length >= 2);
  const tokens = [...new Set(allTokens.filter(t => !STOP_WORDS.has(t)))];

  return {
    raw,
    normalised: tokens.join(' '),
    tokens,
  };
}

export default normalizeQuery;
