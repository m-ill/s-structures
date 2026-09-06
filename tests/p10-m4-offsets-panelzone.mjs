import assert from 'node:assert/strict';
import { createModel } from '../src/core/model.js';
import { materialOf, sectionOf } from '../src/core/catalogs.js';
import { buildElementDescriptors } from '../src/solver/domain/elementDescriptor.js';
import { analyzeModel } from '../src/solver/linear3d.js';
import { assembleStiffness3D, memberKinematics } from '../src/solver/linear3dAssembly.js';
import { matTrans, matVec, memberAxes, transform12 } from '../src/solver/linear3dElement.js';
import { buildPDeltaTangentStiffness } from '../src/solver/pdelta/tangentStiffness.js';
import { stableHash } from '../src/core/stableHash.js';

const material = { id: 'MAT', version: 1, E: 200000000, G: 76923076.92307693, Fy: 355000, Fu: 490000, density: 0 };
const section = { id: 'SEC', version: 1, type: 'direct', A: 0.02, Iy: 8e-5, Iz: 2e-4, J: 1e-5, H: 0.6, B: 0.3 };
const a = { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' };
const b = { id: 'B', x: 4, y: 0, z: 0 };
const member = {
  id: 'M1', type: 'frame', n1: 'A', n2: 'B', matId: 'MAT', secId: 'SEC',
  localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
};

// EL-O01: an explicit zero vector must be identical to the legacy no-offset path.
const baseKinematics = memberKinematics(member, a, b, section);
const zeroKinematics = memberKinematics({
  ...member,
  endOffset: {
    i: { dx: 0, dy: 0, dz: 0 },
    j: { dx: 0, dy: 0, dz: 0 },
    frame: 'global',
  },
}, a, b, section);
assert.equal(baseKinematics.ok, true);
assert.equal(zeroKinematics.ok, true);
const legacyTransform = transform12(memberAxes(a, b, member.localAxis));
const zeroRegressionError = maxRelativeMatrixError(zeroKinematics.T, legacyTransform);
assert.ok(zeroRegressionError < 1e-12, `EL-O01 zero-offset regression ${zeroRegressionError}`);

// Legacy numeric offsets retain the previous axial shortening convention.
const legacy = memberKinematics({ ...member, endOffset: { i: 0.4, j: 0.25, rigidFactor: 1 } }, a, b, section);
assert.equal(legacy.ok, true);
assert.ok(Math.abs(legacy.ax.L - 3.35) < 1e-14);
assert.deepEqual(legacy.ax.offset, { i: 0.4, j: 0.25, rigidFactor: 1 });

// EL-O02: T_off must transfer axial force through a transverse rigid arm as N*e.
const eccentricity = 0.35;
const eccentric = memberKinematics({
  ...member,
  endOffset: {
    i: { dx: 0, dy: eccentricity, dz: 0 },
    j: { dx: 0, dy: eccentricity, dz: 0 },
    frame: 'global',
  },
}, a, b, section);
assert.equal(eccentric.ok, true, eccentric.message);
const axialForce = 240;
const localEnd = [-axialForce, 0, 0, 0, 0, 0, axialForce, 0, 0, 0, 0, 0];
const jointEnd = matVec(matTrans(eccentric.T), localEnd);
const expectedMoment = axialForce * eccentricity;
const eccentricMomentError = Math.max(
  relativeError(jointEnd[5], expectedMoment),
  relativeError(jointEnd[11], -expectedMoment),
);
assert.ok(eccentricMomentError < 1e-8, `EL-O02 N*e transfer ${eccentricMomentError}`);

// Insertion points resolve to the same rigid-arm mechanism.
const insertion = memberKinematics({ ...member, insertionPoint: 'top-center' }, a, b, section);
assert.equal(insertion.ok, true, insertion.message);
assert.ok(insertion.vectors.insertionLocal.every((value, index) => (
  Math.abs(value - [0, -section.H / 2, 0][index]) < 1e-14
)));
assert.ok(Math.abs(insertion.ax.L - 4) < 1e-14, 'equal insertion offsets preserve flexible length');

// EL-O03: automatic panel-zone stiffness is exactly equivalent to a manual M3 spring.
const panelZone = { tp: 0.012, db: 0.55, dc: 0.6 };
const automaticModel = modelOf({
  nodes: [a, { ...b, panelZone }],
  members: [member],
  loads: [],
});
const panelStiffness = materialOf(automaticModel, 'MAT').G * panelZone.tp * panelZone.db * panelZone.dc;
const manualModel = modelOf({
  nodes: [a, b],
  members: [{ ...member, releases: { i: 'rigid', j: 'rigid', spring: { rzJ: panelStiffness } } }],
  loads: [],
});
const automaticAssembly = assemble(automaticModel);
const manualAssembly = assemble(manualModel);
assert.equal(automaticAssembly.ok, true, automaticAssembly.reason);
assert.equal(manualAssembly.ok, true, manualAssembly.reason);
const panelZoneEquivalenceError = maxRelativeMatrixError(automaticAssembly.K, manualAssembly.K);
assert.ok(panelZoneEquivalenceError < 1e-9, `EL-O03 panel-zone equivalence ${panelZoneEquivalenceError}`);
const automaticDescriptor = buildElementDescriptors(automaticModel).descriptors[0];
const automaticSpring = automaticDescriptor.partialFixity.entries.find((entry) => entry.key === 'rzJ');
assert.equal(automaticSpring.source, 'panelZone');
assert.ok(relativeError(automaticSpring.stiffness, panelStiffness) < 1e-14);

// Product solve exposes the rigid-arm transfer audit and keeps P-Delta on the same T_off path.
const productModel = modelOf({
  nodes: [a, b],
  members: [{
    ...member,
    endOffset: {
      i: { dx: 0, dy: 0.2, dz: 0 },
      j: { dx: 0, dy: 0.2, dz: 0 },
      frame: 'global',
    },
  }],
  loads: [{ id: 'P', type: 'nodal', node: 'B', P: 10, dir: '-z', case: 'D' }],
});
const solved = analyzeModel(productModel);
assert.equal(solved.ok, true, solved.reason);
const combo = solved.byCombo.C1;
assert.equal(combo.ok, true, combo.reason);
assert.equal(combo.summary.offsetEquilibrium.status, 'PASS');
assert.ok(combo.summary.offsetEquilibrium.maximumResidual <= 1e-10);
assert.equal(combo.memberResults.M1.offset.vector3d, true);
const pdelta = buildPDeltaTangentStiffness(productModel, { axialForces: { M1: -100 } });
assert.equal(pdelta.ok, true, pdelta.reason);
assert.ok(pdelta.geometric.memberData.M1.global.flat().every(Number.isFinite));

export const M4_VERIFICATION_SNAPSHOT = Object.freeze({
  ok: true,
  version: 'p10-m4-offsets-panelzone',
  metrics: {
    zeroRegressionError,
    eccentricMomentError,
    panelZoneEquivalenceError,
    offsetEquilibriumResidual: combo.summary.offsetEquilibrium.maximumResidual,
  },
  panelZone: { stiffness: panelStiffness, source: automaticSpring.source },
  tolerances: {
    zeroRegression: 1e-12,
    eccentricMoment: 1e-8,
    panelZoneEquivalence: 1e-9,
    offsetEquilibrium: 1e-10,
  },
  modelHashes: {
    zero: stableHash({ member, endOffset: zeroKinematics.ax.offset }).slice(0, 16),
    eccentric: stableHash({ member, eccentricity }).slice(0, 16),
    panelZone: stableHash({ member, panelZone, panelStiffness }).slice(0, 16),
    product: stableHash(productModel).slice(0, 16),
  },
});

console.log(JSON.stringify(M4_VERIFICATION_SNAPSHOT, null, 2));

function modelOf({ nodes, members, loads }) {
  return createModel({
    materials: [material],
    sections: [section],
    nodes,
    members,
    loads,
    loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
    loadCombinations: [{ id: 'C1', name: 'D', type: 'service', factors: { D: 1 } }],
    analysisSettings: { validateBeforeSolve: true, shearDeformation: false },
  });
}

function assemble(model) {
  return assembleStiffness3D(model.nodes, model.members, {
    model,
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
  });
}

function maxRelativeMatrixError(actual, expected) {
  let error = 0;
  for (let row = 0; row < expected.length; row += 1) {
    for (let column = 0; column < expected[row].length; column += 1) {
      error = Math.max(error, relativeError(actual[row][column], expected[row][column]));
    }
  }
  return error;
}

function relativeError(actual, expected) {
  return Math.abs(Number(actual) - Number(expected)) / Math.max(1, Math.abs(Number(expected)));
}
