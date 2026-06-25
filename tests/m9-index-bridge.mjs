import assert from 'node:assert/strict';
import {
  analyzeForIndex,
  createIndexAgentApi,
  decorateAgentControls,
  INDEX_BRIDGE_VERSION,
  installIndexEngineBridge,
  listAgentControls,
  validateForIndex,
} from '../src/ui/indexBridge.js';
import { createPortalFrameSample } from '../src/index.js';

const model = createPortalFrameSample();
model.nodes.find((node) => !node.support).mass = [5, 5, 5];

const analysis = analyzeForIndex(model, { requestedAt: '2026-06-25T00:00:00.000Z' });
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysis.bridge.version, INDEX_BRIDGE_VERSION);
assert.equal(analysis.bridge.ui, 'index');
assert.ok(analysis.combos.length >= 1, 'bridge should preserve load combinations');
assert.ok(analysis.byCombo[analysis.combos[0].id].nodeDisplacements, 'legacy displacement alias should exist');
assert.equal(
  analysis.byCombo[analysis.combos[0].id].nodeDisplacements,
  analysis.byCombo[analysis.combos[0].id].disp,
  'legacy displacement alias should point at the solver displacement map',
);
assert.ok(analysis.envelope?.memberResults, 'envelope should remain UI-compatible');
assert.ok(analysis.design?.summary, 'design summary should remain attached');

const validation = validateForIndex(model);
assert.equal(validation.errors.length, 0, JSON.stringify(validation.errors, null, 2));

let reanalysisCount = 0;
const hostedModel = createPortalFrameSample();
const target = {
  model: () => hostedModel,
  reanalyze: () => {
    reanalysisCount += 1;
  },
};
const bridge = installIndexEngineBridge(target);
assert.equal(target.SStructuresEngine, bridge);
assert.equal(typeof target.analyzeModel, 'function');
assert.equal(typeof target.SStructuresAgent.getSnapshot, 'function');

const targetResult = target.analyzeModel(hostedModel);
assert.equal(targetResult.bridge.version, INDEX_BRIDGE_VERSION);

const snapshot = target.SStructuresAgent.getSnapshot();
assert.equal(snapshot.version, INDEX_BRIDGE_VERSION);
assert.equal(snapshot.model.memberCount, hostedModel.members.length);
assert.equal(snapshot.analysis.ok, true);

target.SStructuresAgent.execute('setAnalysisSetting', {
  key: 'includeGeometricStiffness',
  value: true,
});
assert.equal(hostedModel.analysisSettings.includeGeometricStiffness, true);
assert.ok(reanalysisCount >= 1, 'agent action should request UI reanalysis');

const replacement = createPortalFrameSample();
replacement.meta = { name: 'Replacement' };
replacement.meta.name = 'Replacement';
target.SStructuresAgent.execute('setModel', replacement);
assert.equal(hostedModel.meta.name, 'Replacement');

const fakeDocument = createFakeDocument();
const decorated = decorateAgentControls(fakeDocument);
assert.ok(decorated.includes('menuBtn'));
assert.ok(decorated.includes('tool-member'));
assert.ok(decorated.includes('result-M'));
assert.equal(listAgentControls(fakeDocument).length, 3);

const agent = createIndexAgentApi(target, bridge);
assert.equal(agent.getSnapshot().model.available, true);

console.log(JSON.stringify({
  ok: true,
  bridgeVersion: INDEX_BRIDGE_VERSION,
  combos: analysis.combos.length,
  members: model.members.length,
  decorated: decorated.length,
}, null, 2));

function createFakeDocument() {
  const elements = [
    fakeElement({ id: 'menuBtn', title: 'Menu' }),
    fakeElement({ dataTool: 'member', text: 'Member' }),
    fakeElement({ dataRes: 'M', text: 'M' }),
  ];
  return {
    querySelectorAll(selector) {
      if (selector === '[id]') return elements.filter((element) => element.attrs.id);
      if (selector === '[data-tool]') return elements.filter((element) => element.attrs['data-tool']);
      if (selector === '[data-res]') return elements.filter((element) => element.attrs['data-res']);
      if (selector === '[data-mode]') return [];
      if (selector === '[data-view]') return [];
      if (selector === '[data-agent-id]') return elements.filter((element) => element.attrs['data-agent-id']);
      return [];
    },
  };
}

function fakeElement({ id = null, title = null, dataTool = null, dataRes = null, text = '' }) {
  const attrs = {};
  if (id) attrs.id = id;
  if (title) attrs.title = title;
  if (dataTool) attrs['data-tool'] = dataTool;
  if (dataRes) attrs['data-res'] = dataRes;
  return {
    attrs,
    disabled: false,
    tagName: 'BUTTON',
    textContent: text,
    getAttribute(name) {
      return attrs[name] || null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
  };
}
