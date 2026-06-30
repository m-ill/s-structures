export function hasCombinationFactor(factors, prefix) {
  return Object.entries(factors || {}).some(([id, value]) => (
    id.toUpperCase().startsWith(prefix) && Math.abs(Number(value) || 0) > 0
  ));
}
