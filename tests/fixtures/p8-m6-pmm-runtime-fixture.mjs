import {
  createConcreteMaterial,
  createSteelBilinearMaterial,
} from '../../src/nonlinear/fiber/materialModels.js';

export const P8_M6_PMM_RUNTIME_GATE_MS = 60_000;

export const P8_M6_EXPLICIT_DEFAULT_OPTIONS = Object.freeze({
  inputLengthUnit: null,
  refinement: Object.freeze({
    level: 1,
    longitudinal: 8,
    thickness: 2,
    sectors: 32,
    radial: 2,
    rcDivisions: 8,
    maxCellSize: null,
    maxCellSizeUnit: 'm',
  }),
  sourcePropertyTolerance: 0.005,
  angles: null,
  angleCount: 8,
  curvatures: null,
  curvatureMax: null,
  curvatureSteps: 16,
  axialLevels: null,
  axialTolerance: 1e-6,
  axialAbsoluteTolerance: 1e-3,
  directionTolerance: 5e-4,
  directionIterations: 12,
  capacityTolerance: 1e-12,
  capacityIterations: 18,
  capacityCurvatureTolerance: 1e-6,
  forceTolerance: 1e-3,
  relativeTolerance: 1e-7,
  maxIterations: 80,
  epsilonBracket: Object.freeze([-0.05, 0.05]),
  initialBracket: null,
  bracketExpansion: 2,
  maxBracketExpansions: 40,
  bracketSamples: 64,
  compressionStrainLimit: null,
  tensionStrainLimit: null,
  axialCapacitySamples: 160,
  axialCapacityIterations: 32,
  steelHardeningRatio: 0.01,
  rebarHardeningRatio: 0.01,
  concreteTensionStrength: null,
});

export function createColdRc400x600Fixture() {
  const reinforcement = createRcReinforcement('RC-R1');
  const member = {
    id: 'RC-M1',
    matId: 'RC30',
    secId: 'RC-400x600',
    nonlinear: {
      formulation: 'concentrated-plasticity',
      hinges: [{ id: 'RC-M1:i:z', end: 'i', axis: 'z', location: 0 }],
    },
  };
  return {
    model: {
      materials: [{ id: 'RC30', version: 1, kind: 'concrete', E: 30000, G: 12500, fck: 30 }],
      sections: [{
        id: 'RC-400x600',
        version: 1,
        kind: 'parametric',
        shape: 'RECT',
        params: { B: 400, H: 600 },
        properties: { A: 0.24, Iy: 0.0032, Iz: 0.0072, J: 0.006 },
      }],
      members: [member],
    },
    member,
    reinforcement,
    options: {
      reinforcementSnapshots: { [member.id]: reinforcement },
      angleCount: 8,
    },
  };
}

export function createWorkerSteelFixture() {
  return {
    model: {
      materials: [
        { id: 'S275-A', version: 1, kind: 'steel', E: 205000, G: 79000, Fy: 275 },
        { id: 'S355-B', version: 1, kind: 'steel', E: 205000, G: 79000, Fy: 355 },
      ],
      sections: [
        { id: 'PIPE-A', version: 1, kind: 'parametric', shape: 'PIPE', params: { D: 200, t: 10 } },
        { id: 'PIPE-B', version: 1, kind: 'parametric', shape: 'PIPE', params: { D: 250, t: 12 } },
      ],
      members: [
        workerMember('WORKER-A', 'S275-A', 'PIPE-A'),
        workerMember('WORKER-B', 'S355-B', 'PIPE-B'),
      ],
    },
    options: {
      refinement: { level: 1, sectors: 8, radial: 1 },
      angleCount: 8,
      curvatures: [0, 0.01, 0.02, 0.04],
      directionIterations: 1,
      capacityIterations: 4,
      axialCapacitySamples: 40,
      axialCapacityIterations: 12,
    },
  };
}

export function createStaleProtectionFixture() {
  const reinforcement = createRcReinforcement('STALE-R');
  const target = {
    id: 'STALE-TARGET',
    matId: 'RC30',
    secId: 'RC-TARGET',
    nonlinear: {
      formulation: 'distributed-plasticity',
      hinges: [],
      reinforcementSnapshot: reinforcement,
    },
  };
  const unrelated = workerMember('STALE-UNRELATED', 'S275', 'PIPE-UNRELATED');
  return {
    model: {
      materials: [
        { id: 'RC30', version: 1, kind: 'concrete', E: 30000, G: 12500, fck: 30 },
        { id: 'S275', version: 1, kind: 'steel', E: 205000, G: 79000, Fy: 275 },
      ],
      sections: [
        { id: 'RC-TARGET', version: 1, kind: 'parametric', shape: 'RECT', params: { B: 400, H: 600 } },
        { id: 'PIPE-UNRELATED', version: 1, kind: 'parametric', shape: 'PIPE', params: { D: 200, t: 10 } },
      ],
      members: [target, unrelated],
    },
    target,
    unrelated,
    reinforcement,
  };
}

export function createEnvelopeParityFixtures() {
  const steel = createSteelBilinearMaterial({
    id: 'steel', E: 200e9, Fy: 250e6, hardeningRatio: 0.01,
  });
  const concrete = createConcreteMaterial({
    id: 'concrete', E: 30e9, fc: 30e6, ft: 2e6,
  });
  const rebar = createSteelBilinearMaterial({
    id: 'rebar', E: 200e9, Fy: 400e6, hardeningRatio: 0.01,
  });
  const rcMaterials = { concrete, rebar };

  return [
    {
      id: 'small-steel',
      section: {
        id: 'PARITY-STEEL-16',
        fibers: ringFibers('S', 16, 0.00125, 0.1, 'steel'),
      },
      materials: { steel },
      deformations: [
        { epsilon0: 2e-4, kappaY: 0.001, kappaZ: -0.0005 },
        { epsilon0: -4e-4, kappaY: 0.012, kappaZ: 0.008 },
      ],
      root: { targetN: -4e5, kappaY: 0.004, kappaZ: -0.003 },
      pmm: {
        axialIntercepts: { compression: -1.5e6, tension: 1.5e6 },
        axialLevels: [-7.5e5, 0, 7.5e5],
        curvatures: [0, 0.006, 0.012, 0.02, 0.04],
      },
    },
    rcParityFixture('symmetric-rc', false, rcMaterials),
    rcParityFixture('asymmetric-rc', true, rcMaterials),
  ];
}

function rcParityFixture(id, asymmetric, materials) {
  const concreteFibers = rectangularGridFibers('C', 3, 4, 0.4, 0.6, 0.0198, 'concrete');
  const areas = asymmetric
    ? [0.00065, 0.00045, 0.00055, 0.00035]
    : [0.0005, 0.0005, 0.0005, 0.0005];
  const rebarFibers = cornerFibers('R', areas, 0.14, 0.24, 'rebar');
  return {
    id,
    section: {
      id: `PARITY-${id.toUpperCase()}`,
      family: 'reinforced-concrete',
      fibers: [...concreteFibers, ...rebarFibers],
    },
    materials,
    deformations: [
      { epsilon0: -4e-4, kappaY: 0.001, kappaZ: -0.0008 },
      { epsilon0: -0.001, kappaY: 0.006, kappaZ: 0.004 },
    ],
    root: { targetN: -1e6, kappaY: 0.002, kappaZ: -0.0015 },
    pmm: {
      axialIntercepts: { compression: -2e6, tension: 2.5e5 },
      axialLevels: [-1e6, 0, 1.25e5],
      curvatures: [0, 0.004, 0.008, 0.014, 0.025],
    },
  };
}

function createRcReinforcement(id) {
  return {
    id,
    version: 1,
    qualification: 'verified',
    units: { length: 'mm', area: 'mm2' },
    cover: 40,
    bars: [
      { id: `${id}-B1`, y: -240, z: -140, area: 491 },
      { id: `${id}-B2`, y: 240, z: -140, area: 491 },
      { id: `${id}-B3`, y: -240, z: 140, area: 491 },
      { id: `${id}-B4`, y: 240, z: 140, area: 491 },
    ],
    material: { E: 200000, Fy: 400 },
    confinement: { enabled: false },
  };
}

function workerMember(id, matId, secId) {
  return {
    id,
    matId,
    secId,
    nonlinear: {
      formulation: 'concentrated-plasticity',
      hinges: [{ id: `${id}:i:z`, end: 'i', axis: 'z', location: 0 }],
    },
  };
}

function cornerFibers(prefix, areaInput, y, z, materialId) {
  const areas = Array.isArray(areaInput) ? areaInput : new Array(4).fill(areaInput);
  return [
    { id: `${prefix}1`, area: areas[0], y: -y, z: -z, materialId },
    { id: `${prefix}2`, area: areas[1], y, z: -z, materialId },
    { id: `${prefix}3`, area: areas[2], y: -y, z, materialId },
    { id: `${prefix}4`, area: areas[3], y, z, materialId },
  ];
}

function ringFibers(prefix, count, area, radius, materialId) {
  return Array.from({ length: count }, (_, index) => {
    const angle = 2 * Math.PI * index / count;
    return {
      id: `${prefix}${index + 1}`,
      area,
      y: radius * Math.cos(angle),
      z: radius * Math.sin(angle),
      materialId,
    };
  });
}

function rectangularGridFibers(prefix, yCount, zCount, width, depth, area, materialId) {
  const fibers = [];
  for (let yIndex = 0; yIndex < yCount; yIndex += 1) {
    for (let zIndex = 0; zIndex < zCount; zIndex += 1) {
      fibers.push({
        id: `${prefix}${fibers.length + 1}`,
        area,
        y: -width / 2 + width * (yIndex + 0.5) / yCount,
        z: -depth / 2 + depth * (zIndex + 0.5) / zCount,
        materialId,
      });
    }
  }
  return fibers;
}
