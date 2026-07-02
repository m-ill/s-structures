import { materialOf, sectionOf } from '../../core/catalogs.js';
import { createMomentRotationBackbone } from './momentHinge.js';

export const PMM_HINGE_VERSION = 'p3-m16-pmm-hinge';

const DEFAULT_PMM_LEVELS = [
  { axialRatio: 0, My: 120, thetaY: 0.012 },
  { axialRatio: 0.3, My: 100, thetaY: 0.01 },
  { axialRatio: 0.6, My: 65, thetaY: 0.007 },
];

export function createPmmBackboneSet(options = {}) {
  const levels = Array.isArray(options.levels) && options.levels.length >= 2
    ? options.levels
    : DEFAULT_PMM_LEVELS;
  return {
    version: PMM_HINGE_VERSION,
    contract: {
      milestone: 'P3-M16',
      tickets: ['P3-T83'],
      model: 'axial-ratio-dependent M-theta backbone interpolation',
      range: '0 <= axialRatio <= 1',
    },
    levels: levels.map((level) => ({
      axialRatio: clamp(level.axialRatio, 0, 1),
      backbone: createMomentRotationBackbone(level),
    })).sort((a, b) => a.axialRatio - b.axialRatio),
  };
}

export function interpolatePmmBackbone(axialRatio, set = createPmmBackboneSet()) {
  const requestedAxialRatio = Number(axialRatio);
  const ratio = clamp(axialRatio, 0, 1);
  const clamped = Number.isFinite(requestedAxialRatio) && Math.abs(requestedAxialRatio - ratio) > 1e-12;
  const levels = Array.isArray(set.levels) && set.levels.length >= 2 ? set.levels : createPmmBackboneSet().levels;
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
  const t = clamp((ratio - lo.axialRatio) / span, 0, 1);
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
    requestedAxialRatio: Number.isFinite(requestedAxialRatio) ? requestedAxialRatio : null,
    axialRatio: ratio,
    clamped,
    points,
    source: [lo.axialRatio, hi.axialRatio],
    summary: {
      pointCount: points.length,
      yieldMoment: points.find((point) => point.id === 'B')?.moment || 0,
      residualMoment: points.find((point) => point.id === 'E')?.moment || 0,
    },
    review: {
      status: clamped ? 'review-required' : 'available',
      warning: clamped ? 'pmm-axial-ratio-out-of-range' : null,
      agentDecision: clamped ? 'review-pmm-axial-ratio-input' : 'pmm-backbone-ready-for-review',
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
  const levels = (options.levels || [0, 0.3, 0.6, 0.85]).map((axialRatio) => {
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
    ...createPmmBackboneSet({ levels }),
    source: {
      memberId: member.id || null,
      materialId: member.matId || null,
      sectionId: member.secId || null,
      nominalAxial,
      nominalMoment,
    },
  };
}

function mix(a, b, t) {
  return Number(a) * (1 - t) + Number(b) * t;
}

function clamp(value, min, max) {
  const n = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
