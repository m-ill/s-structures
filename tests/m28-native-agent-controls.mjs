import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { INDEX_NATIVE_AGENT_CONTROLS_VERSION } from '../src/ui/indexNativeAgentControls.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const { target, document, counters } = createTarget();
installMenuHandlers(target, document);
const bridge = installIndexEngineBridge(target);
bridge.reanalyze();

let snapshot = target.SStructuresAgent.execute('loadNativeExample');
assert.equal(snapshot.nativeAgentControls.version, INDEX_NATIVE_AGENT_CONTROLS_VERSION);
assert.equal(target.SStructuresAgent.getCapabilities().modules.nativeAgentControls, INDEX_NATIVE_AGENT_CONTROLS_VERSION);
assert.ok(target.SStructuresAgent.getCapabilities().dataContracts.includes('nativeAgentScreenControls'));
assert.ok(target.SStructuresAgent.getCapabilities().milestones.some((item) => item.id === 'M28'));

snapshot = target.SStructuresAgent.execute('clickNativeControl', { id: 'native-mode-elastic' });
assert.equal(snapshot.nativeUi.activeMode, 'elastic');
assert.equal(document.querySelector('[data-mode="select"]').classList.contains('active'), true);

const drawBefore = counters.draw;
snapshot = target.SStructuresAgent.execute('setNativeResultToggle', { id: 'M', on: true });
assert.equal(snapshot.nativeControlResult.on, true);
assert.equal(document.querySelector('[data-res="M"]').classList.contains('on'), true);
assert.ok(counters.draw > drawBefore);

snapshot = target.SStructuresAgent.execute('setNativeResultToggle', { id: 'M', on: false });
assert.equal(snapshot.nativeControlResult.on, false);
assert.equal(document.querySelector('[data-res="M"]').classList.contains('on'), false);

snapshot = target.SStructuresAgent.execute('setNativeCombo', { comboId: 'SLS1' });
assert.equal(snapshot.nativeControlResult.comboId, 'SLS1');
assert.equal(snapshot.runtime.activeCombination.value, 'SLS1');
assert.ok(counters.reanalyze >= 2);

snapshot = target.SStructuresAgent.execute('openNativeLoadCombinations');
assert.equal(snapshot.nativeControlResult.controlId, 'mLoadCombos');
assert.equal(document.getElementById('lcModal').classList.contains('show'), true);
assert.equal(snapshot.nativeAgentControls.loadCombinationModal.open, true);

snapshot = target.SStructuresAgent.execute('openNativeDesignReport');
assert.equal(snapshot.nativeControlResult.controlId, 'mDesignReport');
assert.equal(document.getElementById('reportModal').classList.contains('show'), true);
assert.equal(snapshot.nativeAgentControls.reportModal.open, true);

snapshot = target.SStructuresAgent.execute('runNativeValidation');
assert.equal(snapshot.nativeControlResult.controlId, 'mValidate');
assert.equal(target.__nativeValidationRan, true);
assert.equal(document.getElementById('statusTxt').textContent, 'Validation OK');

const screen = target.SStructuresAgent.getScreenState();
assert.equal(screen.nativeAgentControls.activeTool.value, 'smove');
assert.equal(screen.nativeAgentControls.activeCombo.value, 'SLS1');
assert.ok(screen.nativeAgentControls.resultToggles.some((item) => item.id === 'chk' && item.on));
assert.ok(screen.controls.some((item) => item.id === 'native-mode-elastic'));
assert.ok(screen.controls.some((item) => item.id === 'result-M'));

console.log(JSON.stringify({
  ok: true,
  version: INDEX_NATIVE_AGENT_CONTROLS_VERSION,
  activeMode: screen.nativeUi.activeMode,
  activeCombo: screen.nativeAgentControls.activeCombo.value,
  drawCount: counters.draw,
  reanalysisCount: counters.reanalyze,
}, null, 2));

function createTarget() {
  const document = createFakeIndexDocument();
  buildNativeIndexShell(document);
  const combo = document.getElementById('comboSel');
  const option = document.createElement('option');
  option.value = 'SLS1';
  option.textContent = 'SLS';
  combo.appendChild(option);

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
  return { target, document, counters };
}

function installMenuHandlers(target, document) {
  document.getElementById('mLoadCombos').addEventListener('click', () => {
    document.getElementById('lcModal').classList.add('show');
  });
  document.getElementById('mDesignReport').addEventListener('click', () => {
    document.getElementById('reportModal').classList.add('show');
  });
  document.getElementById('mValidate').addEventListener('click', () => {
    target.__nativeValidationRan = true;
    document.getElementById('statusTxt').textContent = 'Validation OK';
  });
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
