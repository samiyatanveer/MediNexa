// backend/src/services/generation/PromptBuilder.js
// Builds category-aware prompts from retrieved KB context.
// Rules: answer ONLY from context, never invent, include masked source IDs.

const SYSTEM_PREAMBLE = `You are a clinical knowledge assistant for Houston Memorial Hospital.
You answer questions ONLY using the retrieved hospital records provided below.
Do not invent facts, diagnoses, or details not present in the context.
If the context does not contain enough information, say so clearly.
Always include the Source IDs from the retrieved records.`;

/**
 * Build a prompt for patient queries (SOAP response format).
 */
function buildPatientPrompt(query, results) {
  const contextBlocks = results.map((r, i) => {
    const p = r.record;
    return `[Record ${i + 1} | Source: ${r.id}]
Age: ${p.age} | Gender: ${p.gender} | Blood Type: ${p.blood_type}
Diagnoses: ${(p.diagnoses ?? []).join(', ')}
Symptoms: ${(p.symptoms ?? []).join(', ')}
Vitals: BP ${p.vitals?.systolic_bp}/${p.vitals?.diastolic_bp} mmHg | HR ${p.vitals?.heart_rate} bpm | Temp ${p.vitals?.temperature_c}°C | SpO2 ${p.vitals?.spo2_percent}%
Medications: ${(p.medications ?? []).join(', ')}
Visit History: ${(p.visit_history ?? []).map(v => `${v.date} — ${v.reason} (${v.department})`).join('; ')}`;
  }).join('\n\n');

  return `${SYSTEM_PREAMBLE}

RETRIEVED PATIENT RECORDS:
${contextBlocks}

USER QUERY: ${query}

Respond ONLY using the above records. Format your response as a SOAP note:
Subjective:
Objective:
Assessment:
Plan:
Sources:`;
}

/**
 * Build a prompt for medicine queries.
 */
function buildMedicinePrompt(query, results) {
  const contextBlocks = results.map((r, i) => {
    const m = r.record;
    return `[Record ${i + 1} | Source: ${r.id}]
Name: ${m.name} | Dosage: ${m.dosage} | Form: ${m.form}
Indications: ${(m.indications ?? []).join(', ')}
Contraindications: ${(m.contraindications ?? []).join(', ')}
Stock: ${m.stock_units} units | Batch: ${m.batch_id} | Expiry: ${m.expiry_date}`;
  }).join('\n\n');

  return `${SYSTEM_PREAMBLE}

RETRIEVED MEDICINE RECORDS:
${contextBlocks}

USER QUERY: ${query}

Respond ONLY using the above records. Format your response as:
Medicine:
Dosage:
Form:
Indications:
Contraindications:
Stock:
Batch:
Sources:`;
}

/**
 * Build a prompt for instrument queries.
 */
function buildInstrumentPrompt(query, results) {
  const contextBlocks = results.map((r, i) => {
    const ins = r.record;
    return `[Record ${i + 1} | Source: ${r.id}]
Name: ${ins.name} | Category: ${ins.category}
Department: ${ins.department} | Location: ${ins.location}
Operational Status: ${ins.operational_status}
Maintenance: ${ins.maintenance_status}
Last Calibration: ${ins.last_calibration} | Next Calibration: ${ins.next_calibration}`;
  }).join('\n\n');

  return `${SYSTEM_PREAMBLE}

RETRIEVED INSTRUMENT RECORDS:
${contextBlocks}

USER QUERY: ${query}

Respond ONLY using the above records. Format your response as:
Instrument:
Category:
Department:
Operational Status:
Maintenance:
Calibration:
Sources:`;
}

/**
 * Build a prompt for inventory queries.
 */
function buildInventoryPrompt(query, results) {
  const contextBlocks = results.map((r, i) => {
    const inv = r.record;
    return `[Record ${i + 1} | Source: ${r.id}]
Item: ${inv.item_name} | Category: ${inv.category}
Quantity: ${inv.quantity} ${inv.unit} | Location: ${inv.location}
Reorder Level: ${inv.reorder_level} | Status: ${inv.status}`;
  }).join('\n\n');

  return `${SYSTEM_PREAMBLE}

RETRIEVED INVENTORY RECORDS:
${contextBlocks}

USER QUERY: ${query}

Respond ONLY using the above records. Format your response as:
Item:
Category:
Quantity:
Location:
Reorder Level:
Status:
Sources:`;
}

/**
 * Build a no-results prompt — Ollama still responds but states nothing was found.
 */
function buildNoResultPrompt(query, category) {
  return `${SYSTEM_PREAMBLE}

No hospital records were found matching the query below.

USER QUERY: ${query}
CATEGORY: ${category}

Respond: "No records found matching your query. Please refine your search terms or select a specific category."
Do not invent any information.`;
}

/**
 * Main entry point — selects the correct prompt builder based on category.
 *
 * @param {string} query
 * @param {string} category  'patient'|'medicine'|'instrument'|'inventory'|'auto'
 * @param {Array}  results   RetrievalHit[] from KeywordRetriever
 * @returns {string} Full prompt string
 */
export function buildPrompt(query, category, results) {
  if (!results || results.length === 0) {
    return buildNoResultPrompt(query, category);
  }

  // When auto, use the dominant category of results
  const effectiveCategory = category === 'auto'
    ? (results[0]?.category ?? 'patient')
    : category;

  switch (effectiveCategory) {
    case 'patient':    return buildPatientPrompt(query, results);
    case 'medicine':   return buildMedicinePrompt(query, results);
    case 'instrument': return buildInstrumentPrompt(query, results);
    case 'inventory':  return buildInventoryPrompt(query, results);
    default:           return buildPatientPrompt(query, results);
  }
}

export default buildPrompt;
