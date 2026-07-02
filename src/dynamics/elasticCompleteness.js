import { estimateGlobalBucklingTrace } from './globalBuckling.js';

export const DYNAMIC_COMPLETENESS_VERSION = 'p3-m13-dynamic-completeness';

export function buildDynamicCompletenessReview(input = {}) {
  const type = input.type || 'dynamic-trace';
  const missing = [];
  if (type === 'cqc' && !(Number(input.responseCount) >= 2)) missing.push('modal-response-count');
  if (type === 'buckling' && input.globalStatus !== 'available') missing.push('global-buckling-trace');
  if (type === 'time-history' && !(Number(input.stepCount) > 0)) missing.push('time-history-steps');
  const hasWarnings = missing.length > 0 || input.warning;
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    type,
    status: hasWarnings ? 'review-required' : 'available',
    missing,
    warning: input.warning || null,
    productionReady: false,
    agentDecision: hasWarnings ? dynamicHoldDecision(type) : dynamicReadyDecision(type),
  };
}

export function combineModalCqc(responses, dampingRatio = 0.05) {
  let sum = 0;
  for (const a of responses) for (const b of responses) sum += rho(a.period, b.period, dampingRatio) * a.displacement * b.displacement;
  return Math.sqrt(Math.max(0, sum));
}

export function buildCqcCombinationReport(responses, dampingRatio = 0.05, closeRatio = 0.1) {
  const cqc = combineModalCqc(responses, dampingRatio);
  const srss = Math.sqrt(responses.reduce((sum, item) => sum + Number(item.displacement || 0) ** 2, 0));
  const closeModes = [];
  for (let i = 0; i < responses.length; i += 1) {
    for (let j = i + 1; j < responses.length; j += 1) {
      const a = responses[i]; const b = responses[j];
      const ratio = Math.abs(Number(a.period) - Number(b.period)) / Math.max(1e-12, Math.max(Number(a.period), Number(b.period)));
      if (ratio <= closeRatio) closeModes.push({ modes: [a.mode || i + 1, b.mode || j + 1], periodRatio: ratio, rho: rho(a.period, b.period, dampingRatio) });
    }
  }
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T79'], 'CQC modal combination trace for elastic response spectrum review.'),
    method: 'CQC',
    review: buildDynamicCompletenessReview({ type: 'cqc', responseCount: responses.length }),
    cqc,
    srss,
    cqcToSrss: srss > 0 ? cqc / srss : 0,
    closeModes,
  };
}

export function estimateMemberEulerBuckling(member, result) {
  const L = result?.L || 0; const E = result?.material?.E || result?.check?.inputs?.Fa || 0; const I = Math.min(result?.section?.Iy || 0, result?.section?.Iz || 0);
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T80'], 'Member Euler buckling screening trace.'),
    memberId: member.id,
    pcr: L > 0 ? Math.PI ** 2 * E * I / L ** 2 : 0,
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

export function runLinearSdofTha({ period = 1, dampingRatio = 0.05, dt = 0.02, accelerations = [] } = {}) {
  if (!(Number(period) > 0)) throw new Error('period must be positive.');
  if (!(Number(dt) > 0)) throw new Error('dt must be positive.');
  const zeta = Math.max(0, Number(dampingRatio) || 0);
  const w = 2 * Math.PI / Number(period);
  const c = 2 * zeta * w;
  const k = w * w;
  const beta = 0.25;
  const gamma = 0.5;
  let u = 0;
  let v = 0;
  let a = -Number(accelerations[0] || 0) - c * v - k * u;
  const rows = [];
  for (let i = 0; i < accelerations.length; i += 1) {
    const ag = Number(accelerations[i]);
    if (!Number.isFinite(ag)) throw new Error(`acceleration at step ${i} must be finite.`);
    const effective = -ag + (1 / (beta * dt * dt) + gamma * c / (beta * dt)) * u
      + (1 / (beta * dt) + c * (gamma / beta - 1)) * v
      + ((1 / (2 * beta) - 1) + c * dt * (gamma / (2 * beta) - 1)) * a;
    const uNext = effective / (k + 1 / (beta * dt * dt) + gamma * c / (beta * dt));
    const aNext = (uNext - u) / (beta * dt * dt) - v / (beta * dt) - (1 / (2 * beta) - 1) * a;
    const vNext = v + dt * ((1 - gamma) * a + gamma * aNext);
    u = uNext;
    v = vNext;
    a = aNext;
    rows.push({ step: i, time: i * dt, displacement: u, velocity: v, acceleration: a });
  }
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T81'], 'Linear SDOF Newmark trace used by modal-superposition time history.'),
    method: 'linear-sdof-newmark-average-acceleration',
    review: buildDynamicCompletenessReview({ type: 'time-history', stepCount: rows.length }),
    maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))),
    rows,
  };
}

export function runModalSuperpositionTha({ modes = [], direction = 'x', dampingRatio = 0.05, dt = 0.02, accelerations = [] } = {}) {
  const modal = modes.map((mode, index) => {
    const trace = runLinearSdofTha({ period: mode.period, dampingRatio, dt, accelerations });
    const gamma = Number(mode.participation?.[direction]?.gamma ?? mode.gamma ?? 1);
    return { mode: mode.id || `MODE${index + 1}`, period: mode.period, gamma, trace };
  });
  const rows = accelerations.map((_, step) => {
    const displacement = modal.reduce((sum, item) => sum + item.gamma * (item.trace.rows[step]?.displacement || 0), 0);
    return { step, time: step * dt, displacement };
  });
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    contract: buildDynamicContract(['P3-T81'], 'Linear modal-superposition time-history trace.'),
    method: 'linear-modal-superposition-newmark',
    direction,
    review: buildDynamicCompletenessReview({ type: 'time-history', stepCount: rows.length }),
    modal,
    rows,
    maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))),
  };
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
      'Material nonlinearity, construction sequence, and project-specific code exceptions remain outside this contract.',
    ],
  };
}

function rho(Ti, Tj, zeta) {
  const r = Math.max(Ti, Tj) / Math.max(1e-12, Math.min(Ti, Tj));
  return (8 * zeta ** 2 * (1 + r) * r ** 1.5) / ((1 - r ** 2) ** 2 + 4 * zeta ** 2 * r * (1 + r) ** 2) || 1;
}
