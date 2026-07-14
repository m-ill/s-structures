import assert from 'node:assert/strict';
import {
  buildPhase8PilotArtifact,
  getPhase8PilotPackage,
  listPhase8PilotPackages,
  summarizePhase8PilotArtifacts,
  validatePhase8PilotArtifact,
} from '../src/index.js';

const pilots = listPhase8PilotPackages();
assert.equal(pilots.length, 5);
assert.deepEqual(pilots.map((row) => row.id), ['PILOT-ST-01', 'PILOT-ST-02', 'PILOT-ST-03', 'PILOT-RC-01', 'PILOT-DYN-01']);
assert.equal(new Set(pilots.map((row) => row.packageHash)).size, 5);
assert.equal(new Set(pilots.map((row) => row.inputHash)).size, 5);

for (const pilot of pilots) {
  assert.equal(getPhase8PilotPackage(pilot.id).packageHash, pilot.packageHash);
  assert.ok(pilot.model.nodes.length > 0);
  assert.ok(pilot.model.members.length > 0);
  assert.ok(pilot.analysisCases.length > 0);
  assert.ok(pilot.workflow.length >= 4);
  assert.equal(pilot.reproducibility.fallbackPolicy, 'forbidden');
  for (const analysisCase of pilot.analysisCases) {
    const controlNodeId = analysisCase.control?.nodeId;
    if (controlNodeId) assert.ok(pilot.model.nodes.some((node) => node.id === controlNodeId), `${pilot.id}:${controlNodeId}`);
  }
}

const artifacts = pilots.map((pilot) => candidateArtifact(pilot));
for (let index = 0; index < artifacts.length; index += 1) {
  const validation = validatePhase8PilotArtifact(artifacts[index], pilots[index]);
  assert.equal(validation.ok, true, `${pilots[index].id}: ${validation.errors.join(', ')}`);
  assert.equal(artifacts[index].qualification.status, 'candidate');
  assert.equal(artifacts[index].qualification.designBlocked, true);
}
const summary = summarizePhase8PilotArtifacts(artifacts);
assert.equal(summary.status, 'PASS');
assert.equal(summary.pilotCount, 5);
assert.equal(summary.verifiedPilotCount, 0);
assert.equal(summary.independentlyQualified, false);
assert.equal(summary.releaseReady, false);
assert.ok(summary.results.every((row) => row.status === 'PASS'));

const tampered = structuredClone(artifacts[0]);
tampered.execution.summary = { changed: true };
assert.equal(validatePhase8PilotArtifact(tampered, pilots[0]).ok, false);

console.log(JSON.stringify({
  ok: true,
  pilotIds: pilots.map((row) => row.id),
  packageHashes: pilots.map((row) => row.packageHash),
  summaryHash: summary.summaryHash,
  releaseReady: summary.releaseReady,
}, null, 2));

function candidateArtifact(pilot) {
  const blocked = pilot.expected.executionStatus === 'blocked';
  const resultChannels = Object.fromEntries(pilot.requiredResultFields.map((field) => [field, true]));
  return buildPhase8PilotArtifact(pilot, {
    generatedAt: '2026-07-14T22:00:00+09:00',
    sourceRevision: 'p8-m11-test',
    execution: blocked ? {
      status: 'blocked',
      engineId: pilot.analysisCases[0].engineId,
      reason: pilot.expected.reason,
      designBlocked: true,
      fallbackUsed: false,
      resultChannels,
      summary: { blockingCode: pilot.expected.reason },
    } : {
      status: 'completed',
      engineId: pilot.analysisCases[0].engineId,
      terminationReason: pilot.expected.acceptedTermination[0],
      resultHash: `result-${pilot.id}`,
      runRecordId: `run-${pilot.id}`,
      checkpointHash: `checkpoint-${pilot.id}`,
      fallbackUsed: false,
      designBlocked: true,
      resultChannels,
      summary: { fixture: pilot.id },
    },
    report: {
      path: `docs/verification/phase8/pilots/${pilot.id}.md`,
      reportHash: `report-${pilot.id}`,
      resultHash: blocked ? null : `result-${pilot.id}`,
    },
  });
}
