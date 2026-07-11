export const KS_H_DB_VERSION = 'p7-m1-parametric-h-seed-v1';

const PARAMETRIC_SOURCE = Object.freeze({
  db: 's-structures-parametric-h-seed-v1',
  scope: 'builtin',
  propertyMethod: 'computed-parametric',
  verificationStatus: 'unverified-parametric',
  note: 'Convenience geometry seed; not a verified KS section table.',
});

// Legacy builds labeled these convenience seeds "KS-H-2024" without a verified table source.

export const KS_H_SECTIONS = [
  { id: 'H-200x100x5.5x8', version: 1, name: 'H-200x100x5.5x8', shape: 'H', params: { H: 200, B: 100, tw: 5.5, tf: 8 }, source: PARAMETRIC_SOURCE },
  { id: 'H-300x150x6.5x9', version: 1, name: 'H-300x150x6.5x9', shape: 'H', params: { H: 300, B: 150, tw: 6.5, tf: 9 }, source: PARAMETRIC_SOURCE },
  { id: 'H-400x200x8x13', version: 1, name: 'H-400x200x8x13', shape: 'H', params: { H: 400, B: 200, tw: 8, tf: 13 }, source: PARAMETRIC_SOURCE },
];
