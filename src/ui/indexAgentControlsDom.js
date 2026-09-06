export function decorateAgentControls(doc) {
  if (!doc?.querySelectorAll) return [];
  const decorated = [];
  const add = (element, id, label = null) => {
    if (!element || !id) return;
    element.setAttribute('data-agent-id', id);
    if (label && !element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
    decorated.push(id);
  };

  for (const element of doc.querySelectorAll('[id]')) {
    const id = element.getAttribute('id');
    if (isAgentRelevantId(id)) add(element, id, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-mode]')) {
    add(element, `mode-${element.getAttribute('data-mode')}`, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-tool]')) {
    add(element, `tool-${element.getAttribute('data-tool')}`, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-res]')) {
    add(element, `result-${element.getAttribute('data-res')}`, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-view]')) {
    add(element, `view-${element.getAttribute('data-view')}`, labelForElement(element));
  }
  return decorated;
}

export function listAgentControls(doc) {
  if (!doc?.querySelectorAll) return [];
  return [...doc.querySelectorAll('[data-agent-id]')].map((element) => ({
    id: element.getAttribute('data-agent-id'),
    label: labelForElement(element),
    tag: element.tagName?.toLowerCase() || null,
    disabled: !!element.disabled,
  }));
}

function isAgentRelevantId(id) {
  return new Set([
    'menuBtn',
    'prevPage',
    'nextPage',
    'newPage',
    'undoBtn',
    'redoBtn',
    'zoomOut',
    'zoomLbl',
    'zoomIn',
    'comboSel',
    'mLoadCombos',
    'mDesignReport',
    'mCalculationPackage',
    'mValidate',
    'mSettings',
    'mHelp',
    'paletteToggle',
    'playerToggle',
    'navZoomIn',
    'navZoomOut',
    'navOrbit',
    'navPan',
    'navFit',
    'propPanel',
    'statusTxt',
    'statusChip',
  ]).has(id);
}

function labelForElement(element) {
  return (
    element.getAttribute?.('aria-label') ||
    element.getAttribute?.('title') ||
    element.textContent?.replace(/\s+/g, ' ').trim() ||
    element.getAttribute?.('id') ||
    element.getAttribute?.('data-agent-id') ||
    ''
  );
}
