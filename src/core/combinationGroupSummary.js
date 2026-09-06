import {
  COMBINATION_GROUP_VERSION,
  classifyCombinationGroup,
} from './combinationGroup.js';

export function summarizeCombinationGroups(modelOrCombinations = {}) {
  const combos = Array.isArray(modelOrCombinations)
    ? modelOrCombinations
    : modelOrCombinations?.loadCombinations || [];
  const rows = combos.map((combo) => ({
    id: combo.id,
    name: combo.name || combo.id,
    ...classifyCombinationGroup(combo),
  }));
  return {
    version: COMBINATION_GROUP_VERSION,
    rowCount: rows.length,
    counts: rows.reduce((out, row) => {
      out[row.group] = (out[row.group] || 0) + 1;
      return out;
    }, {}),
    rows,
  };
}
