import { runPushover } from './pushover.js';

export const FORMAL_PUSHOVER_VERSION = 'p3-m15-pushover-formal';

export function runFormalPushover(model, options = {}) {
  const preliminary = runPushover(model, options);
  const eventRows = buildPushoverHingeEvents(preliminary.curve || []);
  const control = buildPushoverControlTrace(preliminary, options);
  const curve = (preliminary.curve || []).map((point) => ({
    step: point.step,
    lambda: point.loadFactor,
    baseShear: point.baseShear,
    roofDisp: point.controlDisplacement,
    controlType: control.type,
    controlNodeId: preliminary.controlNodeId,
    pattern: preliminary.pattern || options.pattern || 'triangular',
    degradedMemberCount: point.degradedMemberCount || 0,
    minStiffnessFactor: point.minStiffnessFactor ?? 1,
    targetReached: control.targetDisplacement != null && Math.abs(point.controlDisplacement || 0) >= Math.abs(control.targetDisplacement),
    converged: point.ok,
    iterations: point.ok ? 1 : 0,
    hingeEvents: eventRows.filter((event) => event.step === point.step),
  }));
  const regression = options.baseline ? comparePushoverRegression({ capacityCurve: curve }, options.baseline) : null;
  return {
    ok: !!preliminary.ok && control.stopReason !== 'STEP_FAILED',
    version: FORMAL_PUSHOVER_VERSION,
    sourceVersion: preliminary.sourceVersion || preliminary.version,
    contract: {
      milestone: 'P3-M15',
      tickets: ['P3-T54', 'P3-T56'],
      result: 'formal-pushover-capacity-curve',
      benchmarkLinks: ['B4', 'B5'],
      sourcePolicy: 'Keeps sourceVersion visible until the hinge-degraded tangent path is fully integrated.',
    },
    method: {
      elements: 'linear-frame-with-stepwise-hinge-degraded-stiffness',
      hinges: 'concentrated-M-theta-secant-update',
      control: options.control || 'load-control',
      stiffnessUpdate: preliminary.hingeDegradation?.method || null,
    },
    limitations: [
      'Uses previous-step hinge state for secant stiffness reduction; this is not a full simultaneous tangent equilibrium loop.',
      'PMM and fiber traces are available in the P3-M16 nonlinear trace, but are not yet condensed into this pushover tangent path.',
    ],
    controlNodeId: preliminary.controlNodeId,
    direction: preliminary.direction,
    control,
    steps: curve,
    capacityCurve: curve.map((point) => ({ baseShear: point.baseShear, roofDisp: point.roofDisp })),
    hingeEvents: eventRows,
    hingeStates: preliminary.memberStates || {},
    hingeDegradation: preliminary.hingeDegradation || null,
    regression,
    summary: summarizeFormalPushover(preliminary, curve, eventRows, control),
    warnings: preliminary.warnings || [],
  };
}

export function buildPushoverControlTrace(preliminary = {}, options = {}) {
  const steps = preliminary.curve || preliminary.steps || [];
  const last = steps.at(-1) || {};
  const targetDisplacement = options.targetDisplacement == null ? null : Number(options.targetDisplacement);
  return {
    version: FORMAL_PUSHOVER_VERSION,
    type: options.control || 'load-control',
    direction: preliminary.direction || options.direction || '+x',
    pattern: preliminary.pattern || options.pattern || 'triangular',
    controlNodeId: preliminary.controlNodeId || null,
    referenceBaseShear: preliminary.referenceBaseShear ?? options.referenceBaseShear ?? null,
    maxLoadFactor: preliminary.maxLoadFactor ?? options.maxLoadFactor ?? null,
    targetDisplacement,
    stopped: !!preliminary.stopped,
    stopReason: stopReason(preliminary, targetDisplacement, last),
    finalStep: last.step ?? null,
    finalLambda: last.loadFactor ?? last.lambda ?? null,
    finalRoofDisp: last.controlDisplacement ?? last.roofDisp ?? null,
    finalBaseShear: last.baseShear ?? null,
  };
}

export function buildPushoverHingeEvents(curve = []) {
  const events = [];
  let yielded = 0;
  let ultimate = 0;
  for (const point of curve) {
    const nextYielded = Math.max(0, Number(point.yieldedMemberCount) || 0);
    const nextUltimate = Math.max(0, Number(point.ultimateMemberCount) || 0);
    if (nextYielded > yielded) {
      events.push({ step: point.step, type: 'yielded', count: nextYielded, delta: nextYielded - yielded });
    }
    if (nextUltimate > ultimate) {
      events.push({ step: point.step, type: 'ultimate', count: nextUltimate, delta: nextUltimate - ultimate });
    }
    yielded = nextYielded;
    ultimate = nextUltimate;
  }
  return events;
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
    currentStepCount: a.length,
    baselineStepCount: b.length,
    stepCountMismatch: a.length !== b.length,
    maxBaseShearDiff: Math.max(0, ...rows.map((row) => row.baseShearDiff)),
    maxRoofDispDiff: Math.max(0, ...rows.map((row) => row.roofDispDiff)),
    rows,
  };
}

function summarizeFormalPushover(preliminary = {}, curve = [], events = [], control = {}) {
  const baseSummary = preliminary.summary || {};
  return {
    ...baseSummary,
    stepCount: curve.length,
    capacityPointCount: curve.length,
    maxBaseShear: Math.max(0, ...curve.map((point) => Math.abs(point.baseShear || 0))),
    maxRoofDisp: Math.max(0, ...curve.map((point) => Math.abs(point.roofDisp || 0))),
    eventCount: events.length,
    firstYieldStep: events.find((event) => event.type === 'yielded')?.step ?? null,
    firstUltimateStep: events.find((event) => event.type === 'ultimate')?.step ?? null,
    stopReason: control.stopReason || null,
  };
}

function stopReason(preliminary, targetDisplacement, last) {
  if ((preliminary.warnings || []).some((warning) => warning.code === 'PUSHOVER_STEP_FAILED')) return 'STEP_FAILED';
  const controlDisplacement = last.controlDisplacement ?? last.roofDisp ?? 0;
  if (targetDisplacement != null && Math.abs(controlDisplacement) >= Math.abs(targetDisplacement)) return 'TARGET_DISPLACEMENT';
  if (preliminary.stopped) return 'STOPPED';
  return 'COMPLETED';
}
