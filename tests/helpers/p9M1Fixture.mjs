export function p9M1CantileverModel() {
  return {
    schemaVersion: 5,
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 0, y: 0, z: 3 },
    ],
    members: [{
      id: 'M1',
      type: 'frame',
      n1: 'N1',
      n2: 'N2',
      matId: 'MAT',
      secId: 'SEC',
      releases: { i: 'rigid', j: 'rigid' },
    }],
    materials: [{ id: 'MAT', E: 200000, G: 76923, Fy: 250, density: 0, allow: { fb: 150, ft: 150, fc: 150, fv: 90 } }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 8e-5, J: 1e-5, Zy: 5e-4, Zz: 5e-4 }],
    loads: [{ id: 'H', type: 'nodal', node: 'N2', P: 10, dir: '+x', case: 'W' }],
    loadCases: [{ id: 'W', name: 'Wind', type: 'wind' }],
    loadCombinations: [{ id: 'C1', name: 'Wind', type: 'service', factors: { W: 1 } }],
    analysisSettings: { responseSpectrum: { enabled: false }, validateBeforeSolve: false },
  };
}

export function p9M1Backend(operations = ['elementBatch']) {
  return Object.freeze({
    id: 'p9-m1-test-backend',
    version: 'test-v1',
    buildHash: 'a'.repeat(64),
    family: 'reference',
    executionTarget: 'cpu-js',
    numericPrecision: 'f64',
    precisionModes: ['f64'],
    deterministic: true,
    production: false,
    qualification: 'test-only',
    matrixClasses: ['spd', 'general'],
    operations,
    preflight: () => ({ ok: true }),
  });
}
