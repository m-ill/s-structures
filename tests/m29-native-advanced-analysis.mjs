import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION } from '../src/ui/indexNativeAdvancedAnalysis.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const { target, document } = createTarget();
const bridge = installIndexEngineBridge(target);
bridge.reanalyze();

let snapshot = target.SStructuresAgent.execute('loadNativeExample');
assert.equal(target.SStructuresAgent.getCapabilities().modules.nativeAdvancedAnalysis, INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION);
assert.ok(target.SStructuresAgent.getCapabilities().dataContracts.includes('nativeAdvancedAnalysisReport'));
assert.ok(target.SStructuresAgent.getCapabilities().milestones.some((item) => item.id === 'M29'));
assert.equal(snapshot.nativeAdvancedAnalysis.experimentalPanelsVisible, false);
assert.equal(document.querySelector('#enginePushoverPanel'), null);
assert.equal(document.querySelector('#engineResultsDock'), null);

snapshot = target.SStructuresAgent.execute('runNativePushoverReport', {
  direction: '+x',
  pattern: 'uniform',
  steps: 4,
});
assert.equal(snapshot.nativeAdvancedAnalysis.lastView.type, 'pushover');
assert.equal(snapshot.nativeAdvancedAnalysis.lastView.preliminary, true);
assert.equal(snapshot.nativeAdvancedAnalysis.reportModal.open, true);
assert.equal(document.getElementById('reportModal').classList.contains('show'), true);
assert.equal(document.getElementById('reportModal').getAttribute('data-native-advanced-type'), 'pushover');
assert.match(document.getElementById('reportBody').innerHTML, /Pushover Report/);
assert.match(document.getElementById('reportBody').innerHTML, /Capacity Curve/);
assert.ok(snapshot.nativeAdvancedAnalysis.lastView.summary.stepCount >= 2);

target.SStructuresAgent.execute('generateFloorMass', {
  massPerFloor: 80,
  includeBase: false,
});
snapshot = target.SStructuresAgent.execute('showNativeModalReport');
assert.equal(snapshot.nativeAdvancedAnalysis.lastView.type, 'modal');
assert.equal(snapshot.nativeAdvancedAnalysis.reportModal.open, true);
assert.equal(document.getElementById('reportModal').getAttribute('data-native-advanced-type'), 'modal');
assert.match(document.getElementById('reportBody').innerHTML, /Modal\/RSA Report/);
assert.match(document.getElementById('reportBody').innerHTML, /Mode Summary/);
assert.ok(snapshot.nativeAdvancedAnalysis.lastView.summary.modeCount > 0);
assert.equal(snapshot.nativeAdvancedAnalysis.experimentalPanelsVisible, false);

console.log(JSON.stringify({
  ok: true,
  version: INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION,
  pushoverSteps: target.SStructuresNativePushoverView.summary.stepCount,
  modalModes: snapshot.nativeAdvancedAnalysis.lastView.summary.modeCount,
}, null, 2));

function createTarget() {
  const document = createFakeIndexDocument();
  buildNativeIndexShell(document);
  const model = createModel();
  let result = null;
  const target = {
    document,
    location: { search: '' },
    localStorage: createMemoryStorage(),
    model: () => model,
    activeResult: () => result?.pDelta?.envelope || result?.envelope || null,
    reanalyze: () => {
      result = target.analyzeModel(model);
      document.getElementById('statusTxt').textContent = result.ok ? 'OK' : 'NG';
      document.getElementById('statusChip').textContent = result.ok ? 'OK' : 'NG';
      target.draw();
      return result;
    },
    draw: () => {},
    getComputedStyle(element) {
      return {
        display: element.style?.display || 'block',
        visibility: element.style?.visibility || 'visible',
      };
    },
  };
  document.defaultView = target;
  return { target, document };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
