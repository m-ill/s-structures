import { estimateGlobalBucklingTrace } from './globalBuckling.js';

export const DYNAMIC_COMPLETENESS_VERSION = 'p3-m13-dynamic-completeness';

export function buildDynamicCompletenessReview(input = {}) {
  const type = input.type || 'dynamic-trace';
  const missing = [];
  if (type === 'cqc' && !(Number(input.responseCount) >= 2)) missing.push('modal-response-count');
  if (type === 'cqc' && Number(input.invalidResponseCount || 0) > 0) missing.push('modal-response-values');
  if (type === 'buckling' && input.globalStatus !== 'available') missing.push('global-buckling-trace');
  if (type === 'time-history' && !(Number(input.stepCount) > 0)) missing.push('time-history-steps');
  if (type === 'time-history' && input.requiresModes === true && !(Number(input.modeCount) > 0)) missing.push('modal-mode-count');
  if (type === 'time-history' && Number(input.invalidModeCount || 0) > 0) missing.push('modal-mode-values');
  const hasWarnings = missing.length > 0 || input.warning;
  const isTimeHistory = type === 'time-history';
  const bucklingBlocked = type === 'buckling' && hasWarnings;
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    type,
    status: hasWarnings ? 'review-required' : 'available',
    missing,
    warning: input.warning || null,
    productionReady: false,
    resultStatus: isTimeHistory ? 'preliminary' : hasWarnings ? 'review-required' : 'available',
    designBlocked: isTimeHistory || bucklingBlocked,
    designBlockReason: isTimeHistory
      ? 'FULL_STRUCTURAL_RESPONSE_RECOVERY_NOT_VERIFIED'
      : bucklingBlocked
        ? 'QUALIFIED_GLOBAL_BUCKLING_RESULT_NOT_AVAILABLE'
        : null,
    agentDecision: hasWarnings ? dynamicHoldDecision(type) : dynamicReadyDecision(type),
  };
}

export function combineModalCqc(responses, dampingRatio = 0.05) {
  let sum = 0;
  for (const a of responses) for (const b of responses) sum += rho(a.period, b.period, dampingRatio) * a.displacement * b.displacement;
  return Math.sqrt(Math.max(0, sum));
}

export function buildCqcCombinationReport(responses, dampingRatio = 0.05, closeRatio = 0.1) {
  const validResponses = (responses || []).filter(validModalResponse);
  const invalidResponseCount = (responses || []).length - validResponses.length;
  const cqc = combineModalCqc(validResponses, dampingRatio);
  const srss = Math.sqrt(validResponses.reduce((sum, item) => sum + Number(item.displacement || 0) ** 2, 0));
  const closeModes = [];
  for (let i = 0; i < validResponses.length; i += 1) {
    for (let j = i + 1; j < validResponses.length; j += 1) {
      const a = validResponses[i]; const b = validResponses[j];
      const ratio = Math.abs(Number(a.period) - Number(b.period)) / Math.max(1e-12, Math.max(Number(a.period), Number(b.period)));
      if (ratio <= closeRatio) closeModes.push({ modes: [a.mode || i + 1, b.mode || j + 1], periodRatio: ratio, rho: rho(a.period, b.period, dampingRatio) });
    }
  }
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T79'], 'CQC modal combination trace for elastic response spectrum review.'),
    method: 'CQC',
    review: buildDynamicCompletenessReview({ type: 'cqc', responseCount: validResponses.length, invalidResponseCount }),
    cqc,
    srss,
    cqcToSrss: srss > 0 ? cqc / srss : 0,
    closeModes,
    inputReview: {
      responseCount: (responses || []).length,
      validResponseCount: validResponses.length,
      invalidResponseCount,
      invalidResponses: (responses || []).filter((row) => !validModalResponse(row)).map((row, index) => ({
        index,
        mode: row?.mode || null,
        period: row?.period ?? null,
        displacement: row?.displacement ?? null,
      })),
    },
  };
}

export function estimateMemberEulerBuckling(member, result) {
  const data = result || member?.buckling || {};
  const L = positiveValue(data.L, data.length, member?.L);
  const effectiveLengthFactor = positiveValue(data.effectiveLengthFactor, data.kFactor, data.K, 1);
  const E = positiveValue(data.material?.E, data.E);
  const inertias = [data.section?.Iy, data.section?.Iz, data.Iy, data.Iz]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  const I = inertias.length ? Math.min(...inertias) : 0;
  const effectiveLength = L * effectiveLengthFactor;
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T80'], 'Member Euler buckling screening trace.'),
    memberId: member.id,
    status: effectiveLength > 0 && E > 0 && I > 0 ? 'available-preliminary' : 'not-available',
    pcr: effectiveLength > 0 && E > 0 && I > 0 ? Math.PI ** 2 * E * I / effectiveLength ** 2 : 0,
    length: L,
    effectiveLengthFactor,
    effectiveLength,
    elasticModulus: E,
    governingInertia: I,
    method: 'Euler pinned-pinned preliminary',
  };
}

export function estimateModelBucklingTrace(model = {}, options = {}) {
  const rows = (model.members || []).map((member) => {
    const result = options.results?.[member.id] || member.buckling || {};
    return estimateMemberEulerBuckling(member, result);
  }).filter((row) => row.pcr > 0);
  rows.sort((a, b) => a.pcr - b.pcr);
  const global = estimateGlobalBucklingTrace(model, options);
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T80'], 'Global eigenvalue buckling trace paired with member Euler screening.'),
    method: global.status === 'available'
      ? 'global-eigenvalue-with-member-euler-screening'
      : 'member-euler-screening-not-global-eigenvalue',
    critical: rows[0] || null,
    globalCritical: global.status === 'available' ? global.criticalLoadFactor : null,
    review: buildDynamicCompletenessReview({ type: 'buckling', globalStatus: global.status }),
    global,
    rows,
  };
}

export function runLinearSdofTha({
  period = 1,
  dampingRatio = 0.05,
  dt = 0.02,
  accelerations = [],
  initialDisplacement = 0,
  initialVelocity = 0,
  initialAcceleration,
  timeUnit = 's',
  accelerationUnit = 'model-length/s^2',
  displacementUnit = 'model-length',
  accelerationScale = 1,
  recordId = null,
} = {}) {
  if (!(Number(period) > 0)) throw new Error('period must be positive.');
  if (!(Number(dt) > 0)) throw new Error('dt must be positive.');
  if (!Number.isFinite(Number(initialDisplacement))) throw new Error('initialDisplacement must be finite.');
  if (!Number.isFinite(Number(initialVelocity))) throw new Error('initialVelocity must be finite.');
  if (initialAcceleration !== undefined && !Number.isFinite(Number(initialAcceleration))) throw new Error('initialAcceleration must be finite.');
  if (!Number.isFinite(Number(accelerationScale))) throw new Error('accelerationScale must be finite.');
  const timeStep = Number(dt);
  const scale = Number(accelerationScale);
  const accelerationConversion = resolveAccelerationConversion(accelerationUnit, displacementUnit, timeUnit);
  const totalAccelerationScale = scale * accelerationConversion.factor;
  const groundMotion = (accelerations || []).map((value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`acceleration at step ${index} must be finite.`);
    return number * totalAccelerationScale;
  });
  const zeta = Math.max(0, Number(dampingRatio) || 0);
  const w = 2 * Math.PI / Number(period);
  const c = 2 * zeta * w;
  const k = w * w;
  const beta = 0.25;
  const gamma = 0.5;
  let u = Number(initialDisplacement);
  let v = Number(initialVelocity);
  let a = initialAcceleration === undefined
    ? -Number(groundMotion[0] || 0) - c * v - k * u
    : Number(initialAcceleration);
  const rows = [];
  if (groundMotion.length) rows.push(timeHistoryRow(0, timeStep, groundMotion[0], u, v, a));
  for (let i = 1; i < groundMotion.length; i += 1) {
    const ag = groundMotion[i];
    const effective = -ag + (1 / (beta * timeStep * timeStep) + gamma * c / (beta * timeStep)) * u
      + (1 / (beta * timeStep) + c * (gamma / beta - 1)) * v
      + ((1 / (2 * beta) - 1) + c * timeStep * (gamma / (2 * beta) - 1)) * a;
    const uNext = effective / (k + 1 / (beta * timeStep * timeStep) + gamma * c / (beta * timeStep));
    const aNext = (uNext - u) / (beta * timeStep * timeStep) - v / (beta * timeStep) - (1 / (2 * beta) - 1) * a;
    const vNext = v + timeStep * ((1 - gamma) * a + gamma * aNext);
    u = uNext;
    v = vNext;
    a = aNext;
    rows.push(timeHistoryRow(i, timeStep, ag, u, v, a));
  }
  const review = buildDynamicCompletenessReview({ type: 'time-history', stepCount: rows.length });
  const units = buildTimeHistoryUnits(timeUnit, accelerationConversion.modelUnit, displacementUnit);
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T81'], 'Linear SDOF Newmark trace used by modal-superposition time history.'),
    method: 'linear-sdof-newmark-average-acceleration',
    status: rows.length ? 'preliminary' : 'blocked',
    maturity: 'preliminary',
    designBlocked: true,
    designTransfer: designTransferBlock(),
    review,
    units,
    time: {
      dt: timeStep,
      unit: timeUnit,
      startTime: 0,
      endTime: rows.length ? rows[rows.length - 1].time : 0,
      sampleCount: rows.length,
      firstSampleIsInitialState: true,
    },
    record: {
      id: recordId,
      accelerationUnit: accelerationConversion.sourceUnit,
      sourceAccelerationUnit: accelerationConversion.sourceUnit,
      modelAccelerationUnit: accelerationConversion.modelUnit,
      accelerationUnitConversionFactor: accelerationConversion.factor,
      accelerationScale: scale,
      totalAccelerationScale,
      sampleCount: groundMotion.length,
    },
    provenance: buildTimeHistoryProvenance({
      recordId,
      sourceAccelerationUnit: accelerationConversion.sourceUnit,
      modelAccelerationUnit: accelerationConversion.modelUnit,
      unitConversionFactor: accelerationConversion.factor,
      userScale: scale,
      totalScale: totalAccelerationScale,
      sampleCount: groundMotion.length,
      dt: timeStep,
      timeUnit,
    }),
    initialState: {
      time: 0,
      displacement: Number(initialDisplacement),
      velocity: Number(initialVelocity),
      acceleration: initialAcceleration === undefined
        ? -Number(groundMotion[0] || 0) - c * Number(initialVelocity) - k * Number(initialDisplacement)
        : Number(initialAcceleration),
    },
    maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))),
    rows,
  };
}

export function runModalSuperpositionTha({
  modes = [],
  direction = 'x',
  dampingRatio = 0.05,
  dt = 0.02,
  accelerations = [],
  timeUnit = 's',
  accelerationUnit = 'model-length/s^2',
  displacementUnit = 'model-length',
  accelerationScale = 1,
  recordId = null,
} = {}) {
  if (!(Number(dt) > 0)) throw new Error('dt must be positive.');
  const recordValues = Array.from(accelerations || []);
  const accelerationConversion = resolveAccelerationConversion(accelerationUnit, displacementUnit, timeUnit);
  const validModes = (modes || []).filter(validDynamicMode);
  const invalidModeCount = (modes || []).length - validModes.length;
  const modal = validModes.map((mode, index) => {
    const trace = runLinearSdofTha({
      period: mode.period,
      dampingRatio,
      dt,
      accelerations: recordValues,
      initialDisplacement: mode.initialDisplacement ?? 0,
      initialVelocity: mode.initialVelocity ?? 0,
      initialAcceleration: mode.initialAcceleration,
      timeUnit,
      accelerationUnit,
      displacementUnit,
      accelerationScale,
      recordId,
    });
    const gamma = Number(mode.participation?.[direction]?.gamma ?? mode.gamma ?? 1);
    return { mode: mode.id || `MODE${index + 1}`, period: mode.period, gamma, trace };
  });
  const rows = recordValues.map((_, step) => {
    const displacement = modal.reduce((sum, item) => sum + item.gamma * (item.trace.rows[step]?.displacement || 0), 0);
    return { step, time: step * dt, displacement };
  });
  const review = buildDynamicCompletenessReview({
    type: 'time-history',
    stepCount: rows.length,
    requiresModes: true,
    modeCount: modal.length,
    invalidModeCount,
  });
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T81'], 'Linear modal-superposition time-history trace.'),
    method: 'linear-modal-superposition-newmark',
    status: rows.length && modal.length ? 'preliminary' : 'blocked',
    maturity: 'preliminary',
    designBlocked: true,
    designTransfer: designTransferBlock(),
    direction,
    review,
    units: buildTimeHistoryUnits(timeUnit, accelerationConversion.modelUnit, displacementUnit),
    time: {
      dt: Number(dt),
      unit: timeUnit,
      startTime: 0,
      endTime: rows.length ? rows[rows.length - 1].time : 0,
      sampleCount: rows.length,
      firstSampleIsInitialState: true,
    },
    record: {
      id: recordId,
      accelerationUnit: accelerationConversion.sourceUnit,
      sourceAccelerationUnit: accelerationConversion.sourceUnit,
      modelAccelerationUnit: accelerationConversion.modelUnit,
      accelerationUnitConversionFactor: accelerationConversion.factor,
      accelerationScale: Number(accelerationScale),
      totalAccelerationScale: Number(accelerationScale) * accelerationConversion.factor,
      sampleCount: recordValues.length,
    },
    provenance: buildTimeHistoryProvenance({
      recordId,
      sourceAccelerationUnit: accelerationConversion.sourceUnit,
      modelAccelerationUnit: accelerationConversion.modelUnit,
      unitConversionFactor: accelerationConversion.factor,
      userScale: Number(accelerationScale),
      totalScale: Number(accelerationScale) * accelerationConversion.factor,
      sampleCount: recordValues.length,
      dt: Number(dt),
      timeUnit,
    }),
    responseScope: 'scalar-modal-coordinate-sum-without-full-structural-force-recovery',
    inputReview: {
      modeCount: (modes || []).length,
      validModeCount: modal.length,
      invalidModeCount,
      invalidModes: (modes || []).filter((mode) => !validDynamicMode(mode)).map((mode, index) => ({
        index,
        mode: mode?.id || null,
        period: mode?.period ?? null,
      })),
    },
    modal,
    rows,
    maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))),
  };
}

function validModalResponse(row) {
  return Number(row?.period) > 0 && Number.isFinite(Number(row?.displacement));
}

function validDynamicMode(mode) {
  return Number(mode?.period) > 0;
}

function dynamicHoldDecision(type) {
  if (type === 'cqc') return 'add-modal-responses-before-cqc-review';
  if (type === 'buckling') return 'review-member-euler-screening-without-global-mode';
  if (type === 'time-history') return 'provide-ground-motion-steps';
  return 'review-dynamic-trace-inputs';
}

function dynamicReadyDecision(type) {
  if (type === 'cqc') return 'cqc-trace-ready-for-review';
  if (type === 'buckling') return 'buckling-trace-ready-for-review';
  if (type === 'time-history') return 'time-history-trace-ready-for-review';
  return 'dynamic-trace-ready-for-review';
}

function buildDynamicContract(tickets, scope) {
  return {
    milestone: 'P3-M13',
    tickets,
    scope,
    featureTicketMap: {
      cqcCombination: 'P3-T79',
      globalBuckling: 'P3-T80',
      linearTimeHistory: 'P3-T81',
    },
    reviewFields: ['contract.tickets', 'method', 'rows', 'closeModes', 'global'],
    limitations: [
      'Dynamic completeness traces are preliminary elastic-analysis helpers.',
      'Linear time-history traces remain design-blocked until full structural response and equilibrium recovery are independently verified.',
      'Material nonlinearity, construction sequence, and project-specific code exceptions remain outside this contract.',
    ],
  };
}

function timeHistoryRow(step, dt, groundAcceleration, displacement, velocity, relativeAcceleration) {
  return {
    step,
    time: step * dt,
    groundAcceleration,
    displacement,
    velocity,
    acceleration: relativeAcceleration,
    relativeAcceleration,
    absoluteAcceleration: relativeAcceleration + groundAcceleration,
  };
}

function buildTimeHistoryUnits(timeUnit, accelerationUnit, displacementUnit) {
  return {
    time: timeUnit,
    groundAcceleration: accelerationUnit,
    relativeAcceleration: `${displacementUnit}/${timeUnit}^2`,
    absoluteAcceleration: `${displacementUnit}/${timeUnit}^2`,
    displacement: displacementUnit,
    velocity: `${displacementUnit}/${timeUnit}`,
  };
}

function resolveAccelerationConversion(accelerationUnit, displacementUnit, timeUnit) {
  if (String(timeUnit || 's').toLowerCase() !== 's') {
    throw new Error(`Unsupported time-history time unit: ${timeUnit}.`);
  }
  const source = canonicalAccelerationUnit(accelerationUnit);
  const modelLength = canonicalLengthUnit(displacementUnit);
  const modelUnit = modelLength === 'model-length' ? 'model-length/s^2' : `${modelLength}/s^2`;
  if (source === 'model') return { sourceUnit: 'model', modelUnit, factor: 1 };
  const metresPerModelLength = metresPerLengthUnit(modelLength);
  if (!(metresPerModelLength > 0)) {
    throw new Error(`Cannot convert ${source} acceleration to unsupported model length unit ${displacementUnit}.`);
  }
  if (source === 'g') return { sourceUnit: 'g', modelUnit, factor: 9.80665 / metresPerModelLength };
  return { sourceUnit: 'm/s^2', modelUnit, factor: 1 / metresPerModelLength };
}

function canonicalAccelerationUnit(value) {
  const unit = String(value || 'model').trim().toLowerCase().replaceAll('²', '2').replaceAll(' ', '');
  if (unit === 'g') return 'g';
  if (['m/s2', 'm/s^2', 'mps2'].includes(unit)) return 'm/s^2';
  if (['model', 'model/s2', 'model/s^2', 'model-length/s2', 'model-length/s^2'].includes(unit)) return 'model';
  throw new Error(`Unsupported acceleration unit: ${value}. Use g, m/s^2, or model.`);
}

function canonicalLengthUnit(value) {
  const unit = String(value || 'model-length').trim().toLowerCase();
  return ['m', 'mm', 'cm', 'ft', 'in'].includes(unit) ? unit : 'model-length';
}

function metresPerLengthUnit(unit) {
  return {
    m: 1,
    mm: 0.001,
    cm: 0.01,
    ft: 0.3048,
    in: 0.0254,
    'model-length': 1,
  }[unit] || 0;
}

function buildTimeHistoryProvenance(input) {
  return {
    source: 'ground-motion-record',
    recordId: input.recordId,
    input: {
      accelerationUnit: input.sourceAccelerationUnit,
      sampleCount: input.sampleCount,
      dt: input.dt,
      timeUnit: input.timeUnit,
    },
    conversion: {
      modelAccelerationUnit: input.modelAccelerationUnit,
      unitConversionFactor: input.unitConversionFactor,
      userScale: input.userScale,
      totalScale: input.totalScale,
    },
    qualification: {
      status: 'preliminary',
      designBlocked: true,
      reason: 'FULL_STRUCTURAL_RESPONSE_RECOVERY_NOT_VERIFIED',
    },
  };
}

function designTransferBlock() {
  return {
    allowed: false,
    status: 'blocked',
    reason: 'FULL_STRUCTURAL_RESPONSE_RECOVERY_NOT_VERIFIED',
  };
}

function positiveValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function rho(Ti, Tj, zeta) {
  const r = Math.max(Ti, Tj) / Math.max(1e-12, Math.min(Ti, Tj));
  if (Math.abs(r - 1) <= 1e-12) return 1;
  if (!(zeta > 0)) return 0;
  return (8 * zeta ** 2 * (1 + r) * r ** 1.5) / ((1 - r ** 2) ** 2 + 4 * zeta ** 2 * r * (1 + r) ** 2);
}
