// backend/src/services/retrieval/CategoryClassifier.js
// Detects which KB category (or 'auto' for all) a query is targeting.

/**
 * Keyword signals for each category.
 * The classifier scores the query tokens against each signal list and
 * returns the category with the highest match count (ties → 'auto').
 */
const CATEGORY_SIGNALS = {
  patient: [
    'patient', 'patients', 'admission', 'admitted', 'diagnosis', 'diagnose',
    'diagnosed', 'symptom', 'symptoms', 'vital', 'vitals', 'bp', 'heartrate',
    'temperature', 'spo2', 'respiratory', 'blood', 'age', 'gender', 'male',
    'female', 'visit', 'visits', 'history', 'hypertension', 'diabetes',
    'copd', 'asthma', 'pneumonia', 'uti', 'migraine', 'depression', 'anxiety',
    'stroke', 'sepsis', 'anemia', 'gout', 'epilepsy', 'obesity', 'ckd',
    'cardiac', 'cad', 'afib', 'dvt', 'pe', 'eczema', 'psoriasis', 'hiv',
    'tuberculosis', 'tb', 'malaria', 'dengue', 'covid', 'flu', 'influenza',
    'hospital', 'ward', 'icu', 'ehr', 'record', 'records',
  ],
  medicine: [
    'medicine', 'medicines', 'medication', 'medications', 'drug', 'drugs',
    'tablet', 'tablets', 'capsule', 'capsules', 'injection', 'injectable',
    'inhaler', 'inhalers', 'dosage', 'dose', 'mg', 'mcg', 'iu', 'units',
    'stock', 'batch', 'expiry', 'contraindication', 'contraindications',
    'indication', 'indications', 'antibiotic', 'antibiotics', 'antiviral',
    'analgesic', 'antidepressant', 'antihypertensive', 'statin', 'insulin',
    'steroid', 'diuretic', 'anticoagulant', 'opioid', 'nsaid', 'ppi',
    'ssri', 'vaccine', 'supplement', 'vitamin', 'iron', 'folic', 'lisinopril',
    'metformin', 'atorvastatin', 'amoxicillin', 'ciprofloxacin', 'azithromycin',
    'omeprazole', 'paracetamol', 'ibuprofen', 'morphine', 'warfarin', 'heparin',
    'salbutamol', 'budesonide', 'metoprolol', 'amlodipine', 'sertraline',
    'pharmacy', 'prescribed', 'prescription', 'reorder', 'supply', 'supplies',
  ],
  instrument: [
    'instrument', 'instruments', 'equipment', 'device', 'devices', 'machine',
    'machines', 'scanner', 'monitor', 'monitors', 'ventilator', 'defibrillator',
    'ecg', 'ekg', 'mri', 'ct', 'xray', 'ultrasound', 'scope', 'endoscope',
    'laparoscope', 'spirometer', 'dialysis', 'infusion', 'pump', 'centrifuge',
    'microscope', 'pcr', 'glucometer', 'oximeter', 'calibration', 'calibrated',
    'maintenance', 'operational', 'status', 'department', 'catheter', 'bipap',
    'cpap', 'anesthesia', 'surgical', 'table', 'phototherapy', 'echocardiography',
    'echo', 'fluoroscopy', 'mammography', 'pet', 'holter', 'radiology',
    'laboratory', 'lab', 'biomedical', 'clinical', 'imaging', 'diagnostic',
  ],
  inventory: [
    'inventory', 'stock', 'supply', 'supplies', 'quantity', 'reorder',
    'item', 'items', 'consumable', 'consumables', 'ppe', 'gloves', 'mask',
    'masks', 'gown', 'gowns', 'gauze', 'bandage', 'dressing', 'suture',
    'sutures', 'saline', 'ringer', 'dextrose', 'iv', 'cannula', 'catheter',
    'oxygen', 'cylinder', 'nasal', 'tube', 'tubing', 'tpn', 'feeding',
    'enteral', 'parenteral', 'alcohol', 'sanitizer', 'chlorhexidine',
    'sharps', 'autoclave', 'sterilisation', 'lancet', 'vacutainer',
    'urine', 'container', 'covid', 'antigen', 'test', 'kit', 'bag', 'bottle',
    'pack', 'box', 'roll', 'instock', 'lowstock', 'outofstock', 'ordered',
    'location', 'pharmacy', 'ward', 'storage',
  ],
};

/** Valid category values returned by this classifier. */
export const VALID_CATEGORIES = ['patient', 'medicine', 'instrument', 'inventory', 'auto'];

/**
 * Classify a query into one KB category.
 *
 * @param {string[]} tokens          Normalised tokens from QueryNormalizer
 * @param {string}   [explicit]      Explicit category override from request param
 * @returns {{ category: string, confidence: number, scores: object }}
 */
export function classifyCategory(tokens, explicit) {
  // Explicit override wins immediately (validated by route)
  if (explicit && explicit !== 'auto' && VALID_CATEGORIES.includes(explicit)) {
    return { category: explicit, confidence: 1.0, scores: {} };
  }

  if (!tokens || tokens.length === 0) {
    return { category: 'auto', confidence: 0, scores: {} };
  }

  const tokenSet = new Set(tokens);
  const scores = {};

  for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS)) {
    let hits = 0;
    for (const token of tokenSet) {
      // Exact match
      if (signals.includes(token)) { hits += 2; continue; }
      // Prefix match (e.g. "diabetic" matches "diabetes")
      if (signals.some(s => s.startsWith(token) || token.startsWith(s))) hits += 1;
    }
    scores[cat] = hits;
  }

  const maxScore = Math.max(...Object.values(scores));

  if (maxScore === 0) {
    return { category: 'auto', confidence: 0, scores };
  }

  const winners = Object.entries(scores).filter(([, v]) => v === maxScore);
  const confidence = maxScore / (tokens.length * 2);  // normalised 0–1

  if (winners.length === 1) {
    return { category: winners[0][0], confidence, scores };
  }

  // Tie → auto (search all categories)
  return { category: 'auto', confidence, scores };
}

export default classifyCategory;
