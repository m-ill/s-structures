import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import {
  createIndexAgentApi,
  installIndexEngineBridge,
} from '../src/ui/indexBridge.js';
import {
  INDEX_NATIVE_RESULT_CONTROLS_VERSION,
  buildNativeResultState,
} from '../src/ui/indexNativeResultControls.js';

function run() {
  const { target, document, model, counters } = createTarget();
  const bridge = installIndexEngineBridge(target);
  bridge.reanalyze();

  const controls = target.SStructuresNativeResultControls;
  assert.equal(controls.version, INDEX_NATIVE_RESULT_CONTROLS_VERSION);
  assert.equal(target.SStructuresFloatingPanels.getState().propertyPanel.floating, true);
  assert.equal(document.getElementById('propPanel').getAttribute('data-ss-floating-panel'), '1');
  assert.equal(target.SStructuresResultsPanel, undefined);
  assert.equal(target.SStructuresPushoverPanel, undefined);
  assert.equal(document.querySelector('#engineResultsDock'), null);
  assert.equal(document.querySelector('#engineVisualControls'), null);
  assert.equal(document.querySelector('#enginePushoverPanel'), null);

  const toggle = document.getElementById('ssNativePDeltaToggle');
  const nativeScale = document.getElementById('ssNativeResultScale');
  assert.equal(toggle, null, 'the legacy P-Delta result toggle should not duplicate the unified result shortcut');
  assert.ok(nativeScale, 'elastic ribbon should expose the native result scale selector');
  assert.ok(document.getElementById('ssElasticAnalysis-direct-pdelta'));
  assert.equal(nativeScale.value, 'auto');

  let state = controls.getState();
  assert.equal(state.version, INDEX_NATIVE_RESULT_CONTROLS_VERSION);
  assert.equal(state.singleResultControlSystem, true);
  assert.equal(state.pDelta.enabled, false);
  assert.equal(state.player.visible, false);
  assert.equal(state.resultScale.value, 'auto');

  const agent = target.SStructuresAgent || createIndexAgentApi(target, bridge);
  const capabilities = agent.getCapabilities();
  assert.equal(capabilities.modules.nativeResultControls, INDEX_NATIVE_RESULT_CONTROLS_VERSION);
  assert.ok(capabilities.dataContracts.includes('nativeResultControls'));
  assert.ok(capabilities.milestones.some((item) => item.id === 'M25'));
  assert.ok(agent.getSnapshot().availableActions.includes('setNativePDeltaEnabled'));
  assert.ok(agent.getSnapshot().availableActions.includes('setNativeResultScale'));

  let snapshot = agent.execute('setNativePDeltaEnabled', { enabled: true });
  assert.equal(snapshot.nativeResultControls.pDelta.enabled, true);
  const maxStep = snapshot.nativeResultControls.pDelta.maxStep;

  snapshot = agent.execute('setNativePDeltaStep', { step: maxStep + 20 });
  assert.equal(snapshot.nativeResultControls.pDelta.step, maxStep);
  assert.equal(document.getElementById('plSlider').value, String(maxStep));

  snapshot = agent.execute('setPDeltaStep', { step: 1 });
  assert.equal(snapshot.nativeResultControls.pDelta.step, 1);
  assert.equal(document.getElementById('plSlider').value, '1');

  const drawBeforeScale = counters.draw;
  nativeScale.value = '50';
  nativeScale.dispatchEvent({ type: 'change', target: nativeScale });
  state = controls.getState();
  assert.equal(state.resultScale.value, '50');
  assert.equal(document.getElementById('setExag').value, '50');
  assert.equal(target.SStructuresNativeResultScale, '50');
  assert.ok(counters.draw > drawBeforeScale);

  const legacyTitle = document.createElement('h3');
  legacyTitle.textContent = '부재 M1 (L=3.00m) ✕';
  document.getElementById('propPanel').appendChild(legacyTitle);
  document.getElementById('propPanel').style.display = 'block';
  const legacyResult = document.createElement('div');
  legacyResult.id = 'propResult';
  legacyResult.setAttribute('id', 'propResult');
  legacyResult.style.display = 'block';
  legacyResult.innerHTML = '<b>해석 결과</b>';
  document.getElementById('propPanel').appendChild(legacyResult);
  assert.ok(document.eventHandlers.click?.length, 'legacy member selection sync should be registered');
  assert.ok(document.eventHandlers.pointerup?.length, 'legacy member pointer sync should be registered');
  assert.ok(document.getElementById('propPanel').querySelectorAll('h3').some((item) => item.textContent === '부재 M1 (L=3.00m) ✕'));
  assert.equal(controls.getState().pDelta.enabled, true);
  for (const handler of document.eventHandlers.click || []) handler({ type: 'click', target: legacyResult });
  for (const handler of document.eventHandlers.pointerup || []) handler({ type: 'pointerup', target: legacyResult });
  assert.equal(legacyResult.getAttribute('data-agent-id'), 'native-member-result-detail');
  assert.equal(legacyResult.getAttribute('data-member-id'), 'M1');
  assert.doesNotMatch(legacyResult.innerHTML, /native-member-pdelta-review/);
  const legacyDock = document.getElementById('ssPDeltaMemberDock');
  assert.ok(legacyDock, 'legacy member selection should show the left P-Delta dock');
  assert.equal(legacyDock.style.display, 'block');
  assert.equal(legacyDock.getAttribute('data-agent-id'), 'native-member-pdelta-dock');
  assert.equal(legacyDock.getAttribute('data-member-id'), 'M1');
  assert.equal(legacyDock.parentNode.id, 'canvasWrap');
  assert.equal(legacyDock.getAttribute('data-ss-floating-panel'), '1');
  assert.ok(legacyDock.querySelector('[data-ss-floating-resize]'), 'P-Delta dock should expose a resize handle');
  assert.match(legacyDock.innerHTML, /Selected member P-Delta contribution curve/);
  assert.match(legacyDock.innerHTML, /member diagnostic only/);
  assert.match(legacyDock.innerHTML, /native-member-pdelta-combo/);
  assert.match(legacyDock.innerHTML, /All combos/);
  assert.match(legacyDock.innerHTML, /SLS1/);

  snapshot = agent.execute('showNativeMemberResult', { memberId: 'M1' });
  const propResult = document.getElementById('propResult');
  assert.equal(document.getElementById('propPanel').style.display, 'block');
  assert.equal(propResult.style.display, 'block');
  assert.equal(propResult.getAttribute('data-agent-id'), 'native-member-result-detail');
  assert.equal(propResult.getAttribute('data-member-id'), 'M1');
  assert.match(propResult.innerHTML, /Member M1 result/);
  assert.doesNotMatch(propResult.innerHTML, /native-member-pdelta-review/);
  assert.doesNotMatch(propResult.innerHTML, /Selected member P-Delta contribution curve/);
  assert.doesNotMatch(propResult.innerHTML, /ss-member-pdelta-table/);
  assert.ok(document.getElementById('ssMemberPDeltaStyles'), 'member P-Delta review should install scoped styles');
  const pDeltaDock = document.getElementById('ssPDeltaMemberDock');
  assert.equal(pDeltaDock.style.display, 'block');
  assert.match(pDeltaDock.innerHTML, /P-Delta M1/);
  assert.match(pDeltaDock.innerHTML, /Selected member P-Delta contribution curve/);
  assert.match(pDeltaDock.innerHTML, /native-member-pdelta-combo/);
  assert.match(propResult.innerHTML, /check/);
  assert.equal(snapshot.nativeResultControls.detail.memberId, 'M1');

  snapshot = agent.execute('focusEntity', { type: 'member', id: 'M1' });
  assert.equal(snapshot.agent.selection.id, 'M1');
  assert.equal(snapshot.nativeResultControls.detail.memberId, 'M1');

  const directState = buildNativeResultState(target, bridge, controls.state);
  assert.equal(directState.singleResultControlSystem, true);
  assert.equal(agent.getScreenState().nativeResultControls.resultScale.value, '50');

  console.log(JSON.stringify({
    ok: true,
    version: INDEX_NATIVE_RESULT_CONTROLS_VERSION,
    maxStep,
    resultScale: controls.getState().resultScale.value,
    selectedMember: controls.getState().detail.memberId,
    drawCount: counters.draw,
  }, null, 2));
}

function createTarget() {
  const model = createPDeltaColumnModel();
  const document = new FakeDocument();
  const storage = new Map();
  const counters = { draw: 0, reanalyze: 0 };
  let lastResult = null;

  const target = {
    document,
    location: { search: '' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    model: () => model,
    activeResult: () => lastResult?.pDelta?.envelope || lastResult?.envelope || null,
    draw: () => {
      counters.draw += 1;
    },
    reanalyze: () => {
      counters.reanalyze += 1;
      lastResult = target.analyzeModel(model);
      document.getElementById('statusTxt').textContent = lastResult.ok ? 'OK' : 'NG';
      document.getElementById('statusChip').textContent = lastResult.ok ? 'OK' : 'NG';
      target.draw();
      return lastResult;
    },
    getComputedStyle(element) {
      return {
        display: element.style?.display || 'block',
        visibility: element.style?.visibility || 'visible',
      };
    },
  };
  document.defaultView = target;
  buildIndexShell(document);
  return { target, document, model, counters };
}

function buildIndexShell(document) {
  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  topbar.setAttribute('id', 'topbar');
  document.body.appendChild(topbar);

  for (const mode of ['structure', 'select', 'draw', 'erase', 'image']) {
    const button = document.createElement('button');
    button.className = 'tb-btn mode';
    button.setAttribute('data-mode', mode);
    button.textContent = mode;
    button.addEventListener('click', () => {
      for (const item of document.querySelectorAll('[data-mode]')) item.classList.remove('active');
      button.classList.add('active');
    });
    topbar.appendChild(button);
  }
  document.querySelector('[data-mode="structure"]').classList.add('active');

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  topbar.appendChild(spacer);

  const subbar = document.createElement('div');
  subbar.id = 'subbar';
  subbar.setAttribute('id', 'subbar');
  document.body.appendChild(subbar);

  const combo = document.createElement('select');
  combo.id = 'comboSel';
  combo.setAttribute('id', 'comboSel');
  combo.value = 'CO1';
  combo.selectedIndex = 0;
  const option = document.createElement('option');
  option.value = 'CO1';
  option.textContent = 'D + L';
  combo.appendChild(option);
  subbar.appendChild(combo);

  for (const value of ['def', 'M', 'Q', 'N', 'react', 'chk', 'design', 'defl']) {
    const button = document.createElement('button');
    button.className = 'res-toggle';
    button.setAttribute('data-res', value);
    button.textContent = value;
    subbar.appendChild(button);
  }

  const reactMode = document.createElement('select');
  reactMode.id = 'reactMode';
  reactMode.setAttribute('id', 'reactMode');
  subbar.appendChild(reactMode);

  const status = byId(document, 'statusTxt', 'Idle');
  subbar.appendChild(status);

  const palette = byId(document, 'palette');
  palette.classList.add('show');
  for (const tool of ['smove', 'member', 'pin', 'pload']) {
    const button = document.createElement('button');
    button.setAttribute('data-tool', tool);
    button.textContent = tool;
    palette.appendChild(button);
  }
  document.body.appendChild(palette);

  const canvasWrap = byId(document, 'canvasWrap');
  document.body.appendChild(canvasWrap);

  const player = byId(document, 'playerBar');
  player.style.display = 'none';
  document.body.appendChild(player);
  for (const id of ['plPrev', 'plPlay', 'plNext', 'plClose']) {
    player.appendChild(byId(document, id));
  }
  const info = byId(document, 'plInfo', 'Step 1/1');
  player.appendChild(info);
  const slider = document.createElement('input');
  slider.id = 'plSlider';
  slider.setAttribute('id', 'plSlider');
  slider.value = '0';
  slider.max = '0';
  player.appendChild(slider);

  const panel = byId(document, 'propPanel');
  panel.style.display = 'none';
  document.body.appendChild(panel);
  document.body.appendChild(byId(document, 'statusChip', '-'));
  document.body.appendChild(byId(document, 'pageInfo', '1 / 1'));
  document.body.appendChild(byId(document, 'reportModal'));

  const setExag = document.createElement('select');
  setExag.id = 'setExag';
  setExag.setAttribute('id', 'setExag');
  setExag.value = 'auto';
  document.body.appendChild(setExag);

  const menu = byId(document, 'menuDrop');
  for (const id of ['mLoadCombos', 'mDesignReport', 'mValidate']) {
    menu.appendChild(byId(document, id));
  }
  document.body.appendChild(menu);
}

function byId(document, id, text = '') {
  const element = document.createElement('div');
  element.id = id;
  element.setAttribute('id', id);
  element.textContent = text;
  return element;
}

function createPDeltaColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'L', name: 'Lateral', type: 'wind' },
  ];
  model.loadCombinations = [
    { id: 'CO1', name: 'D + L', type: 'strength', factors: { D: 1, L: 1 } },
    { id: 'SLS1', name: 'D + L service', type: 'service', factors: { D: 1, L: 1 } },
  ];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 800, dir: '-z', case: 'D' },
    { id: 'H1', type: 'nodal', node: 'N2', P: 20, dir: '+x', case: 'L' },
  ];
  model.analysisSettings = {
    includeGeometricStiffness: false,
    pDeltaMaxIterations: 20,
    pDeltaTolerance: 1e-6,
  };
  return model;
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.defaultView = null;
    this.eventHandlers = {};
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener(type, handler) {
    this.eventHandlers[type] = this.eventHandlers[type] || [];
    this.eventHandlers[type].push(handler);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.eventHandlers = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.id = '';
    this.type = '';
    this.value = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.selectedIndex = -1;
    this.options = [];
    this._textContent = '';
    this._innerHTML = '';
    this._classes = new Set();
    this.classList = {
      add: (...items) => items.forEach((item) => this._classes.add(item)),
      remove: (...items) => items.forEach((item) => this._classes.delete(item)),
      contains: (item) => this._classes.has(item),
      toggle: (item, force) => {
        const enabled = force === undefined ? !this._classes.has(item) : !!force;
        if (enabled) this._classes.add(item);
        else this._classes.delete(item);
        return enabled;
      },
    };
  }

  get className() {
    return [...this._classes].join(' ');
  }

  set className(value) {
    this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  get childNodes() {
    return this.children;
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this._innerHTML = this._textContent;
  }

  get innerText() {
    return this.textContent;
  }

  set innerText(value) {
    this.textContent = value;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this._textContent = this._innerHTML.replace(/<[^>]*>/g, ' ');
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION') this.options.push(child);
    return child;
  }

  insertBefore(child, before) {
    if (!before) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.children.indexOf(before);
    if (index < 0) return this.appendChild(child);
    child.parentNode = this;
    this.children.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    if (this.tagName === 'SELECT') {
      const optionIndex = this.options.indexOf(child);
      if (optionIndex >= 0) this.options.splice(optionIndex, 1);
    }
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes[name] = text;
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name.startsWith('data-')) this.dataset[toDatasetKey(name.slice(5))] = text;
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className;
    if (name.startsWith('data-')) return this.dataset[toDatasetKey(name.slice(5))] || null;
    return this.attributes[name] || null;
  }

  addEventListener(type, handler) {
    this.eventHandlers[type] = this.eventHandlers[type] || [];
    this.eventHandlers[type].push(handler);
  }

  dispatchEvent(event) {
    const nextEvent = { ...event, target: event?.target || this };
    for (const handler of this.eventHandlers[nextEvent.type] || []) handler.call(this, nextEvent);
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  closest(selector) {
    let item = this;
    while (item) {
      if (matchesSelector(item, selector)) return item;
      item = item.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    walk(this, (element) => {
      if (matchesSelector(element, selector)) results.push(element);
    });
    return results;
  }
}

function walk(element, visit) {
  visit(element);
  for (const child of element.children) walk(child, visit);
}

function matchesSelector(element, selector) {
  if (!selector) return false;
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  const attrMatch = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, name, expected] = attrMatch;
    const value = element.getAttribute(name);
    return expected === undefined ? value != null : value === expected;
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function toDatasetKey(name) {
  return name.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}

run();
