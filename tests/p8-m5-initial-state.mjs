import assert from 'node:assert/strict';
import { analysisRunRecordIntegrityHash } from '../src/core/analysisRunRecord.js';
import { stableHash } from '../src/core/stableHash.js';
import { buildLoadAudit, LOAD_AUDIT_CODES } from '../src/loads/loadAudit.js';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { buildMassSourceTrace } from '../src/loads/loadsV2.js';
import {
  buildPushoverLateralPattern,
  buildPushoverLoadSet,
} from '../src/nonlinear/pushover/loadPatterns.js';
import {
  buildNonlinearCaseDependencyGraph,
  markDependentNonlinearCasesStale,
  runNonlinearGravityPreload,
  validateNonlinearInitialStateDependency,
  validateVerifiedLinearInitialGuess,
} from '../src/nonlinear/workflow/initialState.js';

const loadSet = verifyLoadOwnership();
const pattern = verifyPatternVariants();
const gravity = await verifyGravityPreload();
const dependency = verifyDependencyContracts(gravity);
const linearGuess = verifyLinearGuessPolicy(gravity.domain);
const linkageGuards = verifyTamperedStateLinkage(gravity);
const loadAuditGuards = verifyLoadAuditGuards();

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-MEI-09', 'NL-MEI-10', 'NL-MEI-11', 'NL-MEI-12',
    'NL-MEI-13', 'NL-MEI-14', 'NL-MEI-15', 'NL-PUSH-01',
  ],
  constantLoads: loadSet.loadPattern.constantLoadCount,
  referenceLoads: loadSet.loadPattern.referenceLoadCount,
  referenceResultant: loadSet.referenceResultant,
  modalForceRatio: pattern.modalRatio,
  gravityDisplacement: gravity.result.stateStore.committed.q[0],
  gravityResidual: gravity.result.continuity.residualNorm,
  dependencyOrder: dependency.order,
  staleCount: dependency.staleCount,
  linearGuessImportedMaterialState: linearGuess.importedMaterialState,
  linkageGuardCodes: linkageGuards,
  loadAuditGuardCodes: loadAuditGuards,
}, null, 2));

function verifyLoadOwnership() {
  const model = portalModel();
  const analysisCase = {
    id: 'PUSH-X', kind: 'pushover',
    inputRefs: { gravityCombinationId: 'GRAV' },
    control: { direction: '+x', targetDisplacement: 0.05 },
  };
  const loadSet = buildPushoverLoadSet(model, analysisCase, {
    gravityCombinationId: 'GRAV',
    pattern: 'triangular',
    direction: '+x',
    referenceBaseShear: 10,
  });
  assert.equal(loadSet.gravity.factors.D, 1);
  assert.equal(loadSet.loadPattern.constantLoadCount, 1);
  assert.equal(loadSet.loadPattern.referenceLoadCount, 1);
  assert.equal(loadSet.ownership.duplicatePhysicalLoadCount, 0);
  assert.deepEqual(loadSet.ownership.selfWeight, { mode: 'explicit-only', ids: [] });
  close(loadSet.referenceResultant, 10, 1e-12, 'reference shear');
  assert.ok(loadSet.loadPattern.trace.find((row) => row.role === 'constant')?.source.case === 'D');
  assert.ok(loadSet.loadPattern.trace.find((row) => row.role === 'reference')?.source.case.startsWith('PUSH-'));

  const selfWeightModel = portalModel();
  selfWeightModel.loads = [];
  selfWeightModel.analysisSettings.includeSelfWeight = true;
  const selfWeight = buildPushoverLoadSet(selfWeightModel, analysisCase, {
    gravityCombinationId: 'GRAV',
    pattern: 'uniform',
    direction: '+x',
    referenceBaseShear: 10,
  });
  assert.equal(selfWeight.ownership.selfWeight.mode, 'solver-generated-once');
  assert.deepEqual(selfWeight.ownership.selfWeight.ids, ['sw_M1']);
  const base = buildCanonicalAnalysisDomain(selfWeightModel, { factors: { D: 1 } });
  assert.equal(selfWeight.domain.identity.massHash, base.identity.massHash, 'lateral loads must not mutate mass ownership');
  const duplicateSelfWeight = portalModel();
  duplicateSelfWeight.analysisSettings.includeSelfWeight = true;
  duplicateSelfWeight.loads.push({
    id: 'EXPLICIT-SW', type: 'udl', member: 'M1', w: 1, direction: [0, 0, -1],
    case: 'D', source: 'self-weight', physicalSourceKey: 'member:M1:self-weight',
  });
  assert.throws(() => buildPushoverLoadSet(duplicateSelfWeight, analysisCase, {
    gravityCombinationId: 'GRAV', pattern: 'uniform', direction: '+x', referenceBaseShear: 10,
  }), (error) => error.code === 'PUSHOVER_LOAD_AUDIT_INVALID');

  const massModel = portalModel();
  massModel.loadCases.push({ id: 'D-SW', type: 'dead', variant: 'self-weight' });
  massModel.loads = [{ id: 'SW-L', type: 'udl', member: 'M1', w: 7.85 * 0.02 * 9.80665, direction: [0, 0, -1], case: 'D-SW' }];
  const mass = buildMassSourceTrace(massModel, {
    combos: [{ case: 'D-SW', factor: 1 }], includeMemberMass: true, includeNodeMass: false,
  });
  close(mass.totalMass, 7.85 * 0.02 * 3, 1e-10, 'self-weight mass ownership');
  assert.ok(mass.skipped.some((row) => row.reason === 'self-weight-physical-mass-already-included'));
  return loadSet;
}

function verifyPatternVariants() {
  const model = {
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 0, y: 0, z: 3 },
      { id: 'N2', x: 4, y: 0, z: 6 },
    ],
  };
  const uniform = buildPushoverLateralPattern(model, { type: 'uniform', direction: '-y', referenceBaseShear: 12 });
  const triangular = buildPushoverLateralPattern(model, { type: 'triangular', direction: '+x', referenceBaseShear: 12 });
  const modal = buildPushoverLateralPattern(model, {
    type: 'modal', direction: '+x', referenceBaseShear: 12,
    modalVector: { N1: 1, N2: 2 }, modalSourceId: 'MODE-1',
  });
  const user = buildPushoverLateralPattern(model, {
    type: 'user', direction: '+x', referenceBaseShear: 12,
    userPattern: { N1: 2, N2: -1 }, userSourceId: 'USER-1',
  });
  close(uniform.normalizedResultant, 12, 1e-12, 'uniform resultant');
  close(triangular.loads[1].P / triangular.loads[0].P, 2, 1e-12, 'triangular height ratio');
  const modalRatio = modal.loads[1].P / modal.loads[0].P;
  close(modalRatio, 2, 1e-12, 'modal ratio');
  assert.ok(user.loads.some((load) => load.P < 0), 'signed user pattern must preserve a reverse nodal component');
  close(user.normalizedResultant, 12, 1e-12, 'user resultant');
  assert.ok(modal.sourceHash && user.sourceHash);
  return { modalRatio };
}

async function verifyGravityPreload() {
  const model = {
    schemaVersion: 5,
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix: [false, true, true, true, true, true] },
    ],
    members: [], materials: [], sections: [], loads: [], loadCases: [], loadCombinations: [],
    hingeProperties: [], nonlinearMaterials: [], nonlinearSections: [], linkProperties: [],
    timeHistoryFunctions: [], analysisStates: [], analysisSettings: { includeSelfWeight: false },
  };
  const domain = buildCanonicalAnalysisDomain(model);
  const kernel = createNonlinearElementContract({
    type: 'p8-m5-gravity-spring', dofCount: 2,
    evaluate({ trialKinematics }) {
      const q = Number(trialKinematics.uGlobal[1]) - Number(trialKinematics.uGlobal[0]);
      return {
        resistingForceGlobal: [-100 * q, 100 * q], tangentGlobal: [[100, -100], [-100, 100]],
        trialState: { q }, energies: { strain: 50 * q * q },
      };
    },
  });
  const elements = [{ id: 'S1', dofs: [0, 6], kernel, descriptor: { id: 'S1' } }];
  const constantFull = new Float64Array(domain.constraint.fullDofCount);
  const referenceFull = new Float64Array(domain.constraint.fullDofCount);
  constantFull[6] = 5;
  referenceFull[6] = 10;
  const pattern = {
    ok: true,
    constantFull,
    referenceFull,
    constantReduced: Float64Array.from([5]),
    referenceReduced: Float64Array.from([10]),
    trace: [
      { id: 'G', role: 'constant', source: { id: 'G', type: 'nodal', case: 'D' } },
      { id: 'P', role: 'reference', source: { id: 'P', type: 'nodal', case: 'PUSH' } },
    ],
    patternHash: 'combined-pattern',
  };
  const combinedAssembler = createEquilibriumAssembler({ domain, elements, loadPattern: pattern });
  const result = await runNonlinearGravityPreload({
    model, domain, elements, loadPattern: pattern, combinedAssembler,
    backend: createDenseReferenceBackend(), production: false,
    caseId: 'GRAVITY', runRecordId: 'RUN-GRAVITY', combinationId: 'GRAV',
    options: {
      initialStep: 0.5,
      maxStep: 0.5,
      newton: strictNewton(),
      equilibriumAbsolute: 1e-10,
      equilibriumRelative: 1e-10,
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  close(result.stateStore.committed.q[0], 0.05, 1e-10, 'gravity displacement');
  assert.equal(result.stateStore.committed.lambda, 0, 'gravity state must be rebased before lateral loading');
  assert.deepEqual(result.stateStore.committed.loadState, { gravityFactor: 1, lateralFactor: 0 });
  assert.equal(result.runRecord.result.accepted, true);
  assert.equal(result.analysisState.immutable, true);
  assert.equal(result.analysisState.status, 'accepted');
  assert.equal(result.checkpoint.integrityHash, result.runRecord.result.checkpointHash);
  assert.equal(result.initialGuess.importedMaterialState, false);
  return { result, domain };
}

function verifyDependencyContracts(gravity) {
  const cases = [
    { id: 'GRAVITY', kind: 'nonlinearStatic', initialState: { policy: 'zero' } },
    { id: 'PUSH', kind: 'pushover', initialState: { policy: 'nonlinear-case', caseId: 'GRAVITY', runRecordId: gravity.result.runRecord.id } },
  ];
  const graph = buildNonlinearCaseDependencyGraph(cases, [gravity.result.runRecord]);
  assert.equal(graph.ok, true, JSON.stringify(graph.errors));
  assert.deepEqual(graph.order, ['GRAVITY', 'PUSH']);
  const validation = validateNonlinearInitialStateDependency({
    analysisCase: cases[1],
    runRecords: [gravity.result.runRecord],
    analysisStates: [gravity.result.analysisState],
    checkpoint: gravity.result.checkpoint,
    domain: gravity.domain,
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const tamperedRun = structuredClone(gravity.result.runRecord);
  tamperedRun.result.combinationId = 'FORGED';
  const tamperedValidation = validateNonlinearInitialStateDependency({
    analysisCase: cases[1], runRecords: [tamperedRun],
    analysisStates: [gravity.result.analysisState], checkpoint: gravity.result.checkpoint,
    domain: gravity.domain,
  });
  assert.equal(tamperedValidation.ok, false);
  assert.ok(tamperedValidation.errors.some((row) => row.code === 'GRAVITY_PREDECESSOR_RUN_INTEGRITY_FAILED'));
  const forgedState = { ...gravity.result.analysisState, checkpointRef: 'FORGED' };
  const forgedStateValidation = validateNonlinearInitialStateDependency({
    analysisCase: cases[1], runRecords: [gravity.result.runRecord],
    analysisStates: [forgedState], checkpoint: gravity.result.checkpoint, domain: gravity.domain,
  });
  assert.equal(forgedStateValidation.ok, false);
  assert.ok(forgedStateValidation.errors.some((row) => row.code === 'GRAVITY_CHECKPOINT_STATE_LINK_MISMATCH'));

  const stale = markDependentNonlinearCasesStale(cases, 'GRAVITY', 'RUN-GRAVITY-NEW');
  assert.equal(stale.find((row) => row.id === 'PUSH').status, 'stale');
  const cycleRecords = [
    { id: 'RA', caseId: 'A' }, { id: 'RB', caseId: 'B' },
  ];
  const cycle = buildNonlinearCaseDependencyGraph([
    { id: 'A', initialState: { policy: 'nonlinear-case', caseId: 'B', runRecordId: 'RB' } },
    { id: 'B', initialState: { policy: 'nonlinear-case', caseId: 'A', runRecordId: 'RA' } },
  ], cycleRecords);
  assert.equal(cycle.ok, false);
  assert.ok(cycle.errors.some((row) => row.code === 'CASE_DEPENDENCY_CYCLE'));
  const failedRecord = withRunIntegrity({ ...clone(gravity.result.runRecord), runStatus: 'failed' });
  const failed = validateNonlinearInitialStateDependency({
    analysisCase: cases[1],
    runRecords: [failedRecord],
    analysisStates: [gravity.result.analysisState],
    checkpoint: gravity.result.checkpoint,
    domain: gravity.domain,
  });
  assert.equal(failed.ok, false);
  assert.ok(failed.errors.some((row) => row.code === 'GRAVITY_PREDECESSOR_NOT_ACCEPTED'));
  assert.ok(!failed.errors.some((row) => row.code === 'GRAVITY_PREDECESSOR_RUN_INTEGRITY_FAILED'));
  return { order: graph.order, staleCount: stale.filter((row) => row.status === 'stale').length };
}

function verifyLinearGuessPolicy(domain) {
  const guess = validateVerifiedLinearInitialGuess({
    q: [0.05],
    elementStates: { FORBIDDEN: { yielded: true } },
    domainHashes: domain.hashes,
    verification: { status: 'PASS' },
    qualification: 'verified',
    equilibrium: { ok: true, relativeResidual: 1e-12 },
    admissibleState: true,
  }, domain);
  assert.equal(guess.ok, true, JSON.stringify(guess.errors));
  assert.deepEqual(guess.elementStates, {}, 'linear result must never import material state');
  assert.equal(guess.importedMaterialState, false);
  const bad = validateVerifiedLinearInitialGuess({
    q: [0.05], domainHashes: { ...domain.hashes, propertyHash: 'changed' },
    verification: { status: 'PASS' }, equilibrium: { ok: true, relativeResidual: 0 }, admissibleState: true,
  }, domain);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((row) => row.code === 'LINEAR_INITIAL_GUESS_DOMAIN_MISMATCH'));
  const badEquilibrium = validateVerifiedLinearInitialGuess({
    q: [0.05], domainHashes: domain.hashes,
    verification: { status: 'PASS' }, equilibrium: { ok: true, relativeResidual: 1e-2 }, admissibleState: true,
  }, domain, { linearResidualTolerance: 1e-8 });
  assert.equal(badEquilibrium.ok, false);
  assert.deepEqual(badEquilibrium.errors.map((row) => row.code), ['LINEAR_INITIAL_GUESS_EQUILIBRIUM_FAILED']);
  const inadmissible = validateVerifiedLinearInitialGuess({
    q: [0.05], domainHashes: domain.hashes,
    verification: { status: 'PASS' }, equilibrium: { ok: true, relativeResidual: 0 }, admissibleState: false,
  }, domain);
  assert.equal(inadmissible.ok, false);
  assert.deepEqual(inadmissible.errors.map((row) => row.code), ['LINEAR_INITIAL_GUESS_INADMISSIBLE']);
  return guess;
}

function verifyTamperedStateLinkage(gravity) {
  const analysisCase = {
    id: 'PUSH', kind: 'pushover',
    initialState: { policy: 'nonlinear-case', caseId: 'GRAVITY', runRecordId: gravity.result.runRecord.id },
  };
  const validate = ({ runRecord = gravity.result.runRecord, analysisState = gravity.result.analysisState, checkpoint = gravity.result.checkpoint } = {}) => (
    validateNonlinearInitialStateDependency({
      analysisCase,
      runRecords: [runRecord],
      analysisStates: [analysisState],
      checkpoint,
      domain: gravity.domain,
    })
  );

  const tamperedRun = clone(gravity.result.runRecord);
  tamperedRun.result.summary.residualNorm += 1;
  const runIntegrity = validate({ runRecord: tamperedRun });
  assertDependencyError(runIntegrity, 'GRAVITY_PREDECESSOR_RUN_INTEGRITY_FAILED');

  const relinkedRun = clone(gravity.result.runRecord);
  relinkedRun.result.checkpointHash = 'checkpoint:other';
  const runLink = validate({ runRecord: withRunIntegrity(relinkedRun) });
  assertDependencyError(runLink, 'GRAVITY_CHECKPOINT_RUN_LINK_MISMATCH');
  assert.ok(!runLink.errors.some((row) => row.code === 'GRAVITY_PREDECESSOR_RUN_INTEGRITY_FAILED'));

  const tamperedCheckpoint = clone(gravity.result.checkpoint);
  tamperedCheckpoint.committed.q[0] += 0.001;
  const checkpointIntegrity = validate({ checkpoint: tamperedCheckpoint });
  assertDependencyError(checkpointIntegrity, 'STATE_CHECKPOINT_INTEGRITY_FAILED');

  const relinkedState = withStateIntegrity({
    ...clone(gravity.result.analysisState),
    checkpointRef: 'checkpoint:other',
  });
  const stateLink = validate({ analysisState: relinkedState });
  assertDependencyError(stateLink, 'GRAVITY_CHECKPOINT_STATE_LINK_MISMATCH');
  assert.ok(!stateLink.errors.some((row) => row.code === 'GRAVITY_PREDECESSOR_STATE_INTEGRITY_FAILED'));

  const committedMismatchState = withStateIntegrity({
    ...clone(gravity.result.analysisState),
    committedStateHash: 'committed:other',
  });
  const committedLink = validate({ analysisState: committedMismatchState });
  assertDependencyError(committedLink, 'GRAVITY_COMMITTED_STATE_LINK_MISMATCH');

  return [
    'GRAVITY_PREDECESSOR_RUN_INTEGRITY_FAILED',
    'GRAVITY_CHECKPOINT_RUN_LINK_MISMATCH',
    'STATE_CHECKPOINT_INTEGRITY_FAILED',
    'GRAVITY_CHECKPOINT_STATE_LINK_MISMATCH',
    'GRAVITY_COMMITTED_STATE_LINK_MISMATCH',
  ];
}

function verifyLoadAuditGuards() {
  const generatedConflict = portalModel();
  generatedConflict.loads[0].generatedKey = 'gravity:n1';
  generatedConflict.loads.push({
    ...clone(generatedConflict.loads[0]),
    id: 'GD-CONFLICT',
    P: 7,
  });
  const conflictAudit = buildLoadAudit(generatedConflict);
  assert.equal(conflictAudit.status, 'invalid');
  assert.equal(conflictAudit.byCode[LOAD_AUDIT_CODES.GENERATED_KEY_CONFLICT].length, 1);
  assertPushoverLoadAuditBlocked(generatedConflict, LOAD_AUDIT_CODES.GENERATED_KEY_CONFLICT);

  const doubleSelfWeight = portalModel();
  doubleSelfWeight.analysisSettings.includeSelfWeight = true;
  doubleSelfWeight.loads.push({
    id: 'EXPLICIT-SW', type: 'udl', member: 'M1', w: 1, dir: '-z', case: 'D',
    variant: 'self-weight', source: 'explicit-self-weight',
  });
  const selfWeightAudit = buildLoadAudit(doubleSelfWeight);
  assert.equal(selfWeightAudit.status, 'invalid');
  assert.equal(selfWeightAudit.byCode[LOAD_AUDIT_CODES.DOUBLE_SELF_WEIGHT].length, 1);
  assert.equal(selfWeightAudit.selfWeightCandidates[0].memberId, 'M1');
  assert.equal(selfWeightAudit.selfWeightCandidates[0].explicitSelfWeight, true);
  assertPushoverLoadAuditBlocked(doubleSelfWeight, LOAD_AUDIT_CODES.DOUBLE_SELF_WEIGHT);

  return [LOAD_AUDIT_CODES.GENERATED_KEY_CONFLICT, LOAD_AUDIT_CODES.DOUBLE_SELF_WEIGHT];
}

function assertPushoverLoadAuditBlocked(model, expectedAuditCode) {
  const analysisCase = {
    id: 'PUSH-X', kind: 'pushover',
    inputRefs: { gravityCombinationId: 'GRAV' },
    control: { direction: '+x', targetDisplacement: 0.05 },
  };
  assert.throws(
    () => buildPushoverLoadSet(model, analysisCase, {
      gravityCombinationId: 'GRAV', pattern: 'triangular', direction: '+x', referenceBaseShear: 10,
    }),
    (error) => error?.code === 'PUSHOVER_LOAD_AUDIT_INVALID'
      && error.message.includes(expectedAuditCode),
  );
}

function assertDependencyError(validation, expectedCode) {
  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some((row) => row.code === expectedCode),
    `${expectedCode} missing from ${JSON.stringify(validation.errors)}`,
  );
}

function withRunIntegrity(record) {
  const next = clone(record);
  next.integrityHash = analysisRunRecordIntegrityHash(next);
  return next;
}

function withStateIntegrity(state) {
  const next = clone(state);
  delete next.integrityHash;
  return { ...next, integrityHash: stableHash(next) };
}

function portalModel() {
  return {
    schemaVersion: 5,
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 0, y: 0, z: 3 },
    ],
    members: [{ id: 'M1', type: 'frame', behavior: 'frame', n1: 'N0', n2: 'N1', matId: 'MAT', secId: 'SEC' }],
    materials: [{ id: 'MAT', E: 2.0e8, G: 7.7e7, density: 7.85 }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 8e-5, Iz: 8e-5, J: 1e-5, Zy: 8e-4, Zz: 8e-4 }],
    loads: [{ id: 'GD', type: 'nodal', node: 'N1', P: 5, direction: [0, 0, -1], case: 'D' }],
    loadCases: [{ id: 'D', type: 'dead', name: 'Dead' }],
    loadCombinations: [{ id: 'GRAV', type: 'service', purpose: 'gravity-preload', factors: { D: 1 } }],
    hingeProperties: [], nonlinearMaterials: [], nonlinearSections: [], linkProperties: [],
    timeHistoryFunctions: [], analysisStates: [], analysisSettings: { includeSelfWeight: false },
  };
}

function strictNewton() {
  return {
    maxIterations: 10,
    pivotTolerance: 1e-14,
    convergence: {
      forceAbsolute: 1e-11, forceRelative: 1e-10,
      momentAbsolute: 1e-11, momentRelative: 1e-10,
      displacementAbsolute: 1e-12, displacementRelative: 1e-10,
      energyAbsolute: 1e-14, energyRelative: 1e-10,
    },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}

function clone(value) {
  return structuredClone(value);
}
