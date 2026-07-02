import { selectLongitudinalBars } from '../rcDetailing.js';

export const RC_SLAB_DETAIL_VERSION = 'p3-m17-rc-slab-detail';

export function detailRcSlab(input = {}, options = {}) {
  const id = input.id || 'slab';
  const lx = Number(input.lx || input.shortSpan || options.lx || 4);
  const ly = Number(input.ly || input.longSpan || options.ly || 6);
  const t = Number(input.thickness || options.thickness || 0.15);
  const load = Number(input.factoredLoad || options.factoredLoad || 8);
  const mode = ly / Math.max(0.1, lx) >= 2 ? 'one-way' : 'two-way';
  const moment = mode === 'one-way' ? load * lx * lx / 8 : load * lx * lx / 12;
  const asReq = moment * 1e6 / Math.max(1, 0.9 * t * 1000 * 400 * 0.85);
  const main = selectLongitudinalBars(asReq, { minBars: 2, preferredBar: options.slabBar || 'D13' });
  const punching = punchingCheck(input, t);
  return {
    version: RC_SLAB_DETAIL_VERSION,
    slabId: id,
    role: 'slab',
    status: punching.status,
    mode,
    spans: { lx, ly, thickness: t },
    flexure: { moment: round(moment), requiredAs: round(asReq), main, formulaId: `KDS-RC-SLAB-${mode.toUpperCase()}-V1` },
    punching,
    reinforcement: { main, distribution: `${main.bar}@200 approximate` },
  };
}

function punchingCheck(input, t) {
  const demand = Math.abs(Number(input.punchingShear || input.columnReaction || 0));
  const capacity = Math.max(1, 0.17 * Math.sqrt(Number(input.fc || 24)) * 4 * (Number(input.columnSize || 0.4) + t) * 1000 * t * 1000 / 1000);
  const ratio = demand / capacity;
  return { demand, capacity: round(capacity), ratio: round(ratio), status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK', formulaId: 'KDS-RC-SLAB-PUNCHING-V1' };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
