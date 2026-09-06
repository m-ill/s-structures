import { finite } from './resultUtils.js';

export const REACTION_KEYS = ['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz'];

export function emptyReactionRange() {
  return Object.fromEntries(REACTION_KEYS.map((key) => [key, {
    min: Infinity,
    max: -Infinity,
    comboMin: null,
    comboMax: null,
  }]));
}

export function updateReactionRange(range, comboId, reaction = {}) {
  for (const key of REACTION_KEYS) {
    const value = finite(reaction[key]);
    if (value < range[key].min) Object.assign(range[key], { min: value, comboMin: comboId });
    if (value > range[key].max) Object.assign(range[key], { max: value, comboMax: comboId });
  }
}

export function finalizeReactionRange(range) {
  return Object.fromEntries(REACTION_KEYS.map((key) => [key, {
    ...range[key],
    min: Number.isFinite(range[key].min) ? range[key].min : 0,
    max: Number.isFinite(range[key].max) ? range[key].max : 0,
  }]));
}
