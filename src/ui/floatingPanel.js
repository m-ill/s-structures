export const FLOATING_PANEL_VERSION = 'p5-responsive-floating-panels';

const DEFAULT_MIN_WIDTH = 240;
const DEFAULT_MIN_HEIGHT = 160;
const DEFAULT_PADDING = 8;
const DEFAULT_SNAP = 18;

export function installFloatingPanel(target = globalThis, panel, options = {}) {
  const doc = panel?.ownerDocument || target?.document;
  if (!doc?.createElement || !panel?.style) return null;
  installFloatingPanelStyles(doc);

  const existing = panel.__SStructuresFloatingPanel;
  if (existing) {
    existing.refresh(options);
    return existing;
  }

  const state = {
    action: null,
    options: normalizeOptions(options),
    startX: 0,
    startY: 0,
    startRect: null,
  };

  const api = {
    version: FLOATING_PANEL_VERSION,
    refresh(nextOptions = {}) {
      state.options = normalizeOptions({ ...state.options, ...nextOptions });
      decoratePanel(panel, state.options);
      ensureResizeHandle(target, doc, panel, state, api);
      bindDragHandles(target, panel, state);
      applySavedPlacement(target, panel, state.options);
      return api;
    },
    reset() {
      clearSavedPlacement(target, state.options);
      for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height']) panel.style[key] = '';
      return api;
    },
    clamp() {
      const rect = getPanelRect(panel, state.options);
      const next = clampFloatingRect(rect, getFloatingBounds(target, state.options), state.options);
      applyPlacement(panel, next, state.options);
      savePlacement(target, state.options, next);
      return next;
    },
    getState() {
      return {
        version: FLOATING_PANEL_VERSION,
        rect: getPanelRect(panel, state.options),
        options: {
          storageKey: state.options.storageKey,
          handleSelector: state.options.handleSelector,
          snapThreshold: state.options.snapThreshold,
        },
      };
    },
  };

  panel.__SStructuresFloatingPanel = api;
  bindDocumentPointerEvents(target, doc, panel, state);
  bindWindowResize(target, panel, state, api);
  api.refresh(options);
  return api;
}

export function clampFloatingRect(rect = {}, bounds = {}, options = {}) {
  const requestedMinWidth = finiteNumber(options.minWidth, DEFAULT_MIN_WIDTH);
  const requestedMinHeight = finiteNumber(options.minHeight, DEFAULT_MIN_HEIGHT);
  const boundsLeft = finiteNumber(bounds.left, 0);
  const boundsTop = finiteNumber(bounds.top, 0);
  const boundsWidth = Math.max(0, finiteNumber(bounds.width, 1024));
  const boundsHeight = Math.max(0, finiteNumber(bounds.height, 768));
  const minWidth = Math.min(requestedMinWidth, boundsWidth || requestedMinWidth);
  const minHeight = Math.min(requestedMinHeight, boundsHeight || requestedMinHeight);
  const maxWidth = Math.max(minWidth, Math.min(finiteNumber(options.maxWidth, boundsWidth), boundsWidth || minWidth));
  const maxHeight = Math.max(minHeight, Math.min(finiteNumber(options.maxHeight, boundsHeight), boundsHeight || minHeight));
  const width = clamp(finiteNumber(rect.width, minWidth), minWidth, maxWidth);
  const height = clamp(finiteNumber(rect.height, minHeight), minHeight, maxHeight);
  const leftMax = boundsLeft + Math.max(0, boundsWidth - width);
  const topMax = boundsTop + Math.max(0, boundsHeight - height);
  return {
    left: clamp(finiteNumber(rect.left, boundsLeft), boundsLeft, leftMax),
    top: clamp(finiteNumber(rect.top, boundsTop), boundsTop, topMax),
    width,
    height,
  };
}

export function snapFloatingRectToPeers(rect = {}, peers = [], bounds = {}, options = {}) {
  const threshold = Math.max(0, finiteNumber(options.snapThreshold, DEFAULT_SNAP));
  let next = { ...rect };
  if (!threshold) return clampFloatingRect(next, bounds, options);
  for (const peer of peers || []) {
    if (!peer) continue;
    const candidatesX = [
      [next.left, peer.left],
      [next.left, peer.left + peer.width],
      [next.left + next.width, peer.left],
      [next.left + next.width, peer.left + peer.width],
    ];
    const candidatesY = [
      [next.top, peer.top],
      [next.top, peer.top + peer.height],
      [next.top + next.height, peer.top],
      [next.top + next.height, peer.top + peer.height],
    ];
    const x = candidatesX.find(([actual, target]) => Math.abs(actual - target) <= threshold);
    const y = candidatesY.find(([actual, target]) => Math.abs(actual - target) <= threshold);
    if (x) next.left += x[1] - x[0];
    if (y) next.top += y[1] - y[0];
  }
  return clampFloatingRect(next, bounds, options);
}

export function dockFloatingRect(bounds = {}, dock = 'left', options = {}) {
  const left = finiteNumber(bounds.left, 0);
  const top = finiteNumber(bounds.top, 0);
  const width = Math.max(0, finiteNumber(bounds.width, 1024));
  const height = Math.max(0, finiteNumber(bounds.height, 768));
  const ratio = clamp(finiteNumber(options.dockRatio, 0.32), 0.2, 0.8);
  const horizontal = Math.max(0, width * ratio);
  const vertical = Math.max(0, height * ratio);
  const rects = {
    left: { left, top, width: horizontal, height },
    right: { left: left + width - horizontal, top, width: horizontal, height },
    top: { left, top, width, height: vertical },
    bottom: { left, top: top + height - vertical, width, height: vertical },
    fill: { left, top, width, height },
  };
  return clampFloatingRect(rects[dock] || rects.left, bounds, { ...options, minWidth: 0, minHeight: 0 });
}

export function snapFloatingRect(rect = {}, bounds = {}, options = {}) {
  const threshold = Math.max(0, finiteNumber(options.snapThreshold, DEFAULT_SNAP));
  const next = { ...rect };
  if (!threshold) return clampFloatingRect(next, bounds, options);
  const left = finiteNumber(bounds.left, 0);
  const top = finiteNumber(bounds.top, 0);
  const right = left + finiteNumber(bounds.width, 1024);
  const bottom = top + finiteNumber(bounds.height, 768);
  if (Math.abs(finiteNumber(next.left, left) - left) <= threshold) next.left = left;
  if (Math.abs(finiteNumber(next.top, top) - top) <= threshold) next.top = top;
  if (Math.abs((finiteNumber(next.left, left) + finiteNumber(next.width, 0)) - right) <= threshold) {
    next.left = right - finiteNumber(next.width, 0);
  }
  if (Math.abs((finiteNumber(next.top, top) + finiteNumber(next.height, 0)) - bottom) <= threshold) {
    next.top = bottom - finiteNumber(next.height, 0);
  }
  return clampFloatingRect(next, bounds, options);
}

function normalizeOptions(options = {}) {
  return {
    allowPanelHandle: options.allowPanelHandle !== false,
    boundsElement: options.boundsElement || null,
    defaultHeight: finiteNumber(options.defaultHeight, 0),
    defaultWidth: finiteNumber(options.defaultWidth, 0),
    handleSelector: options.handleSelector || '[data-ss-floating-handle]',
    maxHeight: options.maxHeight,
    maxWidth: options.maxWidth,
    minHeight: finiteNumber(options.minHeight, DEFAULT_MIN_HEIGHT),
    minWidth: finiteNumber(options.minWidth, DEFAULT_MIN_WIDTH),
    position: options.position || '',
    resize: options.resize !== false,
    snapThreshold: finiteNumber(options.snapThreshold, DEFAULT_SNAP),
    storageKey: options.storageKey || '',
    suspendClamp: typeof options.suspendClamp === 'function' ? options.suspendClamp : null,
    viewportPadding: finiteNumber(options.viewportPadding, DEFAULT_PADDING),
  };
}

function decoratePanel(panel, options) {
  panel.classList?.add?.('ss-floating-panel');
  panel.setAttribute?.('data-ss-floating-panel', '1');
  if (options.position && !panel.style.position) panel.style.position = options.position;
  if (panel.style.position === 'static') panel.style.position = options.position || 'fixed';
}

function bindDocumentPointerEvents(target, doc, panel, state) {
  if (panel.getAttribute?.('data-ss-floating-doc-bound') === '1') return;
  panel.setAttribute?.('data-ss-floating-doc-bound', '1');
  const move = (event) => moveFloatingPanel(target, panel, state, event);
  const end = () => endFloatingPanel(target, panel, state);
  doc.addEventListener?.('pointermove', move);
  doc.addEventListener?.('pointerup', end);
  doc.addEventListener?.('pointercancel', end);
}

function bindWindowResize(target, panel, state, api) {
  if (!target?.addEventListener) return;
  target.addEventListener('resize', () => {
    try {
      if (state.options.suspendClamp?.(target, panel)) return;
    } catch (_error) {
      // A responsive predicate must not break panel recovery on resize.
    }
    api.clamp();
  });
}

function bindDragHandles(target, panel, state) {
  const handles = [...panel.querySelectorAll?.(state.options.handleSelector) || []];
  if (!handles.length && state.options.allowPanelHandle) handles.push(panel);
  for (const handle of handles) {
    if (!handle || handle.getAttribute?.('data-ss-floating-handle-bound') === '1') continue;
    handle.setAttribute?.('data-ss-floating-handle-bound', '1');
    handle.setAttribute?.('data-ss-floating-handle', '1');
    handle.classList?.add?.('ss-floating-handle');
    handle.addEventListener?.('pointerdown', (event) => beginFloatingDrag(target, panel, handle, state, event));
    handle.addEventListener?.('dblclick', () => panel.__SStructuresFloatingPanel?.reset?.());
  }
}

function ensureResizeHandle(target, doc, panel, state, api) {
  if (!state.options.resize) return null;
  let handle = panel.querySelector?.('[data-ss-floating-resize]');
  if (!handle) {
    handle = doc.createElement('span');
    handle.setAttribute?.('data-ss-floating-resize', '1');
    handle.setAttribute?.('aria-hidden', 'true');
    handle.className = 'ss-floating-resize';
    panel.appendChild?.(handle);
  }
  if (handle.getAttribute?.('data-ss-floating-resize-bound') !== '1') {
    handle.setAttribute?.('data-ss-floating-resize-bound', '1');
    handle.addEventListener?.('pointerdown', (event) => beginFloatingResize(target, panel, state, event));
    handle.addEventListener?.('dblclick', () => api.reset());
  }
  return handle;
}

function beginFloatingDrag(target, panel, handle, state, event = {}) {
  if (!isPrimaryPointer(event)) return;
  if (isInteractiveElement(event.target, handle)) return;
  state.action = 'drag';
  state.startX = finiteNumber(event.clientX, 0);
  state.startY = finiteNumber(event.clientY, 0);
  state.startRect = getPanelRect(panel, state.options);
  panel.classList?.add?.('is-floating-dragging');
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault?.();
  event.stopPropagation?.();
}

function beginFloatingResize(target, panel, state, event = {}) {
  if (!isPrimaryPointer(event)) return;
  state.action = 'resize';
  state.startX = finiteNumber(event.clientX, 0);
  state.startY = finiteNumber(event.clientY, 0);
  state.startRect = getPanelRect(panel, state.options);
  panel.classList?.add?.('is-floating-resizing');
  event.target?.setPointerCapture?.(event.pointerId);
  event.preventDefault?.();
  event.stopPropagation?.();
}

function moveFloatingPanel(target, panel, state, event = {}) {
  if (!state.action || !state.startRect) return;
  const dx = finiteNumber(event.clientX, state.startX) - state.startX;
  const dy = finiteNumber(event.clientY, state.startY) - state.startY;
  const bounds = getFloatingBounds(target, state.options);
  let next = { ...state.startRect };
  if (state.action === 'drag') {
    next.left += dx;
    next.top += dy;
    next = snapFloatingRect(next, bounds, state.options);
  } else {
    next.width += dx;
    next.height += dy;
    next = snapFloatingResize(next, bounds, state.options);
  }
  applyPlacement(panel, next, state.options);
  event.preventDefault?.();
}

function endFloatingPanel(target, panel, state) {
  if (!state.action) return;
  panel.classList?.remove?.('is-floating-dragging');
  panel.classList?.remove?.('is-floating-resizing');
  const rect = clampFloatingRect(getPanelRect(panel, state.options), getFloatingBounds(target, state.options), state.options);
  applyPlacement(panel, rect, state.options);
  savePlacement(target, state.options, rect);
  state.action = null;
  state.startRect = null;
}

function snapFloatingResize(rect, bounds, options) {
  const threshold = Math.max(0, finiteNumber(options.snapThreshold, DEFAULT_SNAP));
  const next = { ...rect };
  if (threshold) {
    const right = finiteNumber(bounds.left, 0) + finiteNumber(bounds.width, 1024);
    const bottom = finiteNumber(bounds.top, 0) + finiteNumber(bounds.height, 768);
    if (Math.abs((finiteNumber(next.left, 0) + finiteNumber(next.width, 0)) - right) <= threshold) {
      next.width = right - finiteNumber(next.left, 0);
    }
    if (Math.abs((finiteNumber(next.top, 0) + finiteNumber(next.height, 0)) - bottom) <= threshold) {
      next.height = bottom - finiteNumber(next.top, 0);
    }
  }
  return clampFloatingRect(next, bounds, options);
}

function applySavedPlacement(target, panel, options) {
  if (!options.storageKey || panel.getAttribute?.('data-ss-floating-restored') === '1') return;
  panel.setAttribute?.('data-ss-floating-restored', '1');
  try {
    const raw = target?.localStorage?.getItem?.(options.storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const rect = clampFloatingRect(parsed, getFloatingBounds(target, options), options);
    applyPlacement(panel, rect, options);
  } catch (_error) {
    // Ignore invalid saved UI state.
  }
}

function savePlacement(target, options, rect) {
  if (!options.storageKey) return;
  try {
    target?.localStorage?.setItem?.(options.storageKey, JSON.stringify(rect));
  } catch (_error) {
    // Ignore private browsing/storage failures.
  }
}

function clearSavedPlacement(target, options) {
  if (!options.storageKey) return;
  try {
    target?.localStorage?.removeItem?.(options.storageKey);
  } catch (_error) {
    // Ignore storage failures.
  }
}

function applyPlacement(panel, rect, options) {
  if (options.position) panel.style.position = options.position;
  panel.style.left = `${Math.round(rect.left)}px`;
  panel.style.top = `${Math.round(rect.top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.width = `${Math.round(rect.width)}px`;
  panel.style.height = `${Math.round(rect.height)}px`;
  panel.style.maxWidth = 'none';
  panel.style.maxHeight = 'none';
}

function getPanelRect(panel, options) {
  const bounds = getFloatingBounds(panel.ownerDocument?.defaultView || globalThis, options);
  const rect = typeof panel.getBoundingClientRect === 'function' ? panel.getBoundingClientRect() : null;
  const width = readLength(panel.style.width)
    || finiteNumber(rect?.width, 0)
    || options.defaultWidth
    || options.minWidth;
  const height = readLength(panel.style.height)
    || finiteNumber(rect?.height, 0)
    || options.defaultHeight
    || options.minHeight;
  const left = readLength(panel.style.left)
    ?? (rect ? finiteNumber(rect.left, bounds.left) - finiteNumber(bounds.globalLeft, 0) : bounds.left);
  const top = readLength(panel.style.top)
    ?? (rect ? finiteNumber(rect.top, bounds.top) - finiteNumber(bounds.globalTop, 0) : bounds.top);
  return { left, top, width, height };
}

function getFloatingBounds(target, options = {}) {
  const padding = finiteNumber(options.viewportPadding, DEFAULT_PADDING);
  const element = options.boundsElement;
  if (element && typeof element.getBoundingClientRect === 'function') {
    const rect = element.getBoundingClientRect();
    return {
      left: padding,
      top: padding,
      width: Math.max(0, finiteNumber(rect.width, 0) - padding * 2),
      height: Math.max(0, finiteNumber(rect.height, 0) - padding * 2),
      globalLeft: finiteNumber(rect.left, 0),
      globalTop: finiteNumber(rect.top, 0),
    };
  }
  const doc = target?.document;
  const width = finiteNumber(target?.innerWidth, finiteNumber(doc?.documentElement?.clientWidth, 1024));
  const height = finiteNumber(target?.innerHeight, finiteNumber(doc?.documentElement?.clientHeight, 768));
  return {
    left: padding,
    top: padding,
    width: Math.max(0, width - padding * 2),
    height: Math.max(0, height - padding * 2),
    globalLeft: 0,
    globalTop: 0,
  };
}

function installFloatingPanelStyles(doc) {
  if (doc.getElementById?.('ssFloatingPanelStyles')) return;
  const style = doc.createElement('style');
  style.id = 'ssFloatingPanelStyles';
  style.setAttribute?.('id', 'ssFloatingPanelStyles');
  style.textContent = `
    .ss-floating-panel{box-sizing:border-box}
    .ss-floating-panel *{box-sizing:border-box}
    .ss-floating-handle{cursor:move;user-select:none}
    .ss-floating-panel.is-floating-dragging,
    .ss-floating-panel.is-floating-resizing{outline:2px solid rgba(0,70,127,.28);outline-offset:1px}
    .ss-floating-resize{position:absolute;right:3px;bottom:3px;width:16px;height:16px;z-index:5;cursor:nwse-resize;border-right:2px solid #8fa8bb;border-bottom:2px solid #8fa8bb;opacity:.75}
    .ss-floating-resize:hover{opacity:1}
  `;
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}

function isPrimaryPointer(event = {}) {
  return event.button == null || event.button === 0;
}

function isInteractiveElement(element, stopAt) {
  let item = element;
  while (item) {
    const tag = String(item.tagName || '').toUpperCase();
    if (['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'LABEL'].includes(tag)) return true;
    if (item.getAttribute?.('contenteditable') === 'true') return true;
    if (item.getAttribute?.('data-ss-floating-resize') != null) return true;
    if (item === stopAt) return false;
    item = item.parentNode;
  }
  return false;
}

function readLength(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
