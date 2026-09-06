import { hasCombinationFactor } from './combinationFactorScan.js';
import { purposeForCombinationGroup } from './combinationPurpose.js';

export const COMBINATION_GROUP_VERSION = 'p2-t21-combination-groups';

export function classifyCombinationGroup(combo = {}) {
  const type = String(combo.type || '').toLowerCase();
  const id = String(combo.id || '').toUpperCase();
  const factors = combo.factors || {};
  let group = 'strength';
  if (type.includes('construction') || id.includes('CONST')) group = 'construction';
  else if (type.includes('foundation') || id.includes('FND')) group = 'foundation';
  else if (hasCombinationFactor(factors, 'E')) group = 'seismic';
  else if (type.includes('service') || id.includes('SVC')) group = 'service';
  return { group, purpose: purposeForCombinationGroup(group), type: combo.type || group };
}
