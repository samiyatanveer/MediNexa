// backend/src/services/chat/ChatService.js
// Central RAG pipeline: user message → retrieve → prompt → generate → validate → persist.

import { retrieve } from '../retrieval/KeywordRetriever.js';
import { buildPrompt } from '../generation/PromptBuilder.js';
import { validateAndRepair } from '../generation/TemplateValidator.js';
import { formatSOAP } from '../generation/SOAPFormatter.js';
import { formatDomain } from '../generation/DomainFormatter.js';
import { GroqClient } from '../generation/GroqClient.js';
import { chatSessionRepository } from '../../repositories/ChatSessionRepository.js';
import { chatMessageRepository } from '../../repositories/ChatMessageRepository.js';
import { userRepository } from '../../repositories/UserRepository.js';
import { normalizeQuery } from '../retrieval/QueryNormalizer.js';
import { logger } from '../../utils/logger.js';

// ─── Title generation ─────────────────────────────────────────────────────────
// Deterministic: take first 5 meaningful tokens from query, capitalise first.
const TITLE_STOP = new Set(['the','a','an','is','are','what','how','give','show','list','find','tell','me','us']);

export function generateTitle(query) {
  const words = query.trim().split(/\s+/).filter(w => w.length > 1 && !TITLE_STOP.has(w.toLowerCase()));
  const meaningful = words.slice(0, 5).join(' ');
  if (!meaningful) return query.slice(0, 60) || 'New Chat';
  return meaningful.charAt(0).toUpperCase() + meaningful.slice(1);
}

// ─── Response formatter ───────────────────────────────────────────────────────
function formatResponse(generatedText, effectiveCategory, sourceIds) {
  // Domain cards represent one record. When Groq returns multiple record blocks,
  // preserve the complete source-grounded answer through the UI's existing raw
  // response fallback instead of collapsing it into a single, misleading card.
  const sourceBlocks = generatedText.match(/^[\t ]*(?:\d+[.)][\t ]*)?Sources[\t ]*:/gim) ?? [];
  if (effectiveCategory !== 'patient' && sourceBlocks.length > 1) {
    return null;
  }

  const validated = validateAndRepair(generatedText, effectiveCategory, sourceIds);

  if (effectiveCategory === 'patient') {
    return formatSOAP(validated, sourceIds);
  }
  return formatDomain(effectiveCategory, validated, sourceIds);
}

// ─── ChatService ──────────────────────────────────────────────────────────────
export class ChatService {
  /**
   * @param {GroqClient} [groqClient]  Injectable for testing
   */
  constructor(groqClient) {
    this.groq = groqClient ?? new GroqClient();
  }

  /**
   * Process a user message through the full RAG pipeline.
   *
   * @param {string} sessionId
   * @param {string} userQuery
   * @param {string} [categoryHint]  'auto'|'patient'|'medicine'|'instrument'|'inventory'
   * @returns {Promise<ChatResponse>}
   */
  async processMessage(sessionId, userQuery, categoryHint = 'auto') {
    // 1. Validate session exists
    const session = await chatSessionRepository.getById(sessionId);
    if (!session) {
      throw Object.assign(new Error(`Chat session not found: ${sessionId}`), { status: 404 });
    }

    // 2. Retrieve from JSON KB
    let retrievalResult;
    try {
      retrievalResult = await retrieve(userQuery, categoryHint);
    } catch (retrievalErr) {
      logger.error('Retrieval failed', retrievalErr.message);
      retrievalResult = { results: [], noResults: true, category: categoryHint, tokens: [], normalised: '' };
    }

    const sourceIds   = retrievalResult.results.map(r => r.id);
    const effectiveCat = retrievalResult.category === 'auto'
      ? (retrievalResult.results[0]?.category ?? 'patient')
      : retrievalResult.results[0]?.category ?? retrievalResult.category;

    // 3. Build prompt
    const prompt = buildPrompt(userQuery, effectiveCat, retrievalResult.results);

    // 4. Call Groq — graceful fallback if unavailable
    let generatedText;
    let groqAvailable = true;
    try {
      const response = await this.groq.generate(prompt);
      generatedText = response.text;
    } catch (groqErr) {
      groqAvailable = false;
      logger.warn('Groq unavailable — using fallback response', groqErr.message);

      if (retrievalResult.noResults) {
        generatedText = `No records found matching your query. Please try different search terms.`;
      } else {
        // Construct a template-valid fallback from retrieved records directly
        generatedText = buildFallbackResponse(effectiveCat, retrievalResult.results, sourceIds);
      }
    }

    // 5. Validate and format
    const formattedResponse = formatResponse(generatedText, effectiveCat, sourceIds);

    // 6. Persist user + assistant messages in one transaction
    const assistantContent = generatedText;
    const { userMessage, assistantMessage } = await chatMessageRepository.insertPair(
      sessionId,
      { content: userQuery, category: effectiveCat },
      {
        content:  assistantContent,
        category: effectiveCat,
        sources_json: sourceIds.length > 0
          ? { ids: sourceIds, matched_terms: retrievalResult.results[0]?.matched_terms ?? [] }
          : null,
        retrieval_metadata: {
          query:          userQuery,
          normalised:     retrievalResult.normalised,
          tokens:         retrievalResult.tokens,
          category:       retrievalResult.category,
          confidence:     retrievalResult.confidence,
          total_searched: retrievalResult.totalSearched,
          no_results:     retrievalResult.noResults,
          groq_ok:        groqAvailable,
        },
      }
    );

    return {
      userMessage,
      assistantMessage,
      formatted:  formattedResponse,
      sourceIds,
      retrieval: {
        category:       retrievalResult.category,
        resultCount:    retrievalResult.results.length,
        noResults:      retrievalResult.noResults,
        tokens:         retrievalResult.tokens,
      },
      groqAvailable,
    };
  }

  /**
   * Create a new chat session with a deterministic title.
   * @param {string} userId
   * @param {string} [firstQuery]
   */
  async createSession(userId, firstQuery) {
    const title = firstQuery ? generateTitle(firstQuery) : 'New Chat';
    return chatSessionRepository.create(userId, title);
  }
}

// ─── Fallback response builder (when the provider is unavailable) ────────────
function buildFallbackResponse(category, results, sourceIds) {
  if (!results.length) {
    return 'No records found matching your query.';
  }
  const r = results[0].record;
  const src = sourceIds.slice(0, 3).join(', ');

  switch (category) {
    case 'patient':
      return [
        `Subjective: Patient with age ${r.age}, gender ${r.gender}, blood type ${r.blood_type}.`,
        `Objective: BP ${r.vitals?.systolic_bp}/${r.vitals?.diastolic_bp} | HR ${r.vitals?.heart_rate} | Temp ${r.vitals?.temperature_c}°C | SpO2 ${r.vitals?.spo2_percent}%.`,
        `Assessment: Diagnoses include ${(r.diagnoses ?? []).join(', ')}.`,
        `Plan: Based on retrieved records. Consult attending physician.`,
        `Sources: ${src}`,
      ].join('\n');
    case 'medicine':
      return [
        `Medicine: ${r.name}`, `Dosage: ${r.dosage}`, `Form: ${r.form}`,
        `Indications: ${(r.indications ?? []).join(', ')}`,
        `Contraindications: ${(r.contraindications ?? []).join(', ')}`,
        `Stock: ${r.stock_units} units`, `Batch: ${r.batch_id}`,
        `Sources: ${src}`,
      ].join('\n');
    case 'instrument':
      return [
        `Instrument: ${r.name}`, `Category: ${r.category}`, `Department: ${r.department}`,
        `Operational Status: ${r.operational_status}`, `Maintenance: ${r.maintenance_status}`,
        `Calibration: ${r.last_calibration}`, `Sources: ${src}`,
      ].join('\n');
    case 'inventory':
      return [
        `Item: ${r.item_name}`, `Category: ${r.category}`,
        `Quantity: ${r.quantity} ${r.unit}`, `Location: ${r.location}`,
        `Reorder Level: ${r.reorder_level}`, `Status: ${r.status}`,
        `Sources: ${src}`,
      ].join('\n');
    default:
      return `Retrieved ${results.length} records. Sources: ${src}`;
  }
}

export const chatService = new ChatService();
export default ChatService;
