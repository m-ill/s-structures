export const MOMENT_HINGE_VERSION = 'p3-m15-moment-hinge';

export function createMomentRotationBackbone(input = {}) {
  const My = positive(input.My, 100);
  const thetaY = positive(input.thetaY, 0.01);
  const capRatio = positive(input.capRatio, 1.15);
  const residualRatio = positive(input.residualRatio, 0.25);
  return {
    version: MOMENT_HINGE_VERSION,
    points: [
      { id: 'A', state: 'elastic', theta: 0, moment: 0 },
      { id: 'B', state: 'yielded', theta: thetaY, moment: My },
      { id: 'C', state: 'capping', theta: positive(input.thetaC, thetaY * 4), moment: My * capRatio },
      { id: 'D', state: 'degrading', theta: positive(input.thetaD, thetaY * 8), moment: My * residualRatio },
      { id: 'E', state: 'residual', theta: positive(input.thetaE, thetaY * 12), moment: My * residualRatio },
    ],
    unloading: 'initial-stiffness-parallel-v1',
    limitation: 'PMM interaction is provided by the P3-M16 pmmHinge trace',
  };
}

export function evaluateMomentHinge(rotation, backbone = createMomentRotationBackbone()) {
  const sign = Math.sign(rotation || 1);
  const theta = Math.abs(Number(rotation) || 0);
  const points = backbone.points || [];
  let left = points[0];
  let right = points.at(-1);
  for (let i = 0; i < points.length - 1; i += 1) {
    if (theta <= points[i + 1].theta) {
      left = points[i];
      right = points[i + 1];
      break;
    }
  }
  const span = Math.max(1e-12, right.theta - left.theta);
  const t = Math.min(1, Math.max(0, (theta - left.theta) / span));
  const moment = left.moment * (1 - t) + right.moment * t;
  return {
    version: MOMENT_HINGE_VERSION,
    rotation,
    moment: sign * moment,
    tangent: span > 0 ? (right.moment - left.moment) / span : 0,
    state: right.state,
    point: right.id,
  };
}

export function buildHingeStateTrace(steps = [], backbone = createMomentRotationBackbone()) {
  const rows = steps.map((step, index) => ({ step: index, hingeId: step.hingeId || 'H1', ...evaluateMomentHinge(step.rotation, backbone) }));
  const events = [];
  let previous = 'elastic';
  for (const row of rows) {
    if (row.state !== previous) events.push({ step: row.step, type: row.state, hingeId: stepId(row), rotation: row.rotation });
    previous = row.state;
  }
  return { version: MOMENT_HINGE_VERSION, backbone, rows, events };
}

function stepId(row) {
  return row.hingeId || 'H1';
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
