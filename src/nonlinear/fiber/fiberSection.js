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
  return { version: FIBER_SECTION_VERSION, type: 'rectangular-rc-fiber', width, depth, fibers };
}

export function buildSteelIFiberSection(options = {}) {
  const d = positive(options.depth, 0.4);
  const bf = positive(options.flangeWidth, 0.2);
  const tf = positive(options.flangeThickness, 0.012);
  const tw = positive(options.webThickness, 0.008);
  return {
    version: FIBER_SECTION_VERSION,
    type: 'steel-i-strip-fiber',
    fibers: [
      { id: 'TF', material: 'steel', area: bf * tf, y: d / 2 - tf / 2 },
      { id: 'WEB', material: 'steel', area: tw * (d - 2 * tf), y: 0 },
      { id: 'BF', material: 'steel', area: bf * tf, y: -d / 2 + tf / 2 },
    ],
  };
}

export function applyFiberStrain(section, { curvature = 0, axialStrain = 0, materials = {} } = {}) {
  return {
    ...section,
    fibers: (section.fibers || []).map((fiber) => {
      const strain = Number(axialStrain) - Number(curvature) * Number(fiber.y || 0);
      const mat = materials[fiber.material] || defaultMaterial(fiber.material);
      const stress = Math.max(-mat.fy, Math.min(mat.fy, mat.E * strain));
      return { ...fiber, strain, stress, force: stress * Number(fiber.area || 0), moment: stress * Number(fiber.area || 0) * Number(fiber.y || 0) };
    }),
  };
}

function defaultBars(width, depth) {
  const cover = Math.min(width, depth) * 0.12;
  return [{ y: depth / 2 - cover }, { y: depth / 2 - cover }, { y: -depth / 2 + cover }, { y: -depth / 2 + cover }];
}

function defaultMaterial(type) {
  return type === 'steel' ? { E: 200000000, fy: 400000 } : { E: 25000000, fy: 24000 };
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
