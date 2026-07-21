import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildM1XvalReferenceArtifacts,
  createXvalCaseDefinitions,
  modelHash,
  parseXvalReferenceArtifact,
  runPathologicalModelBattery,
  runXvalSuite,
  xv01HandCalculation,
  xv02HandCalculation,
} from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';

const evidenceRoot = path.resolve('reports', 'validation-evidence', 'phase10');
const xvalRoot = path.join(evidenceRoot, 'xv');
const modelRoot = path.resolve('tests', 'fixtures', 'phase10', 'xval');
const cases = createXvalCaseDefinitions();
const liveArtifacts = buildM1XvalReferenceArtifacts(cases);

for (const [index, definition] of cases.entries()) {
  const fixture = JSON.parse(await readFile(path.join(modelRoot, `${definition.caseId}.model.json`), 'utf8'));
  assert.deepEqual(fixture, definition.model, `${definition.caseId} committed model fixture is stale`);
  assert.equal(modelHash(fixture), modelHash(definition.model));
  const suffix = liveArtifacts[index].status === 'ready' ? 'hand-calc' : 'pending-reference';
  const committedArtifact = parseXvalReferenceArtifact(
    await readFile(path.join(xvalRoot, `${definition.caseId}-${suffix}.json`), 'utf8'),
  );
  assert.deepEqual(committedArtifact, liveArtifacts[index], `${definition.caseId} reference artifact is stale`);
}

const committedCrossValidation = await readJson('p10-m1-cross-validation.json');
const liveCrossValidation = runXvalSuite({ cases, artifacts: liveArtifacts });
assert.deepEqual(committedCrossValidation, liveCrossValidation, 'cross-validation aggregate evidence is stale');
assert.equal(committedCrossValidation.status, 'OK');
assert.equal(committedCrossValidation.milestoneGate.ok, true);
assert.equal(committedCrossValidation.releaseQualification.externallyCrossValidated, false);
assert.deepEqual(committedCrossValidation.releaseQualification.sourceIneligibleCaseIds, ['XV-02']);
assert.deepEqual(committedCrossValidation.releaseQualification.missingGreenCaseIds, [
  'XV-03', 'XV-04', 'XV-05', 'XV-06', 'XV-07', 'XV-08', 'XV-09', 'XV-10',
]);
assert.deepEqual(committedCrossValidation.releaseQualification.pendingCaseIds, [
  'XV-03', 'XV-04', 'XV-05', 'XV-06', 'XV-07', 'XV-08',
]);

const committedBattery = await readJson('p10-m1-pathological-battery.json');
const liveBattery = runPathologicalModelBattery();
assert.deepEqual(committedBattery, liveBattery, 'pathological battery aggregate evidence is stale');
assert.equal(committedBattery.status, 'OK');
assert.equal(committedBattery.summary.pass, 10);

const handCalculations = await readJson('p10-m1-hand-calculations.json');
const { artifactHash, ...handCalculationCore } = handCalculations;
assert.equal(artifactHash, stableHash(handCalculationCore).slice(0, 24));
assert.equal(handCalculations.status, 'OK');
assert.deepEqual(Object.keys(handCalculations.cases), ['XV-01', 'XV-02']);
assert.deepEqual(handCalculations.cases, {
  'XV-01': xv01HandCalculation(),
  'XV-02': xv02HandCalculation(),
}, 'committed hand-calculation evidence is stale');

console.log(JSON.stringify({
  ok: true,
  crossValidationArtifactHash: committedCrossValidation.artifactHash,
  pathologicalBatteryArtifactHash: committedBattery.artifactHash,
  handCalculationArtifactHash: handCalculations.artifactHash,
  modelFixtureCount: cases.length,
  referenceArtifactCount: liveArtifacts.length,
}, null, 2));

async function readJson(file) {
  return JSON.parse(await readFile(path.join(evidenceRoot, file), 'utf8'));
}
