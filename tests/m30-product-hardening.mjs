import assert from 'node:assert/strict';
import { analyzeModel, createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import {
  INDEX_PRODUCT_HARDENING_VERSION,
  measureAnalysisPerformance,
} from '../src/ui/indexProductHardening.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const { target, document } = createTarget();
installIndexEngineBridge(target);
target.SStructuresAgent.execute('loadNativeExample');
target.SStructuresAgent.execute('saveNativeAutosave', { savedAt: '2026-06-26T00:00:04.000Z' });
target.SStructuresAgent.execute('setNativeResultToggle', { id: 'react', on: true });
target.SStructuresAgent.execute('runNativePushoverReport', { steps: 3, direction: '+x' });

let snapshot = target.SStructuresAgent.execute('runNativeProductAudit');
assert.equal(snapshot.audit.version, INDEX_PRODUCT_HARDENING_VERSION);
assert.equal(snapshot.audit.ok, true, JSON.stringify(snapshot.audit, null, 2));
assert.equal(snapshot.audit.checks.noDuplicatePanelsVisible, true);
assert.equal(snapshot.audit.checks.oneResultControlSystem, true);
assert.equal(snapshot.audit.checks.nativeModelerAvailable, true);
assert.equal(snapshot.audit.checks.nativePersistenceAvailable, true);
assert.equal(snapshot.audit.checks.nativeAgentControlsAvailable, true);
assert.equal(snapshot.audit.checks.nativeAdvancedAvailable, true);
assert.equal(snapshot.audit.checks.modelConsistency, true);
assert.equal(snapshot.audit.duplicateAgentIds.length, 0);
assert.equal(snapshot.audit.visualContracts.every((item) => item.ok), true);
assert.equal(document.querySelector('#engineResultsDock'), null);
assert.equal(document.querySelector('#enginePushoverPanel'), null);

target.SStructuresAgent.execute('createGridFrame', {
  baysX: 2,
  baysY: 2,
  stories: 2,
  bayX: 5,
  bayY: 4,
  storyH: 3,
  replace: true,
});
target.SStructuresAgent.execute('applyLoadTemplate', {
  template: 'gravityUdl',
  w: 5,
  case: 'D',
});
target.SStructuresAgent.execute('generateFloorMass', {
  massPerFloor: 120,
});
snapshot = target.SStructuresAgent.runAnalysis();
assert.equal(snapshot.analysis.ok, true);
assert.equal(snapshot.model.nodeCount, 27);
assert.ok(snapshot.model.memberCount >= 42);

const perf = measureAnalysisPerformance('medium-native-frame', () => analyzeModel(target.model()), {
  thresholdMs: 5000,
});
assert.equal(perf.ok, true, JSON.stringify(perf, null, 2));
assert.ok(perf.elapsedMs >= 0);

snapshot = target.SStructuresAgent.execute('runNativeProductAudit');
assert.equal(snapshot.audit.ok, true, JSON.stringify(snapshot.audit, null, 2));
assert.equal(snapshot.audit.modelCounts.nodeCount, 27);
assert.equal(snapshot.audit.checks.modelConsistency, true);

console.log(JSON.stringify({
  ok: true,
  version: INDEX_PRODUCT_HARDENING_VERSION,
  nodes: snapshot.audit.modelCounts.nodeCount,
  members: snapshot.audit.modelCounts.memberCount,
  performanceMs: Number(perf.elapsedMs.toFixed(2)),
  visualContracts: snapshot.audit.visualContracts.length,
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
