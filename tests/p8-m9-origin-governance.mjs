import assert from 'node:assert/strict';
import {
  CANONICAL_DOMAIN_ADAPTERS,
  NONLINEAR_RESULT_DIMENSIONS,
  analysisRunCanTransferToDesign,
  auditCanonicalAnalysisAdapterIdentities,
  auditNonlinearResultFreshness,
  buildCanonicalAnalysisDomain,
  buildNonlinearDesignTransferGuard,
  buildNonlinearResultDependencies,
  createAnalysisRunRecord,
} from '../src/index.js';

const analysisCase = { id: 'M9-CASE', kind: 'pushover', outputPolicy: { stations: 9 } };
const model = baseModel();
const domain = buildCanonicalAnalysisDomain(model, { analysisCase });
assert.equal(domain.ok, true, domain.reason);
assert.equal(domain.elements.find((row) => row.id === 'M').origin.type, 'wall');
const wallOrigin = domain.originMap.members.find((row) => row.generatedId === 'M');
assert.equal(wallOrigin.originType, 'wall');
assert.equal(wallOrigin.originId, 'W1');
assert.equal(wallOrigin.qualification, 'preliminary-equivalent');

const adapterAudit = auditCanonicalAnalysisAdapterIdentities(domain);
assert.equal(adapterAudit.ok, true);
assert.deepEqual(adapterAudit.adapters, CANONICAL_DOMAIN_ADAPTERS);

const dependencies = buildNonlinearResultDependencies({
  model,
  analysisCase,
  domain,
  resultDimensions: NONLINEAR_RESULT_DIMENSIONS,
  step: 4,
});
assert.deepEqual(dependencies.nodeIds, domain.identity.nodeIds);
assert.deepEqual(dependencies.elementIds, domain.identity.elementIds);
assert.ok(dependencies.canonical.originMapHash);
assert.ok(dependencies.canonical.unitSystemHash);

const verifiedResult = {
  ok: true,
  status: 'completed',
  qualification: 'verified',
  designBlocked: false,
  dimensions: NONLINEAR_RESULT_DIMENSIONS,
  dependencies,
  resultHash: 'M9-VERIFIED-RESULT',
};
const current = { model, domain, analysisCase };
assert.equal(auditNonlinearResultFreshness(verifiedResult, current, analysisCase).ok, true);
assert.equal(auditNonlinearResultFreshness(verifiedResult, domain, analysisCase).ok, true);
assert.equal(buildNonlinearDesignTransferGuard(verifiedResult, current, analysisCase).allowed, true);
const missingContextFreshness = auditNonlinearResultFreshness(verifiedResult, {}, analysisCase);
assert.equal(missingContextFreshness.stale, true);
assert.equal(missingContextFreshness.reason, 'NONLINEAR_RESULT_CURRENT_CONTEXT_REQUIRED');
assert.equal(buildNonlinearDesignTransferGuard(verifiedResult, {}, analysisCase).allowed, false);
const massDomain = { sourceSnapshot: { sourceId: 'MS1', sourceHash: 'MASS-SOURCE-A' } };
const loadSetHash = 'LOAD-SET-A';
const executionDependencies = buildNonlinearResultDependencies({
  model,
  analysisCase,
  domain,
  massDomain,
  loadSetHash,
  resultDimensions: NONLINEAR_RESULT_DIMENSIONS,
});
const executionResult = { ...verifiedResult, dependencies: executionDependencies };
const executionCurrent = { ...current, massDomain, loadSetHash };
assert.equal(auditNonlinearResultFreshness(executionResult, executionCurrent, analysisCase).ok, true);
assert.equal(
  auditNonlinearResultFreshness(executionResult, current, analysisCase).reason,
  'NONLINEAR_RESULT_MASS_CONTEXT_REQUIRED',
);
const staleMassSource = auditNonlinearResultFreshness(executionResult, {
  ...executionCurrent,
  massDomain: { sourceSnapshot: { sourceId: 'MS1', sourceHash: 'MASS-SOURCE-B' } },
}, analysisCase);
assert.ok(staleMassSource.changes.some((row) => row.key === 'massSourceHash' && row.category === 'mass'));
const staleLoadSet = auditNonlinearResultFreshness(executionResult, {
  ...executionCurrent,
  loadSetHash: 'LOAD-SET-B',
}, analysisCase);
assert.ok(staleLoadSet.changes.some((row) => row.key === 'loadSetHash' && row.category === 'load'));
const candidateGuard = buildNonlinearDesignTransferGuard({
  ...verifiedResult,
  qualification: 'candidate',
  designBlocked: true,
  designBlockReason: 'QUALIFICATION_PENDING',
}, current, analysisCase);
assert.equal(candidateGuard.allowed, false);
assert.ok(candidateGuard.blockers.includes('QUALIFICATION_PENDING'));

for (const mutation of staleMutations()) {
  const nextModel = structuredClone(model);
  const nextCase = structuredClone(analysisCase);
  mutation.apply(nextModel, nextCase);
  const nextDomain = buildCanonicalAnalysisDomain(nextModel, { analysisCase: nextCase });
  const stale = auditNonlinearResultFreshness(
    verifiedResult,
    { model: nextModel, domain: nextDomain, analysisCase: nextCase },
    nextCase,
  );
  assert.equal(stale.stale, true, mutation.id);
  assert.ok(stale.changes.some((row) => row.category === mutation.category), `${mutation.id}: ${JSON.stringify(stale.changes)}`);
}

const runRecord = createAnalysisRunRecord({ model, analysisCase, result: { ...verifiedResult, engine: { id: 'p8-production-mdof-pushover', version: 'test' } } });
assert.equal(runRecord.provenance.analysisCase.id, analysisCase.id);
assert.equal(runRecord.modelHash.length > 0, true);
assert.equal(analysisRunCanTransferToDesign(runRecord, model), false, 'untrusted synthetic evidence must remain blocked');

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-INT-15', 'NL-INT-16',
    'NL-MEI-16', 'NL-MEI-17', 'NL-MEI-18', 'NL-MEI-19', 'NL-MEI-20',
  ],
  adapterCount: adapterAudit.adapters.length,
  origin: wallOrigin,
  dependencyHash: dependencies.dependencyHash,
  staleCategoryCount: staleMutations().length,
  missingContextReason: missingContextFreshness.reason,
  selectedExecutionDependencies: ['massSourceId', 'massSourceHash', 'loadSetHash'],
  candidateBlockers: candidateGuard.blockers,
  runRecordQualification: runRecord.qualification,
}, null, 2));

function staleMutations() {
  return [
    { id: 'topology', category: 'topology', apply: (next) => { next.nodes[1].x += 0.1; } },
    { id: 'property', category: 'property', apply: (next) => { next.materials[0].E *= 0.9; } },
    { id: 'constraint', category: 'constraint', apply: (next) => { next.nodes[1].support = 'roller'; } },
    { id: 'load', category: 'load', apply: (next) => { next.loads[0].P *= 1.1; } },
    { id: 'mass', category: 'mass', apply: (next) => { next.nodes[1].mass = [2, 2, 2]; } },
    { id: 'nonlinear', category: 'nonlinear', apply: (next) => { next.nonlinearMaterials = [{ id: 'NL1', version: 1 }]; } },
    { id: 'output', category: 'output', apply: (_next, nextCase) => { nextCase.outputPolicy.stations = 11; } },
    { id: 'origin', category: 'origin', apply: (next) => { next.wallEquivalents[0].wallId = 'W2'; } },
    { id: 'units', category: 'units', apply: (next) => { next.unitSystem.force = 'N'; } },
  ];
}

function baseModel() {
  return {
    schemaVersion: 5,
    unitSystem: { length: 'm', force: 'kN', mass: 'tonne', time: 's' },
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 0, y: 0, z: 3 },
    ],
    members: [{
      id: 'M', type: 'frame', behavior: 'frame', n1: 'A', n2: 'B', matId: 'MAT', secId: 'SEC',
      localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
    }],
    materials: [{ id: 'MAT', E: 2e8, G: 8e7, density: 0 }],
    sections: [{ id: 'SEC', A: 0.1, Iy: 0.001, Iz: 0.002, J: 0.0005 }],
    loads: [{ id: 'P', type: 'nodal', node: 'B', P: 1, direction: [1, 0, 0], case: 'D' }],
    loadCases: [{ id: 'D', type: 'dead' }],
    loadCombinations: [{ id: 'D1', type: 'service', factors: { D: 1 } }],
    massSources: [{ id: 'MS1', version: 1, components: [{ caseId: 'D', factor: 1 }] }],
    wallEquivalents: [{ wallId: 'W1', memberId: 'M', sectionId: 'SEC', sourceGeometry: { height: 3 } }],
    analysisSettings: { includeSelfWeight: false },
  };
}
