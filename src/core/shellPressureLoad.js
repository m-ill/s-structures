export const SHELL_PRESSURE_TARGET_KEYS = Object.freeze(['shell', 'panel', 'target']);
export const SHELL_PRESSURE_VALUE_KEYS = Object.freeze(['q', 'pressure', 'w']);

export function resolveShellPressureLoad(load = {}) {
  if (load.node != null || load.member != null) {
    return failure('SHELL_PRESSURE_TARGET_INVALID', 'Shell pressure cannot also target a node or member.');
  }

  const suppliedTargets = SHELL_PRESSURE_TARGET_KEYS
    .filter((key) => load[key] != null)
    .map((key) => normalizeIdentifier(load[key]));
  const distinctTargets = [...new Set(suppliedTargets)];
  if (distinctTargets.length !== 1 || !distinctTargets[0]) {
    return failure('SHELL_PRESSURE_TARGET_INVALID', 'Shell pressure requires one unambiguous shell target.');
  }

  const suppliedValues = SHELL_PRESSURE_VALUE_KEYS
    .filter((key) => load[key] != null)
    .map((key) => strictNumber(load[key]));
  if (!suppliedValues.length
    || suppliedValues.some((value) => !Number.isFinite(value))
    || new Set(suppliedValues).size !== 1) {
    return failure('SHELL_PRESSURE_INVALID', 'Shell pressure requires one unambiguous finite q/pressure/w value.');
  }

  return { ok: true, target: distinctTargets[0], q: suppliedValues[0] };
}

function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function strictNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function failure(reason, message) {
  return { ok: false, reason, message, target: null, q: null };
}
