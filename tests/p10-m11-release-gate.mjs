import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  buildPhase10ProductIntegrationContract,
  buildPhase10ReleaseGate,
  measurePhase10LargeModelPerformance,
  validatePhase10ReleaseGate,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';
import { findFeature, resolveFeatureEnabled } from '../src/platform/featureCatalog.js';

const evidenceDir = path.resolve('reports', 'validation-evidence', 'phase10');
const evidenceFiles = (await readdir(evidenceDir)).filter((name) => /^p10-m(?:[0-9]|10)-.*\.json$/.test(name));
const milestoneEvidence = await Promise.all(evidenceFiles.map(async (name) => JSON.parse(await readFile(path.join(evidenceDir, name), 'utf8'))));
const xval = JSON.parse(await readFile(path.join(evidenceDir, 'p10-m1-cross-validation.json'), 'utf8'));
milestoneEvidence.push({ ...xval, milestone: 'P10-M1' });
const integration = buildPhase10ProductIntegrationContract();
const performance = measurePhase10LargeModelPerformance({ elementCount: 120, maxElapsedMs: 10_000 });

assert.equal(integration.features.length, 9);
assert.ok(integration.features.every((row) => row.surfaces.includes('agent')));
assert.equal(performance.status, 'PASS');
assert.equal(performance.cpuF64ReferencePassed, true);
assert.equal(performance.gpuF32ShadowPassed, true);
assert.equal(performance.nativeWebGpuQualified, false);

const candidate = buildPhase10ReleaseGate({
  generatedAt: '2026-07-22T23:59:59.000+09:00', sourceRevision: 'a871573+p10-m11-worktree',
  xval, milestoneEvidence, integration, performance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: false,
});
assert.deepEqual(validatePhase10ReleaseGate(candidate), { ok: true, errors: [] });
assert.equal(candidate.implementation.status, 'complete');
assert.equal(candidate.release.allowed, false);
assert.equal(candidate.release.externallyCrossValidated, false);
assert.ok(candidate.blockers.includes('P10_M11_EXTERNAL_CROSS_VALIDATION_REQUIRED'));
assert.ok(candidate.blockers.includes('P10_M11_NATIVE_WEBGPU_DEVICE_REQUIRED'));
assert.deepEqual(candidate.xval.missingGreenCaseIds, ['XV-03', 'XV-04', 'XV-05', 'XV-06', 'XV-07', 'XV-08', 'XV-09', 'XV-10']);

const greenXval = {
  cases: Array.from({ length: 10 }, (_, index) => ({ caseId: `XV-${String(index + 1).padStart(2, '0')}`, status: 'PASS', referenceSource: index ? 'independent-solver' : 'hand-calc' })),
  releaseQualification: { externallyCrossValidated: true },
};
const releasable = buildPhase10ReleaseGate({
  generatedAt: candidate.generatedAt, sourceRevision: candidate.sourceRevision,
  xval: greenXval, milestoneEvidence, integration, performance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: true,
});
assert.deepEqual(validatePhase10ReleaseGate(releasable), { ok: true, errors: [] });
assert.equal(releasable.release.status, 'externally-cross-validated');
assert.equal(releasable.release.allowed, true);

const catalogFeature = findFeature('phase10-advanced-elastic');
assert.equal(catalogFeature.control.key, 'feature.phase10-advanced-elastic');
assert.equal(resolveFeatureEnabled(catalogFeature.id), true);
assert.equal(resolveFeatureEnabled(catalogFeature.id, { [catalogFeature.control.key]: false }), false);

const target = { S: { model: null } };
const api = createIndexAgentApi(target, null);
assert.ok(api.getCapabilities().readApis.includes('getPhase10ReleaseStatus'));
const agentStatus = api.getPhase10ReleaseStatus({ xval, milestoneEvidence, performance });
assert.equal(agentStatus.release.allowed, false);
assert.equal(agentStatus.integrationContractHash, integration.contractHash);
const committed = JSON.parse(await readFile(path.join(evidenceDir, 'p10-m11-release-gate.json'), 'utf8'));
assert.deepEqual(validatePhase10ReleaseGate(committed), { ok: true, errors: [] });
assert.equal(committed.implementation.status, 'complete');
assert.equal(committed.release.status, 'blocked');

if (process.argv.includes('--print')) console.log(JSON.stringify(candidate, null, 2));
else console.log(JSON.stringify({ ok: true, implementation: candidate.implementation.status, release: candidate.release.status, blockers: candidate.blockers, performanceMs: performance.elapsedMs }, null, 2));
