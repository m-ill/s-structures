export const RC_DETAILING_VERSION = 'm39-rc-detailing';

export const STANDARD_REBARS = [
  { id: 'D10', diameter: 9.53, area: 71.3 },
  { id: 'D13', diameter: 12.7, area: 126.7 },
  { id: 'D16', diameter: 15.9, area: 198.6 },
  { id: 'D19', diameter: 19.1, area: 286.5 },
  { id: 'D22', diameter: 22.2, area: 387.1 },
  { id: 'D25', diameter: 25.4, area: 506.7 },
  { id: 'D29', diameter: 28.6, area: 642.4 },
];

export function buildRcDetailingReport(model, analysis, options = {}) {
  const concrete = analysis?.design?.concrete;
  const rows = Object.values(concrete?.memberResults || {})
    .map((check) => detailRcMember(check, options))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  const summary = {
    memberCount: rows.length,
    okCount: rows.filter((row) => row.status === 'OK').length,
    warnCount: rows.filter((row) => row.status === 'WARN').length,
    ngCount: rows.filter((row) => row.status === 'NG').length,
    maxUtilization: rows.reduce((max, row) => Math.max(max, row.utilization || 0), 0),
  };
  return {
    version: RC_DETAILING_VERSION,
    modelName: model?.meta?.name || null,
    summary,
    rows,
    limitations: [
      'Rebar selection is a preliminary schedule based on current required/provided steel area checks.',
      'Development length, lap splice, anchorage, confinement, joint shear, bar spacing, and constructability require project-specific checks.',
      'Final reinforcement drawings must be reviewed by a qualified structural engineer.',
    ],
  };
}

export function detailRcMember(check, options = {}) {
  const role = check.role || 'member';
  const minBars = role === 'column' ? 4 : 2;
  const preferredBar = options.preferredBar || (role === 'column' ? 'D22' : 'D19');
  const requiredStrong = Math.max(0, Number(check.requiredRebar?.AsZ) || 0);
  const requiredWeak = Math.max(0, Number(check.requiredRebar?.AsY) || 0);
  const requiredTotal = Math.max(requiredStrong, requiredWeak, Number(check.requiredRebar?.AsTotal) || 0);
  const strong = selectLongitudinalBars(requiredStrong, { minBars, preferredBar });
  const weak = selectLongitudinalBars(requiredWeak, { minBars, preferredBar });
  const total = selectLongitudinalBars(requiredTotal, { minBars, preferredBar });
  const shearZ = selectStirrups(check.requiredRebar?.AvsZ, options);
  const shearY = selectStirrups(check.requiredRebar?.AvsY, options);

  return {
    version: RC_DETAILING_VERSION,
    memberId: check.memberId,
    role,
    status: check.status || 'UNCK',
    utilization: Number(check.utilization) || 0,
    governingCheck: check.governingCheck || null,
    comboId: check.comboId || null,
    requiredRebar: {
      AsZ: requiredStrong,
      AsY: requiredWeak,
      AsTotal: requiredTotal,
      AvsZ: Math.max(0, Number(check.requiredRebar?.AvsZ) || 0),
      AvsY: Math.max(0, Number(check.requiredRebar?.AvsY) || 0),
    },
    longitudinal: {
      strongAxis: strong,
      weakAxis: weak,
      total,
    },
    transverse: {
      zDirection: shearZ,
      yDirection: shearY,
    },
    material: check.material || null,
    section: check.section || null,
    method: check.method || null,
    messages: scheduleMessages(check, strong, weak, total, shearZ, shearY),
  };
}

export function selectLongitudinalBars(requiredArea, options = {}) {
  const minBars = Math.max(1, Number(options.minBars) || 2);
  const preferred = STANDARD_REBARS.find((bar) => bar.id === options.preferredBar) || STANDARD_REBARS[3];
  let best = null;
  for (const bar of STANDARD_REBARS.filter((item) => item.area >= preferred.area * 0.6)) {
    for (let count = minBars; count <= 16; count += 1) {
      const provided = count * bar.area;
      if (provided < requiredArea) continue;
      const excess = provided - requiredArea;
      const score = excess + count * 3 + Math.abs(bar.area - preferred.area) * 0.02;
      if (!best || score < best.score) {
        best = { bar: bar.id, count, providedArea: provided, requiredArea, excessArea: excess, score };
      }
    }
  }
  if (!best) {
    const bar = STANDARD_REBARS.at(-1);
    const count = Math.max(minBars, Math.ceil(requiredArea / bar.area));
    best = {
      bar: bar.id,
      count,
      providedArea: count * bar.area,
      requiredArea,
      excessArea: count * bar.area - requiredArea,
      score: Infinity,
    };
  }
  const { score, ...out } = best;
  return {
    ...out,
    label: `${out.count}-${out.bar}`,
  };
}

export function selectStirrups(requiredAvPerLength, options = {}) {
  const bar = STANDARD_REBARS.find((item) => item.id === (options.stirrupBar || 'D10')) || STANDARD_REBARS[0];
  const legs = Math.max(2, Number(options.stirrupLegs) || 2);
  const maxSpacing = Math.max(75, Number(options.maxStirrupSpacing) || 250);
  const minSpacing = Math.max(50, Number(options.minStirrupSpacing) || 75);
  const required = Math.max(0, Number(requiredAvPerLength) || 0);
  const providedPerSet = legs * bar.area;
  const spacing = required > 0
    ? Math.max(minSpacing, Math.min(maxSpacing, Math.floor(providedPerSet / required / 25) * 25))
    : maxSpacing;
  return {
    bar: bar.id,
    legs,
    spacing,
    requiredAvPerLength: required,
    providedAvPerLength: providedPerSet / spacing,
    label: `${legs}-${bar.id}@${spacing}`,
  };
}

function scheduleMessages(check, strong, weak, total, shearZ, shearY) {
  const messages = [...(check.messages || [])].map((item) => ({
    code: item.code,
    level: item.level || 'warning',
    message: item.message,
  }));
  for (const schedule of [strong, weak, total]) {
    if (schedule.count > 12) {
      messages.push({
        code: 'RC_BAR_CONGESTION',
        level: 'warning',
        message: `${schedule.label} may be congested and should be reviewed for spacing.`,
      });
    }
  }
  if (shearZ.spacing <= 100 || shearY.spacing <= 100) {
    messages.push({
      code: 'RC_STIRRUP_DENSE',
      level: 'warning',
      message: 'Dense stirrup spacing should be reviewed for constructability.',
    });
  }
  return messages;
}
