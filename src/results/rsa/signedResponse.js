import { signedAccidentalSign, signedAccidentalVariants } from '../../core/signedLateralCases.js';

export const RSA_SIGNED_RESPONSE_VERSION = 'p6-m4-rsa-signed-response-v1';

export function buildSignedResponseStrategy(input = {}) {
  const lateralCases = input.lateralCases || input.caseIds || [];
  const unsignedMethod = /SRSS|CQC|ABS|NRC(?:10)?/i.test(String(input.method || input.rsa?.method || 'SRSS'));
  const signedCases = lateralCases
    .filter((caseId) => /[+-]$|A[PN]$/i.test(String(caseId)))
    .map((caseId) => ({ caseId, sign: signOf(caseId) }));
  const generatedAccidental = (input.accidentalBaseCases || []).flatMap((caseId) => signedAccidentalVariants(caseId));
  const warnings = [];
  if (unsignedMethod) warnings.push('RSA modal-combination responses are unsigned; design envelopes require signed lateral cases or explicit ELF sign strategy.');
  if (!signedCases.length && !generatedAccidental.length) warnings.push('No signed lateral response cases were provided.');
  return {
    version: RSA_SIGNED_RESPONSE_VERSION,
    method: input.method || input.rsa?.method || 'SRSS',
    strategy: signedCases.length ? 'provided-signed-lateral-cases' : 'generate-accidental-plus-minus-cases',
    signedCases,
    generatedAccidental,
    dominantModeSign: input.dominantModeSign || null,
    dimensions: { sign: 'dimensionless' },
    units: { sign: '1' },
    provenance: {
      source: 'rsa-sign-strategy',
      analysisCaseId: input.analysisCaseId || input.rsa?.provenance?.analysisCaseId || null,
      responseMethod: input.method || input.rsa?.method || 'SRSS',
      staticCaseReferences: [],
    },
    warnings,
    status: warnings.length ? 'review-required' : 'available',
  };
}

function signOf(caseId) {
  const text = String(caseId || '').toUpperCase();
  if (text.endsWith('-') || text.endsWith('N')) return 'negative';
  if (text.endsWith('+') || text.endsWith('P')) return 'positive';
  return signedAccidentalSign(text);
}
