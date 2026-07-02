export const GROUND_MOTION_VERSION = 'p3-m16-ground-motion';

export function parseGroundMotionText(text = '', options = {}) {
  const dt = Number(options.dt || 0.02);
  const values = String(text).split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return {
    version: GROUND_MOTION_VERSION,
    contract: groundMotionContract('parse-record'),
    name: options.name || 'user-record',
    dt,
    pointCount: values.length,
    duration: Math.max(0, values.length - 1) * dt,
    accelerations: values,
  };
}

export function scaleGroundMotion(record = {}, options = {}) {
  const targetPga = Math.abs(Number(options.targetPga ?? 1));
  const pga = Math.max(0, ...(record.accelerations || []).map((value) => Math.abs(value)));
  const factor = pga > 0 ? targetPga / pga : 1;
  return {
    version: GROUND_MOTION_VERSION,
    contract: groundMotionContract('pga-scale-record'),
    name: record.name || 'record',
    dt: record.dt || options.dt || 0.02,
    scaleFactor: factor,
    targetPga,
    sourcePga: pga,
    pointCount: (record.accelerations || []).length,
    duration: Math.max(0, ((record.accelerations || []).length - 1) * Number(record.dt || options.dt || 0.02)),
    accelerations: (record.accelerations || []).map((value) => value * factor),
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
    method: 'pga-scaling-with-period-range-trace',
    limitations: ['Spectrum matching is represented as a trace contract; full frequency-domain matching remains hardening scope.'],
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
