import assert from 'node:assert/strict';
import {
  LEGACY_PUSHOVER_ENGINE_ID,
  LEGACY_SDOF_NLTH_ENGINE_ID,
  NONLINEAR_ENGINE_IDS,
  analyzeModel,
  buildAgentManifest,
  buildDetailedReportData,
  createAnalysisCase,
  createAnalysisRunRecord,
  createModel,
  runAnalysisCase,
  runFormalPushover,
  runNewmarkNlth,
  runNonlinearAnalysisCase,
  runPushover,
  validateNonlinearRunRecord,
} from '../src/index.js';
import {
  VERIFICATION_MATRIX_RECORD_VERSION,
  adaptVerificationEvidenceForAnalysis,
  modelHash,
} from '../verification/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';

const model = frameModel();
const directPushover = runPushover(model, {
  controlNodeId: 'N2', direction: '+x', referenceBaseShear: 20, maxLoadFactor: 1, steps: 2,
});
assertLegacy(directPushover, LEGACY_PUSHOVER_ENGINE_ID, true, 'runPushover');
assert.equal(directPushover.curve.length, 3);

const intentOnly = runPushover(model, {
  controlNodeId: 'N2', direction: '+x', referenceBaseShear: 20, steps: 1, control: 'displacement',
});
assert.equal(intentOnly.executionControl.requested, 'displacement');
assert.equal(intentOnly.executionControl.executed, 'load-factor');
assert.equal(intentOnly.executionControl.intentOnly, true);

const formal = runFormalPushover(model, {
  controlNodeId: 'N2', direction: '+x', referenceBaseShear: 20, steps: 2,
});
assertLegacy(formal, LEGACY_PUSHOVER_ENGINE_ID, true, 'runFormalPushover');
assert.equal(formal.capacityCurve.length, 3);

const sdof = runNewmarkNlth({
  accelerations: [0, 0.1, -0.05, 0], dt: 0.02, mass: 1, stiffness: 100, yieldForce: 0.2,
});
assertLegacy(sdof, LEGACY_SDOF_NLTH_ENGINE_ID, false, 'runNewmarkNlth');
assert.equal(sdof.rows.length, 4);

const pushoverCase = createAnalysisCase({
  id: 'PUSH-LEGACY', kind: 'pushover', settings: {
    controlNodeId: 'N2', direction: '+x', referenceBaseShear: 20, maxLoadFactor: 1, steps: 2, control: 'load-factor',
  },
});
const pushoverRun = runAnalysisCase(model, pushoverCase);
assert.equal(pushoverRun.status, 'preliminary');
assert.equal(pushoverRun.qualification, 'legacy-preliminary');
assert.equal(pushoverRun.engine.id, LEGACY_PUSHOVER_ENGINE_ID);
assert.equal(pushoverRun.designBlocked, true);

const nlthCase = createAnalysisCase({
  id: 'NLTH-LEGACY', kind: 'nlth', settings: {
    accelerations: [0, 0.1, -0.05, 0], dt: 0.02, mass: 1, stiffness: 100, yieldForce: 0.2,
  },
});
const nlthRun = runAnalysisCase(model, nlthCase);
assert.equal(nlthRun.status, 'preliminary');
assert.equal(nlthRun.qualification, 'legacy-preliminary');
assert.equal(nlthRun.engine.id, LEGACY_SDOF_NLTH_ENGINE_ID);
assert.equal(nlthRun.modelBound, false);

const record = createAnalysisRunRecord({ model, analysisCase: pushoverCase, result: pushoverRun, attemptId: 'PUSH-1' });
assert.equal(record.qualification, 'legacy-preliminary');
assert.equal(record.designTransferAllowed, false);
assert.equal(record.engine.id, LEGACY_PUSHOVER_ENGINE_ID);
assert.equal(validateNonlinearRunRecord(record).ok, true);

let legacyCalls = 0;
const productionCase = createAnalysisCase({
  id: 'PUSH-PRODUCTION',
  kind: 'pushover',
  engineId: NONLINEAR_ENGINE_IDS.productionPushover,
  settings: { control: 'load' },
});
const productionBlocked = runNonlinearAnalysisCase(model, productionCase, productionCase.settings, {
  nonlinearAdapters: {
    [LEGACY_PUSHOVER_ENGINE_ID]: () => {
      legacyCalls += 1;
      return directPushover;
    },
  },
});
assert.equal(productionBlocked.status, 'unsupported');
assert.equal(productionBlocked.reason, 'NONLINEAR_CAPABILITY_UNSUPPORTED');
assert.equal(productionBlocked.routing.requestedEngineId, NONLINEAR_ENGINE_IDS.productionPushover);
assert.equal(productionBlocked.routing.executedEngineId, null);
assert.equal(productionBlocked.routing.fallbackUsed, false);
assert.equal(legacyCalls, 0, 'reserved production engine must never call a legacy adapter');

const missingEngine = runAnalysisCase(model, {
  id: 'PUSH-MISSING-ENGINE', kind: 'pushover', status: 'not-run', settings: { control: 'load-factor' },
});
assert.equal(missingEngine.status, 'unsupported');
assert.equal(missingEngine.designBlockReason, 'NONLINEAR_ENGINE_REQUIRED');

const unsupportedControl = runAnalysisCase(model, createAnalysisCase({
  id: 'PUSH-DISPLACEMENT', kind: 'pushover', settings: { control: 'displacement' },
}));
assert.equal(unsupportedControl.status, 'unsupported');
assert.equal(unsupportedControl.designBlockReason, 'NONLINEAR_CAPABILITY_UNSUPPORTED');

const verifiedHash = modelHash(model);
const evidence = {
  modelHash: verifiedHash,
  audit: {
    version: 'p7-m11-run-record-audit-v1', ok: true, status: 'PASS',
    rows: [{
      version: VERIFICATION_MATRIX_RECORD_VERSION,
      caseId: 'STATIC-EVIDENCE', tier: 'L1', name: 'Independent static fixture',
      modelHash: verifiedHash, referenceSource: 'independent-closed-form', solverVersion: 'fixture-v1',
      status: 'OK', relError: 0, tolerance: 1e-9,
    }],
  },
};
const acceptedEvidence = adaptVerificationEvidenceForAnalysis(evidence, {
  model,
  analysisCase: { id: 'STATIC-EVIDENCE', kind: 'static' },
});
const legacyWithEvidence = createAnalysisRunRecord({
  model, analysisCase: pushoverCase, attemptId: 'PUSH-EVIDENCE',
  result: { ...pushoverRun, verificationEvidence: acceptedEvidence },
});
assert.equal(legacyWithEvidence.qualification, 'legacy-preliminary', 'evidence cannot lift a legacy engine ceiling');

const selfDeclared = createAnalysisRunRecord({
  model, analysisCase: { id: 'STATIC-NO-EVIDENCE', kind: 'static' }, attemptId: 'STATIC-NO-EVIDENCE',
  result: { ok: true, status: 'ok', qualification: 'verified' },
});
assert.equal(selfDeclared.qualification, 'candidate', 'verified cannot be stored without trusted evidence');

const unrelatedEvidence = structuredClone(evidence);
unrelatedEvidence.audit.rows[0].caseId = 'UNRELATED-CASE';
const unrelated = createAnalysisRunRecord({
  model, analysisCase: { id: 'STATIC-TARGET', kind: 'static' }, attemptId: 'STATIC-UNRELATED-EVIDENCE',
  result: {
    ok: true,
    status: 'ok',
    verificationEvidence: adaptVerificationEvidenceForAnalysis(unrelatedEvidence, {
      model,
      analysisCase: { id: 'STATIC-TARGET', kind: 'static' },
    }),
  },
});
assert.equal(unrelated.qualification, 'candidate', 'evidence from another case must not qualify the target result');

const verified = createAnalysisRunRecord({
  model, analysisCase: { id: 'STATIC-EVIDENCE', kind: 'static' }, attemptId: 'STATIC-EVIDENCE',
  result: { ok: true, status: 'ok', verificationEvidence: acceptedEvidence },
});
assert.equal(verified.qualification, 'verified');

model.analysisCases = [pushoverCase, nlthCase];
const agent = createIndexAgentApi({ model: () => model }, null);
const agentRun = agent.runAnalysisCase(pushoverCase.id);
assert.equal(agentRun.engine.id, pushoverRun.engine.id);
assert.equal(agentRun.qualification, pushoverRun.qualification);
assert.equal(agentRun.designBlocked, pushoverRun.designBlocked);
assert.ok(agentRun.runRecordId);
const analysis = analyzeModel(model);
const report = buildDetailedReportData(model, analysis, {
  generatedAt: '2026-07-11T00:00:00.000Z',
  analysisResults: { [pushoverCase.id]: agentRun },
});
const reportCase = report.analysisCases.rows.find((item) => item.id === pushoverCase.id);
assert.equal(reportCase.engineId, LEGACY_PUSHOVER_ENGINE_ID);
assert.equal(reportCase.qualification, 'legacy-preliminary');
assert.equal(reportCase.designBlocked, true);
assert.equal(reportCase.engineId, agentRun.engine.id, 'report and Agent API engine identity must match');

const manifest = buildAgentManifest();
const manifestEngine = manifest.nonlinear.capabilities.find((item) => item.engineId === LEGACY_PUSHOVER_ENGINE_ID);
assert.equal(manifestEngine.qualificationCeiling, 'legacy-preliminary');
assert.equal(manifest.nonlinear.routingPolicy, 'explicit-engine-id-no-silent-fallback');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-GOV-01', 'NL-GOV-02', 'NL-GOV-03', 'NL-GOV-05', 'NL-GOV-06'],
  pushoverEngine: pushoverRun.engine.id,
  nlthEngine: nlthRun.engine.id,
  legacyFallbackCalls: legacyCalls,
  evidenceGate: selfDeclared.qualification,
}, null, 2));

function assertLegacy(result, engineId, modelBound, api) {
  assert.equal(result.qualification, 'legacy-preliminary', `${api} qualification`);
  assert.equal(result.designBlocked, true, `${api} design block`);
  assert.equal(result.modelBound, modelBound, `${api} model binding`);
  assert.equal(result.engine.id, engineId, `${api} engine`);
  assert.equal(result.routing.fallbackUsed, false, `${api} fallback`);
  assert.equal(result.legacyCompatibility.api, api);
}

function frameModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  model.members = [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  model.loadCombinations = [{ id: 'D1', name: 'Dead', type: 'service', factors: { D: 1 } }];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' }];
  model.analysisCases = [];
  return model;
}
