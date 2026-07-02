export const BOLT_CONNECTION_VERSION = 'p3-m18-bolt-connection';

export function designBoltGroup(row = {}, options = {}) {
  const boltShear = Number(options.boltShearCapacity || 45);
  const boltTension = Number(options.boltTensionCapacity || 55);
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
    status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK',
    formulaId: 'KDS-CONN-BOLT-V1',
    summary: { shear, tension, boltShear, boltTension },
  };
}
