import { forceAxis, round6 } from './forceDirection.js';

export function torsionMz(force, dir, eccentricity) {
  const axis = forceAxis(dir);
  const e = axis === 'x' ? Number(eccentricity?.y || 0) : Number(eccentricity?.x || 0);
  return round6((axis === 'x' ? -1 : 1) * (Number(force) || 0) * e);
}
