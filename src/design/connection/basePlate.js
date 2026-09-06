export const BASE_PLATE_VERSION = 'p3-m18-base-plate';

export function designBasePlate(foundationRow = {}, options = {}) {
  const verticalInput = foundationRow.reaction?.vertical ?? 0;
  const bearingInput = foundationRow.allowableBearing ?? options.allowableBearing ?? 150;
  const inputReview = reviewBasePlateInputs({ vertical: verticalInput, bearing: bearingInput });
  const vertical = Math.max(0, Number(verticalInput) || 0);
  const bearing = positive(bearingInput, 150);
  const area = Math.max(Number(foundationRow.requiredArea) || 0, vertical / Math.max(1, bearing));
  const side = Math.max(0.25, Math.sqrt(area));
  const anchors = foundationRow.uplift ? 4 : 2;
  return {
    version: BASE_PLATE_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T92'],
      scope: 'Base-plate bearing area, plate sizing, and anchor count trace.',
    },
    nodeId: foundationRow.nodeId,
    plate: { width: round(side), length: round(side), thickness: options.thickness || 25 },
    anchors,
    status: inputReview.status === 'review-required' ? 'NG' : foundationRow.uplift ? 'WARN' : foundationRow.status || 'OK',
    formulaId: 'KDS-CONN-BASEPLATE-V1',
    inputReview,
    summary: { vertical, bearing, requiredArea: round(area), uplift: !!foundationRow.uplift },
  };
}

function reviewBasePlateInputs(input = {}) {
  const missing = [];
  if (!(Number(input.vertical) >= 0)) missing.push('base-plate-vertical-reaction');
  if (!(Number(input.bearing) > 0)) missing.push('base-plate-bearing-capacity');
  return {
    status: missing.length ? 'review-required' : 'available',
    missing,
    formulaId: 'KDS-CONN-INPUT-V1',
    agentDecision: missing.length ? 'review-base-plate-inputs' : 'base-plate-inputs-ready',
  };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
