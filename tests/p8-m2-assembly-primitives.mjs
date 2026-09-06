import assert from 'node:assert/strict';
import { buildFixedEndLoad } from '../src/loads/fixedEnd/index.js';
import {
  condenseReleasedDofs,
  localK12,
  matTrans,
  matVec,
} from '../src/solver/linear3dElement.js';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import {
  buildConstraintSystem,
  expandConstraintDisplacements,
  reduceConstraintMatrix,
} from '../src/solver/domain/constraintSystem.js';
import { validateNonlinearElementResponse } from '../src/nonlinear/core/elementContract.js';
import {
  assembleReducedTangent,
  buildReducedSparsePattern,
  typedCscMatVec,
  typedCscToCsr,
} from '../src/nonlinear/equilibrium/typedSparse.js';
import { buildNonlinearLoadPattern } from '../src/nonlinear/equilibrium/externalLoads.js';
import {
  buildLinearElasticElementEntries,
  createLinearElasticElementKernel,
} from '../src/nonlinear/equilibrium/linearElasticElement.js';

const EPS = 2e-10;

const sparse = verifyTypedReducedAssembly();
const loads = verifyExternalLoads();
const released = verifyReleaseAndOffsetConsistency();
const element = verifyLinearElasticKernel(released.domain);
verifyStrictFailures(loads.domain);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-EQ-01', 'NL-EQ-02', 'NL-EQ-03', 'NL-EQ-04'],
  patternHash: sparse.pattern.patternHash,
  reducedDofs: sparse.constraint.reducedDofCount,
  fixedEndTypes: loads.memberLoadTypes,
  releasedDofs: released.descriptor.releases.localDofs,
  strainEnergy: element.energies.strainEnergy,
}, null, 2));

function verifyTypedReducedAssembly() {
  const nodes = [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 3 },
    { id: 'C', x: 0, y: 3, z: 3 },
  ];
  const diaphragm = [{ id: 'D1', type: 'rigid', nodeIds: ['B', 'C'], center: { x: 2, y: 1.5, z: 3 } }];
  const constraint = buildConstraintSystem(nodes, diaphragm);
  assert.equal(constraint.ok, true, constraint.reason);
  const elementDofs = [
    [...Array(6).keys(), ...Array.from({ length: 6 }, (_value, index) => 6 + index)],
    [...Array(6).keys(), ...Array.from({ length: 6 }, (_value, index) => 12 + index)],
  ];
  const elementMatrices = elementDofs.map((dofs, elementIndex) => dofs.map((_row, i) => (
    dofs.map((_column, j) => {
      if (i === j) return 30 + elementIndex * 7 + i;
      return (i + j + elementIndex) % 4 === 0 ? 0.2 * (1 + Math.min(i, j)) : 0;
    })
  )));
  const pattern = buildReducedSparsePattern(constraint, elementDofs);
  const cached = buildReducedSparsePattern(constraint, elementDofs);
  assert.equal(cached, pattern, 'identical symbolic input must reuse the cached pattern');
  assert.ok(pattern.colPtr instanceof Int32Array);
  assert.ok(pattern.rowIdx instanceof Int32Array);
  assert.ok(pattern.values instanceof Float64Array);
  assert.ok(pattern.elementScatters.every((row) => (
    row.matrixIndices instanceof Int32Array
      && row.valueIndices instanceof Int32Array
      && row.coefficients instanceof Float64Array
  )));

  const tangent = assembleReducedTangent(pattern, elementMatrices);
  assert.ok(tangent.values instanceof Float64Array);
  const full = zeros(constraint.fullDofCount, constraint.fullDofCount);
  elementDofs.forEach((dofs, elementIndex) => {
    dofs.forEach((row, i) => dofs.forEach((column, j) => {
      full[row][column] += elementMatrices[elementIndex][i][j];
    }));
  });
  const expected = reduceConstraintMatrix(constraint, full);
  assertMatrixClose(cscToDense(tangent), expected, EPS, 'typed scatter versus dense T^T K T');

  const vector = Float64Array.from({ length: constraint.reducedDofCount }, (_value, index) => Math.sin(index + 0.25));
  const product = typedCscMatVec(tangent, vector);
  assertVectorClose(product, denseMatVec(expected, vector), EPS, 'typed CSC matvec');
  const csr = typedCscToCsr(tangent);
  assert.ok(csr.rowPtr instanceof Int32Array);
  assert.ok(csr.colIdx instanceof Int32Array);
  assert.ok(csr.values instanceof Float64Array);
  assertVectorClose(csrMatVec(csr, vector), product, EPS, 'CSC to CSR parity');
  return { constraint, pattern, tangent };
}

function verifyExternalLoads() {
  const memberLoads = [
    { id: 'U', type: 'udl', member: 'M1', w: 2.5, dir: '-z', case: 'D' },
    { id: 'UP', type: 'udl-partial', member: 'M1', w: 3.2, from: 0.15, to: 0.8, dir: '-z', case: 'D' },
    { id: 'TR', type: 'trapezoid', member: 'M1', w1: 1.1, w2: 4.3, from: 0, to: 1, dir: '-z', case: 'D' },
    { id: 'P', type: 'point', member: 'M1', P: 6.4, at: 0.35, dir: '-z', case: 'D' },
    { id: 'MM', type: 'mmoment', member: 'M1', M: 7.5, at: 0.45, axis: 'z', case: 'D' },
    { id: 'TEMP', type: 'temperature', member: 'M1', dT: 18, alpha: 1.2e-5, case: 'D' },
    { id: 'TG', type: 'tgradient', member: 'M1', dTtop: 22, dTbot: 4, h: 0.5, alpha: 1.2e-5, case: 'D' },
  ];
  const model = baseModel({
    releases: { i: 'rigid', j: 'rigid' },
    loads: [
      { id: 'NF', type: 'nodal', node: 'B', P: 9, direction: [1, 2, -1], case: 'D' },
      { id: 'NM', type: 'nmoment', node: 'B', M: 5, axis: 'y', coordinate: 'global', case: 'D' },
      ...memberLoads,
    ],
  });
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  const pattern = buildNonlinearLoadPattern(domain, { constantLoadIds: ['NM'] });
  assert.equal(pattern.ok, true, pattern.reason);
  assert.ok(pattern.constantFull instanceof Float64Array);
  assert.ok(pattern.referenceFull instanceof Float64Array);
  assert.ok(pattern.constantReduced instanceof Float64Array);
  assert.ok(pattern.referenceReduced instanceof Float64Array);
  assert.equal(pattern.constantLoadCount, 1);
  assert.equal(pattern.referenceLoadCount, model.loads.length - 1);
  assert.equal(pattern.trace.find((row) => row.id === 'NM').role, 'constant');
  close(pattern.constantFull[6 + 4], 5, EPS, 'nodal moment assembly');

  const descriptor = domain.elements[0];
  const axes = descriptorAxes(descriptor);
  const md = descriptorMemberData(descriptor);
  const memberTraces = pattern.trace.filter((row) => row.target?.memberId === 'M1');
  assert.equal(memberTraces.length, memberLoads.length);
  for (const trace of memberTraces) {
    const source = domain.loads.find((load) => load.id === trace.id);
    const expected = buildFixedEndLoad(source, axes, md);
    assert.equal(expected.ok, true, `${trace.id}: ${expected.reason}`);
    assertVectorClose(trace.fixedEnd.fe, expected.fe, EPS, `${trace.id} fixed-end equivalent nodal parity`);
    assertVectorClose(trace.fixedEnd.q0, expected.q0, EPS, `${trace.id} fixed-end force parity`);
  }

  const q = Float64Array.from({ length: domain.constraint.reducedDofCount }, (_value, index) => Math.cos(index + 0.4) * 0.003);
  const u = expandConstraintDisplacements(domain.constraint, q);
  close(
    dot(u, addVectors(pattern.constantFull, pattern.referenceFull)),
    dot(q, addVectors(pattern.constantReduced, pattern.referenceReduced)),
    EPS,
    'external load reduction virtual work',
  );
  return { domain, pattern, memberLoadTypes: memberTraces.map((row) => row.type).sort() };
}

function verifyReleaseAndOffsetConsistency() {
  const load = { id: 'REL-U', type: 'udl', member: 'M1', w: 4, dir: '-z', case: 'D' };
  const model = baseModel({
    releases: { i: 'rigid', j: 'pin' },
    endOffset: { i: 0.4, j: 0.25, rigidFactor: 1 },
    loads: [load],
  });
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  const descriptor = domain.elements[0];
  const pattern = buildNonlinearLoadPattern(domain);
  assert.equal(pattern.ok, true, pattern.reason);
  const source = domain.loads.find((row) => row.id === 'REL-U');
  const axes = descriptorAxes(descriptor);
  const md = descriptorMemberData(descriptor);
  const fixedEnd = buildFixedEndLoad(source, axes, md);
  assert.equal(fixedEnd.ok, true, fixedEnd.reason);
  const material = descriptor.propertySnapshot.effectiveMaterial;
  const section = descriptor.propertySnapshot.effectiveSection;
  const local = localK12(material.E, material.G, section.A, section.Iy, section.Iz, section.J, axes.L);
  const condensed = condenseReleasedDofs(local, fixedEnd.q0, descriptor.releases.localDofs);
  assert.ok(condensed, 'released fixed-end force must condense');
  const localEquivalent = condensed.f0C.map((value) => -value);
  const expected = matVec(matTrans(descriptor.geometry.transform), localEquivalent);
  const actual = descriptor.fullDofs.map((dof) => pattern.referenceFull[dof]);
  assertVectorClose(actual, expected, EPS, 'release/offset equivalent nodal load');
  for (const dof of descriptor.releases.localDofs) close(localEquivalent[dof], 0, EPS, `released local load DOF ${dof}`);
  const trace = pattern.trace[0];
  assert.equal(trace.method, 'fixed-end-release-condensed-offset-transform');
  assert.deepEqual(trace.offsets, descriptor.geometry.offsets);

  const withoutOffset = buildCanonicalAnalysisDomain(baseModel({
    releases: { i: 'rigid', j: 'pin' },
    loads: [load],
  }));
  const withoutOffsetPattern = buildNonlinearLoadPattern(withoutOffset);
  assert.notDeepEqual(
    Array.from(pattern.referenceFull),
    Array.from(withoutOffsetPattern.referenceFull),
    'rigid-arm offsets must affect equivalent nodal forces/moments',
  );
  return { domain, descriptor, pattern };
}

function verifyLinearElasticKernel(domain) {
  const descriptor = domain.elements[0];
  const kernel = createLinearElasticElementKernel(descriptor);
  const uGlobal = Array.from({ length: 12 }, (_value, index) => Math.sin(index + 1) * 1e-3);
  const response = kernel.evaluate({
    committedState: { arbitraryHistory: 17 },
    trialKinematics: { uGlobal },
    mode: 'static',
  });
  const second = kernel.evaluate({
    committedState: { arbitraryHistory: -99 },
    trialKinematics: { uGlobal },
    mode: 'initial-tangent',
  });
  const validation = validateNonlinearElementResponse(response, 12);
  assert.equal(validation.ok, true, validation.errors.join(', '));
  assert.deepEqual(response.Pint, response.resistingForceGlobal);
  assert.deepEqual(response.Kt, response.tangentGlobal);
  assert.deepEqual(second.resistingForceGlobal, response.resistingForceGlobal, 'linear response must ignore committed state');
  assert.deepEqual(second.tangentGlobal, response.tangentGlobal, 'linear tangent must be state independent');
  assert.equal(response.trialState.stateIndependent, true);
  assert.ok(Number.isFinite(response.energies.strainEnergy));
  assert.ok(response.energies.strainEnergy >= -EPS);
  assertVectorClose(response.resistingForceGlobal, denseMatVec(response.tangentGlobal, uGlobal), EPS, 'Pint = Kt u');
  close(response.energies.strainEnergy, 0.5 * dot(uGlobal, response.resistingForceGlobal), EPS, 'strain energy');
  for (const dof of descriptor.releases.localDofs) {
    close(response.localResponse.resistingForce[dof], 0, EPS, `released elastic force DOF ${dof}`);
  }
  const entries = buildLinearElasticElementEntries(domain);
  assert.equal(entries.length, domain.elements.length);
  assert.ok(entries[0].dofs instanceof Int32Array);
  assert.equal(entries[0].kernel.type, kernel.type);
  assert.throws(
    () => kernel.evaluate({ trialKinematics: { uGlobal: [0, 1] } }),
    (error) => error.code === 'LINEAR_ELASTIC_KINEMATICS_SIZE',
  );
  return response;
}

function verifyStrictFailures(domain) {
  const unknown = buildNonlinearLoadPattern({
    ...domain,
    loads: [{ id: 'BAD-TYPE', type: 'not-a-load', node: 'B', P: 1 }],
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'UNKNOWN_EXTERNAL_LOAD_TYPE');
  assert.equal(unknown.failClosed, true);
  assert.ok([...unknown.constantFull, ...unknown.referenceFull].every((value) => value === 0));

  const invalidDirection = buildNonlinearLoadPattern({
    ...domain,
    loads: [{ id: 'BAD-DIR', type: 'nodal', node: 'B', P: 1, direction: [1, Number.NaN, 0] }],
  });
  assert.equal(invalidDirection.ok, false);
  assert.equal(invalidDirection.failClosed, true);
  assert.ok(invalidDirection.reason.includes('DIRECTION'));

  const invalidTemperature = buildNonlinearLoadPattern({
    ...domain,
    loads: [{ id: 'BAD-TEMP', type: 'temperature', member: 'M1' }],
  });
  assert.equal(invalidTemperature.ok, false);
  assert.equal(invalidTemperature.reason, 'NONFINITE_LOAD_COMPONENT');
}

function baseModel({ releases, endOffset, loads }) {
  return {
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 5, y: 0, z: 0 },
    ],
    members: [{
      id: 'M1',
      type: 'frame',
      n1: 'A',
      n2: 'B',
      matId: 'MAT',
      secId: 'SEC',
      releases,
      ...(endOffset ? { endOffset } : {}),
    }],
    materials: [{ id: 'MAT', E: 200_000, G: 80_000, nu: 0.25, density: 0, alpha: 1.2e-5 }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 1.2e-4, J: 2e-5 }],
    loads,
    loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
    loadCombinations: [{ id: 'D1', name: 'Dead', factors: { D: 1 } }],
    analysisSettings: { includeSelfWeight: false, validateBeforeSolve: false },
  };
}

function descriptorAxes(descriptor) {
  return {
    L: descriptor.geometry.length,
    grossL: descriptor.geometry.grossLength,
    x: descriptor.geometry.axes.x,
    y: descriptor.geometry.axes.y,
    z: descriptor.geometry.axes.z,
    offset: descriptor.geometry.offsets,
  };
}

function descriptorMemberData(descriptor) {
  return {
    ax: descriptorAxes(descriptor),
    T: descriptor.geometry.transform,
    dof: descriptor.fullDofs,
    rel: descriptor.releases.localDofs,
    material: descriptor.propertySnapshot.effectiveMaterial,
    section: descriptor.propertySnapshot.effectiveSection,
  };
}

function cscToDense(matrix) {
  const out = zeros(matrix.rowCount, matrix.colCount);
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let index = matrix.colPtr[column]; index < matrix.colPtr[column + 1]; index += 1) {
      out[matrix.rowIdx[index]][column] = matrix.values[index];
    }
  }
  return out;
}

function csrMatVec(matrix, vector) {
  const out = new Float64Array(matrix.rowCount);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index += 1) {
      out[row] += matrix.values[index] * vector[matrix.colIdx[index]];
    }
  }
  return out;
}

function denseMatVec(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * Number(vector[index]), 0));
}

function addVectors(a, b) {
  return Array.from(a, (value, index) => Number(value) + Number(b[index]));
}

function zeros(rows, columns) {
  return Array.from({ length: rows }, () => new Array(columns).fill(0));
}

function dot(a, b) {
  return Array.from(a).reduce((sum, value, index) => sum + Number(value) * Number(b[index]), 0);
}

function assertMatrixClose(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: row count`);
  actual.forEach((row, i) => assertVectorClose(row, expected[i], tolerance, `${label}[${i}]`));
}

function assertVectorClose(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  for (let index = 0; index < actual.length; index += 1) {
    close(actual[index], expected[index], tolerance, `${label}[${index}]`);
  }
}

function close(actual, expected, tolerance, label) {
  const scale = Math.max(1, Math.abs(Number(actual)), Math.abs(Number(expected)));
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= tolerance * scale,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
