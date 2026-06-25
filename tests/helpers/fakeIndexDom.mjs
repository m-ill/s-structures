export function createFakeIndexDocument() {
  return new FakeDocument();
}

export function buildNativeIndexShell(document) {
  const topbar = byId(document, 'topbar');
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
  document.querySelector('[data-mode="structure"]')?.classList.add('active');

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  topbar.appendChild(spacer);

  const subbar = byId(document, 'subbar');
  document.body.appendChild(subbar);

  for (const view of ['iso', 'plan']) {
    const button = document.createElement('button');
    button.className = 'view-btn';
    button.setAttribute('data-view', view);
    button.textContent = view;
    button.addEventListener('click', () => {
      for (const item of document.querySelectorAll('[data-view]')) item.classList.remove('active');
      button.classList.add('active');
      document.defaultView?.draw?.();
    });
    subbar.appendChild(button);
  }
  document.querySelector('[data-view="iso"]')?.classList.add('active');

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

  for (const value of ['def', 'M', 'Q', 'N', 'react', 'val', 'T', 'chk', 'nid', 'mid', 'len', 'axes', 'design', 'defl']) {
    const button = document.createElement('button');
    button.className = 'res-toggle';
    button.setAttribute('data-res', value);
    button.textContent = value;
    button.addEventListener('click', () => {
      button.classList.toggle('on');
      document.defaultView?.draw?.();
    });
    if (value === 'def' || value === 'val' || value === 'chk') button.classList.add('on');
    subbar.appendChild(button);
  }

  const reactMode = document.createElement('select');
  reactMode.id = 'reactMode';
  reactMode.setAttribute('id', 'reactMode');
  subbar.appendChild(reactMode);
  subbar.appendChild(byId(document, 'statusTxt', 'Idle'));

  const palette = byId(document, 'palette');
  palette.classList.add('show');
  for (const tool of ['smove', 'member', 'boxsel', 'column', 'addnode', 'pin', 'roller', 'fixed', 'pload', 'udl', 'mload', 'sdelete']) {
    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.setAttribute('data-tool', tool);
    button.textContent = tool;
    button.addEventListener('click', () => {
      for (const item of document.querySelectorAll('[data-tool]')) item.classList.remove('active');
      button.classList.add('active');
    });
    palette.appendChild(button);
  }
  palette.querySelector('[data-tool="smove"]')?.classList.add('active');
  document.body.appendChild(palette);

  const player = byId(document, 'playerBar');
  player.style.display = 'none';
  for (const id of ['plPrev', 'plPlay', 'plNext', 'plClose']) player.appendChild(byId(document, id));
  player.appendChild(byId(document, 'plInfo', 'Step 1/1'));
  const slider = document.createElement('input');
  slider.id = 'plSlider';
  slider.setAttribute('id', 'plSlider');
  slider.value = '0';
  slider.max = '0';
  player.appendChild(slider);
  document.body.appendChild(player);

  const propPanel = byId(document, 'propPanel');
  propPanel.style.display = 'none';
  document.body.appendChild(propPanel);
  document.body.appendChild(byId(document, 'statusChip', '-'));
  document.body.appendChild(byId(document, 'pageInfo', '1 / 1'));
  document.body.appendChild(byId(document, 'lcModal'));
  const reportModal = byId(document, 'reportModal');
  reportModal.appendChild(byId(document, 'reportBody'));
  document.body.appendChild(reportModal);

  const setExag = document.createElement('select');
  setExag.id = 'setExag';
  setExag.setAttribute('id', 'setExag');
  setExag.value = 'auto';
  document.body.appendChild(setExag);

  const menu = byId(document, 'menuDrop');
  for (const id of ['mClearPage', 'mLoadCombos', 'mDesignReport', 'mValidate', 'mSettings', 'mHelp']) {
    menu.appendChild(byId(document, id));
  }
  document.body.appendChild(menu);
}

export function byId(document, id, text = '') {
  const element = document.createElement('div');
  element.id = id;
  element.setAttribute('id', id);
  element.textContent = text;
  return element;
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
