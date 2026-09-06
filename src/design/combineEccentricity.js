import { round6 } from './forceDirection.js';

export function combineEccentricity(base = {}, accidental = {}) {
  return {
    x: round6(Number(base.x || 0) + Number(accidental.x || 0)),
    y: round6(Number(base.y || 0) + Number(accidental.y || 0)),
  };
}
