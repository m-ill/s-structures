import { forceAxis, round6 } from './forceDirection.js';

export function accidentalEccentricity(nodes, dir, basis = {}, options = {}) {
  const ratio = Math.max(0, Number(options.accidentalEccentricityRatio ?? basis.accidentalEccentricityRatio ?? 0) || 0);
  const sign = Number(options.accidentalEccentricitySign ?? basis.accidentalEccentricitySign ?? 1) < 0 ? -1 : 1;
  const axis = forceAxis(dir) === 'x' ? 'y' : 'x';
  const values = nodes.map((node) => Number(node[axis] || 0));
  const dimension = values.length ? Math.max(...values) - Math.min(...values) : 0;
  const value = round6(sign * ratio * dimension);
  return {
    x: axis === 'x' ? value : 0,
    y: axis === 'y' ? value : 0,
    ratio,
    sign,
    axis,
    dimension: round6(dimension),
  };
}
