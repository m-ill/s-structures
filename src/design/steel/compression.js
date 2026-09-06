export const STEEL_COMPRESSION_VERSION = 'p3-m18-steel-compression';

export function checkSteelCompression(check = {}) {
  const slenderness = check.slenderness || {};
  const maxKL = Math.max(num(slenderness.KLry), num(slenderness.KLrz));
  const limit = num(slenderness.limit) || 200;
  const axial = findCheck(check, 'steel-axial');
  const ratio = Math.max(axial?.ratio || 0, maxKL / limit);
  return {
    version: STEEL_COMPRESSION_VERSION,
    memberId: check.memberId,
    ratio,
    maxKL,
    limit,
    status: status(ratio),
    formulaId: 'KDS-ST-COMPRESSION-KL-V1',
  };
}

function findCheck(check, id) {
  return (check.checks || []).find((item) => item.id === id) || null;
}

function status(ratio) {
  if (ratio > 1) return 'NG';
  if (ratio > 0.8) return 'WARN';
  return 'OK';
}

function num(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
