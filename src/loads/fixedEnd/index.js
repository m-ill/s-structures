import { fixedEndMemberMoment } from './memberMoment.js';
import { fixedEndPartialUdl } from './udlPartial.js';
import { fixedEndPointLoad } from './pointLoad.js';
import { fixedEndTemperature, fixedEndTemperatureGradient } from './temperature.js';
import { fixedEndTrapezoid } from './trapezoid.js';
import { fixedEndUdl } from './udl.js';

export const FIXED_END_LOAD_VERSION = 'p7-m7-axis-aware-fixed-end-load-v1';

export function buildFixedEndLoad(load = {}, ax = {}, md = {}) {
  let result = null;
  if (load.type === 'udl') result = fixedEndUdl(load, ax, md);
  else if (load.type === 'udl-partial') result = fixedEndPartialUdl(load, ax, md);
  else if (load.type === 'trapezoid') result = fixedEndTrapezoid(load, ax, md);
  else if (load.type === 'point') result = fixedEndPointLoad(load, ax, md);
  else if (load.type === 'mmoment') result = fixedEndMemberMoment(load, ax, md);
  else if (load.type === 'temperature') result = fixedEndTemperature(load, ax, md);
  else if (load.type === 'tgradient') result = fixedEndTemperatureGradient(load, ax, md);
  if (!result) return null;
  const fe = sanitizeVector(result.fe, 12, load, 'fe');
  const q0 = sanitizeVector(result.q0, 12, load, 'q0');
  const issues = [...(result.issues || []), ...fe.issues, ...q0.issues];
  return {
    contractVersion: FIXED_END_LOAD_VERSION,
    ...result,
    ok: result.ok !== false && issues.length === 0,
    reason: result.reason || issues[0]?.code || null,
    issues,
    fe: fe.values,
    q0: q0.values,
  };
}

export function buildFixedEndLoads(loads = [], memberData = {}) {
  return loads
    .map((load) => {
      const md = memberData[load.member];
      if (!md) return null;
      return buildFixedEndLoad(load, md.ax, md);
    })
    .filter(Boolean);
}

export function fixedEndTraceRow(contract) {
  if (!contract) return null;
  return {
    version: contract.contractVersion || FIXED_END_LOAD_VERSION,
    id: contract.source?.id || null,
    type: contract.source?.type || null,
    member: contract.source?.member || null,
    method: contract.method,
    fe: contract.fe,
    q0: contract.q0,
    recovery: contract.recovery,
    handcalc: contract.handcalc,
    issues: contract.issues || [],
  };
}

function sanitizeVector(vector = [], length = 12, load = {}, field = 'vector') {
  const issues = [];
  const values = Array.from({ length }, (_, i) => {
    const raw = vector?.[i] ?? 0;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      issues.push({
        code: 'NONFINITE_FIXED_END_COMPONENT',
        entityType: 'load',
        entityId: load.id || null,
        memberId: load.member || null,
        component: `${field}[${i}]`,
        value: raw,
      });
      return 0;
    }
    return Math.abs(value) < 1e-14 ? 0 : value;
  });
  return { values, issues };
}

export { fixedEndUdl } from './udl.js';
export { fixedEndPartialUdl } from './udlPartial.js';
export { fixedEndTrapezoid } from './trapezoid.js';
export { fixedEndPointLoad } from './pointLoad.js';
export { fixedEndMemberMoment } from './memberMoment.js';
export { FIXED_END_TEMPERATURE_VERSION, fixedEndTemperature, fixedEndTemperatureGradient } from './temperature.js';
export { springSettlementLoad } from './settlement.js';
