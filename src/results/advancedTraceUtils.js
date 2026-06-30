export const ADVANCED_ELASTIC_TRACE_VERSION = 'p2-m5-advanced-elastic-trace';

export function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function traceStatus(enabled, ok) {
  if (!enabled) return 'disabled';
  return ok ? 'available' : 'check';
}
