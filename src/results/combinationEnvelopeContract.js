import { buildResultPostprocessing } from './resultPostprocessing.js';
import { combinationEnvelopeAudit } from './combinationEnvelopeAudit.js';
import { combinationEnvelopeSummary } from './combinationEnvelopeSummary.js';
import { combinationEnvelopeSources } from './combinationEnvelopeSources.js';
import { COMBINATION_ENVELOPE_CONTRACT_VERSION } from './combinationEnvelopeVersion.js';

export function buildCombinationEnvelopeContract(model, analysis, options = {}) {
  const post = buildResultPostprocessing(model, analysis, options);
  const { groups, rules, coverage } = combinationEnvelopeSources(model, options);
  const env = combinationEnvelopeAudit(model, analysis, post, options);
  return {
    version: COMBINATION_ENVELOPE_CONTRACT_VERSION,
    tickets: ['T21', 'T22', 'T23', 'T24'],
    combinationGroups: groups,
    ruleGeneration: rules,
    coverageAudit: coverage,
    envelopeAudit: env,
    summary: combinationEnvelopeSummary(groups, rules, coverage, env),
  };
}
