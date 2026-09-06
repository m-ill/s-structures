import { loadSource } from './common.js';

export const FIXED_END_SETTLEMENT_VERSION = 'p6-m2-fixed-end-settlement-v1';

export function springSettlementLoad(node = {}) {
  const stiffnessKeys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const dispKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const fe = new Array(6).fill(0);
  stiffnessKeys.forEach((key, i) => {
    const k = Number(node.spring?.[key] || 0);
    const imposed = Number(node.settlement?.[key] ?? node.settlement?.[dispKeys[i]] ?? 0);
    if (k > 0 && Number.isFinite(imposed)) fe[i] = k * imposed;
  });
  return {
    ok: fe.some((value) => value !== 0),
    version: FIXED_END_SETTLEMENT_VERSION,
    source: loadSource({ id: node.id || null, type: 'settlement' }),
    method: 'spring-support-imposed-displacement',
    fe,
    q0: fe.map((value) => -value),
    handcalc: {
      expression: 'F = k * imposed_displacement for spring supports',
      node: node.id || null,
    },
  };
}
