export function shouldGenerateSignedAccidental(summary, basis, options = {}) {
  if (options.signedAccidentalCases === false) return false;
  if (Math.max(0, Number(basis?.accidentalEccentricityRatio || 0)) <= 0) return false;
  return (summary?.rows || []).some((row) => hasCenter(row.massCenter) && hasCenter(row.diaphragmCenter));
}

function hasCenter(center) {
  return Number.isFinite(center?.x) && Number.isFinite(center?.y);
}
