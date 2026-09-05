import { traceStatus } from './advancedTraceUtils.js';

export function buildResponseSpectrumTrace(analysis) {
  const rsa = analysis?.dynamics?.rsa || null;
  return {
    enabled: !!rsa,
    status: traceStatus(!!rsa, !!rsa),
    contract: rsa?.contract || null,
    review: rsa?.review || null,
    method: rsa?.method || null,
    spectrum: rsa?.spectrum || null,
    directions: Object.entries(rsa?.combined || {}).map(([direction, row]) => ({
      direction,
      method: row.method || rsa?.method || null,
      displacement: row.displacement,
      srssDisplacement: row.srssDisplacement,
      cqcDisplacement: row.cqcDisplacement,
      absDisplacement: row.absDisplacement,
      nrc10Displacement: row.nrc10Displacement,
      maxRotationRz: Math.max(0, ...(row.nodalDisplacements || []).map((item) => Math.abs(Number(item.rz) || 0))),
      maxModalDisplacement: row.maxModalDisplacement,
      participatingMassRatio: row.participatingMassRatio,
      totalMass: row.totalMass,
      combinationTrace: row.combinationTrace || null,
    })),
    modalRows: rsa?.modal || [],
  };
}
