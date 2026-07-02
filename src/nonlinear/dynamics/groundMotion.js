export const GROUND_MOTION_VERSION = 'p3-m16-ground-motion';

export function parseGroundMotionText(text = '', options = {}) {
  const dtInput = Number(options.dt ?? 0.02);
  const dt = Number.isFinite(dtInput) && dtInput > 0 ? dtInput : 0.02;
  const values = String(text).split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return {
    version: GROUND_MOTION_VERSION,
    contract: groundMotionContract('parse-record'),
    name: options.name || 'user-record',
    dtInput,
    dt,
    pointCount: values.length,
    duration: Math.max(0, values.length - 1) * dt,
    accelerations: values,
    review: buildGroundMotionReview({ dtInput, pointCount: values.length }),
  };
}

export function scaleGroundMotion(record = {}, options = {}) {
  const targetPga = Math.abs(Number(options.targetPga ?? 1));
  const pga = Math.max(0, ...(record.accelerations || []).map((value) => Math.abs(value)));
  const factor = pga > 0 ? targetPga / pga : 1;
  const dtInput = Number(record.dtInput ?? record.dt ?? options.dt ?? 0.02);
  const dt = Number.isFinite(dtInput) && dtInput > 0 ? dtInput : 0.02;
  const pointCount = (record.accelerations || []).length;
  return {
    version: GROUND_MOTION_VERSION,
    contract: groundMotionContract('pga-scale-record'),
    name: record.name || 'record',
    dtInput,
    dt,
    scaleFactor: factor,
    targetPga,
    sourcePga: pga,
    pointCount,
    duration: Math.max(0, (pointCount - 1) * dt),
    accelerations: (record.accelerations || []).map((value) => value * factor),
    review: buildGroundMotionReview({
      dtInput,
      pointCount,
      sourcePga: pga,
      scaleFactor: factor,
      existingMissing: record.review?.missing,
    }),
    formula: 'scaleFactor=targetPga/sourcePga',
  };
}

export function buildSpectrumScalingTrace(record = {}, spectrum = {}) {
  const scaled = scaleGroundMotion(record, spectrum);
  return {
    version: GROUND_MOTION_VERSION,
    contract: groundMotionContract('spectrum-scaling-trace'),
    record: record.name || 'record',
    direction: spectrum.direction || 'x',
    scaled,
    periodRange: spectrum.periodRange || [0.2, 1.5],
    targetPga: scaled.targetPga,
    sourcePga: scaled.sourcePga,
    scaleFactor: scaled.scaleFactor,
    pointCount: scaled.pointCount,
    duration: scaled.duration,
    review: scaled.review,
    method: 'pga-scaling-with-period-range-trace',
    limitations: ['Spectrum matching is represented as a trace contract; full frequency-domain matching remains hardening scope.'],
  };
}

function buildGroundMotionReview({ dtInput, pointCount, sourcePga = 1, scaleFactor = 1, existingMissing = [] }) {
  const missing = [...existingMissing];
  if (!(Number.isFinite(Number(dtInput)) && Number(dtInput) > 0)) missing.push('ground-motion-dt');
  if (!(Number(pointCount) > 0)) missing.push('ground-motion-points');
  if (!(Number(sourcePga) > 0)) missing.push('ground-motion-source-pga');
  if (!(Number.isFinite(Number(scaleFactor)) && Number(scaleFactor) > 0)) missing.push('ground-motion-scale-factor');
  return {
    status: missing.length ? 'review-required' : 'available',
    missing,
    agentDecision: missing.length ? 'review-ground-motion-inputs' : 'ground-motion-ready-for-review',
  };
}

function groundMotionContract(action) {
  return {
    milestone: 'P3-M16',
    tickets: ['P3-T86'],
    action,
    scope: 'Ground-motion record parsing and scaling trace for NLTH review.',
  };
}
