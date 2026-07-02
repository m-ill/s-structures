import { createMomentRotationBackbone } from './momentHinge.js';

export const PMM_HINGE_VERSION = 'p3-m16-pmm-hinge';

export function createPmmBackboneSet(options = {}) {
  const levels = options.levels || [
    { axialRatio: 0, My: 120, thetaY: 0.012 },
    { axialRatio: 0.3, My: 100, thetaY: 0.01 },
    { axialRatio: 0.6, My: 65, thetaY: 0.007 },
  ];
  return {
    version: PMM_HINGE_VERSION,
    levels: levels.map((level) => ({
      axialRatio: clamp(level.axialRatio, 0, 1),
      backbone: createMomentRotationBackbone(level),
    })).sort((a, b) => a.axialRatio - b.axialRatio),
  };
}

export function interpolatePmmBackbone(axialRatio, set = createPmmBackboneSet()) {
  const ratio = clamp(axialRatio, 0, 1);
  const levels = set.levels || [];
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
  return { version: PMM_HINGE_VERSION, axialRatio: ratio, points, source: [lo.axialRatio, hi.axialRatio] };
}

function mix(a, b, t) {
  return Number(a) * (1 - t) + Number(b) * t;
}

function clamp(value, min, max) {
  const n = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}
