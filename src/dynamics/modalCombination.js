export const MODAL_COMBINATION_VERSION = 'p14-m3-modal-combination-v1';
export const MODAL_COMBINATION_METHODS = Object.freeze(['SRSS', 'CQC', 'ABS', 'NRC10']);
export const MODAL_COMBINATION_POLICY = Object.freeze({
  version: 'p14-m3-modal-combination-policy-v1',
  responseDomain: 'signed-per-mode-contributors-to-unsigned-combined-magnitude',
  methods: Object.freeze({
    SRSS: 'sqrt(sum(Ri^2))',
    CQC: 'sqrt(sum(rhoij*Ri*Rj)) using the equal-modal-damping correlation coefficient',
    ABS: 'sum(abs(Ri))',
    NRC10: 'absolute sum within close-frequency groups, then SRSS between groups',
  }),
  nrc10Boundary: 'inclusive adjacent frequency gap: (omega_high-omega_low)/omega_low <= 0.10; connected groups are transitive',
  repeatedFrequencyCqcCorrelation: 1,
  defaultDampingRatio: 0.05,
  defaultCloseModeRatio: 0.10,
});

export function normalizeModalCombinationMethod(value) {
  const key = String(value || 'SRSS').trim().toUpperCase().replace(/[\s_%\-]/g, '');
  if (key === 'CQC') return 'CQC';
  if (key === 'ABS' || key === 'ABSOLUTE') return 'ABS';
  if (['NRC', 'NRC10', '10PCT', '10PERCENT'].includes(key)) return 'NRC10';
  return 'SRSS';
}

export function combineModalScalars(responses = [], options = {}) {
  const method = normalizeModalCombinationMethod(options.method);
  const rows = Array.from(responses || []).map((row, index) => ({
    modeId: String(row?.modeId || row?.mode || `MODE${index + 1}`),
    period: Number(row?.period),
    omega: Number(row?.omega) > 0 ? Number(row.omega) : Number(row?.period) > 0 ? 2 * Math.PI / Number(row.period) : NaN,
    value: Number(row?.value ?? row?.response ?? row?.displacement),
  })).filter((row) => row.omega > 0 && Number.isFinite(row.value));
  let value = 0;
  let trace;
  if (method === 'ABS') {
    value = rows.reduce((sum, row) => sum + Math.abs(row.value), 0);
    trace = { groups: rows.map((row) => [row.modeId]), rule: 'sum(abs(Ri))' };
  } else if (method === 'NRC10') {
    const groups = nrcGroups(rows, options.closeModeRatio ?? 0.1);
    const groupValues = groups.map((group) => group.reduce((sum, row) => sum + Math.abs(row.value), 0));
    value = Math.sqrt(groupValues.reduce((sum, item) => sum + item ** 2, 0));
    trace = { groups: groups.map((group) => group.map((row) => row.modeId)), groupValues, closeModeRatio: Number(options.closeModeRatio ?? 0.1), boundary: 'inclusive-frequency-gap-relative-to-lower-frequency' };
  } else if (method === 'CQC') {
    const dampingRatio = Math.max(0, Number(options.dampingRatio) || 0);
    let quadratic = 0;
    const correlations = [];
    for (const first of rows) for (const second of rows) {
      const correlation = cqcCorrelation(first.omega, second.omega, dampingRatio);
      quadratic += correlation * first.value * second.value;
      correlations.push({ first: first.modeId, second: second.modeId, correlation });
    }
    value = Math.sqrt(Math.max(0, quadratic));
    trace = { dampingRatio, correlations, rule: 'sqrt(sum(rhoij*Ri*Rj))' };
  } else {
    value = Math.sqrt(rows.reduce((sum, row) => sum + row.value ** 2, 0));
    trace = { groups: rows.map((row) => [row.modeId]), rule: 'sqrt(sum(Ri^2))' };
  }
  return {
    version: MODAL_COMBINATION_VERSION,
    policyVersion: MODAL_COMBINATION_POLICY.version,
    method,
    value,
    modeCount: rows.length,
    modeIds: rows.map((row) => row.modeId),
    trace,
  };
}

/**
 * Compatibility-level response extractor owned by the modal-combination
 * module. Keeping this pure operation here prevents results post-processing
 * from importing the modal analysis runner and forming a dependency cycle.
 */
export function combineModalResponseValues(responses = [], valueOf = 'displacement', method = 'SRSS', dampingRatio = 0.05) {
  const getter = typeof valueOf === 'function' ? valueOf : (row) => row?.[valueOf];
  const rows = (responses || [])
    .map((row, index) => ({
      mode: row?.mode,
      period: Number(row?.period),
      displacement: Number(getter(row, index)),
    }))
    .filter((row) => row.period > 0 && Number.isFinite(row.displacement));
  return combineModalScalars(rows.map((row) => ({
    modeId: row.mode,
    period: row.period,
    value: row.displacement,
  })), { method, dampingRatio }).value;
}

export function cqcCorrelation(firstOmega, secondOmega, dampingRatio = 0.05) {
  const first = Number(firstOmega);
  const second = Number(secondOmega);
  const damping = Math.max(0, Number(dampingRatio) || 0);
  if (!(first > 0) || !(second > 0)) return 0;
  if (Math.abs(first - second) <= 1e-12 * Math.max(first, second)) return 1;
  if (!(damping > 0)) return 0;
  const ratio = Math.max(first, second) / Math.min(first, second);
  const numerator = 8 * damping ** 2 * (1 + ratio) * ratio ** 1.5;
  const denominator = (1 - ratio ** 2) ** 2 + 4 * damping ** 2 * ratio * (1 + ratio) ** 2;
  return denominator > 0 ? numerator / denominator : 0;
}

function nrcGroups(rows, ratioInput) {
  const ratio = Number(ratioInput);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw Object.assign(new Error('NRC close-mode ratio must be within [0,1].'), { code: 'NRC_CLOSE_MODE_RATIO_INVALID' });
  const sorted = rows.slice().sort((a, b) => a.omega - b.omega || a.modeId.localeCompare(b.modeId));
  const groups = [];
  for (const row of sorted) {
    const previous = groups.at(-1)?.at(-1);
    const close = previous && (row.omega - previous.omega) / previous.omega <= ratio + 1e-12;
    if (close) groups.at(-1).push(row);
    else groups.push([row]);
  }
  return groups;
}
