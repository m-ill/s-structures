export const GROUND_MOTION_VERSION = 'p3-m16-ground-motion';

export function parseGroundMotionText(text = '', options = {}) {
  const dt = Number(options.dt || 0.02);
  const values = String(text).split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return { version: GROUND_MOTION_VERSION, name: options.name || 'user-record', dt, accelerations: values };
}

export function scaleGroundMotion(record = {}, options = {}) {
  const targetPga = Math.abs(Number(options.targetPga ?? 1));
  const pga = Math.max(0, ...(record.accelerations || []).map((value) => Math.abs(value)));
  const factor = pga > 0 ? targetPga / pga : 1;
  return {
    version: GROUND_MOTION_VERSION,
    name: record.name || 'record',
    dt: record.dt || options.dt || 0.02,
    scaleFactor: factor,
    targetPga,
    sourcePga: pga,
    accelerations: (record.accelerations || []).map((value) => value * factor),
    formula: 'scaleFactor=targetPga/sourcePga',
  };
}

export function buildSpectrumScalingTrace(record = {}, spectrum = {}) {
  const scaled = scaleGroundMotion(record, spectrum);
  return {
    version: GROUND_MOTION_VERSION,
    record: record.name || 'record',
    direction: spectrum.direction || 'x',
    scaled,
    periodRange: spectrum.periodRange || [0.2, 1.5],
  };
}
