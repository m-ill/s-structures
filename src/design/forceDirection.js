export function forceAxis(dir) {
  return String(dir).includes('y') ? 'y' : 'x';
}

export function signedForce(force, dir) {
  const sign = String(dir).trim().startsWith('-') ? -1 : 1;
  return sign * Math.abs(Number(force) || 0);
}

export function signedDir(value, axis) {
  return `${value < 0 ? '-' : '+'}${axis}`;
}

export function round6(value) {
  return Number(Number(value || 0).toFixed(6));
}
