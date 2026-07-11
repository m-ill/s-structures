import { loadSource, negateVector } from './common.js';

export const FIXED_END_TEMPERATURE_VERSION = 'p6-m2-fixed-end-temperature-v1';

export function fixedEndTemperature(load, ax, md = {}) {
  const alpha = Number(load.alpha ?? md.material?.alpha ?? 1.2e-5);
  const E = Number(md.material?.E || 0);
  const A = Number(md.section?.A || 0);
  const N = E * A * alpha * Number(load.dT || 0);
  const q0 = new Array(12).fill(0);
  q0[0] -= N;
  q0[6] += N;
  const fe = negateVector(q0);
  return {
    ok: true,
    version: FIXED_END_TEMPERATURE_VERSION,
    source: loadSource(load),
    method: 'fixed-end-uniform-temperature',
    fe,
    q0,
    recovery: { type: 'temperature', axialForce: N },
    handcalc: {
      expression: 'N = E A alpha dT',
      E,
      A,
      alpha,
      dT: Number(load.dT || 0),
      axialForce: N,
    },
  };
}
export function fixedEndTemperatureGradient(load, ax, md = {}) {
  const alpha = Number(load.alpha ?? md.material?.alpha ?? 1.2e-5);
  const E = Number(md.material?.E || 0);
  const Iz = Number(md.section?.Iz || 0);
  const h = Math.max(1e-9, Number(load.h || md.section?.H || 1));
  const curvature = alpha * (Number(load.dTtop || 0) - Number(load.dTbot || 0)) / h;
  const M = E * Iz * curvature;
  const q0 = new Array(12).fill(0);
  q0[5] -= M;
  q0[11] += M;
  const fe = negateVector(q0);
  return {
    ok: true,
    version: FIXED_END_TEMPERATURE_VERSION,
    source: loadSource(load),
    method: 'fixed-end-temperature-gradient',
    fe,
    q0,
    recovery: { type: 'temperature-gradient', moment: M },
    handcalc: {
      expression: 'M = E Iz alpha (dTtop-dTbot) / h',
      E,
      Iz,
      alpha,
      h,
      curvature,
      moment: M,
    },
  };
}
