export const INDEX_NATIVE_AGENT_CONTROLS_VERSION = 'm28-native-agent-controls';

export const NATIVE_AGENT_CONTROL_ACTIONS = [
  'clickNativeControl',
  'setNativeResultToggle',
  'setNativeCombo',
  'openNativeLoadCombinations',
  'openNativeDesignReport',
  'runNativeValidation',
];

export function installIndexNativeAgentControls(target = globalThis, options = {}) {
  if (!target?.document) return null;
  if (target.SStructuresNativeAgentControls) return target.SStructuresNativeAgentControls;

  const state = {
    lastAction: null,
  };

  const api = {
    version: INDEX_NATIVE_AGENT_CONTROLS_VERSION,
    state,
    getState() {
      return buildNativeAgentControlState(target);
    },
    execute(action, payload = {}) {
      if (!NATIVE_AGENT_CONTROL_ACTIONS.includes(action)) {
        throw new Error(`Unsupported native agent control action: ${action}`);
      }
      const result = runNativeAgentControlAction(target, options.bridge, action, payload);
      state.lastAction = {
        action,
        ok: !!result.ok,
        at: new Date().toISOString(),
      };
      return { ...api.getState(), actionResult: result };
    },
  };

  target.SStructuresNativeAgentControls = api;
  return api;
}

export function buildNativeAgentControlState(target = globalThis) {
  const runtime = target?.SStructuresRuntimeAdapter?.getDiagnostics?.() || null;
  const doc = target?.document;
  return {
    version: INDEX_NATIVE_AGENT_CONTROLS_VERSION,
    available: !!doc,
    activeTool: runtime?.activeTool || readActiveValue(doc, '[data-tool]', 'data-tool'),
    activeCombo: runtime?.activeCombination || readSelectState(doc?.getElementById?.('comboSel')),
    resultToggles: runtime?.resultToggles || readToggleState(doc, '[data-res]', 'data-res'),
    player: runtime?.player || null,
    reportModal: runtime?.reportModal || readModalState(target, doc?.getElementById?.('reportModal')),
    loadCombinationModal: readModalState(target, doc?.getElementById?.('lcModal')),
    palette: runtime?.palette || null,
    controls: [...doc?.querySelectorAll?.('[data-agent-id]') || []].map((element) => ({
      id: element.getAttribute('data-agent-id'),
      disabled: !!element.disabled,
      tag: element.tagName?.toLowerCase() || null,
    })),
  };
}

function runNativeAgentControlAction(target, bridge, action, payload) {
  if (action === 'clickNativeControl') return clickNativeControl(target, payload.id || payload.controlId || payload);
  if (action === 'setNativeResultToggle') return setNativeResultToggle(target, payload.id || payload.result || payload.value, payload.on);
  if (action === 'setNativeCombo') return setNativeCombo(target, bridge, payload.comboId || payload.id || payload.value);
  if (action === 'openNativeLoadCombinations') return clickById(target, 'mLoadCombos', 'load-combinations');
  if (action === 'openNativeDesignReport') return clickById(target, 'mDesignReport', 'design-report');
  if (action === 'runNativeValidation') return clickById(target, 'mValidate', 'validation');
  throw new Error(`Unsupported native agent control action: ${action}`);
}

function clickNativeControl(target, id) {
  const controlId = String(id || '').trim();
  if (!controlId) throw new Error('Native control id is required.');
  const element = target?.document?.querySelector?.(`[data-agent-id="${cssEscape(controlId)}"]`);
  if (!element) throw new Error(`Native control not found: ${controlId}`);
  if (element.disabled) throw new Error(`Native control is disabled: ${controlId}`);
  element.click?.();
  return { ok: true, controlId };
}

function setNativeResultToggle(target, id, on) {
  const resultId = String(id || '').trim();
  if (!resultId) throw new Error('Native result id is required.');
  const button = target?.document?.querySelector?.(`[data-res="${cssEscape(resultId)}"]`);
  if (!button) throw new Error(`Native result toggle not found: ${resultId}`);
  const current = button.classList?.contains?.('on') || false;
  const desired = typeof on === 'boolean' ? on : !current;
  if (current !== desired) button.click?.();
  if ((button.classList?.contains?.('on') || false) !== desired) {
    button.classList?.toggle?.('on', desired);
    target?.draw?.();
  }
  return { ok: true, resultId, on: desired };
}

function setNativeCombo(target, bridge, comboId) {
  const combo = target?.document?.getElementById?.('comboSel');
  if (!combo) throw new Error('Native combination selector is not available.');
  combo.value = String(comboId || '');
  combo.dispatchEvent?.({ type: 'change', target: combo });
  if (typeof target?.reanalyze === 'function') target.reanalyze(true);
  return {
    ok: true,
    comboId: combo.value,
    modelAvailable: !!(bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null)),
  };
}

function clickById(target, id, label) {
  const element = target?.document?.getElementById?.(id);
  if (!element) throw new Error(`Native ${label} control is not available.`);
  if (element.disabled) throw new Error(`Native ${label} control is disabled.`);
  element.click?.();
  return { ok: true, controlId: id, label };
}

function readSelectState(select) {
  if (!select) return { available: false, value: null, label: null };
  const option = select.options?.[select.selectedIndex] || null;
  return {
    available: true,
    value: select.value || null,
    label: textOf(option) || select.value || null,
  };
}

function readToggleState(doc, selector, attr) {
  if (!doc?.querySelectorAll) return [];
  return [...doc.querySelectorAll(selector)].map((element) => ({
    id: element.getAttribute(attr),
    on: element.classList?.contains?.('on') || element.classList?.contains?.('active') || false,
    disabled: !!element.disabled,
  }));
}

function readActiveValue(doc, selector, attr) {
  const elements = [...doc?.querySelectorAll?.(selector) || []];
  const active = elements.find((element) => element.classList?.contains?.('active') || element.classList?.contains?.('on')) || null;
  return {
    available: elements.length > 0,
    value: active?.getAttribute?.(attr) || null,
    label: textOf(active) || null,
  };
}

function readModalState(target, element) {
  return {
    available: !!element,
    visible: isVisible(element, target),
    open: element?.classList?.contains?.('show') || false,
  };
}

function isVisible(element, target = globalThis) {
  if (!element) return false;
  const style = typeof target?.getComputedStyle === 'function' ? target.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  if (element.hidden) return false;
  if (element.classList?.contains?.('show')) return true;
  return !style || style.display !== 'none';
}

function textOf(element) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}
