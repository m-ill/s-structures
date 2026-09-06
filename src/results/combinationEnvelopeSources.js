import { summarizeCombinationGroups } from '../core/combinationGroupSummary.js';
import {
  summarizeKdsLoadCombinationCoverage,
  summarizeKdsLoadCombinationRules,
} from '../core/kdsLoadCombinations.js';

export function combinationEnvelopeSources(model, options = {}) {
  return {
    groups: summarizeCombinationGroups(model),
    rules: summarizeKdsLoadCombinationRules(model, options),
    coverage: summarizeKdsLoadCombinationCoverage(model, options),
  };
}
