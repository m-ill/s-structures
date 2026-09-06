import { materialOf, sectionOf } from '../../core/catalogs.js';

export const FIBER_SECTION_VERSION = 'p3-m16-fiber-section';

export function buildRectangularFiberSection(options = {}) {
  const width = positive(options.width, 0.3);
  const depth = positive(options.depth, 0.5);
  const strips = Math.max(2, Math.trunc(positive(options.strips, 20)));
  const fibers = [];
  const dy = depth / strips;
  for (let i = 0; i < strips; i += 1) {
    const y = -depth / 2 + dy * (i + 0.5);
    fibers.push({ id: `C${i + 1}`, material: options.concreteMaterial || 'concrete', area: width * dy, y, strain: 0, stress: 0 });
  }
  for (const [i, bar] of (options.bars || defaultBars(width, depth)).entries()) {
    fibers.push({ id: `R${i + 1}`, material: options.steelMaterial || 'steel', area: positive(bar.area, 0.0002), y: Number(bar.y), strain: 0, stress: 0 });
  }
  return {
    version: FIBER_SECTION_VERSION,
    contract: fiberContract('rectangular-rc-fiber'),
    type: 'rectangular-rc-fiber',
    width,
    depth,
    fibers,
    summary: summarizeFibers(fibers),
  };
}

export function buildSteelIFiberSection(options = {}) {
  const d = positive(options.depth, 0.4);
  const bf = positive(options.flangeWidth, 0.2);
  const tf = positive(options.flangeThickness, 0.012);
  const tw = positive(options.webThickness, 0.008);
  const material = options.material || 'steel';
  const fibers = [
    { id: 'TF', material, area: bf * tf, y: d / 2 - tf / 2 },
    { id: 'WEB', material, area: tw * (d - 2 * tf), y: 0 },
    { id: 'BF', material, area: bf * tf, y: -d / 2 + tf / 2 },
  ];
  return {
    version: FIBER_SECTION_VERSION,
    contract: fiberContract('steel-i-strip-fiber'),
    type: 'steel-i-strip-fiber',
    fibers,
    summary: summarizeFibers(fibers),
  };
}

export function applyFiberStrain(section, { curvature = 0, axialStrain = 0, materials = {} } = {}) {
  const fibers = (section.fibers || []).map((fiber) => {
    const strain = Number(axialStrain) - Number(curvature) * Number(fiber.y || 0);
    const mat = materials[fiber.material] || defaultMaterial(fiber.material);
    const stress = stressAtStrain(mat, strain);
    return { ...fiber, strain, stress, force: stress * Number(fiber.area || 0), moment: stress * Number(fiber.area || 0) * Number(fiber.y || 0) };
  });
  return {
    ...section,
    fibers,
    strainState: {
      curvature,
      axialStrain,
      maxAbsStrain: Math.max(0, ...fibers.map((fiber) => Math.abs(fiber.strain))),
      materialCount: Object.keys(materials).length,
    },
  };
}

export function buildMemberFiberSection(model = {}, member = {}, options = {}) {
  const section = sectionOf(model, member.secId);
  const material = materialKey(member.matId);
  const shape = String(section.shape || section.type || '').toUpperCase();
  const params = section.params || section.dims || {};
  if (shape === 'H') {
    return buildSteelIFiberSection({
      material,
      depth: lengthValue(section.H ?? params.H, 0.4),
      flangeWidth: lengthValue(section.B ?? params.B, 0.2),
      flangeThickness: lengthValue(params.tf ?? section.tf, 0.012),
      webThickness: lengthValue(params.tw ?? section.tw, 0.008),
    });
  }
  return buildRectangularFiberSection({
    concreteMaterial: material,
    steelMaterial: options.rebarMaterial || 'steel',
    width: lengthValue(section.B ?? params.B, 0.3),
    depth: lengthValue(section.H ?? params.H, 0.5),
    strips: options.strips,
    bars: options.bars,
  });
}

export function buildFiberMaterialMap(model = {}, refs = []) {
  const ids = new Set(['steel', 'concrete']);
  for (const material of model.materials || []) ids.add(material.id);
  for (const ref of refs) ids.add(materialKey(ref));
  const map = {};
  for (const id of ids) map[id] = fiberMaterialFromRecord(materialOf(model, id));
  return map;
}

export function fiberMaterialFromRecord(material = {}) {
  const fy = strength(material);
  return {
    E: positive(material.E, 200000000),
    fy,
    backbone: normalizeBackbone(material.nonlinear?.backbone || [], fy),
  };
}

function fiberContract(type) {
  return {
    milestone: 'P3-M16',
    tickets: ['P3-T84'],
    type,
    scope: 'Fiber-section trace for hinge-location moment-curvature checks.',
  };
}

function summarizeFibers(fibers = []) {
  return {
    fiberCount: fibers.length,
    materialIds: [...new Set(fibers.map((fiber) => fiber.material))],
    totalArea: fibers.reduce((sum, fiber) => sum + Number(fiber.area || 0), 0),
    maxAbsY: Math.max(0, ...fibers.map((fiber) => Math.abs(Number(fiber.y || 0)))),
  };
}

function defaultBars(width, depth) {
  const cover = Math.min(width, depth) * 0.12;
  return [{ y: depth / 2 - cover }, { y: depth / 2 - cover }, { y: -depth / 2 + cover }, { y: -depth / 2 + cover }];
}

function defaultMaterial(type) {
  return type === 'steel' ? { E: 200000000, fy: 400000 } : { E: 25000000, fy: 24000 };
}

function stressAtStrain(material, strain) {
  const backbone = material.backbone || [];
  if (backbone.length >= 2) return signedBackboneStress(backbone, strain);
  const stress = Number(material.E || 0) * Number(strain || 0);
  const fy = positive(material.fy, Infinity);
  return Math.max(-fy, Math.min(fy, stress));
}

function signedBackboneStress(backbone, strain) {
  const sign = Math.sign(strain || 1);
  const eps = Math.abs(Number(strain) || 0);
  let lo = backbone[0];
  let hi = backbone.at(-1);
  for (let i = 0; i < backbone.length - 1; i += 1) {
    if (eps <= backbone[i + 1].strain) {
      lo = backbone[i];
      hi = backbone[i + 1];
      break;
    }
  }
  const span = Math.max(1e-12, hi.strain - lo.strain);
  const t = Math.min(1, Math.max(0, (eps - lo.strain) / span));
  return sign * (lo.stress * (1 - t) + hi.stress * t);
}

function normalizeBackbone(rows, fy) {
  return rows
    .map((row) => ({
      strain: Math.abs(Number(row.strain ?? row.rotation ?? 0)),
      stress: normalizeStress(row.stress ?? row.moment, fy),
    }))
    .filter((row) => Number.isFinite(row.strain) && Number.isFinite(row.stress))
    .sort((a, b) => a.strain - b.strain);
}

function normalizeStress(value, fy) {
  const stress = Math.abs(Number(value) || 0);
  return stress > 0 && stress < fy / 20 ? stress * 1000 : stress;
}

function materialKey(ref) {
  return String(ref || 'steel').split('@')[0] || 'steel';
}

function lengthValue(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n > 20 ? n / 1000 : n;
}

function strength(material = {}) {
  return positive(material.Fy ?? material.strength?.steel?.Fy ?? material.fc, 240000);
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
