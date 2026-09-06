import assert from 'node:assert/strict';
import { createPortalFrameSample } from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';
import {
  buildRuntimeDiagnostics,
  countModel,
  INDEX_RUNTIME_ADAPTER_VERSION,
  installIndexRuntimeAdapter,
} from '../src/ui/indexRuntimeAdapter.js';

function run() {
  const model = createPortalFrameSample();
  const activeResult = {
    ok: true,
    comboId: 'CO1',
    disp: { [model.nodes[0].id]: [0, 0, 0] },
    memberResults: { [model.members[0].id]: { end: [] } },
    reactions: { [model.nodes[0].id]: [0, 0, 0] },
    dmax: 0.0123,
  };

  const document = createRuntimeDocument();
  const target = {
    document,
    model: () => model,
    reanalyze: () => {},
    draw: () => {},
    activeResult: () => activeResult,
    getComputedStyle(element) {
      return {
        display: element.style?.display || 'block',
        visibility: element.style?.visibility || 'visible',
      };
    },
  };
  document.defaultView = target;

  const adapter = installIndexRuntimeAdapter(target, {
    bridge: { getCurrentModel: () => model },
  });
  assert.equal(adapter.version, INDEX_RUNTIME_ADAPTER_VERSION);
  assert.equal(target.SStructuresRuntimeAdapter, adapter);

  const diagnostics = adapter.getDiagnostics();
  assert.equal(diagnostics.available, true);
  assert.deepEqual(diagnostics.functions, {
    model: true,
    reanalyze: true,
    draw: true,
    activeResult: true,
  });
  assert.equal(diagnostics.page.current, 2);
  assert.equal(diagnostics.page.total, 3);
  assert.equal(diagnostics.modelCounts.nodeCount, model.nodes.length);
  assert.equal(diagnostics.modelCounts.memberCount, model.members.length);
  assert.equal(diagnostics.activeCombination.value, 'CO1');
  assert.equal(diagnostics.activeCombination.label, '1.0D+1.0L');
  assert.equal(diagnostics.activeResult.available, true);
  assert.equal(diagnostics.activeResult.memberResultCount, 1);
  assert.equal(diagnostics.resultToggles.length, 3);
  assert.equal(diagnostics.resultToggles.find((item) => item.id === 'def').on, true);
  assert.equal(diagnostics.viewMode.value, 'iso');
  assert.equal(diagnostics.activeTool.value, 'member');
  assert.equal(diagnostics.player.visible, true);
  assert.equal(diagnostics.player.sliderValue, '250');
  assert.equal(diagnostics.reportModal.open, true);
  assert.equal(diagnostics.palette.open, true);
  assert.equal(diagnostics.modelConsistency.matches, true);

  const mismatch = buildRuntimeDiagnostics({
    ...target,
    SStructuresRuntimeAdapter: null,
    SStructuresEngine: {
      getCurrentModel: () => ({ nodes: [], members: [], loads: [], loadCases: [], loadCombinations: [] }),
    },
  });
  assert.equal(mismatch.modelConsistency.matches, false);

  const counts = countModel(model);
  assert.equal(counts.loadCount, model.loads.length);

  const agent = createIndexAgentApi(target, {
    getLastResult: () => activeResult,
  });
  const snapshot = agent.getSnapshot();
  assert.equal(snapshot.runtime.version, INDEX_RUNTIME_ADAPTER_VERSION);
  assert.equal(snapshot.runtime.modelCounts.memberCount, model.members.length);
  const screen = agent.getScreenState();
  assert.equal(screen.runtime.activeCombination.value, 'CO1');
  assert.equal(agent.getRuntimeDiagnostics().viewMode.value, 'iso');

  console.log(JSON.stringify({
    ok: true,
    adapterVersion: INDEX_RUNTIME_ADAPTER_VERSION,
    nodes: diagnostics.modelCounts.nodeCount,
    members: diagnostics.modelCounts.memberCount,
    activeCombo: diagnostics.activeCombination.value,
    toggles: diagnostics.resultToggles.length,
  }, null, 2));
}

function createRuntimeDocument() {
  const doc = new FakeDocument();

  doc.add(byId('pageInfo', '2 / 3'));
  const combo = byId('comboSel');
  combo.value = 'CO1';
  combo.selectedIndex = 0;
  combo.options = [element('option', '1.0D+1.0L')];
  doc.add(combo);

  doc.add(button({ attr: 'data-res', value: 'def', text: 'Def', classes: ['on'] }));
  doc.add(button({ attr: 'data-res', value: 'M', text: 'M' }));
  doc.add(button({ attr: 'data-res', value: 'chk', text: 'Check', classes: ['on'] }));

  doc.add(button({ attr: 'data-view', value: 'iso', text: '3D', classes: ['active'] }));
  doc.add(button({ attr: 'data-view', value: 'plan', text: 'Plan' }));
  doc.add(button({ attr: 'data-tool', value: 'member', text: 'Member', classes: ['active'] }));

  const player = byId('playerBar');
  player.style.display = 'flex';
  doc.add(player);
  doc.add(byId('plInfo', 'Step 2/4'));
  const slider = byId('plSlider');
  slider.value = '250';
  slider.max = '1000';
  doc.add(slider);

  doc.add(byId('reportModal', '', ['show']));
  doc.add(byId('palette', '', ['show']));
  doc.add(byId('statusTxt', 'Analysis OK'));
  doc.add(byId('statusChip', 'OK'));
  return doc;
}

function byId(id, text = '', classes = []) {
  const item = element('div', text, classes);
  item.setAttribute('id', id);
  return item;
}

function button({ attr, value, text, classes = [] }) {
  const item = element('button', text, classes);
  item.setAttribute(attr, value);
  return item;
}

function element(tagName, text = '', classes = []) {
  return new FakeElement(tagName, text, classes);
}

class FakeDocument {
  constructor() {
    this.elements = [];
    this.defaultView = null;
  }

  add(element) {
    this.elements.push(element);
    return element;
  }

  getElementById(id) {
    return this.elements.find((element) => element.getAttribute('id') === id) || null;
  }

  querySelectorAll(selector) {
    return this.elements.filter((element) => matches(element, selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FakeElement {
  constructor(tagName, text = '', classes = []) {
    this.tagName = tagName.toUpperCase();
    this.textContent = text;
    this.attributes = {};
    this.style = {};
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.max = '';
    this.options = [];
    this.selectedIndex = -1;
    this._classes = new Set(classes);
    this.classList = {
      contains: (item) => this._classes.has(item),
      add: (...items) => items.forEach((item) => this._classes.add(item)),
      remove: (...items) => items.forEach((item) => this._classes.delete(item)),
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }
}

function matches(element, selector) {
  const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attr) {
    const value = element.getAttribute(attr[1]);
    return attr[2] == null ? value != null : value === attr[2];
  }
  if (selector.startsWith('#')) return element.getAttribute('id') === selector.slice(1);
  return false;
}

run();
