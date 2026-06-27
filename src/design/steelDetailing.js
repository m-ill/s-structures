export const STEEL_DETAILING_VERSION = 'm40-steel-detailing';

export function buildSteelDetailingReport(model, analysis, options = {}) {
  const steel = analysis?.design?.steel;
  const rows = Object.values(steel?.memberResults || {})
    .map((check) => detailSteelMember(check, options))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  const summary = {
    memberCount: rows.length,
    okCount: rows.filter((row) => row.status === 'OK').length,
    warnCount: rows.filter((row) => row.status === 'WARN').length,
    ngCount: rows.filter((row) => row.status === 'NG').length,
    maxUtilization: rows.reduce((max, row) => Math.max(max, row.utilization || 0), 0),
  };
  return {
    version: STEEL_DETAILING_VERSION,
    modelName: model?.meta?.name || null,
    summary,
    rows,
    limitations: [
      'This steel schedule is based on preliminary member checks currently implemented in the browser engine.',
      'Compactness, lateral torsional buckling, connection design, welds, bolts, base plates, and fabrication details require project-specific checks.',
      'Final steel member and connection design must be reviewed by a qualified structural engineer.',
    ],
  };
}

export function detailSteelMember(check, options = {}) {
  const checks = (check.checks || []).map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status || statusForRatio(item.ratio, options.warnAt || 0.7),
    ratio: clean(item.ratio),
    demand: clean(item.demand),
    capacity: clean(item.capacity),
    expression: item.expression || null,
    comboId: item.comboId || check.comboId || null,
    x: clean(item.x),
  }));
  const slenderness = summarizeSlenderness(check.slenderness);
  const deflection = summarizeDeflection(check.deflection);
  return {
    version: STEEL_DETAILING_VERSION,
    memberId: check.memberId,
    role: check.role || 'member',
    status: check.status || 'UNCK',
    utilization: clean(check.utilization),
    governingCheck: check.governingCheck || null,
    comboId: check.comboId || null,
    method: check.method || null,
    checks,
    demands: check.demands || {},
    capacities: check.capacities || {},
    slenderness,
    deflection,
    reviewActions: reviewActions(check, checks, slenderness, deflection),
    messages: check.messages || [],
  };
}

function summarizeSlenderness(slenderness = {}) {
  const maxKL = Math.max(clean(slenderness.KLry), clean(slenderness.KLrz));
  const limit = clean(slenderness.limit);
  return {
    ky: clean(slenderness.ky),
    kz: clean(slenderness.kz),
    KLry: clean(slenderness.KLry),
    KLrz: clean(slenderness.KLrz),
    maxKL,
    limit,
    ratio: limit > 0 ? maxKL / limit : 0,
    status: limit > 0 && maxKL > limit ? 'NG' : maxKL > limit * 0.8 ? 'WARN' : 'OK',
  };
}

function summarizeDeflection(deflection = {}) {
  const demand = clean(deflection.demand);
  const allowable = clean(deflection.allowable);
  return {
    limit: clean(deflection.limit),
    demand,
    allowable,
    ratio: allowable > 0 ? demand / allowable : 0,
    status: allowable > 0 && demand > allowable ? 'NG' : allowable > 0 && demand > allowable * 0.8 ? 'WARN' : 'OK',
  };
}

function reviewActions(check, checks, slenderness, deflection) {
  const actions = [];
  const governing = checks.find((item) => item.id === check.governingCheck);
  if (governing?.status === 'NG') actions.push(`Revise member for ${governing.name}.`);
  if (slenderness.status !== 'OK') actions.push('Review effective length, bracing, or member size for slenderness.');
  if (deflection.status !== 'OK') actions.push('Review serviceability deflection limit and member stiffness.');
  if (!actions.length) actions.push('Confirm compactness, lateral bracing, and connection design in project-specific checks.');
  return actions;
}

function statusForRatio(ratio, warnAt) {
  if (ratio > 1) return 'NG';
  if (ratio >= warnAt) return 'WARN';
  return 'OK';
}

function clean(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
