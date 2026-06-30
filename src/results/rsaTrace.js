import { traceStatus } from './advancedTraceUtils.js';

export function buildResponseSpectrumTrace(analysis) {
  const rsa = analysis?.dynamics?.rsa || null;
  return {
    enabled: !!rsa,
    status: traceStatus(!!rsa, !!rsa),
    method: rsa?.method || null,
    spectrum: rsa?.spectrum || null,
    directions: Object.entries(rsa?.combined || {}).map(([direction, row]) => ({
      direction,
      srssDisplacement: row.srssDisplacement,
      maxModalDisplacement: row.maxModalDisplacement,
      participatingMassRatio: row.participatingMassRatio,
      totalMass: row.totalMass,
    })),
    modalRows: rsa?.modal || [],
  };
}
