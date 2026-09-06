import assert from 'node:assert/strict';
import {
  XVAL_CASE_IDS,
  buildXvalReferenceArtifact,
  buildM1XvalReferenceArtifacts,
  createXvalCaseDefinitions,
  extractXvalResultPath,
  modelHash,
  runXvalCase,
  runXvalSuite,
  xvalScalarRelativeError,
} from '../verification/index.js';
import {
  listAnalysisCriteriaKeys,
  resolveCriterion,
} from '../src/index.js';

const cases = createXvalCaseDefinitions();
assert.deepEqual(cases.map((item) => item.caseId), XVAL_CASE_IDS);
assert.ok(cases.every((item) => typeof item.execute === 'function'), 'all M1 fixtures must have a future reference executor');
const pendingDryRuns = Object.fromEntries(cases.slice(2).map((definition) => [
  definition.caseId,
  definition.execute(definition.model),
]));
for (const caseId of ['XV-03', 'XV-04', 'XV-05', 'XV-06', 'XV-07', 'XV-08']) {
  assert.equal(pendingDryRuns[caseId].analysis.ok, true, `${caseId} live executor static analysis must remain available`);
}
assert.equal(pendingDryRuns['XV-05'].dynamics.ok, true);
assert.equal(pendingDryRuns['XV-06'].buckling.status, 'available');
assert.equal(pendingDryRuns['XV-08'].dynamics.ok, true);
const artifacts = buildM1XvalReferenceArtifacts(cases);
const report = runXvalSuite({ cases, artifacts });

assert.equal(report.status, 'OK');
assert.equal(report.milestoneGate.ok, true);
assert.deepEqual(report.milestoneGate.requiredCaseIds, ['XV-01', 'XV-02']);
assert.equal(report.summary.total, 8);
assert.equal(report.summary.pass, 2);
assert.equal(report.summary.pending, 6);
assert.equal(report.summary.blocked, 0);
assert.equal(report.summary.ng, 0);
assert.deepEqual(report.duplicateArtifactCaseIds, []);
assert.equal(report.releaseQualification.externallyCrossValidated, false);
assert.deepEqual(report.releaseQualification.sourceIneligibleCaseIds, ['XV-02']);
assert.deepEqual(report.releaseQualification.missingGreenCaseIds, [
  'XV-03', 'XV-04', 'XV-05', 'XV-06', 'XV-07', 'XV-08', 'XV-09', 'XV-10',
]);
assert.deepEqual(report.releaseQualification.pendingCaseIds, ['XV-03', 'XV-04', 'XV-05', 'XV-06', 'XV-07', 'XV-08']);
assert.match(report.artifactHash, /^[0-9a-f]{24}$/);

for (const result of report.cases.slice(0, 2)) {
  assert.equal(result.status, 'PASS', `${result.caseId}: ${JSON.stringify(result.records, null, 2)}`);
  assert.ok(result.records.length >= 4);
  for (const record of result.records) {
    assert.equal(record.status, 'OK');
    assert.equal(typeof record.reference, 'number');
    assert.equal(typeof record.computed, 'number');
    assert.equal(typeof record.relError, 'number');
    assert.equal(typeof record.tolerance, 'number');
    assert.match(record.modelHash, /^[0-9a-f]{16}$/);
    assert.ok(record.solverVersion);
  }
}

const xv01Max = Math.max(...report.cases[0].records.map((record) => record.relError));
const xv02Max = Math.max(...report.cases[1].records.map((record) => record.relError));
assert.ok(xv01Max < 1e-12, `XV-01 max error ${xv01Max}`);
assert.ok(xv02Max < 1e-8, `XV-02 max error ${xv02Max}`);

assert.deepEqual(extractXvalResultPath({ a: [{ b: 3 }] }, 'a[0].b'), {
  ok: true,
  value: 3,
  path: 'a[0].b',
  segments: ['a', '0', 'b'],
});
assert.equal(extractXvalResultPath({ a: {} }, 'a.missing').code, 'XVAL_PATH_MISSING');
assert.equal(extractXvalResultPath({}, '__proto__.polluted').code, 'XVAL_PATH_FORBIDDEN');
assert.deepEqual(extractXvalResultPath({ disp: { 'N.1 with space': [4] } }, 'disp["N.1 with space"][0]'), {
  ok: true,
  value: 4,
  path: 'disp["N.1 with space"][0]',
  segments: ['disp', 'N.1 with space', '0'],
});
assert.equal(extractXvalResultPath({}, 'disp["constructor"]').code, 'XVAL_PATH_FORBIDDEN');
assert.equal(extractXvalResultPath({ a: [] }, 'a[0]').code, 'XVAL_PATH_MISSING');
assert.equal(xvalScalarRelativeError(2, 1), 1);
assert.equal(xvalScalarRelativeError(2, 0, 10), 0.2, 'scale must be maxed with absolute reference');
assert.equal(xvalScalarRelativeError(2, 1, 10), 0.1, 'explicit scale must not replace a larger reference denominator');

let executionCount = 0;
const live = cases[0];
const wrongHashArtifact = buildXvalReferenceArtifact({
  ...artifactInput(live, 'ready', artifacts[0].quantities),
  model: { modelHash: '0000000000000000', unitSystem: live.model.unitSystem },
});
const hashBlocked = runXvalCase({
  definition: { ...live, execute: () => { executionCount += 1; return {}; } },
  artifact: wrongHashArtifact,
});
assert.equal(hashBlocked.status, 'BLOCKED');
assert.equal(hashBlocked.reason, 'XVAL_MODEL_HASH_MISMATCH');
assert.equal(executionCount, 0, 'hash mismatch must fail before solver execution');

const alternateUnits = structuredClone(live.model.unitSystem);
alternateUnits.display.displacement = alternateUnits.display.displacement === 'mm' ? 'm' : 'mm';
const unitArtifact = buildXvalReferenceArtifact({
  ...artifactInput(live, 'ready', artifacts[0].quantities),
  model: { modelHash: modelHash(live.model), unitSystem: alternateUnits },
});
const unitBlocked = runXvalCase({ definition: live, artifact: unitArtifact });
assert.equal(unitBlocked.status, 'BLOCKED');
assert.equal(unitBlocked.reason, 'XVAL_UNIT_SYSTEM_MISMATCH');

const missingPathArtifact = buildXvalReferenceArtifact(artifactInput(live, 'ready', [{
  path: 'static.notThere', value: 1, unit: '1', tolerance: 1e-3,
}]));
const missingPath = runXvalCase({ definition: live, artifact: missingPathArtifact });
assert.equal(missingPath.status, 'NG');
assert.equal(missingPath.records[0].details.extractionCode, 'XVAL_PATH_MISSING');

const boundaryDefinition = {
  caseId: 'XV-01',
  model: live.model,
  execute: () => ({ metric: 2 }),
};
const boundaryArtifact = buildXvalReferenceArtifact(artifactInput(boundaryDefinition, 'ready', [{
  path: 'metric', value: 1, unit: '1', tolerance: 1,
}]));
assert.equal(runXvalCase({ definition: boundaryDefinition, artifact: boundaryArtifact }).status, 'PASS');

const quotedPathDefinition = {
  caseId: 'XV-01',
  model: live.model,
  execute: () => ({ disp: { 'N.1 with space': [4] } }),
};
const quotedPathArtifact = buildXvalReferenceArtifact(artifactInput(quotedPathDefinition, 'ready', [{
  path: 'disp["N.1 with space"][0]', value: 4, unit: 'm', tolerance: 1e-6,
}]));
assert.equal(runXvalCase({ definition: quotedPathDefinition, artifact: quotedPathArtifact }).status, 'PASS');

const mutatingModel = structuredClone(live.model);
const mutatingDefinition = {
  caseId: 'XV-01',
  model: mutatingModel,
  execute(model) {
    model.nodes[0].x += 1;
    return { metric: 1 };
  },
};
const mutatingArtifact = buildXvalReferenceArtifact(artifactInput(mutatingDefinition, 'ready', [{
  path: 'metric', value: 1, unit: '1', tolerance: 1e-3,
}]));
const mutationBlocked = runXvalCase({ definition: mutatingDefinition, artifact: mutatingArtifact });
assert.equal(mutationBlocked.status, 'BLOCKED');
assert.equal(mutationBlocked.reason, 'XVAL_EXECUTOR_MUTATED_MODEL');
assert.equal(mutatingModel.nodes[0].x, live.model.nodes[0].x, 'executor must receive an isolated model clone');

const mutableArtifact = structuredClone(buildXvalReferenceArtifact(artifactInput(live, 'ready', [{
  path: 'metric', value: 2, unit: '1', tolerance: 1e-6,
}])));
const originalArtifactHash = mutableArtifact.artifactHash;
const originalSourceVersion = mutableArtifact.sourceVersion;
const artifactMutatingDefinition = {
  caseId: 'XV-01',
  model: live.model,
  execute() {
    mutableArtifact.source = 'opensees';
    mutableArtifact.sourceVersion = 'forged-after-validation';
    mutableArtifact.quantities[0].value = 1;
    mutableArtifact.artifactHash = 'f'.repeat(24);
    return { metric: 1 };
  },
};
const artifactMutationResult = runXvalCase({
  definition: artifactMutatingDefinition,
  artifact: mutableArtifact,
});
assert.equal(artifactMutationResult.status, 'NG', 'artifact mutation after validation must not forge PASS');
assert.equal(artifactMutationResult.referenceSource, 'hand-calc');
assert.equal(artifactMutationResult.referenceArtifactHash, originalArtifactHash);
assert.equal(artifactMutationResult.records[0].reference, 2);
assert.equal(artifactMutationResult.records[0].referenceSource, `hand-calc:${originalSourceVersion}`);
assert.equal(artifactMutationResult.records[0].details.referenceArtifactHash, originalArtifactHash);

const throwingThenDefinition = {
  ...live,
  execute() {
    return {
      metric: 1,
      get then() {
        throw new Error('then getter boom');
      },
    };
  },
};
const throwingThenArtifact = buildXvalReferenceArtifact(artifactInput(throwingThenDefinition, 'ready', [{
  path: 'metric', value: 1, unit: '1', tolerance: 1e-3,
}]));
const throwingThenBlocked = runXvalCase({ definition: throwingThenDefinition, artifact: throwingThenArtifact });
assert.equal(throwingThenBlocked.status, 'BLOCKED');
assert.equal(throwingThenBlocked.reason, 'XVAL_RESULT_EXTRACTION_FAILED');
assert.match(throwingThenBlocked.details.message, /then getter boom/);

const duplicateArtifacts = runXvalSuite({ cases, artifacts: [...artifacts, artifacts[0]] });
assert.equal(duplicateArtifacts.status, 'NG');
assert.equal(duplicateArtifacts.milestoneGate.ok, false);
assert.deepEqual(duplicateArtifacts.duplicateArtifactCaseIds, ['XV-01']);
assert.equal(duplicateArtifacts.cases[0].status, 'BLOCKED');
assert.equal(duplicateArtifacts.cases[0].reason, 'XVAL_REFERENCE_ARTIFACT_DUPLICATE');

const keys = listAnalysisCriteriaKeys();
for (const key of [
  'criteria.solver.pivotWarn',
  'criteria.xval.displacementReaction',
  'criteria.xval.memberForce',
  'criteria.xval.period',
  'criteria.xval.massParticipation',
  'criteria.xval.rsaBaseShear',
  'criteria.xval.pdelta',
  'criteria.xval.buckling',
]) assert.ok(keys.includes(key), `missing analysis criterion ${key}`);
assert.equal(resolveCriterion(live.model, 'xval.displacementReaction'), 1e-4);
assert.equal(resolveCriterion(live.model, 'xval.memberForce'), 1e-3);
assert.equal(resolveCriterion(live.model, 'xval.period'), 1e-3);
assert.equal(resolveCriterion(live.model, 'xval.massParticipation'), 1e-3);

console.log(JSON.stringify({
  ok: true,
  artifactHash: report.artifactHash,
  xv01MaxRelError: xv01Max,
  xv02MaxRelError: xv02Max,
  pass: report.summary.pass,
  pending: report.summary.pending,
  externallyCrossValidated: report.releaseQualification.externallyCrossValidated,
}, null, 2));

function artifactInput(definition, status, quantities) {
  return {
    status,
    caseId: definition.caseId,
    source: 'hand-calc',
    sourceVersion: status === 'ready' ? `${definition.caseId.toLowerCase()}-closed-form-v1` : 'owner-reference-pending',
    date: '2026-07-20',
    author: 'Phase 10 verification team',
    model: {
      modelHash: modelHash(definition.model),
      unitSystem: definition.model.unitSystem,
    },
    quantities,
    provenance: {
      inputFiles: [`tests/fixtures/phase10/xval/${definition.caseId}.model.json`],
      notes: status === 'ready'
        ? 'Independent closed-form calculation; production solver output is not used as the reference.'
        : 'Model fixture is committed; owner-supplied external reference values are pending.',
    },
  };
}
