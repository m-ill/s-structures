import { loadSource, negateVector } from './common.js';

export const FIXED_END_TEMPERATURE_VERSION = 'p8-m3-fixed-end-temperature-v3';

export function fixedEndTemperature(load, ax, md = {}) {
  const alpha = finitePositive(load.alpha ?? md.material?.alpha);
  const E = Number(md.material?.E || 0);
  const A = Number(md.section?.A || 0);
  if (alpha == null) return failedTemperature(load, 'TEMPERATURE_ALPHA_REQUIRED', 'Uniform temperature requires a positive load or material alpha.');
  const N = E * A * alpha * Number(load.dT || 0);
  const q0 = new Array(12).fill(0);
  q0[0] += N;
  q0[6] -= N;
  const fe = negateVector(q0);
  return {
    ok: true,
    version: FIXED_END_TEMPERATURE_VERSION,
    source: loadSource(load),
    method: 'fixed-end-uniform-temperature',
    fe,
    q0,
    recovery: { type: 'temperature', axialForce: -N },
    handcalc: {
      expression: 'N_restraint = -E A alpha dT (tension positive)',
      E,
      A,
      alpha,
      dT: Number(load.dT || 0),
      axialForce: -N,
    },
  };
}
export function fixedEndTemperatureGradient(load, ax, md = {}) {
  const alpha = finitePositive(load.alpha ?? md.material?.alpha);
  const E = Number(md.material?.E || 0);
  const Iz = Number(md.section?.Iz || 0);
  const h = finitePositive(load.h ?? md.section?.H);
  if (alpha == null) return failedTemperature(load, 'TEMPERATURE_ALPHA_REQUIRED', 'Temperature gradient requires a positive load or material alpha.');
  if (h == null) return failedTemperature(load, 'TEMPERATURE_GRADIENT_DEPTH_REQUIRED', 'Temperature gradient requires a positive load depth h or section H.');
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

function failedTemperature(load, code, message) {
  const issue = {
    code,
    entityType: 'load',
    entityId: load.id || null,
    memberId: load.member || null,
    message,
  };
  return {
    ok: false,
    reason: code,
    issues: [issue],
    version: FIXED_END_TEMPERATURE_VERSION,
    source: loadSource(load),
    method: 'fixed-end-temperature-invalid',
    fe: new Array(12).fill(0),
    q0: new Array(12).fill(0),
    recovery: null,
    handcalc: null,
  };
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
