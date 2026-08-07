// backend/src/services/generation/SOAPFormatter.js
// Formats a validated SOAP field map into the canonical patient response object.

/**
 * Format a SOAP fields object into the standard patient response.
 * @param {{ fields: object, valid: boolean, repaired: boolean, raw: string }} validated
 * @param {string[]} sourceIds  Masked patient IDs from retrieval
 * @returns {{ type: 'soap', subjective, objective, assessment, plan, sources, valid, repaired, raw }}
 */
export function formatSOAP(validated, sourceIds = []) {
  const { fields, valid, repaired, raw } = validated;
  return {
    type:        'soap',
    subjective:  fields['Subjective']  ?? '',
    objective:   fields['Objective']   ?? '',
    assessment:  fields['Assessment']  ?? '',
    plan:        fields['Plan']        ?? '',
    sources:     fields['Sources'] || sourceIds.join(', '),
    valid,
    repaired,
    raw,
  };
}

export default formatSOAP;
