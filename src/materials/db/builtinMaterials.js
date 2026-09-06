import { KS_STEEL_MATERIALS } from './ksSteel.js';

export const BUILTIN_MATERIAL_DB_VERSION = 'p7-m1-builtin-materials-v1';

export const LEGACY_STEEL_MATERIALS = Object.freeze([
  Object.freeze({
    id: 'steel',
    version: 1,
    name: 'Steel SS400',
    E: 205000,
    G: 79000,
    alpha: 1.2e-5,
    Fy: 235,
    Fu: 400,
    density: 7.85,
    allow: Object.freeze({ fb: 156.7, ft: 156.7, fc: 156.7, fv: 90.4 }),
    legacy: true,
    status: 'legacy',
    legacyDesignation: 'SS400',
    migration: Object.freeze({
      candidateDesignations: Object.freeze(['SS275']),
      equivalent: false,
      automatic: false,
    }),
    source: Object.freeze({
      scope: 'builtin',
      db: 'legacy-material-catalog-v1',
      verificationStatus: 'legacy-snapshot',
      note: 'Preserved application snapshot; not a current KS grade record.',
    }),
  }),
  Object.freeze({
    id: 'sm490',
    version: 1,
    name: 'Steel SM490',
    E: 205000,
    G: 79000,
    alpha: 1.2e-5,
    Fy: 325,
    Fu: 490,
    density: 7.85,
    allow: Object.freeze({ fb: 216.7, ft: 216.7, fc: 216.7, fv: 125 }),
    legacy: true,
    status: 'legacy',
    legacyDesignation: 'SM490',
    migration: Object.freeze({
      candidateDesignations: Object.freeze(['SM355A', 'SM355B', 'SM355C']),
      equivalent: false,
      automatic: false,
      requires: Object.freeze(['suffix', 'thicknessMm', 'productForm']),
    }),
    source: Object.freeze({
      scope: 'builtin',
      db: 'legacy-material-catalog-v1',
      verificationStatus: 'legacy-snapshot',
      note: 'Preserved application snapshot; suffix and thickness must be reviewed before migration.',
    }),
  }),
]);

export const OTHER_BUILTIN_MATERIALS = Object.freeze([
  Object.freeze({
    id: 'concrete',
    version: 1,
    name: 'Concrete Fc24',
    E: 22700,
    G: 9500,
    Fy: 24,
    Fu: 24,
    density: 2.4,
    allow: Object.freeze({ fb: 8, ft: 0.8, fc: 8, fv: 0.73 }),
    source: Object.freeze({ scope: 'builtin', db: 'legacy-material-catalog-v1' }),
  }),
  Object.freeze({
    id: 'wood',
    version: 1,
    name: 'Wood',
    E: 7000,
    G: 440,
    Fy: 22,
    Fu: 22,
    density: 0.38,
    allow: Object.freeze({ fb: 8.1, ft: 5.4, fc: 6.5, fv: 0.66 }),
    source: Object.freeze({ scope: 'builtin', db: 'legacy-material-catalog-v1' }),
  }),
]);

export const DEFAULT_MATERIAL_RECORDS = Object.freeze([
  ...KS_STEEL_MATERIALS,
  ...OTHER_BUILTIN_MATERIALS,
]);

export const ALL_BUILTIN_MATERIAL_RECORDS = Object.freeze([
  ...DEFAULT_MATERIAL_RECORDS,
  ...LEGACY_STEEL_MATERIALS,
]);
