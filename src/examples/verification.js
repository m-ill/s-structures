import { createModel } from '../core/model.js';

export const BENCH_MATERIAL = {
  id: 'bench-steel',
  name: 'Benchmark steel',
  E: 200000,
  G: 80000,
  Fy: 300,
  Fu: 400,
  density: 0,
  allow: { fb: 200, ft: 200, fc: 200, fv: 120 },
};

export const BENCH_SECTION = {
  id: 'bench-rect',
  name: 'Benchmark section',
  type: 'BENCH',
  A: 0.02,
  Iy: 8e-5,
  Iz: 1e-4,
  J: 2e-5,
  Zy: 8e-4,
  Zz: 1e-3,
};

export const BENCH_INTERNAL = {
  E: BENCH_MATERIAL.E * 1000,
  G: BENCH_MATERIAL.G * 1000,
  A: BENCH_SECTION.A,
  Iy: BENCH_SECTION.Iy,
  Iz: BENCH_SECTION.Iz,
  J: BENCH_SECTION.J,
};

export function createBenchmarkModel() {
  const model = createModel();
  model.materials = [{ ...BENCH_MATERIAL }];
  model.sections = [{ ...BENCH_SECTION }];
  model.loadCases = [{ id: 'D', name: 'Benchmark load', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: '1.0D', type: 'strength', factors: { D: 1 } }];
  return model;
}

export function createCantileverTipLoad({ L = 4, P = 12 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: L, y: 0, z: 0, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      tipUz: -(P * L ** 3) / (3 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz),
      baseReactionZ: P,
      totalLoadZ: -P,
    },
  };
}

export function createCantileverUdl({ L = 4, w = 5 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: L, y: 0, z: 0, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'W1', type: 'udl', member: 'M1', w, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      tipUz: -(w * L ** 4) / (8 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz),
      baseReactionZ: w * L,
      totalLoadZ: -(w * L),
    },
  };
}

export function createFixedFixedUdl({ L = 4, w = 5 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: L, y: 0, z: 0, support: 'fixed' },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'W1', type: 'udl', member: 'M1', w, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      midspanDeflection: (w * L ** 4) / (384 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz),
      endReactionZ: (w * L) / 2,
      totalLoadZ: -(w * L),
    },
  };
}

export function createAxialBar({ L = 3, P = 20 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: L, y: 0, z: 0, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P, dir: '+x', case: 'D' }];
  return {
    model,
    expected: {
      tipUx: (P * L) / (BENCH_INTERNAL.E * BENCH_INTERNAL.A),
      baseReactionX: -P,
      totalLoadX: P,
    },
  };
}

export function createVerticalAxialColumn({ L = 3, P = 20 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: L, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      topUz: -(P * L) / (BENCH_INTERNAL.E * BENCH_INTERNAL.A),
      baseReactionZ: P,
      totalLoadZ: -P,
    },
  };
}

export function createSimpleBeamUdl({ L = 6, w = 4 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'pin' },
    { id: 'N2', x: L, y: 0, z: 0, support: 'roller' },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'W1', type: 'udl', member: 'M1', w, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      endReactionZ: (w * L) / 2,
      totalLoadZ: -(w * L),
      maxDeflection: (5 * w * L ** 4) / (384 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz),
      maxMoment: (w * L ** 2) / 8,
      endMoment: 0,
    },
  };
}

export function createSimpleBeamCenterPoint({ L = 6, P = 18 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'pin' },
    { id: 'N2', x: L, y: 0, z: 0, support: 'roller' },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'P1', type: 'point', member: 'M1', P, t: 0.5, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      endReactionZ: P / 2,
      totalLoadZ: -P,
      maxDeflection: (P * L ** 3) / (48 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz),
      maxMoment: (P * L) / 4,
    },
  };
}

export function createProppedCantileverUdl({ L = 5, w = 4 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: L, y: 0, z: 0, support: 'roller' },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'W1', type: 'udl', member: 'M1', w, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      fixedReactionZ: (5 * w * L) / 8,
      rollerReactionZ: (3 * w * L) / 8,
      totalLoadZ: -(w * L),
      fixedEndMoment: (w * L ** 2) / 8,
    },
  };
}

export function createCustomFixedCantileverTipLoad({ L = 4, P = 12 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'custom', fix: [true, true, true, true, true, true] },
    { id: 'N2', x: L, y: 0, z: 0, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P, dir: '-z', case: 'D' }];
  return {
    model,
    expected: {
      tipUz: -(P * L ** 3) / (3 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz),
      baseReactionZ: P,
      totalLoadZ: -P,
    },
  };
}

export function createCantileverGlobalYUdl({ L = 4, w = 5 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: L, y: 0, z: 0, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'W1', type: 'udl', member: 'M1', w, dir: '-y', case: 'D' }];
  return {
    model,
    expected: {
      tipUy: -(w * L ** 4) / (8 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iy),
      baseReactionY: w * L,
      totalLoadY: -(w * L),
      maxMomentY: (w * L ** 2) / 2,
    },
  };
}

export function createCantileverTriangularUdl({ L = 4, w = 6, shape = 'asc' } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: L, y: 0, z: 0, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'W1', type: 'udl', member: 'M1', w, shape, dir: '-z', case: 'D' }];
  const resultant = (w * L) / 2;
  const centroidFromFixed = shape === 'asc' ? (2 * L) / 3 : L / 3;
  return {
    model,
    expected: {
      baseReactionZ: resultant,
      totalLoadZ: -resultant,
      baseMomentY: resultant * centroidFromFixed,
      maxMoment: resultant * centroidFromFixed,
    },
  };
}

export function createReleasedSimpleBeamUdl({ L = 6, w = 4 } = {}) {
  const fixture = createSimpleBeamUdl({ L, w });
  fixture.model.members[0].releases = { i: 'pin', j: 'pin' };
  fixture.model.members[0].rel1 = 'pin';
  fixture.model.members[0].rel2 = 'pin';
  return fixture;
}

export function createMechanismPinnedCantilever({ L = 4, P = 12 } = {}) {
  const model = createBenchmarkModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'pin' },
    { id: 'N2', x: L, y: 0, z: 0, support: null },
  ];
  model.members = [frameMember('M1', 'N1', 'N2')];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P, dir: '-z', case: 'D' }];
  return { model };
}

function frameMember(id, n1, n2) {
  return {
    id,
    type: 'frame',
    n1,
    n2,
    matId: BENCH_MATERIAL.id,
    secId: BENCH_SECTION.id,
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  };
}
