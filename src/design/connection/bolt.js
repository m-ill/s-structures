export const BOLT_CONNECTION_VERSION = 'p3-m18-bolt-connection';

export function designBoltGroup(row = {}, options = {}) {
  const shearInput = options.boltShearCapacity ?? 45;
  const tensionInput = options.boltTensionCapacity ?? 55;
  const inputReview = reviewBoltInputs({ boltShear: shearInput, boltTension: tensionInput });
  const boltShear = positive(shearInput, 45);
  const boltTension = positive(tensionInput, 55);
  const shear = Math.hypot(Number(row.demands?.shearY) || 0, Number(row.demands?.shearZ) || 0);
  const tension = Math.max(0, Number(row.demands?.axial) || 0);
  const required = Math.max(Math.ceil(shear / boltShear), Math.ceil(tension / boltTension), 2);
  const ratio = Math.max(shear / (required * boltShear), tension / (required * boltTension));
  return {
    version: BOLT_CONNECTION_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T92'],
      scope: 'Bolt group shear and tension sizing trace.',
    },
    memberId: row.memberId,
    bolt: options.bolt || 'M20-F10T',
    requiredCount: required,
    ratio,
    status: inputReview.status === 'review-required' ? 'NG' : ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK',
    formulaId: 'KDS-CONN-BOLT-V1',
    inputReview,
    summary: { shear, tension, boltShear, boltTension },
  };
}

function reviewBoltInputs(input = {}) {
  const missing = [];
  if (!(Number(input.boltShear) > 0)) missing.push('bolt-shear-capacity');
  if (!(Number(input.boltTension) > 0)) missing.push('bolt-tension-capacity');
  return {
    status: missing.length ? 'review-required' : 'available',
    missing,
    formulaId: 'KDS-CONN-INPUT-V1',
    agentDecision: missing.length ? 'review-bolt-inputs' : 'bolt-inputs-ready',
  };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
