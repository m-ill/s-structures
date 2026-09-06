import { finite } from './resultUtils.js';

export function directionVector(value) {
  if (Array.isArray(value)) {
    return [finite(value[0]), finite(value[1]), finite(value[2])];
  }
  const dir = String(value || '-z').toLowerCase();
  const sign = dir.startsWith('-') ? -1 : 1;
  const axis = dir.replace(/^[+-]/, '');
  if (axis === 'x') return [sign, 0, 0];
  if (axis === 'y') return [0, sign, 0];
  return [0, 0, sign];
}
