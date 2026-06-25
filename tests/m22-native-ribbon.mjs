import assert from 'node:assert/strict';
import {
  getNativeUiState,
  installIndexNativeRibbon,
  ELASTIC_RIBBON_GROUPS,
  MEMO_RIBBON_MODES,
  NATIVE_MAIN_MODES,
  normalizeNativeMode,
} from '../src/ui/indexNativeRibbon.js';

function createFakeTarget() {
  const storage = new Map();
  const document = new FakeDocument();
  const legacyClicks = { structure: 0, select: 0, draw: 0, erase: 0, image: 0 };
  const actionClicks = {};
  const pushoverCalls = [];
  const target = {
    document,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    SStructuresEngine: {
      runPushover(options) {
        pushoverCalls.push({ ...options });
        return {
          ok: true,
          summary: {
            stepCount: options.steps + 1,
            maxBaseShear: 80,
            maxControlDisplacement: 0.12,
            plasticMemberCount: 1,
          },
          curve: [
            { controlDisplacement: 0, baseShear: 0 },
            { controlDisplacement: 0.06, baseShear: 40 },
            { controlDisplacement: 0.12, baseShear: 80 },
          ],
        };
      },
    },
  };
  document.defaultView = target;

  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  document.body.appendChild(topbar);

  const logo = document.createElement('div');
  logo.className = 'logo';
  topbar.appendChild(logo);

  const modeButtons = [];
  for (const mode of ['structure', 'select', 'draw', 'erase', 'image']) {
    const button = document.createElement('button');
    button.className = 'tb-btn mode';
    button.setAttribute('data-mode', mode);
    button.addEventListener('click', () => {
      modeButtons.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      legacyClicks[mode] += 1;
    });
    modeButtons.push(button);
    topbar.appendChild(button);
  }

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  topbar.appendChild(spacer);

  const subbar = document.createElement('div');
  subbar.id = 'subbar';
  document.body.appendChild(subbar);

  const viewButton = document.createElement('button');
  viewButton.className = 'view-btn';
  viewButton.setAttribute('data-view', 'iso');
  subbar.appendChild(viewButton);

  const combo = document.createElement('select');
  combo.id = 'comboSel';
  subbar.appendChild(combo);

  for (const result of ['def', 'M', 'Q', 'N']) {
    const button = document.createElement('button');
    button.className = 'res-toggle';
    button.setAttribute('data-res', result);
    subbar.appendChild(button);
  }

  const reactMode = document.createElement('select');
  reactMode.id = 'reactMode';
  subbar.appendChild(reactMode);

  const status = document.createElement('div');
  status.id = 'statusTxt';
  subbar.appendChild(status);

  const penOpts = document.createElement('span');
  penOpts.id = 'penOpts';
  subbar.appendChild(penOpts);

  const palette = document.createElement('div');
  palette.id = 'palette';
  palette.classList.add('show');
  document.body.appendChild(palette);
  const toolButtons = [];
  for (const tool of ['smove', 'member', 'pin', 'pload']) {
    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.setAttribute('data-tool', tool);
    button.addEventListener('click', () => {
      toolButtons.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
    });
    toolButtons.push(button);
    palette.appendChild(button);
  }
  toolButtons[0].classList.add('active');

  const menu = document.createElement('div');
  menu.id = 'menuDrop';
  document.body.appendChild(menu);
  for (const action of ELASTIC_RIBBON_GROUPS.flatMap((group) => group.actions || [])) {
    const button = document.createElement('button');
    button.id = action.id;
    actionClicks[action.id] = 0;
    button.addEventListener('click', () => {
      actionClicks[action.id] += 1;
    });
    menu.appendChild(button);
  }

  return { target, document, legacyClicks, actionClicks, pushoverCalls, storage };
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.defaultView = null;
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
    this.textContent = '';
    this.innerHTML = '';
    this.id = '';
    this.type = '';
    this.value = '';
    this.style = {};
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

  get childNodes() {
    return this.children;
  }

  set className(value) {
    this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
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
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes[name] = text;
    if (name === 'id') this.id = text;
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

  click() {
    for (const handler of this.eventHandlers.click || []) handler.call(this, { target: this });
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
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  const attrMatch = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (!attrMatch) return element.tagName.toLowerCase() === selector.toLowerCase();
  const [, name, expected] = attrMatch;
  const value = element.getAttribute(name);
  return expected === undefined ? value != null : value === expected;
}

function toDatasetKey(name) {
  return name.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}

const { target, document, legacyClicks, actionClicks, pushoverCalls, storage } = createFakeTarget();
const api = installIndexNativeRibbon(target);

assert.equal(api.version, 'm22-native-index-ribbon');
assert.equal(api.state.activeMode, 'modeling');
assert.equal(document.body.dataset.ssActiveMode, 'modeling');
assert.equal(document.body.classList.contains('ss-native-ui'), true);
assert.equal(document.getElementById('ssModeTabs').querySelectorAll('[data-ss-mode]').length, 4);
assert.equal(document.getElementById('ssNativeRibbon').querySelectorAll('[data-ss-ribbon-panel]').length, 4);
assert.equal(document.getElementById('topbar').querySelector('[data-ss-ribbon-panel="common"]') != null, true);
assert.equal(document.querySelectorAll('[data-ss-ribbon-panel]').length, 5);
assert.equal(document.querySelectorAll('[data-ss-tool-proxy]').length, 0);
assert.equal(document.querySelectorAll('[data-ss-palette-toggle]').length, 1);
assert.equal(document.querySelector('[data-ss-palette-toggle]').classList.contains('active'), true);
assert.equal(document.querySelector('[data-ss-palette-toggle]').getAttribute('aria-pressed'), 'true');
assert.equal(document.querySelector('[data-ss-ribbon-items="elastic-combo"]').querySelector('#comboSel') != null, true);
assert.equal(document.querySelector('[data-ss-ribbon-items="elastic-results"]').querySelectorAll('[data-res]').length, 4);
assert.equal(document.querySelectorAll('[data-ss-action-proxy]').length, 3);
assert.equal(document.querySelector('#ssRunPushover') != null, true);
assert.equal(document.querySelector('#ssPushoverCurve') != null, true);
assert.equal(document.querySelectorAll('[data-ss-mode-proxy]').length, MEMO_RIBBON_MODES.length);
assert.equal(document.querySelector('[data-ss-ribbon-items="memo-pen"]').querySelector('#penOpts') != null, true);
assert.equal(document.querySelector('[data-ss-ribbon-panel="common"]').classList.contains('active'), true);
assert.equal(document.querySelector('[data-ss-ribbon-panel="modeling"]').classList.contains('active'), true);
assert.equal(document.querySelector('[data-ss-mode="modeling"]').classList.contains('active'), true);
assert.equal(document.querySelector('#ssNativeRibbonStyle') != null, true);
assert.match(document.querySelector('#ssNativeRibbonStyle').textContent, /\.ss-native-ribbon\{[^}]*flex-wrap:wrap/);
assert.match(document.querySelector('#ssNativeRibbonStyle').textContent, /\.ss-topbar-common\.ss-ribbon-panel\{[^}]*justify-content:flex-end/);
assert.match(document.querySelector('#ssNativeRibbonStyle').textContent, /#subbar\{[^}]*overflow-x:visible/);
assert.doesNotMatch(document.querySelector('#ssNativeRibbonStyle').textContent, /\.ss-native-ribbon\{[^}]*min-width:max-content/);

document.querySelector('[data-ss-palette-toggle]').click();
assert.equal(document.querySelector('#palette').classList.contains('collapsed'), true);
assert.equal(document.querySelector('#palette').classList.contains('show'), false);
assert.equal(document.querySelector('[data-ss-palette-toggle]').classList.contains('active'), false);
assert.equal(document.querySelector('[data-ss-palette-toggle]').getAttribute('aria-pressed'), 'false');

document.querySelector('[data-ss-palette-toggle]').click();
assert.equal(document.querySelector('#palette').classList.contains('collapsed'), false);
assert.equal(document.querySelector('#palette').classList.contains('show'), true);
assert.equal(document.querySelector('[data-ss-palette-toggle]').classList.contains('active'), true);

document.querySelector('[data-ss-action-proxy="mValidate"]').click();
assert.equal(actionClicks.mValidate, 1);

document.querySelector('#ssRunPushover').click();
assert.equal(pushoverCalls.length, 1);
assert.equal(pushoverCalls[0].direction, '+x');
assert.equal(pushoverCalls[0].steps, 8);
assert.equal(document.querySelector('#ssPushoverStatus').textContent.includes('OK'), true);
assert.equal(document.querySelector('#ssPushoverCurve').innerHTML.includes('polyline'), true);
assert.equal(getNativeUiState(target).nonlinear.available, true);

document.querySelector('[data-ss-mode-proxy="erase"]').click();
assert.equal(legacyClicks.erase, 1);
assert.equal(document.querySelector('[data-ss-mode-proxy="erase"]').classList.contains('active'), true);

api.setMode('elastic');
assert.equal(document.body.dataset.ssActiveMode, 'elastic');
assert.equal(document.querySelector('[data-ss-mode="elastic"]').classList.contains('active'), true);
assert.equal(document.querySelector('[data-ss-ribbon-panel="elastic"]').classList.contains('active'), true);
assert.equal(document.querySelector('[data-ss-ribbon-panel="modeling"]').classList.contains('active'), false);
assert.equal(legacyClicks.select, 1);
assert.equal(storage.get('s-structures:index-native-mode'), 'elastic');

api.setMode('memo');
assert.equal(document.body.dataset.ssActiveMode, 'memo');
assert.equal(legacyClicks.draw, 1);

assert.equal(normalizeNativeMode('missing'), 'modeling');
assert.equal(getNativeUiState(target).modes.length, NATIVE_MAIN_MODES.length);
assert.equal(getNativeUiState(target).ribbon.available, true);

console.log(JSON.stringify({
  ok: true,
  modes: NATIVE_MAIN_MODES.length,
  activeMode: getNativeUiState(target).activeMode,
  selectClicks: legacyClicks.select,
  drawClicks: legacyClicks.draw,
}, null, 2));
