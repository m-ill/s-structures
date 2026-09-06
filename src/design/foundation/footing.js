export const FOOTING_DESIGN_VERSION = 'p3-m18-footing-design';

export function designSpreadFooting(row = {}, options = {}) {
  const inputReview = reviewFootingInputs(row);
  const area = Math.max(Number(row.requiredArea) || 0, 0.6 * 0.6);
  const side = Math.sqrt(area);
  const vertical = Math.max(0, Number(row.reaction?.vertical) || 0);
  const moment = vertical * side / 8;
  const rebarArea = moment * 1e6 / Math.max(1, 0.9 * 450 * 400 * 0.85);
  return {
    version: FOOTING_DESIGN_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T93'],
      scope: 'Spread footing bearing area and preliminary reinforcement trace.',
    },
    nodeId: row.nodeId,
    type: 'spread',
    size: { B: round(side), L: round(side), t: options.thickness || 0.55 },
    rebarArea: round(rebarArea),
    status: inputReview.status === 'review-required' ? 'NG' : row.status || 'OK',
    formulaId: 'KDS-FOUND-SPREAD-V1',
    inputReview,
    summary: { requiredArea: round(area), vertical, moment: round(moment) },
  };
}

function reviewFootingInputs(row = {}) {
  const missing = [];
  if (!(Number(row.reaction?.vertical) >= 0)) missing.push('footing-vertical-reaction');
  if (row.requiredArea != null && !(Number(row.requiredArea) > 0)) missing.push('footing-required-area');
  return {
    status: missing.length ? 'review-required' : 'available',
    missing,
    formulaId: 'KDS-FOUND-INPUT-V1',
    agentDecision: missing.length ? 'review-footing-inputs' : 'footing-inputs-ready',
  };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
