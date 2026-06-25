import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { INDEX_NATIVE_MODELER_VERSION } from '../src/ui/indexNativeModeler.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const { target, document, model, counters } = createTarget();
const bridge = installIndexEngineBridge(target);
bridge.reanalyze();

assert.equal(target.SStructuresNativeModeler.version, INDEX_NATIVE_MODELER_VERSION);
assert.equal(target.SStructuresAgent.getCapabilities().modules.nativeModeler, INDEX_NATIVE_MODELER_VERSION);
assert.ok(target.SStructuresAgent.getCapabilities().milestones.some((item) => item.id === 'M26'));

let snapshot = target.SStructuresAgent.execute('nativeClearPage');
assert.equal(snapshot.nativeModeler.activeTool, 'smove');
assert.equal(snapshot.model.nodeCount, 0);
assert.equal(snapshot.model.memberCount, 0);
assert.equal(snapshot.model.loadCount, 0);

snapshot = target.SStructuresAgent.execute('nativeAddColumn', {
  base: [0, 0, 0],
  height: 3,
  support: 'fixed',
});
assert.equal(snapshot.nativeModeler.activeTool, 'column');
assert.equal(document.querySelector('[data-tool="column"]').classList.contains('active'), true);
assert.equal(snapshot.model.nodeCount, 2);
assert.equal(snapshot.model.memberCount, 1);
const leftTop = snapshot.nativeActionResult.topNodeId;

snapshot = target.SStructuresAgent.execute('nativeAddColumn', {
  base: [4, 0, 0],
  height: 3,
  support: 'fixed',
});
const rightBase = snapshot.nativeActionResult.baseNodeId;
const rightTop = snapshot.nativeActionResult.topNodeId;
assert.equal(snapshot.model.nodeCount, 4);
assert.equal(snapshot.model.memberCount, 2);

snapshot = target.SStructuresAgent.execute('nativeDrawMember', {
  n1: leftTop,
  n2: rightTop,
  id: 'MBEAM',
  design: { role: 'beam' },
});
assert.equal(snapshot.nativeModeler.activeTool, 'member');
assert.equal(document.querySelector('[data-tool="member"]').classList.contains('active'), true);
assert.equal(snapshot.model.memberCount, 3);
assert.equal(model.members.find((member) => member.id === 'MBEAM')?.design?.role, 'beam');

snapshot = target.SStructuresAgent.execute('nativeSetSupport', {
  nodeId: rightBase,
  support: 'fixed',
});
assert.equal(snapshot.nativeModeler.activeTool, 'fixed');
assert.equal(model.nodes.find((node) => node.id === rightBase)?.support, 'fixed');

snapshot = target.SStructuresAgent.execute('nativeAddUdl', {
  memberId: 'MBEAM',
  w: 7.5,
  dir: '-z',
  case: 'D',
});
assert.equal(snapshot.nativeModeler.activeTool, 'udl');
assert.equal(snapshot.model.loadCount, 1);
const udlId = snapshot.nativeActionResult.load.id;

snapshot = target.SStructuresAgent.execute('nativeAddNodalLoad', {
  nodeId: rightTop,
  P: 12,
  dir: '+x',
  case: 'L',
});
assert.equal(snapshot.nativeModeler.activeTool, 'pload');
assert.equal(snapshot.model.loadCount, 2);
const nodalLoadId = snapshot.nativeActionResult.load.id;

snapshot = target.SStructuresAgent.execute('nativeMoveNode', {
  nodeId: rightTop,
  x: 4.2,
  y: 0,
  z: 3,
});
assert.equal(snapshot.nativeModeler.activeTool, 'smove');
assert.equal(model.nodes.find((node) => node.id === rightTop)?.x, 4.2);

snapshot = target.SStructuresAgent.execute('nativeSelectMember', { memberId: 'MBEAM' });
assert.equal(snapshot.agent.selection.id, 'MBEAM');
assert.equal(snapshot.nativeResultControls.detail.memberId, 'MBEAM');
assert.match(document.getElementById('propResult').innerHTML, /Member MBEAM result/);

snapshot = target.SStructuresAgent.execute('nativeDeleteElement', {
  type: 'load',
  id: nodalLoadId,
});
assert.equal(snapshot.nativeModeler.activeTool, 'sdelete');
assert.equal(snapshot.model.loadCount, 1);
assert.equal(model.loads.some((load) => load.id === nodalLoadId), false);
assert.equal(model.loads.some((load) => load.id === udlId), true);

const drawBeforeToggles = counters.draw;
document.querySelector('[data-res="M"]').click();
document.querySelector('[data-res="react"]').click();
assert.ok(counters.draw >= drawBeforeToggles + 2);
assert.equal(document.querySelector('[data-res="M"]').classList.contains('on'), true);
assert.equal(document.querySelector('[data-res="react"]').classList.contains('on'), true);

const finalSnapshot = target.SStructuresAgent.runAnalysis();
assert.equal(finalSnapshot.analysis.available, true);
assert.equal(finalSnapshot.analysis.ok, true);
assert.equal(finalSnapshot.analysis.empty, false);
assert.ok(finalSnapshot.analysis.maxDisplacement > 0);
assert.equal(finalSnapshot.runtime.modelConsistency.matches, true);
assert.equal(finalSnapshot.runtime.activeTool.value, 'sdelete');
assert.ok(counters.reanalyze >= 9);

console.log(JSON.stringify({
  ok: true,
  version: INDEX_NATIVE_MODELER_VERSION,
  nodes: finalSnapshot.model.nodeCount,
  members: finalSnapshot.model.memberCount,
  loads: finalSnapshot.model.loadCount,
  reanalysisCount: counters.reanalyze,
  drawCount: counters.draw,
}, null, 2));

function createTarget() {
  const document = createFakeIndexDocument();
  buildNativeIndexShell(document);
  const model = createModel();
  let result = null;
  const counters = { reanalyze: 0, draw: 0 };
  const target = {
    document,
    location: { search: '' },
    localStorage: createMemoryStorage(),
    model: () => model,
    activeResult: () => result?.pDelta?.envelope || result?.envelope || null,
    reanalyze: () => {
      counters.reanalyze += 1;
      result = target.analyzeModel(model);
      document.getElementById('statusTxt').textContent = result.ok ? 'OK' : 'NG';
      document.getElementById('statusChip').textContent = result.ok ? 'OK' : 'NG';
      target.draw();
      return result;
    },
    draw: () => {
      counters.draw += 1;
    },
    getComputedStyle(element) {
      return {
        display: element.style?.display || 'block',
        visibility: element.style?.visibility || 'visible',
      };
    },
  };
  document.defaultView = target;
  return { target, document, model, counters };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
