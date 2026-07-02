export const PILE_FOUNDATION_VERSION = 'p3-m18-pile-foundation';

export function designPileGroup(row = {}, options = {}) {
  const vertical = Number(row.reaction?.vertical) || 0;
  const pileCapacity = Number(options.pileCapacity || 600);
  const count = Math.max(2, Math.ceil(vertical / Math.max(1, pileCapacity)));
  const ratio = vertical / Math.max(1, count * pileCapacity);
  return {
    version: PILE_FOUNDATION_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T93'],
      scope: 'Pile group count and axial capacity ratio trace.',
    },
    nodeId: row.nodeId,
    pileCapacity,
    count,
    ratio,
    status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK',
    formulaId: 'KDS-FOUND-PILE-V1',
    summary: { vertical, pileCapacity, count },
  };
}
