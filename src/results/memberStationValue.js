import { MEMBER_FORCE_KEYS } from './memberPeak.js';

export function memberStationValue(comboId, result, index) {
  const row = { comboId, x: result.xs[index] };
  for (const key of MEMBER_FORCE_KEYS) row[key] = result[key]?.[index] || 0;
  return row;
}
