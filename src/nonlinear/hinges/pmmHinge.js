import { materialOf, sectionOf } from '../../core/catalogs.js';
import { createMomentRotationBackbone } from './momentHinge.js';

export const PMM_HINGE_VERSION = 'p3-m16-pmm-hinge';

export function createPmmBackboneSet(options = {}) {
  const levels = requirePmmLevels(options.levels);
  return {
    version: PMM_HINGE_VERSION,
    contract: {
      milestone: 'P3-M16',
      tickets: ['P3-T83'],
      model: 'axial-ratio-dependent M-theta backbone interpolation',
      range: `${Number(levels[0].axialRatio)} <= axialRatio <= ${Number(levels.at(-1).axialRatio)}`,
      qualification: options.qualification || 'explicit-input',
    },
    levels: levels.map((level) => ({
      axialRatio: Number(level.axialRatio),
      backbone: createMomentRotationBackbone(level),
    })).sort((a, b) => a.axialRatio - b.axialRatio),
  };
}

export function interpolatePmmBackbone(axialRatio, set) {
  const ratio = Number(axialRatio);
  if (!Number.isFinite(ratio)) throw pmmError('PMM_AXIAL_RATIO_INVALID', 'PMM axial ratio must be finite.');
  const levels = requirePmmLevels(set?.levels).map((level) => ({
    ...level,
    backbone: level.backbone || createMomentRotationBackbone(level),
  }));
  if (ratio < levels[0].axialRatio || ratio > levels.at(-1).axialRatio) {
    throw pmmError(
      'PMM_AXIAL_RATIO_OUT_OF_RANGE',
      `PMM axial ratio ${ratio} is outside ${levels[0].axialRatio}..${levels.at(-1).axialRatio}.`,
    );
  }
  let lo = levels[0];
  let hi = levels.at(-1);
  for (let i = 0; i < levels.length - 1; i += 1) {
    if (ratio <= levels[i + 1].axialRatio) {
      lo = levels[i];
      hi = levels[i + 1];
      break;
    }
  }
  const span = Math.max(1e-12, hi.axialRatio - lo.axialRatio);
  const t = (ratio - lo.axialRatio) / span;
  const points = lo.backbone.points.map((point, i) => ({
    ...point,
    theta: mix(point.theta, hi.backbone.points[i].theta, t),
    moment: mix(point.moment, hi.backbone.points[i].moment, t),
  }));
  return {
    version: PMM_HINGE_VERSION,
    contract: {
      milestone: 'P3-M16',
      tickets: ['P3-T83'],
      interpolation: 'linear between adjacent axial-ratio backbone levels',
    },
    requestedAxialRatio: ratio,
    axialRatio: ratio,
    clamped: false,
    points,
    source: [lo.axialRatio, hi.axialRatio],
    summary: {
      pointCount: points.length,
      yieldMoment: points.find((point) => point.id === 'B')?.moment || 0,
      residualMoment: points.find((point) => point.id === 'E')?.moment || 0,
    },
    review: {
      status: 'available',
      warning: null,
      agentDecision: 'pmm-backbone-ready-for-review',
    },
  };
}

export function createPmmBackboneSetFromMember(model = {}, member = {}, options = {}) {
  const material = materialOf(model, member.matId);
  const section = sectionOf(model, member.secId);
  const fy = positive(material.Fy ?? material.fc, 240000);
  const area = positive(section.A, 0.01);
  const z = Math.max(positive(section.Zz, 0), positive(section.Zy, 0), area * positive(section.H, 0.3) / 6);
  const nominalAxial = fy * area;
  const nominalMoment = fy * z;
  const axialRatioLevels = options.axialRatioLevels || [0, 0.3, 0.6, 0.85];
  const levels = axialRatioLevels.map((axialRatio) => {
    const reduction = Math.max(0.18, 1 - 0.82 * Number(axialRatio));
    return {
      axialRatio,
      My: nominalMoment * reduction,
      thetaY: positive(options.thetaY, 0.012 * Math.max(0.35, reduction)),
      capRatio: positive(material.nonlinear?.capRatio, 1.08),
      residualRatio: positive(material.nonlinear?.residualRatio, 0.25),
    };
  });
  return {
    ...createPmmBackboneSet({ levels, qualification: 'legacy-member-screening' }),
    source: {
      memberId: member.id || null,
      materialId: member.matId || null,
      sectionId: member.secId || null,
      nominalAxial,
      nominalMoment,
      qualification: 'legacy-preliminary',
      limitation: 'Screening interaction only; P8-M6 fiber PMM surface is required for production analysis.',
    },
  };
}

function mix(a, b, t) {
  return Number(a) * (1 - t) + Number(b) * t;
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function requirePmmLevels(input) {
  if (!Array.isArray(input) || input.length < 2) {
    throw pmmError('PMM_LEVELS_REQUIRED', 'At least two explicit PMM axial-ratio levels are required.');
  }
  const levels = input.map((level, index) => {
    const axialRatio = Number(level?.axialRatio);
    if (!Number.isFinite(axialRatio) || axialRatio < 0) {
      throw pmmError('PMM_AXIAL_RATIO_INVALID', `PMM level ${index} axial ratio must be finite and nonnegative.`);
    }
    return { ...level, axialRatio };
  }).sort((a, b) => a.axialRatio - b.axialRatio);
  for (let index = 1; index < levels.length; index += 1) {
    if (!(levels[index].axialRatio > levels[index - 1].axialRatio)) {
      throw pmmError('PMM_LEVEL_ORDER_INVALID', 'PMM axial-ratio levels must strictly increase.');
    }
  }
  return levels;
}

function pmmError(code, message) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}
