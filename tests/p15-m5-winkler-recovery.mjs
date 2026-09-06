import assert from 'node:assert/strict';
import {
  analyzeModel,
  createModel,
  createWinklerLineFoundationProperty,
} from '../src/index.js';
import {
  FOUNDATION_RECOVERY_VERSION,
  buildFoundationEndActionContract,
  buildWinklerLineLocalMatrix,
  evaluateStationEndClosure,
  foundationSpanLoad,
  recoverWinklerLineResult,
} from '../src/solver/foundation/index.js';
import { recoverMemberStations } from '../src/solver/linear3dRecovery.js';
import { analyzeAll } from '../src/solver/linear3d.js';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';

const KIP_TO_KN = 4.4482216152605;
const IN_TO_M = 0.0254;
const IN4_TO_M4 = IN_TO_M ** 4;
const IN2_TO_M2 = IN_TO_M ** 2;
const KSI_TO_MPA = 6.894757293168;

// Canonical additive contract and a mutation guard for the historical
// structuralEnd-only station start.
const length = 6;
const lineStiffness = 12;
const matrix = buildWinklerLineLocalMatrix({ length, localZ: lineStiffness });
const localDisplacements = new Array(12).fill(0);
localDisplacements[2] = 0.025;
localDisplacements[4] = -0.003;
localDisplacements[8] = 0.01;
localDisplacements[10] = 0.002;
const foundation = {
  active: true,
  propertyId: 'WF-CONTRACT',
  memberId: 'B-CONTRACT',
  behavior: 'linear-bilateral',
  length,
  lineStiffness: { localY: 0, localZ: lineStiffness },
  timoshenko: { enabled: false, phiY: 0, phiZ: 0 },
  matrix,
};
const zeroStructuralEnd = new Array(12).fill(0);
const action = buildFoundationEndActionContract({
  foundation,
  localDisplacements,
  structuralEnd: zeroStructuralEnd,
});
assert.equal(action.version, FOUNDATION_RECOVERY_VERSION);
assert.equal(action.equation, 'equilibriumEnd=structuralEnd+foundationEnd');
assertVectorClose(action.foundationEnd, matrixVector(matrix, localDisplacements), 1e-12, 'foundationEnd=Kf*d');
assertVectorClose(
  action.soilEquivalentNodalAction,
  action.foundationEnd.map((value) => -value),
  1e-12,
  'soil equivalent nodal action=-Kf*d',
);
assertVectorClose(action.equilibriumEnd, action.foundationEnd, 1e-12, 'equilibrium additive identity');

const spanLoads = [foundationSpanLoad(foundation, localDisplacements)];
const canonicalStations = recoverMemberStations(action.equilibriumEnd, spanLoads, length, 21);
const canonicalClosure = evaluateStationEndClosure(action.equilibriumEnd, canonicalStations);
assert.equal(canonicalClosure.status, 'PASS');
assert.ok(canonicalClosure.maximumRelativeResidual <= 1e-12);

const missingKfStations = recoverMemberStations(zeroStructuralEnd, spanLoads, length, 21);
const missingKfClosure = evaluateStationEndClosure(zeroStructuralEnd, missingKfStations);
assert.equal(missingKfClosure.status, 'FAIL', 'removing Kf*d from the station start must fail endpoint closure');
assert.ok(missingKfClosure.maximumRelativeResidual > 1e-4);

const foundationResult = recoverWinklerLineResult(foundation, localDisplacements, 21, {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
  flexibleStart: { x: 2, y: 3, z: 4 },
});
assert.equal(foundationResult.recoveryAudit.status, 'PASS');
assert.ok(foundationResult.recoveryAudit.maximumRelativeResidual <= 1e-10);
assert.ok(foundationResult.recoveryAudit.global);
assertVectorClose(foundationResult.foundationEndActionLocal, action.foundationEnd, 1e-12, 'foundation result end action');
assertVectorClose(
  foundationResult.equivalentActionLocal,
  action.foundationEnd.map((value) => -value),
  1e-12,
  'soil equivalent action=-Kf*d',
);

// SB7 production path: center displacement and the signed center element-end
// moment are checked independently of the benchmark harness probe.
const sb7Coarse = solveSb7(8);
assert.equal(sb7Coarse.ok, true, JSON.stringify(sb7Coarse.validation?.errors || sb7Coarse, null, 2));
const sb7 = solveSb7(32);
assert.equal(sb7.ok, true, JSON.stringify(sb7.validation?.errors || sb7, null, 2));
const sb7Result = sb7.byCombo.D_ONLY;
const sb7Sparse = solveSb7(32, { useSparseSolver: true, sparseThreshold: 0 });
assert.equal(sb7Sparse.ok, true, JSON.stringify(sb7Sparse.validation?.errors || sb7Sparse, null, 2));
const sb7SparseResult = sb7Sparse.byCombo.D_ONLY;
assert.equal(sb7Result.ok, true, sb7Result.reason);
const centerDeflectionIn = sb7Result.disp.N16[2] / IN_TO_M;
const leftCenter = sb7Result.memberResults.M16;
const rightCenter = sb7Result.memberResults.M17;
const leftCenterMomentKipIn = leftCenter.structuralEnd[11] / (KIP_TO_KN * IN_TO_M);
const rightCenterMomentKipIn = -rightCenter.structuralEnd[5] / (KIP_TO_KN * IN_TO_M);
const recoveredCenterMomentKipIn = Math.max(leftCenter.Mzmax, rightCenter.Mzmax) / (KIP_TO_KN * IN_TO_M);
const referenceDeflectionIn = -0.089333;
const referenceMomentKipIn = 17697.995034;
assertRelativeError(centerDeflectionIn, referenceDeflectionIn, 0.001, 'SB7 center displacement');
assertRelativeError(Math.abs(leftCenterMomentKipIn), referenceMomentKipIn, 0.001, 'SB7 left signed endpoint moment');
assertRelativeError(Math.abs(rightCenterMomentKipIn), referenceMomentKipIn, 0.001, 'SB7 right signed endpoint moment');
assertRelativeError(recoveredCenterMomentKipIn, referenceMomentKipIn, 0.001, 'SB7 recovered station moment');
close(leftCenterMomentKipIn, rightCenterMomentKipIn, 1e-10, 'SB7 signed center action continuity');
close(sb7SparseResult.disp.N16[2], sb7Result.disp.N16[2], 1e-10, 'SB7 dense/sparse center displacement');
close(
  sb7SparseResult.memberResults.M16.Mzmax,
  leftCenter.Mzmax,
  1e-10,
  'SB7 dense/sparse center moment',
);

// The production sparse policy must remain qualified after the model crosses
// the default sparse threshold; this is the release mesh used by Phase 15.
const sb7FineDense = solveSb7(64, { useSparseSolver: false, sparseThreshold: 1000000 });
const sb7FineSparse = solveSb7(64, { useSparseSolver: true, sparseThreshold: 0 });
assert.equal(sb7FineDense.ok, true, JSON.stringify(sb7FineDense.validation?.errors || sb7FineDense, null, 2));
assert.equal(sb7FineSparse.ok, true, JSON.stringify(sb7FineSparse.validation?.errors || sb7FineSparse, null, 2));
const sb7FineDenseResult = sb7FineDense.byCombo.D_ONLY;
const sb7FineSparseResult = sb7FineSparse.byCombo.D_ONLY;
assert.equal(sb7FineDenseResult.ok, true, sb7FineDenseResult.reason);
assert.equal(sb7FineSparseResult.ok, true, sb7FineSparseResult.reason);
close(sb7FineSparseResult.disp.N32[2], sb7FineDenseResult.disp.N32[2], 1e-9, 'SB7 64-element dense/sparse displacement');
close(sb7FineSparseResult.memberResults.M32.Mzmax, sb7FineDenseResult.memberResults.M32.Mzmax, 1e-8, 'SB7 64-element dense/sparse moment');
assert.ok(sb7FineSparseResult.summary.equilibriumResidual <= 1e-8, `SB7 sparse equilibrium residual ${sb7FineSparseResult.summary.equilibriumResidual}`);

for (const memberResult of Object.values(sb7Result.memberResults)) {
  assert.deepEqual(memberResult.end, memberResult.structuralEnd, 'legacy end field must remain structuralEnd');
  assert.equal(memberResult.endActionContract.version, FOUNDATION_RECOVERY_VERSION);
  assert.equal(memberResult.stationEndClosure.status, 'PASS');
  assert.ok(memberResult.stationEndClosure.maximumRelativeResidual <= 1e-10);
  assertVectorClose(
    memberResult.equilibriumEnd,
    memberResult.structuralEnd.map((value, index) => value + memberResult.foundationEnd[index]),
    1e-12,
    'member additive action identity',
  );
}

// Direct P-Delta consumes the same owner and preserves the public structural
// `end` field while exposing the equilibrium action used for nodal closure.
const pdelta = analyzeModel(pdeltaModel());
assert.equal(pdelta.ok, true, JSON.stringify(pdelta.validation?.errors || pdelta, null, 2));
assert.equal(pdelta.pDelta?.ok, true, pdelta.pDelta?.reason);
const secondOrderMember = pdelta.byCombo.D_ONLY.memberResults.C1;
assert.equal(secondOrderMember.endActionContract.version, FOUNDATION_RECOVERY_VERSION);
assert.deepEqual(secondOrderMember.end, secondOrderMember.structuralEnd);
assert.equal(secondOrderMember.stationEndClosure.status, 'PASS');
assertVectorClose(
  secondOrderMember.equilibriumEnd,
  secondOrderMember.structuralEnd.map((value, index) => value + secondOrderMember.foundationEnd[index]),
  1e-12,
  'P-Delta additive action identity',
);

const limitModel = pdeltaModel();
limitModel.loads = limitModel.loads.filter((load) => load.id === 'PX');
const linearLimit = analyzeAll(limitModel, { D: 1 });
const directLimit = runSecondOrderPDelta(limitModel, { D: 1 }, { loadSteps: 2 });
assert.equal(linearLimit.ok, true, linearLimit.reason);
assert.equal(directLimit.ok, true, directLimit.reason);
const linearLimitMember = linearLimit.memberResults.C1;
const directLimitMember = directLimit.result.memberResults.C1;
close(directLimit.result.disp.T[0], linearLimit.disp.T[0], 1e-8, 'P=0 foundation displacement parity');
for (const quantity of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
  assertVectorClose(
    directLimitMember[quantity],
    linearLimitMember[quantity],
    1e-8,
    `P=0 foundation ${quantity} station parity`,
  );
}
assertVectorClose(
  directLimitMember.equilibriumEnd,
  linearLimitMember.equilibriumEnd,
  1e-8,
  'P=0 foundation equilibriumEnd parity',
);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M5',
  contractVersion: FOUNDATION_RECOVERY_VERSION,
  mutationResidual: missingKfClosure.maximumRelativeResidual,
  canonicalResidual: canonicalClosure.maximumRelativeResidual,
  sb7: {
    coarseElements: 8,
    coarseCenterDeflectionIn: sb7Coarse.byCombo.D_ONLY.disp.N4[2] / IN_TO_M,
    elements: 32,
    centerDeflectionIn,
    leftCenterMomentKipIn,
    rightCenterMomentKipIn,
    recoveredCenterMomentKipIn,
    denseSparseDisplacementDifference: sb7SparseResult.disp.N16[2] - sb7Result.disp.N16[2],
    denseSparseMomentDifference: sb7SparseResult.memberResults.M16.Mzmax - leftCenter.Mzmax,
    fineMeshDenseSparseDisplacementDifference: sb7FineSparseResult.disp.N32[2] - sb7FineDenseResult.disp.N32[2],
    fineMeshDenseSparseMomentDifference: sb7FineSparseResult.memberResults.M32.Mzmax - sb7FineDenseResult.memberResults.M32.Mzmax,
    fineMeshSparseEquilibriumResidual: sb7FineSparseResult.summary.equilibriumResidual,
    maximumStationClosureResidual: Math.max(
      ...Object.values(sb7Result.memberResults).map((row) => row.stationEndClosure.maximumRelativeResidual),
    ),
  },
  pDeltaStationClosureResidual: secondOrderMember.stationEndClosure.maximumRelativeResidual,
  pDeltaLimitDisplacementDifference: directLimit.result.disp.T[0] - linearLimit.disp.T[0],
}, null, 2));

function solveSb7(count, solverSettings = {}) {
  const L = 180 * IN_TO_M;
  const E = 3600 * KSI_TO_MPA;
  const I = 139968 * IN4_TO_M4;
  const A = 36 * 36 * IN2_TO_M2;
  const k = 16.6667 * KIP_TO_KN / (IN_TO_M ** 2);
  const model = createModel();
  model.materials = [{ id: 'MAT', version: 1, name: 'SB7 concrete', E, G: E / 2.4, density: 0, Fy: 1e9, Fu: 1e9 }];
  model.sections = [{ id: 'SEC', version: 1, name: 'SB7 section', type: 'direct', A, Iy: I, Iz: I, J: 2 * I, Ay: A * 5 / 6, Az: A * 5 / 6, Zy: 1, Zz: 1 }];
  model.nodes = Array.from({ length: count + 1 }, (_item, index) => ({
    id: `N${index}`,
    x: L * index / count,
    y: 0,
    z: 0,
    ...(index === 0
      ? { support: 'custom', fix: [true, true, true, true, false, false] }
      : index === count
        ? { support: 'custom', fix: [false, true, true, false, false, false] }
        : {}),
  }));
  model.members = Array.from({ length: count }, (_item, index) => ({
    id: `M${index + 1}`,
    type: 'frame',
    n1: `N${index}`,
    n2: `N${index + 1}`,
    matId: 'MAT',
    secId: 'SEC',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
    foundationId: 'WF',
  }));
  model.foundationProperties = [createWinklerLineFoundationProperty({
    id: 'WF',
    name: 'SB7 Winkler line',
    localY: { lineStiffness: k },
    localZ: { lineStiffness: k },
  })];
  model.loadCases = [{ id: 'D', name: 'Benchmark load', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: '1.0D', type: 'service', factors: { D: 1 } }];
  model.loads = [{ id: 'P', type: 'nodal', node: `N${count / 2}`, P: 500 * KIP_TO_KN, dir: '-z', case: 'D' }];
  model.analysisSettings = {
    ...model.analysisSettings,
    includeSelfWeight: false,
    shearDeformation: false,
    memberStations: 41,
    ...solverSettings,
  };
  return analyzeModel(model);
}

function pdeltaModel() {
  const model = createModel();
  model.nodes = [
    { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'T', x: 0, y: 0, z: 4, support: null },
  ];
  model.members = [{
    id: 'C1', type: 'frame', n1: 'B', n2: 'T', matId: 'steel', secId: 'h300',
    releases: { i: 'rigid', j: 'rigid' }, foundationId: 'WF',
  }];
  model.foundationProperties = [createWinklerLineFoundationProperty({
    id: 'WF', localY: { lineStiffness: 5000 }, localZ: { lineStiffness: 5000 },
  })];
  model.loadCases = [{ id: 'D', name: 'D', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: 'D', factors: { D: 1 } }];
  model.loads = [
    { id: 'PZ', type: 'nodal', node: 'T', P: 200, dir: '-z', case: 'D' },
    { id: 'PX', type: 'nodal', node: 'T', P: 5, dir: '+x', case: 'D' },
  ];
  model.analysisSettings = {
    ...model.analysisSettings,
    includeSelfWeight: false,
    pDeltaMethod: 'direct',
    pDeltaLoadSteps: 3,
    pDeltaMaxIterations: 12,
    pDeltaTolerance: 1e-8,
  };
  return model;
}

function matrixVector(matrixValue, vector) {
  return matrixValue.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function assertVectorClose(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => close(value, expected[index], tolerance, `${label}[${index}]`));
}

function assertRelativeError(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected) / Math.max(1e-15, Math.abs(expected));
  assert.ok(error <= tolerance, `${label}: ${actual} vs ${expected}; relative error ${error}`);
}

function close(actual, expected, tolerance, label) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(Math.abs(actual - expected) / scale <= tolerance, `${label}: ${actual} vs ${expected}`);
}
