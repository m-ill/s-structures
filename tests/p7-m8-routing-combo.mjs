import assert from 'node:assert/strict';
import { analyzeModel, analyzePDeltaCombinations } from '../src/solver/linear3d.js';
import { runAnalysisCase } from '../src/ui/analysisRunners.js';

const model = routingModel();
const direct = analyzePDeltaCombinations(model, model.loadCombinations, { pDeltaMethod: 'direct', loadSteps: 2 });

assert.equal(direct.method, 'direct');
assert.equal(direct.provenance.solver, 'runSecondOrderPDelta');
assert.equal(direct.provenance.solverMethod, 'geometric-stiffness-second-order-direct');
assert.deepEqual(Object.keys(direct.byCombo), ['C1', 'C2']);
assert.equal(direct.byCombo.C1.provenance.comboId, 'C1');
assert.equal(direct.byCombo.C2.provenance.comboId, 'C2');
assert.ok(direct.byCombo.C2.result.disp.N2[0] > direct.byCombo.C1.result.disp.N2[0]);
assert.equal(direct.envelope.sources.length, 2);
assert.equal(direct.envelope.method, 'direct');
assert.ok(direct.envelope.reactions.N1);
assert.ok(direct.envelope.memberResults.M1.xs.length >= 21);
assert.equal(direct.designEligibility.eligible, true);
assert.ok(
  Math.abs(direct.byCombo.C1.result.summary.equilibriumResidual) < 1e-8,
  `C1 equilibrium residual ${direct.byCombo.C1.result.summary.equilibriumResidual}`,
);
assert.ok(
  Math.abs(direct.byCombo.C2.result.summary.equilibriumResidual) < 1e-8,
  `C2 equilibrium residual ${direct.byCombo.C2.result.summary.equilibriumResidual}`,
);

let capturedTarget = null;
const selected = runAnalysisCase(model, {
  id: 'AC_DIRECT_C2',
  name: 'Direct C2',
  kind: 'static',
  settings: { comboId: 'C2', pDeltaMethod: 'direct' },
}, {
  bridge: {
    analyzeModel(target) {
      capturedTarget = target;
      return {
        ok: true,
        pDeltaMethod: 'direct',
        byCombo: { C2: { ok: true } },
        envelope: { ok: true },
        pDelta: { method: 'direct' },
      };
    },
  },
});

assert.equal(selected.status, 'ok');
assert.deepEqual(capturedTarget.loadCombinations.map((combo) => combo.id), ['C2']);
assert.equal(capturedTarget.analysisSettings.pDeltaMethod, 'direct');
assert.equal(selected.payload.selection.selectedComboId, 'C2');
assert.equal(selected.payload.methodTrace.analysisCase.requestedPDeltaMethod, 'direct');
assert.equal(selected.payload.methodTrace.analysisCase.routedPDeltaMethod, 'direct');

const selectedActual = runAnalysisCase(model, {
  id: 'AC_DIRECT_C2_ACTUAL',
  name: 'Direct C2 actual',
  kind: 'static',
  settings: { comboId: 'C2', pDeltaMethod: 'direct' },
});
assert.equal(selectedActual.status, 'ok', selectedActual.message || selectedActual.payload?.reason);
assert.deepEqual(Object.keys(selectedActual.payload.byCombo), ['C2']);
assert.deepEqual(Object.keys(selectedActual.payload.pDelta.byCombo), ['C2']);
assert.equal(selectedActual.payload.pDelta.provenance.solver, 'runSecondOrderPDelta');
assert.equal(selectedActual.payload.pDelta.byCombo.C2.result.combo.id, 'C2');
assert.equal(selectedActual.payload.pDelta.envelope.sources[0].id, 'C2');
assert.equal(selectedActual.payload.methodTrace.analysisCase.selectedComboId, 'C2');
assert.equal(selectedActual.payload.methodTrace.pDelta.resolved, 'direct');
assert.equal(selectedActual.payload.design.analysisSource, 'direct-pdelta-envelope');
assert.equal(selectedActual.payload.pDelta.designEligibility.eligible, true);

const legacy = analyzePDeltaCombinations(model, [model.loadCombinations[0]], { pDeltaMethod: 'legacy' });
assert.equal(legacy.method, 'legacy');
assert.equal(legacy.provenance.routedMethod, 'legacy');
assert.equal(legacy.provenance.solver, 'analyzePDelta');
assert.equal(legacy.designEligibility.status, 'preliminary');
assert.equal(legacy.designEligibility.eligible, false);
assert.equal(legacy.designEligibility.reason, 'LEGACY_PDELTA_DESIGN_BLOCKED');
assert.equal(legacy.comparisonOnly, true);
assert.equal(legacy.envelope.designBlocked, true);
assert.equal(legacy.design.designBlocked, true);
assert.notEqual(legacy.solverMethod, 'geometric-stiffness-second-order-direct');

const legacyModel = routingModel();
legacyModel.analysisSettings.pDeltaMethod = 'legacy';
const legacyActual = analyzeModel(legacyModel);
assert.equal(legacyActual.ok, true);
assert.equal(legacyActual.pDelta.comparisonOnly, true);
assert.equal(legacyActual.designEligibility.eligible, false);
assert.equal(legacyActual.designEligibility.reason, 'LEGACY_PDELTA_DESIGN_BLOCKED');
assert.equal(legacyActual.design.designBlocked, true);
assert.equal(legacyActual.design.comparisonOnly, true);

const off = analyzePDeltaCombinations(model, model.loadCombinations, { pDeltaMethod: 'off' });
assert.equal(off.enabled, false);
assert.equal(off.method, 'off');
assert.deepEqual(off.byCombo, {});
assert.equal(off.provenance.solver, null);

console.log(JSON.stringify({
  ok: true,
  directCombos: Object.keys(direct.byCombo),
  selectedCombo: selectedActual.payload.selection.selectedComboId,
  directSolver: direct.provenance.solver,
  legacySolver: legacy.provenance.solver,
}, null, 2));

function routingModel() {
  return {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 0, y: 0, z: 3 },
    ],
    members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } }],
    loads: [
      { id: 'P', type: 'nodal', node: 'N2', P: 200, dir: '-z', case: 'D' },
      { id: 'H', type: 'nodal', node: 'N2', P: 10, dir: '+x', case: 'W' },
    ],
    loadCases: [
      { id: 'D', name: 'Dead', type: 'dead' },
      { id: 'W', name: 'Wind', type: 'wind' },
    ],
    loadCombinations: [
      { id: 'C1', name: 'D + W', factors: { D: 1, W: 1 } },
      { id: 'C2', name: 'D + 2W', factors: { D: 1, W: 2 } },
    ],
    analysisSettings: {
      responseSpectrum: { enabled: false },
      validateBeforeSolve: false,
      pDeltaCurveSteps: 1,
    },
  };
}
