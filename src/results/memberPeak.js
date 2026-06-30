import { finite } from './resultUtils.js';

export const MEMBER_FORCE_KEYS = ['N', 'Vy', 'Vz', 'My', 'Mz'];

export function updateMemberPeaks(peaks, comboId, result, key) {
  const xs = result?.xs || [];
  const values = result?.[key] || [];
  for (let i = 0; i < values.length; i += 1) {
    const value = finite(values[i]);
    const current = peaks[key];
    if (!current || Math.abs(value) > Math.abs(current.value)) {
      peaks[key] = { comboId, x: finite(xs[i]), value };
    }
  }
}

export function governingMemberPeak(peaks) {
  return Object.entries(peaks).reduce((best, [key, row]) => (
    !best || Math.abs(row.value) > Math.abs(best.value) ? { key, ...row } : best
  ), null);
}
