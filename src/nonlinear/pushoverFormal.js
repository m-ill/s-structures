import { runPushover } from './pushover.js';

export const FORMAL_PUSHOVER_VERSION = 'p3-m15-pushover-formal';

export function runFormalPushover(model, options = {}) {
  const preliminary = runPushover(model, options);
  const curve = (preliminary.curve || []).map((point) => ({
    step: point.step,
    lambda: point.loadFactor,
    baseShear: point.baseShear,
    roofDisp: point.controlDisplacement,
    converged: point.ok,
    iterations: point.ok ? 1 : 0,
    hingeEvents: [],
  }));
  return {
    ok: !!preliminary.ok,
    version: FORMAL_PUSHOVER_VERSION,
    sourceVersion: preliminary.version,
    method: {
      elements: 'linear-frame-with-formal-pushover-contract',
      hinges: 'concentrated-M-theta-preliminary',
      control: options.control || 'load-control',
    },
    limitations: [
      'Uses existing pushover analysis path until tangent stiffness hinge degradation is integrated.',
      'PMM and fiber traces are available in the P3-M16 nonlinear trace, but are not yet condensed into this pushover tangent path.',
    ],
    controlNodeId: preliminary.controlNodeId,
    direction: preliminary.direction,
    steps: curve,
    capacityCurve: curve.map((point) => ({ baseShear: point.baseShear, roofDisp: point.roofDisp })),
    hingeStates: preliminary.memberStates || {},
    summary: preliminary.summary || {},
    warnings: preliminary.warnings || [],
  };
}

export function comparePushoverRegression(current, baseline) {
  const a = current?.capacityCurve || [];
  const b = baseline?.capacityCurve || [];
  const count = Math.min(a.length, b.length);
  const rows = Array.from({ length: count }, (_, i) => ({
    step: i,
    baseShearDiff: Math.abs((a[i].baseShear || 0) - (b[i].baseShear || 0)),
    roofDispDiff: Math.abs((a[i].roofDisp || 0) - (b[i].roofDisp || 0)),
  }));
  return {
    version: FORMAL_PUSHOVER_VERSION,
    comparedSteps: count,
    maxBaseShearDiff: Math.max(0, ...rows.map((row) => row.baseShearDiff)),
    maxRoofDispDiff: Math.max(0, ...rows.map((row) => row.roofDispDiff)),
    rows,
  };
}
