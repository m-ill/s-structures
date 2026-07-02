export const PILE_FOUNDATION_VERSION = 'p3-m18-pile-foundation';

export function designPileGroup(row = {}, options = {}) {
  const verticalInput = row.reaction?.vertical ?? 0;
  const capacityInput = options.pileCapacity ?? 600;
  const inputReview = reviewPileInputs({ vertical: verticalInput, pileCapacity: capacityInput });
  const vertical = Math.max(0, Number(verticalInput) || 0);
  const pileCapacity = positive(capacityInput, 600);
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
    status: inputReview.status === 'review-required' ? 'NG' : ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK',
    formulaId: 'KDS-FOUND-PILE-V1',
    inputReview,
    summary: { vertical, pileCapacity, count },
  };
}

function reviewPileInputs(input = {}) {
  const missing = [];
  if (!(Number(input.vertical) >= 0)) missing.push('pile-vertical-reaction');
  if (!(Number(input.pileCapacity) > 0)) missing.push('pile-capacity');
  return {
    status: missing.length ? 'review-required' : 'available',
    missing,
    formulaId: 'KDS-FOUND-INPUT-V1',
    agentDecision: missing.length ? 'review-pile-inputs' : 'pile-inputs-ready',
  };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
