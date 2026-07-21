import {
  ALL_BUILTIN_MATERIAL_RECORDS,
  DEFAULT_MATERIAL_RECORDS,
  LEGACY_STEEL_MATERIALS,
} from '../materials/db/builtinMaterials.js';
import { KS_H_SECTIONS } from '../materials/db/ksH.js';
import { ADDITIONAL_PRACTICAL_SECTIONS } from '../materials/db/practicalSections.js';
import { normalizeMaterialRecord } from '../materials/materialSchema.js';
import { resolveMaterialRecord, resolveSectionRecord } from '../materials/registry.js';
import { normalizeSectionRecord } from '../materials/sectionSchema.js';
import { resolveSectionShearAreas } from '../materials/sectionProperties.js';

export const DEFAULT_UNITS = {
  length: 'm',
  force: 'kN',
  moment: 'kN.m',
  stress: 'N/mm2',
  displacement: 'mm',
};

// New models receive current KS snapshots. Legacy steel records remain resolvable
// through ALL_MATERIALS_CATALOG without being offered as new defaults.
export const MATERIALS_CATALOG = DEFAULT_MATERIAL_RECORDS;
export const LEGACY_MATERIALS_CATALOG = LEGACY_STEEL_MATERIALS;
export const ALL_MATERIALS_CATALOG = ALL_BUILTIN_MATERIAL_RECORDS;

export const SECTIONS_CATALOG = Object.freeze([
  {
    id: 'h200',
    version: 1,
    name: 'H-200x100x5.5x8',
    type: 'H',
    dims: { H: 200, B: 100, tw: 5.5, tf: 8 },
    A: 27.16e-4,
    Iz: 1840e-8,
    Zz: 184e-6,
    Iy: 134e-8,
    Zy: 26.8e-6,
    J: 5e-8,
    source: { scope: 'builtin', db: 'legacy-section-catalog-v1' },
  },
  {
    id: 'h300',
    version: 1,
    name: 'H-300x150x6.5x9',
    type: 'H',
    dims: { H: 300, B: 150, tw: 6.5, tf: 9 },
    A: 46.78e-4,
    Iz: 7210e-8,
    Zz: 481e-6,
    Iy: 508e-8,
    Zy: 67.7e-6,
    J: 9e-8,
    source: { scope: 'builtin', db: 'legacy-section-catalog-v1' },
  },
  {
    id: 'h400',
    version: 1,
    name: 'H-400x200x8x13',
    type: 'H',
    dims: { H: 400, B: 200, tw: 8, tf: 13 },
    A: 84.12e-4,
    Iz: 23700e-8,
    Zz: 1190e-6,
    Iy: 1740e-8,
    Zy: 174e-6,
    J: 37e-8,
    source: { scope: 'builtin', db: 'legacy-section-catalog-v1' },
  },
  {
    id: 'box200',
    version: 1,
    name: 'BOX-200x200x9',
    type: 'BOX',
    dims: { H: 200, B: 200, t: 9 },
    A: 67.89e-4,
    Iz: 4090e-8,
    Zz: 409e-6,
    Iy: 4090e-8,
    Zy: 409e-6,
    J: 6270e-8,
    source: { scope: 'builtin', db: 'legacy-section-catalog-v1' },
  },
  {
    id: 'rc3060',
    version: 1,
    name: 'RC 300x600',
    type: 'RECT',
    dims: { B: 300, H: 600 },
    A: 0.18,
    Iz: 5.4e-3,
    Zz: 1.8e-2,
    Iy: 1.35e-3,
    Zy: 9e-3,
    J: 3.7e-3,
    source: { scope: 'builtin', db: 'legacy-section-catalog-v1' },
  },
  ...ADDITIONAL_PRACTICAL_SECTIONS,
]);

export function toInternalMaterial(material) {
  const normalized = normalizeMaterialRecord(material || {});
  const elastic = normalized.elastic || {};
  const steel = normalized.strength?.steel || {};
  const concrete = normalized.strength?.concrete || {};
  const allow = normalized.allow || steel.allow || {};
  const fy = firstFinite(steel.Fy, concrete.fck, material?.Fy, material?.fy, 0);
  const fu = firstFinite(steel.Fu, concrete.fck, material?.Fu, material?.fu, 0);
  const E = firstFinite(elastic.E, material?.E, 0);
  const G = firstFinite(elastic.G, material?.G, 0);
  const density = firstFinite(elastic.rho, material?.density, material?.rho, 0);
  const defaultAllow = fy > 0 ? fy / 1.5 : 0;
  return {
    ...material,
    ...normalized,
    E: E * 1000,
    G: G * 1000,
    Fy: fy * 1000,
    Fu: fu * 1000,
    density,
    fb: firstFinite(allow.fb, defaultAllow) * 1000,
    fa: Math.min(
      firstFinite(allow.ft, defaultAllow),
      firstFinite(allow.fc, allow.ft, defaultAllow),
    ) * 1000,
    fs: firstFinite(allow.fv, fy > 0 ? fy / (1.5 * Math.sqrt(3)) : 0) * 1000,
  };
}

export function toInternalSection(section) {
  const normalized = normalizeSectionRecord(section || {});
  const properties = normalized.properties || {};
  const merged = { ...section, ...normalized, ...properties };
  const shearAreas = resolveSectionShearAreas(merged);
  return {
    ...merged,
    Ay: shearAreas.Ay,
    Az: shearAreas.Az,
    shearAreaProvenance: shearAreas.provenance,
    ry: positiveFinite(merged.ry) ? Number(merged.ry) : merged.Iy && merged.A ? Math.sqrt(merged.Iy / merged.A) : 0,
    rz: positiveFinite(merged.rz) ? Number(merged.rz) : merged.Iz && merged.A ? Math.sqrt(merged.Iz / merged.A) : 0,
  };
}

export const MATERIALS = Object.fromEntries(
  ALL_MATERIALS_CATALOG.map((material) => [material.id, toInternalMaterial(material)]),
);

export const SECTIONS = Object.fromEntries(
  [...SECTIONS_CATALOG, ...KS_H_SECTIONS].map((section) => [section.id, toInternalSection(section)]),
);

export function isKnownMaterialReference(model, id) {
  return resolveMaterialRecord(model, id, ALL_MATERIALS_CATALOG) != null;
}

export function isKnownSectionReference(model, id) {
  return resolveSectionRecord(model, id, SECTIONS_CATALOG) != null;
}

export function materialOf(model, id) {
  const resolved = resolveMaterialRecord(model, id, ALL_MATERIALS_CATALOG);
  if (!resolved) throw invalidReferenceError('material', id);
  return toInternalMaterial(resolved);
}

export function sectionOf(model, id) {
  const resolved = resolveSectionRecord(model, id, SECTIONS_CATALOG);
  if (!resolved) throw invalidReferenceError('section', id);
  return toInternalSection(resolved);
}

function invalidReferenceError(kind, reference) {
  const error = new Error(`Unresolved ${kind} reference: ${String(reference || '')}`);
  error.code = `invalid-${kind}-reference`;
  error.kind = kind;
  error.reference = reference ?? null;
  return error;
}

function firstFinite(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function positiveFinite(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}
