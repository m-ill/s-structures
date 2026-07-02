import { resolveMaterialRecord, resolveSectionRecord } from '../materials/registry.js';

export const DEFAULT_UNITS = {
  length: 'm',
  force: 'kN',
  moment: 'kN.m',
  stress: 'N/mm2',
  displacement: 'mm',
};

export const MATERIALS_CATALOG = [
  {
    id: 'steel',
    name: 'Steel SS400',
    E: 205000,
    G: 79000,
    Fy: 235,
    Fu: 400,
    density: 7.85,
    allow: { fb: 156.7, ft: 156.7, fc: 156.7, fv: 90.4 },
  },
  {
    id: 'sm490',
    name: 'Steel SM490',
    E: 205000,
    G: 79000,
    Fy: 325,
    Fu: 490,
    density: 7.85,
    allow: { fb: 216.7, ft: 216.7, fc: 216.7, fv: 125 },
  },
  {
    id: 'concrete',
    name: 'Concrete Fc24',
    E: 22700,
    G: 9500,
    Fy: 24,
    Fu: 24,
    density: 2.4,
    allow: { fb: 8, ft: 0.8, fc: 8, fv: 0.73 },
  },
  {
    id: 'wood',
    name: 'Wood',
    E: 7000,
    G: 440,
    Fy: 22,
    Fu: 22,
    density: 0.38,
    allow: { fb: 8.1, ft: 5.4, fc: 6.5, fv: 0.66 },
  },
];

export const SECTIONS_CATALOG = [
  {
    id: 'h200',
    name: 'H-200x100x5.5x8',
    type: 'H',
    dims: { H: 200, B: 100, tw: 5.5, tf: 8 },
    A: 27.16e-4,
    Iz: 1840e-8,
    Zz: 184e-6,
    Iy: 134e-8,
    Zy: 26.8e-6,
    J: 5e-8,
  },
  {
    id: 'h300',
    name: 'H-300x150x6.5x9',
    type: 'H',
    dims: { H: 300, B: 150, tw: 6.5, tf: 9 },
    A: 46.78e-4,
    Iz: 7210e-8,
    Zz: 481e-6,
    Iy: 508e-8,
    Zy: 67.7e-6,
    J: 9e-8,
  },
  {
    id: 'h400',
    name: 'H-400x200x8x13',
    type: 'H',
    dims: { H: 400, B: 200, tw: 8, tf: 13 },
    A: 84.12e-4,
    Iz: 23700e-8,
    Zz: 1190e-6,
    Iy: 1740e-8,
    Zy: 174e-6,
    J: 37e-8,
  },
  {
    id: 'box200',
    name: 'BOX-200x200x9',
    type: 'BOX',
    dims: { H: 200, B: 200, t: 9 },
    A: 67.89e-4,
    Iz: 4090e-8,
    Zz: 409e-6,
    Iy: 4090e-8,
    Zy: 409e-6,
    J: 6270e-8,
  },
  {
    id: 'rc3060',
    name: 'RC 300x600',
    type: 'RECT',
    dims: { B: 300, H: 600 },
    A: 0.18,
    Iz: 5.4e-3,
    Zz: 1.8e-2,
    Iy: 1.35e-3,
    Zy: 9e-3,
    J: 3.7e-3,
  },
];

export function toInternalMaterial(material) {
  const allow = material.allow || {};
  const fy = material.Fy || 235;
  return {
    ...material,
    E: material.E * 1000,
    G: material.G * 1000,
    Fy: fy * 1000,
    Fu: (material.Fu || 0) * 1000,
    density: material.density || 0,
    fb: (allow.fb ?? fy / 1.5) * 1000,
    fa: Math.min(allow.ft ?? fy / 1.5, allow.fc ?? allow.ft ?? fy / 1.5) * 1000,
    fs: (allow.fv ?? fy / (1.5 * Math.sqrt(3))) * 1000,
  };
}

export function toInternalSection(section) {
  return {
    ...section,
    ry: section.ry || (section.Iy && section.A ? Math.sqrt(section.Iy / section.A) : 0),
    rz: section.rz || (section.Iz && section.A ? Math.sqrt(section.Iz / section.A) : 0),
  };
}

export const MATERIALS = Object.fromEntries(
  MATERIALS_CATALOG.map((material) => [material.id, toInternalMaterial(material)]),
);

export const SECTIONS = Object.fromEntries(
  SECTIONS_CATALOG.map((section) => [section.id, toInternalSection(section)]),
);

export function materialOf(model, id) {
  const resolved = resolveMaterialRecord(model, id, MATERIALS_CATALOG);
  return resolved ? toInternalMaterial(resolved) : MATERIALS.steel;
}

export function sectionOf(model, id) {
  const resolved = resolveSectionRecord(model, id, SECTIONS_CATALOG);
  return resolved ? toInternalSection(resolved) : SECTIONS.h300;
}
