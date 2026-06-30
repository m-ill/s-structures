export function totalLoadCheck(expected = {}, summary = {}) {
  const checks = [
    ['x', expected.totalLoadX, summary.totalLoad?.[0]],
    ['y', expected.totalLoadY, summary.totalLoad?.[1]],
    ['z', expected.totalLoadZ, summary.totalLoad?.[2]],
  ].filter(([, expectedValue]) => Number.isFinite(expectedValue));
  if (!checks.length) return { ok: true, checked: 0, maxDiff: 0 };
  const maxDiff = Math.max(...checks.map(([, expectedValue, actual]) => Math.abs(Number(actual) - expectedValue)));
  return { ok: maxDiff <= 1e-8, checked: checks.length, maxDiff };
}

export function gateCaseStatus(items) {
  return items.every(Boolean) ? 'OK' : 'NG';
}
