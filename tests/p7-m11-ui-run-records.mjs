import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildAnalysisCaseResultView } from '../src/ui/indexResultViews.js';
import { phase7ModelHash, recordPhase7AnalysisAttempt } from '../src/ui/phase7AnalysisRecords.js';
import { VERIFICATION_MATRIX_RECORD_VERSION } from '../src/verification/matrix/record.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createModel();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const target = {
  document,
  location: { search: '' },
  localStorage: createMemoryStorage(),
  model: () => model,
  reanalyze: () => null,
  activeResult: () => null,
  draw() {},
  getComputedStyle(element) {
    return { display: element.style?.display || 'block', visibility: element.style?.visibility || 'visible' };
  },
};
document.defaultView = target;
const bridge = installIndexEngineBridge(target);
const analysisCase = bridge.addAnalysisCase({
  id: 'RUN-1',
  kind: 'nlth',
  settings: { accelerations: [0, 0.05, -0.05, 0.02], dt: 0.02, mass: 1, stiffness: 100, yieldForce: 0.2 },
});

const selectionEvents = [];
bridge.getResultSelectionStore().subscribe((next, previous, source) => selectionEvents.push({ next, previous, source }));
const first = bridge.runAnalysisCase({ id: 'RUN-1' });
assert.equal(first.status, 'preliminary');
assert.equal(first.qualification, 'legacy-preliminary');
assert.equal(first.engine.id, 'legacy-sdof-bilinear-newmark');
assert.equal(first.modelBound, false);
assert.equal(first.designBlocked, true);
assert.equal(first.designTransferAllowed, false);
assert.ok(first.runRecordId);
assert.equal(bridge.getResultSelection().activeResultId, first.runRecordId);

bridge.updateAnalysisCase('RUN-1', { kind: 'buckling', settings: {} });
const failed = bridge.runAnalysisCase({ id: 'RUN-1' });
assert.equal(failed.status, 'failed');
assert.notEqual(failed.runRecordId, first.runRecordId);
assert.equal(bridge.getAnalysisCaseResult('RUN-1').runRecordId, first.runRecordId, 'failed attempt must retain last successful result');
assert.equal(bridge.getAnalysisLatestAttempt('RUN-1').runRecordId, failed.runRecordId);
assert.equal(bridge.getResultSelection().activeResultId, first.runRecordId, 'failed attempt must preserve active successful result');

const runStore = bridge.getAnalysisRunStore();
assert.equal(runStore.attempts['RUN-1'].length, 2);
assert.equal(runStore.lastSuccessful['RUN-1'].id, first.runRecordId);
assert.equal(Object.isFrozen(target.__SStructuresAnalysisRunStore), true);
assert.equal(Object.isFrozen(target.__SStructuresAnalysisRunStore.attempts['RUN-1'][0]), true);

const centerState = target.SStructuresAnalysisCenter.getState();
assert.equal(centerState.latestResult.status, 'preliminary');
assert.equal(centerState.latestAttempt.status, 'failed');
assert.equal(centerState.attemptCount, 2);
const resultCells = document.getElementById('ssAcResult').querySelectorAll('td').map((cell) => cell.textContent);
assert.ok(resultCells.includes('legacy-sdof-bilinear-newmark'), 'Analysis Center must show the executed engine ID');
assert.ok(resultCells.includes('legacy-preliminary'), 'Analysis Center must show the result qualification');
assert.match(document.querySelector('.ss-ac-log').textContent, /PRELOAD_REQUIRED|PRELOAD_RESULT_CONTRACT_INVALID|did not produce|blocked/i);
assert.equal(document.getElementById('ssAcTransferDesign').disabled, true);

bridge.setResultSelection({ response: 'moment', component: 'Mz', modeOrStep: 2 }, 'result-test');
const resultView = buildAnalysisCaseResultView(model, bridge.getAnalysisCaseResult('RUN-1'), {
  selectionStore: bridge.getResultSelectionStore(),
});
assert.equal(resultView.selection.response, 'moment');
assert.equal(resultView.selection.component, 'Mz');
assert.equal(resultView.selection.modeOrStep, 2);
assert.ok(selectionEvents.length >= 2);

const blocked = bridge.canTransferAnalysisResultToDesign({ runRecordId: first.runRecordId });
assert.equal(blocked.allowed, false);
assert.equal(blocked.code, 'ANALYSIS_RESULT_NOT_VERIFIED');
const blockedPackage = bridge.getDesignDemandPackage({ runRecordId: first.runRecordId });
assert.equal(blockedPackage.ok, false);
assert.equal(blockedPackage.demandPackage, null);

const verifiedCase = bridge.addAnalysisCase({ id: 'RUN-VERIFIED', kind: 'static', settings: {} });
const verifiedModelHash = phase7ModelHash(model);
const verified = recordPhase7AnalysisAttempt(target, model, verifiedCase, {
  caseId: verifiedCase.id,
  kind: verifiedCase.kind,
  status: 'ok',
  ok: true,
  payload: { summary: { caseId: verifiedCase.id, solver: 'p7-m11-ui-fixture-v1' } },
  verificationEvidence: {
    modelHash: verifiedModelHash,
    audit: {
      version: 'p7-m11-ui-verification-v1',
      ok: true,
      status: 'PASS',
      rows: [{
        version: VERIFICATION_MATRIX_RECORD_VERSION,
        caseId: 'RUN-VERIFIED',
        tier: 'L1',
        name: 'Static UI transfer fixture',
        modelHash: verifiedModelHash,
        referenceSource: 'p7-m11-ui-independent-fixture',
        solverVersion: 'p7-m11-ui-fixture-v1',
        status: 'OK',
        relError: 0,
        tolerance: 1e-9,
      }],
    },
  },
  completedAt: '2026-07-10T01:00:00.000Z',
}, { attemptId: 'RUN-VERIFIED:VERIFIED' });
assert.equal(verified.record.qualification, 'verified', JSON.stringify({
  recordHash: verified.record.modelHash,
  evidenceHash: verified.record.result?.verificationEvidence?.modelHash,
  audit: verified.record.result?.verificationEvidence?.audit,
}));
const allowed = bridge.canTransferAnalysisResultToDesign({ runRecordId: verified.record.id });
assert.equal(allowed.allowed, true, `${allowed.code || 'unknown'} (${allowed.runStatus}/${allowed.qualification})`);
const transferred = bridge.transferAnalysisResultToDesign({ runRecordId: verified.record.id });
assert.equal(transferred.ok, true);
assert.ok(transferred.demandPackage);
target.SStructuresAnalysisCenter.refresh();
assert.equal(document.getElementById('ssAcTransferDesign').disabled, false);

const preliminary = recordPhase7AnalysisAttempt(target, model, analysisCase, {
  ...first,
  status: 'ok',
  ok: true,
  qualification: 'preliminary',
  designBlocked: true,
  completedAt: '2026-07-10T01:10:00.000Z',
}, { attemptId: 'RUN-1:PRELIMINARY' });
assert.equal(preliminary.result.status, 'designBlocked');
assert.equal(preliminary.record.qualification, 'legacy-preliminary');
assert.equal(preliminary.record.designTransferAllowed, false);

const hadMeta = Object.prototype.hasOwnProperty.call(model, 'meta');
model.meta ||= {};
const originalName = model.meta.name;
model.meta.name = 'Changed after verified run';
const staleModel = bridge.canTransferAnalysisResultToDesign({ runRecordId: verified.record.id });
assert.equal(staleModel.allowed, false);
assert.equal(staleModel.code, 'ANALYSIS_RESULT_MODEL_CHANGED');
if (!hadMeta) delete model.meta;
else if (originalName == null) delete model.meta.name;
else model.meta.name = originalName;
assert.equal(bridge.canTransferAnalysisResultToDesign({ runRecordId: verified.record.id }).allowed, true);

const fiberSection = { width: 0.3, depth: 0.5, strips: 8 };
const calculationPackage = bridge.getCalculationPackage({
  generatedAt: '2026-07-10T02:00:00.000Z',
  phase3: { nonlinear: { fiberSection } },
  nonlinear: { fiberSection },
});
assert.equal(calculationPackage.data.analysisRuns.summary.attemptCount, 4);
assert.equal(calculationPackage.data.analysisRuns.summary.invalidTransferCount, 0);
assert.ok(calculationPackage.data.analysisRuns.rows.every((row) => row.modelHash));
assert.match(calculationPackage.html, /Immutable Analysis Run Records/);
assert.match(calculationPackage.html, /Preliminary or unverified successful runs/);

console.log(JSON.stringify({
  ok: true,
  attempts: calculationPackage.data.analysisRuns.summary.attemptCount,
  retainedResult: first.runRecordId,
  failedAttempt: failed.runRecordId,
  verifiedAttempt: verified.record.id,
  selectionEvents: selectionEvents.length,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
