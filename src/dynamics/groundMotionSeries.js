import { stableHash } from '../core/stableHash.js';

export const GROUND_MOTION_SERIES_VERSION = 'p14-m2-ground-motion-series-v1';

export function createCanonicalAccelerationSeries(input = {}) {
  const values = Array.from(input.accelerations || input.values || [], Number);
  if (values.some((value) => !Number.isFinite(value))) throw groundMotionError('GROUND_MOTION_SAMPLE_INVALID');
  const sourceTimes = input.times == null
    ? uniformTimes(values.length, positive(input.dt, 'GROUND_MOTION_DT_INVALID'))
    : normalizeTimes(input.times, values.length);
  const sourceDt = uniformStep(sourceTimes);
  const targetDt = input.targetDt == null ? sourceDt : positive(input.targetDt, 'GROUND_MOTION_TARGET_DT_INVALID');
  const interpolation = String(input.interpolation || 'linear').toLowerCase();
  if (interpolation !== 'linear') throw groundMotionError('GROUND_MOTION_INTERPOLATION_UNSUPPORTED');
  const targetTimes = values.length < 2 || Math.abs(targetDt - sourceDt) <= 1e-14
    ? sourceTimes.slice()
    : uniformTargetTimes(sourceTimes.at(-1), targetDt);
  const accelerations = targetTimes.length === sourceTimes.length && targetTimes.every((value, index) => value === sourceTimes[index])
    ? values.slice()
    : targetTimes.map((time) => interpolate(sourceTimes, values, time));
  const core = {
    version: GROUND_MOTION_SERIES_VERSION,
    recordId: clean(input.recordId),
    accelerationUnit: clean(input.accelerationUnit) || 'model',
    timeUnit: clean(input.timeUnit) || 's',
    signConvention: 'positive-ground-acceleration-produces-negative-inertial-load',
    interpolation,
    source: { sampleCount: values.length, dt: sourceDt, duration: sourceTimes.at(-1) || 0 },
    target: { sampleCount: accelerations.length, dt: targetDt, duration: targetTimes.at(-1) || 0 },
    times: targetTimes,
    accelerations,
  };
  return Object.freeze({ ...core, seriesHash: stableHash(core) });
}

function normalizeTimes(input, count) {
  const times = Array.from(input || [], Number);
  if (times.length !== count || times.some((value) => !Number.isFinite(value))) throw groundMotionError('GROUND_MOTION_TIME_VECTOR_INVALID');
  if (times[0] !== 0) throw groundMotionError('GROUND_MOTION_TIME_ORIGIN_INVALID');
  for (let i = 1; i < times.length; i += 1) if (!(times[i] > times[i - 1])) throw groundMotionError('GROUND_MOTION_TIME_NOT_MONOTONIC');
  return times;
}
function uniformStep(times) {
  if (times.length < 2) return 0;
  const dt = times[1] - times[0];
  const scale = Math.max(1, Math.abs(dt));
  if (times.slice(2).some((value, index) => Math.abs(value - times[index + 1] - dt) / scale > 1e-10)) throw groundMotionError('GROUND_MOTION_NONUNIFORM_SOURCE_UNSUPPORTED');
  return dt;
}
function uniformTimes(count, dt) { return Array.from({ length: count }, (_row, index) => index * dt); }
function uniformTargetTimes(duration, dt) {
  const count = Math.max(1, Math.floor(duration / dt + 1e-12) + 1);
  const times = Array.from({ length: count }, (_row, index) => index * dt);
  if (times.at(-1) < duration - 1e-12) times.push(duration);
  return times;
}
function interpolate(times, values, time) {
  if (time <= 0) return values[0] || 0;
  if (time >= times.at(-1)) return values.at(-1) || 0;
  let high = 1;
  while (times[high] < time) high += 1;
  const low = high - 1;
  const ratio = (time - times[low]) / (times[high] - times[low]);
  return values[low] * (1 - ratio) + values[high] * ratio;
}
function positive(value, code) { const number = Number(value); if (!(number > 0) || !Number.isFinite(number)) throw groundMotionError(code); return number; }
function clean(value) { return value == null ? null : String(value).trim() || null; }
function groundMotionError(code) { return Object.assign(new Error(code), { code }); }
