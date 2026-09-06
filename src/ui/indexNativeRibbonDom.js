export function createSelectControl(doc, options) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ribbon-field';
  wrap.setAttribute('data-ss-ribbon-item', options.id);
  const title = doc.createElement('span');
  title.textContent = options.label;
  wrap.appendChild(title);
  const select = doc.createElement('select');
  select.id = options.id;
  for (const value of options.values) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  wrap.appendChild(select);
  return wrap;
}

export function createNumberControl(doc, options) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ribbon-field';
  wrap.setAttribute('data-ss-ribbon-item', options.id);
  const title = doc.createElement('span');
  title.textContent = options.label;
  wrap.appendChild(title);
  const input = doc.createElement('input');
  input.id = options.id;
  input.type = 'number';
  input.value = String(options.value);
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step ?? 1);
  wrap.appendChild(input);
  return wrap;
}

export function createRibbonPanel(doc, panel) {
  const element = doc.createElement('div');
  element.className = 'ss-ribbon-panel';
  element.setAttribute('data-ss-ribbon-panel', panel.id);
  element.setAttribute('data-ss-mode-owner', panel.mode);
  element.setAttribute('data-agent-id', `native-ribbon-${panel.id}`);
  return element;
}

export function createRibbonGroup(doc, id, label) {
  const group = doc.createElement('div');
  group.className = 'ss-ribbon-group';
  group.setAttribute('data-ss-ribbon-group', id);
  group.setAttribute('data-agent-id', `native-ribbon-group-${id}`);

  const title = doc.createElement('span');
  title.className = 'ss-ribbon-title';
  title.textContent = label;
  group.appendChild(title);

  const items = doc.createElement('div');
  items.className = 'ss-ribbon-items';
  items.setAttribute('data-ss-ribbon-items', id);
  group.appendChild(items);

  return group;
}
