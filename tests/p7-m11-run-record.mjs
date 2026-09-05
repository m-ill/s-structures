import assert from 'node:assert/strict';
import { createPracticeModel } from '../src/core/modelFactory.js';
import {
  analysisRunCanTransferToDesign,
  appendAnalysisRun,
  createAnalysisRunRecord,
  createAnalysisRunStore,
} from '../src/core/analysisRunRecord.js';
import { createResultSelectionStore } from '../src/ui/resultSelectionStore.js';
import {
  VERIFICATION_MATRIX_RECORD_VERSION,
  modelHash,
} from '../verification/framework/matrix/record.js';
import { adaptVerificationEvidenceForAnalysis } from '../verification/framework/analysisEvidenceAdapter.js';

const model = createPracticeModel({
  sourceRegistry: [{
    id: 'KDS-2022', authority: 'MOLIT', code: 'KDS 41', edition: '2022',
    publicationStatus: 'effective', effectiveDate: '2022-10-11', verificationStatus: 'verified',
    verifiedAt: '2026-07-10', sourceHash: 'fixture-hash', sourceUrls: ['https://example.invalid/kds'],
  }],
});
const analysisCase = { id: 'STATIC-1', kind: 'static', settings: { comboId: null } };
const verifiedModelHash = modelHash(model);
const first = createAnalysisRunRecord({
  model, analysisCase, attemptId: 'A1',
  result: {
    ok: true,
    solver: { method: 'dense' },
    warnings: [],
    verificationEvidence: adaptVerificationEvidenceForAnalysis({
      modelHash: verifiedModelHash,
      audit: {
        version: 'p7-m11-run-record-audit-v1',
        ok: true,
        status: 'PASS',
        rows: [{
          version: VERIFICATION_MATRIX_RECORD_VERSION,
          caseId: analysisCase.id,
          tier: 'L1',
          name: 'Static run-record transfer fixture',
          modelHash: verifiedModelHash,
          referenceSource: 'p7-m11-independent-fixture',
          solverVersion: 'p7-m11-fixture-v1',
          status: 'OK',
          relError: 0,
          tolerance: 1e-9,
        }],
      },
    }, { model, analysisCase }),
  },
});
assert.equal(first.runStatus, 'ok');
assert.equal(first.designTransferAllowed, true);
assert.equal(analysisRunCanTransferToDesign(first, model), true);
assert.equal(first.provenance.sourceRegistry[0].id, 'KDS-2022');
assert.equal(first.provenance.materials.length, model.materials.length);
assert.equal(analysisRunCanTransferToDesign({ ...first, id: 'FORGED' }, model), false);
const staleModel = structuredClone(model);
staleModel.meta = { changed: true };
assert.equal(analysisRunCanTransferToDesign(first, staleModel), false);

let store = appendAnalysisRun(createAnalysisRunStore(), first);
const failed = createAnalysisRunRecord({
  model, analysisCase, attemptId: 'A2',
  result: { ok: false, reason: 'SINGULAR', message: 'Mechanism found.' },
});
store = appendAnalysisRun(store, failed);
assert.equal(store.attempts['STATIC-1'].length, 2);
assert.equal(store.lastSuccessful['STATIC-1'].id, 'A1', 'failure must not overwrite last successful result');

const preliminary = createAnalysisRunRecord({
  model, analysisCase: { id: 'THA-1', kind: 'linear-tha' }, attemptId: 'T1',
  result: { ok: true, review: { productionReady: false }, designBlocked: true },
});
assert.equal(preliminary.qualification, 'preliminary');
assert.equal(analysisRunCanTransferToDesign(preliminary), false);

const selection = createResultSelectionStore({ activeCaseId: 'STATIC-1' });
const events = [];
selection.subscribe((next, previous, source) => events.push({ next, previous, source }));
selection.set({ activeResultId: 'COMBO-1', response: 'moment', component: 'Mz' }, 'analysis-center');
selection.selectEntity('member', 'M10', 'viewport');
assert.equal(selection.getState().selectedEntity.id, 'M10');
assert.equal(events.length, 2);
assert.equal(events[1].source, 'viewport');

console.log(JSON.stringify({
  ok: true,
  attempts: store.attempts['STATIC-1'].length,
  retained: store.lastSuccessful['STATIC-1'].id,
  preliminaryBlocked: !analysisRunCanTransferToDesign(preliminary),
  selectionEvents: events.length,
}, null, 2));
