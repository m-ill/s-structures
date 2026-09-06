import { resolveMaterialRecord, resolveSectionRecord } from '../materials/registry.js';
import { computeSectionProperties } from '../materials/sectionProperties.js';
import { ensureAgentState } from './indexAgentActions.js';
import { installFloatingPanel } from './floatingPanel.js';

export const INDEX_SECTION_LIBRARY_PANEL_VERSION = 'p7-practical-section-library-panel-v1';

const SHAPE_FIELDS = Object.freeze({
  SQUARE: [['B', '한 변 B', 400]],
  RECT: [['B', '폭 B', 300], ['H', '높이 H', 600]],
  CIRC: [['D', '직경 D', 400]],
  H: [['H', '높이 H', 300], ['B', '폭 B', 150], ['tw', '웨브 tw', 6.5], ['tf', '플랜지 tf', 9]],
  BOX: [['H', '높이 H', 300], ['B', '폭 B', 300], ['t', '두께 t', 12]],
  PIPE: [['D', '외경 D', 165.2], ['t', '두께 t', 5]],
  GENERAL: [['A', '면적 A (cm²)', 100], ['Iy', 'Iy (cm⁴)', 10000], ['Iz', 'Iz (cm⁴)', 10000], ['J', 'J (cm⁴)', 1000]],
});

export function installIndexSectionLibraryPanel(target = globalThis, nativeModeler) {
  const doc = target?.document;
  const materialSelect = doc?.getElementById?.('matSel');
  const sectionSelect = doc?.getElementById?.('secSel');
  if (!doc?.createElement || !materialSelect || !sectionSelect || !nativeModeler?.executeCommand) return null;
  if (target.SStructuresSectionLibraryPanel) {
    target.SStructuresSectionLibraryPanel.refresh();
    return target.SStructuresSectionLibraryPanel;
  }

  installStyles(doc);
  const controls = installPaletteControls(doc, sectionSelect);
  const panel = buildEditorPanel(target, nativeModeler);
  const state = {
    lastMaterialRef: null,
    lastSectionRef: null,
    lastResult: null,
  };

  const api = {
    version: INDEX_SECTION_LIBRARY_PANEL_VERSION,
    refresh(options = {}) {
      const materialRef = options.materialRef || state.lastMaterialRef || materialSelect.value;
      const sectionRef = options.sectionRef || state.lastSectionRef || sectionSelect.value;
      populateLibrarySelect(nativeModeler, materialSelect, 'material', materialRef);
      populateLibrarySelect(nativeModeler, sectionSelect, 'section', sectionRef);
      state.lastMaterialRef = materialSelect.value;
      state.lastSectionRef = sectionSelect.value;
      renderSectionProperties(target, sectionSelect.value);
      return api.getState();
    },
    openEditor() {
      panel.style.display = 'block';
      panel.hidden = false;
      panel.__SStructuresFloatingPanel?.clamp?.();
      updateEditorPreview(target, nativeModeler, panel);
      return api.getState();
    },
    closeEditor() {
      panel.style.display = 'none';
      panel.hidden = true;
      return api.getState();
    },
    applySelection() {
      const memberIds = selectedMemberIds(target);
      if (!memberIds.length) {
        setPaletteStatus(controls.status, '부재를 먼저 선택하세요.', 'warning');
        return { ok: false, changed: false, errors: ['member-selection-required'] };
      }
      const result = nativeModeler.executeCommand('assignLibraryToMembers', {
        memberIds,
        materialRef: materialSelect.value,
        sectionRef: sectionSelect.value,
      });
      state.lastResult = result;
      setPaletteStatus(
        controls.status,
        result.ok ? `${memberIds.length}개 부재에 적용했습니다.` : formatErrors(result.errors),
        result.ok ? 'ok' : 'error',
      );
      return result;
    },
    createSection() {
      const record = editorRecord(panel);
      const preview = nativeModeler.executeCommand('previewLibraryDefinition', {
        libraryKind: 'section',
        record,
      });
      if (!preview.ok) {
        setEditorStatus(panel, formatErrors(preview.errors), 'error');
        state.lastResult = preview;
        return preview;
      }
      const result = nativeModeler.executeCommand('createLibraryDefinition', {
        libraryKind: 'section',
        record: preview.record,
      });
      state.lastResult = result;
      if (!result.ok) {
        setEditorStatus(panel, formatErrors(result.errors), 'error');
        return result;
      }
      const ref = `${preview.record.id}@${preview.record.version || 1}`;
      api.refresh({ sectionRef: ref });
      sectionSelect.value = ref;
      state.lastSectionRef = ref;
      renderSectionProperties(target, ref);
      setEditorStatus(panel, `${preview.record.name || preview.record.id}을 프로젝트 단면으로 저장했습니다.`, 'ok');
      setPaletteStatus(controls.status, '새 단면이 현재 그리기 기본값으로 선택되었습니다.', 'ok');
      return result;
    },
    getState() {
      return {
        version: INDEX_SECTION_LIBRARY_PANEL_VERSION,
        materialRef: materialSelect.value || null,
        sectionRef: sectionSelect.value || null,
        editorOpen: panel.style.display !== 'none' && !panel.hidden,
        selectedMemberIds: selectedMemberIds(target),
        lastResultOk: state.lastResult?.ok ?? null,
      };
    },
  };

  controls.open.addEventListener?.('click', () => api.openEditor());
  controls.apply.addEventListener?.('click', () => api.applySelection());
  panel.querySelector?.('#ssSectionEditorClose')?.addEventListener?.('click', () => api.closeEditor());
  panel.querySelector?.('#ssSectionEditorSave')?.addEventListener?.('click', () => api.createSection());
  const shape = panel.querySelector?.('#ssSectionShape');
  shape?.addEventListener?.('change', () => {
    renderDimensionInputs(doc, panel, shape.value);
    updateGeneratedIdentity(panel);
    updateEditorPreview(target, nativeModeler, panel);
  });
  panel.addEventListener?.('input', (event) => {
    if (event.target?.id === 'ssSectionId' || event.target?.id === 'ssSectionName') return;
    updateGeneratedIdentity(panel);
    updateEditorPreview(target, nativeModeler, panel);
  });
  materialSelect.onchange = () => {
    state.lastMaterialRef = materialSelect.value;
    renderMaterialStatus(target, controls.status, materialSelect.value);
  };
  sectionSelect.onchange = () => {
    state.lastSectionRef = sectionSelect.value;
    renderSectionProperties(target, sectionSelect.value);
  };

  const legacyApply = doc.getElementById?.('applySec');
  if (legacyApply) {
    legacyApply.style.display = 'none';
    legacyApply.setAttribute?.('aria-hidden', 'true');
  }

  target.SStructuresSectionLibraryPanel = api;
  api.refresh({ materialRef: 'SS275@1', sectionRef: 'h300@1' });
  return api;
}

export function currentPaletteReferences(target = globalThis) {
  return {
    matId: target?.document?.getElementById?.('matSel')?.value || null,
    secId: target?.document?.getElementById?.('secSel')?.value || null,
  };
}

function installPaletteControls(doc, sectionSelect) {
  let root = doc.getElementById?.('ssPracticalSectionControls');
  if (!root) {
    root = doc.createElement('div');
    root.id = 'ssPracticalSectionControls';
    root.className = 'ss-section-quick-actions';
    const open = button(doc, 'ssOpenSectionEditor', '＋ 단면 만들기');
    const apply = button(doc, 'ssApplyLibrarySelection', '✓ 선택 부재 적용');
    root.appendChild(open);
    root.appendChild(apply);
    sectionSelect.parentNode?.insertBefore?.(root, sectionSelect.nextSibling || null);
  }
  let status = doc.getElementById?.('ssSectionPaletteStatus');
  if (!status) {
    status = doc.createElement('div');
    status.id = 'ssSectionPaletteStatus';
    status.className = 'ss-section-palette-status';
    root.parentNode?.insertBefore?.(status, root.nextSibling || null);
  }
  return {
    root,
    open: doc.getElementById?.('ssOpenSectionEditor'),
    apply: doc.getElementById?.('ssApplyLibrarySelection'),
    status,
  };
}

function buildEditorPanel(target, nativeModeler) {
  const doc = target.document;
  const existing = doc.getElementById?.('ssSectionEditor');
  if (existing) return existing;
  const panel = doc.createElement('section');
  panel.id = 'ssSectionEditor';
  panel.className = 'ss-section-editor';
  panel.hidden = true;
  panel.style.display = 'none';
  panel.style.left = '96px';
  panel.style.top = '96px';
  panel.style.width = '410px';
  panel.style.height = '560px';

  const header = doc.createElement('header');
  header.className = 'ss-section-editor-header';
  header.setAttribute('data-ss-floating-handle', '1');
  const title = doc.createElement('h2');
  title.textContent = '프로젝트 단면 만들기';
  header.appendChild(title);
  const close = button(doc, 'ssSectionEditorClose', '×');
  close.title = '닫기';
  close.setAttribute?.('aria-label', '단면 편집기 닫기');
  header.appendChild(close);
  panel.appendChild(header);

  const body = doc.createElement('div');
  body.className = 'ss-section-editor-body';
  appendField(doc, body, 'ssSectionShape', '형상', 'select', 'SQUARE', Object.keys(SHAPE_FIELDS));
  appendField(doc, body, 'ssSectionId', '단면 ID', 'text', 'SEC-SQUARE-400');
  appendField(doc, body, 'ssSectionName', '표시 이름', 'text', 'SQUARE 400x400');
  const dimensions = doc.createElement('div');
  dimensions.id = 'ssSectionDimensions';
  dimensions.className = 'ss-section-dimensions';
  body.appendChild(dimensions);
  renderDimensionInputs(doc, panelWithBody(panel, body), 'SQUARE');

  const visual = doc.createElement('div');
  visual.className = 'ss-section-visual';
  const canvas = doc.createElement('canvas');
  canvas.id = 'ssSectionPreviewCanvas';
  canvas.width = 260;
  canvas.height = 160;
  canvas.setAttribute?.('aria-label', '단면 형상 미리보기');
  visual.appendChild(canvas);
  const summary = doc.createElement('div');
  summary.id = 'ssSectionPropertySummary';
  summary.className = 'ss-section-property-summary';
  visual.appendChild(summary);
  body.appendChild(visual);

  const status = doc.createElement('div');
  status.id = 'ssSectionEditorStatus';
  status.className = 'ss-section-editor-status';
  body.appendChild(status);
  const actions = doc.createElement('div');
  actions.className = 'ss-section-editor-actions';
  actions.appendChild(button(doc, 'ssSectionEditorSave', '✓ 프로젝트 단면 저장'));
  body.appendChild(actions);
  panel.appendChild(body);
  doc.body?.appendChild(panel);

  installFloatingPanel(target, panel, {
    storageKey: 's-structures:section-editor-panel',
    position: 'fixed',
    handleSelector: '.ss-section-editor-header',
    minWidth: 340,
    minHeight: 420,
    defaultWidth: 410,
    defaultHeight: 560,
  });
  updateEditorPreview(target, nativeModeler, panel);
  return panel;
}

function panelWithBody(panel, body) {
  if (!body.parentNode) panel.appendChild(body);
  return panel;
}

function populateLibrarySelect(nativeModeler, select, kind, requestedRef) {
  const result = nativeModeler.executeCommand('listLibrary', { kind });
  const rows = uniqueRows((result.items || []).filter((row) => row.valid));
  clearChildren(select);
  for (const row of rows) {
    const option = select.ownerDocument.createElement('option');
    option.value = row.ref;
    option.textContent = libraryLabel(row);
    option.title = `${row.scope} · ${row.ref}`;
    option.setAttribute?.('data-scope', row.scope);
    option.setAttribute?.('data-kind', kind);
    select.appendChild(option);
  }
  const fallback = kind === 'material' ? ['SS275@1', 'SS275'] : ['h300@1', 'H-300x150x6.5x9@1'];
  const candidate = [normalizeRequestedRef(requestedRef, rows), ...fallback]
    .find((ref) => rows.some((row) => row.ref === ref));
  select.value = candidate || rows[0]?.ref || '';
  select.setAttribute?.('data-phase7-library-status', 'practical-library');
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.ref)) return false;
    seen.add(row.ref);
    return true;
  });
}

function normalizeRequestedRef(ref, rows) {
  const text = String(ref || '').trim();
  if (!text) return null;
  if (rows.some((row) => row.ref === text)) return text;
  return rows.find((row) => row.id === text)?.ref || null;
}

function libraryLabel(row) {
  const scope = row.scope === 'project' ? '[프로젝트] ' : '';
  const legacy = row.legacy || row.status === 'legacy' ? ' (구규격)' : '';
  return `${scope}${row.name || row.id}${legacy}`;
}

function renderMaterialStatus(target, status, ref) {
  const material = resolveMaterialRecord(currentModel(target), ref);
  if (!material) return setPaletteStatus(status, '재료 참조를 확인하세요.', 'error');
  const fy = material.strength?.steel?.Fy ?? material.Fy;
  const suffix = Number.isFinite(Number(fy)) ? ` · Fy ${number(fy, 0)} MPa` : '';
  setPaletteStatus(status, `${material.name || material.id}${suffix}`, material.legacy ? 'warning' : 'neutral');
}

function renderSectionProperties(target, ref) {
  const container = target?.document?.getElementById?.('secProps');
  const section = resolveSectionRecord(currentModel(target), ref);
  if (!container || !section) return;
  const properties = section.properties || section;
  container.textContent = `${section.shape || section.type || 'GENERAL'} · A ${formatArea(properties.A)} · Iz ${formatInertia(properties.Iz)} · Iy ${formatInertia(properties.Iy)}`;
}

function renderDimensionInputs(doc, panel, shape) {
  const root = panel.querySelector?.('#ssSectionDimensions');
  if (!root) return;
  clearChildren(root);
  for (const [key, label, value] of SHAPE_FIELDS[shape] || []) {
    const input = appendField(doc, root, `ssSectionDim${key}`, shape === 'GENERAL' ? label : `${label} (mm)`, 'number', String(value));
    input.min = '0.001';
    input.step = key === 'tw' || key === 'tf' || key === 't' ? '0.1' : '1';
    input.setAttribute?.('data-dimension', key);
  }
}

function updateGeneratedIdentity(panel) {
  const shape = panel.querySelector?.('#ssSectionShape')?.value || 'SQUARE';
  const params = shape === 'GENERAL' ? readDirectProperties(panel, false) : readDimensions(panel);
  const dimensions = (SHAPE_FIELDS[shape] || []).map(([key]) => cleanNumber(params[key])).join('x');
  const id = panel.querySelector?.('#ssSectionId');
  const name = panel.querySelector?.('#ssSectionName');
  if (id && (!id.value || id.getAttribute?.('data-user-edited') !== '1')) id.value = `SEC-${shape}-${dimensions}`;
  if (name && (!name.value || name.getAttribute?.('data-user-edited') !== '1')) name.value = `${shape} ${dimensions}`;
}

function updateEditorPreview(target, nativeModeler, panel) {
  const record = editorRecord(panel);
  const preview = nativeModeler.executeCommand('previewLibraryDefinition', { libraryKind: 'section', record });
  const summary = panel.querySelector?.('#ssSectionPropertySummary');
  if (!preview.ok) {
    if (summary) summary.textContent = formatErrors(preview.errors);
    drawSectionPreview(panel.querySelector?.('#ssSectionPreviewCanvas'), record.shape, record.params, false);
    return preview;
  }
  if (summary) {
    summary.textContent = `A ${formatArea(preview.properties.A)}\nIy ${formatInertia(preview.properties.Iy)}\nIz ${formatInertia(preview.properties.Iz)}\nJ ${formatInertia(preview.properties.J)}`;
  }
  drawSectionPreview(panel.querySelector?.('#ssSectionPreviewCanvas'), record.shape, record.params, true);
  setEditorStatus(panel, '치수 단위 mm · 계산 속성은 모델 내부 SI 단위로 저장됩니다.', 'neutral');
  return preview;
}

function editorRecord(panel) {
  const shape = panel.querySelector?.('#ssSectionShape')?.value || 'SQUARE';
  const direct = shape === 'GENERAL';
  return {
    id: String(panel.querySelector?.('#ssSectionId')?.value || '').trim(),
    version: 1,
    name: String(panel.querySelector?.('#ssSectionName')?.value || '').trim(),
    kind: direct ? 'direct' : 'parametric',
    shape,
    ...(direct ? { properties: readDirectProperties(panel, true) } : { params: readDimensions(panel) }),
    source: { scope: 'project', note: 'Created in the modeling section editor.' },
  };
}

function readDimensions(panel) {
  const values = {};
  for (const input of panel.querySelectorAll?.('[data-dimension]') || []) {
    values[input.getAttribute('data-dimension')] = Number(input.value);
  }
  return values;
}

function readDirectProperties(panel, convertToSi) {
  const values = readDimensions(panel);
  if (!convertToSi) return values;
  return {
    A: Number(values.A) / 1e4,
    Iy: Number(values.Iy) / 1e8,
    Iz: Number(values.Iz) / 1e8,
    J: Number(values.J) / 1e8,
  };
}

function drawSectionPreview(canvas, shape, params = {}, valid) {
  const context = canvas?.getContext?.('2d');
  if (!context) return;
  const width = Number(canvas.width || 260);
  const height = Number(canvas.height || 160);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f7fafc';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = valid ? '#075985' : '#c2413b';
  context.fillStyle = valid ? '#d7eaf5' : '#f7d7d4';
  context.lineWidth = 3;
  const box = previewBox(shape, params, width, height);
  if (shape === 'CIRC' || shape === 'PIPE') {
    const radius = Math.min(box.w, box.h) / 2;
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (shape === 'PIPE') {
      const ratio = Math.max(0.05, Math.min(0.45, Number(params.t || 0) / Number(params.D || 1)));
      context.fillStyle = '#f7fafc';
      context.beginPath();
      context.arc(width / 2, height / 2, radius * (1 - 2 * ratio), 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    return;
  }
  if (shape === 'GENERAL') {
    context.fillRect(60, 42, width - 120, height - 84);
    context.strokeRect(60, 42, width - 120, height - 84);
    return;
  }
  if (shape === 'H') {
    const x = (width - box.w) / 2;
    const y = (height - box.h) / 2;
    const flange = Math.max(8, box.h * Number(params.tf || 1) / Number(params.H || 1));
    const web = Math.max(8, box.w * Number(params.tw || 1) / Number(params.B || 1));
    context.fillRect(x, y, box.w, flange);
    context.fillRect(x, y + box.h - flange, box.w, flange);
    context.fillRect(width / 2 - web / 2, y, web, box.h);
    context.strokeRect(x, y, box.w, flange);
    context.strokeRect(x, y + box.h - flange, box.w, flange);
    context.strokeRect(width / 2 - web / 2, y, web, box.h);
    return;
  }
  const x = (width - box.w) / 2;
  const y = (height - box.h) / 2;
  context.fillRect(x, y, box.w, box.h);
  context.strokeRect(x, y, box.w, box.h);
  if (shape === 'BOX') {
    const ratio = Math.max(0.03, Math.min(0.45, Number(params.t || 0) / Math.min(Number(params.B || 1), Number(params.H || 1))));
    context.fillStyle = '#f7fafc';
    context.fillRect(x + box.w * ratio, y + box.h * ratio, box.w * (1 - 2 * ratio), box.h * (1 - 2 * ratio));
    context.strokeRect(x + box.w * ratio, y + box.h * ratio, box.w * (1 - 2 * ratio), box.h * (1 - 2 * ratio));
  }
}

function previewBox(shape, params, width, height) {
  const rawWidth = Number(params.B || params.D || 1);
  const rawHeight = Number(params.H || params.D || params.B || 1);
  const scale = Math.min((width - 56) / rawWidth, (height - 32) / rawHeight);
  return { w: Math.max(24, rawWidth * scale), h: Math.max(24, rawHeight * scale) };
}

function selectedMemberIds(target) {
  const state = ensureAgentState(target);
  if (state.multiSelection?.type === 'member' && state.multiSelection.ids?.length) return [...state.multiSelection.ids];
  return state.selection?.type === 'member' && state.selection.id ? [state.selection.id] : [];
}

function currentModel(target) {
  return target?.SStructuresEngine?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : {});
}

function appendField(doc, parent, id, labelText, type, value, options = []) {
  const label = doc.createElement('label');
  label.className = 'ss-section-field';
  const text = doc.createElement('span');
  text.textContent = labelText;
  label.appendChild(text);
  const input = doc.createElement(type === 'select' ? 'select' : 'input');
  input.id = id;
  if (type !== 'select') input.type = type;
  for (const optionValue of options) {
    const option = doc.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    input.appendChild(option);
  }
  input.value = value;
  if (id === 'ssSectionId' || id === 'ssSectionName') {
    input.addEventListener?.('input', () => input.setAttribute?.('data-user-edited', '1'));
  }
  label.appendChild(input);
  parent.appendChild(label);
  return input;
}

function button(doc, id, text) {
  const element = doc.createElement('button');
  element.type = 'button';
  element.id = id;
  element.textContent = text;
  return element;
}

function setPaletteStatus(element, message, tone) {
  if (!element) return;
  element.textContent = message || '';
  element.setAttribute?.('data-tone', tone || 'neutral');
}

function setEditorStatus(panel, message, tone) {
  setPaletteStatus(panel.querySelector?.('#ssSectionEditorStatus'), message, tone);
}

function formatErrors(errors) {
  return (errors || ['처리할 수 없습니다.']).map((error) => String(error).replace(/^.*?:/, '')).join(', ');
}

function formatArea(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 1e4).toFixed(2)} cm²` : '-';
}

function formatInertia(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 1e8).toFixed(1)} cm⁴` : '-';
}

function cleanNumber(value) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? String(numberValue) : String(Math.round(numberValue * 10) / 10);
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clearChildren(element) {
  for (const child of [...(element.children || [])]) element.removeChild?.(child);
  if (Array.isArray(element.options)) element.options.length = 0;
}

function installStyles(doc) {
  if (doc.getElementById?.('ssSectionLibraryStyles')) return;
  const style = doc.createElement('style');
  style.id = 'ssSectionLibraryStyles';
  style.textContent = `
    .ss-section-quick-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px}
    .ss-section-quick-actions button{min-height:32px;border:1px solid #9db6c9;background:#fff;color:#075985;border-radius:5px;font-size:11px;font-weight:600}
    .ss-section-palette-status{min-height:28px;padding:6px 2px 0;font-size:10.5px;line-height:1.35;color:#526b7a}
    .ss-section-palette-status[data-tone="error"],.ss-section-editor-status[data-tone="error"]{color:#b42318}
    .ss-section-palette-status[data-tone="warning"],.ss-section-editor-status[data-tone="warning"]{color:#9a6700}
    .ss-section-palette-status[data-tone="ok"],.ss-section-editor-status[data-tone="ok"]{color:#18794e}
    .ss-section-editor{z-index:1200;position:fixed;display:none;overflow:hidden;background:#fff;border:1px solid #aac0d0;border-radius:7px;box-shadow:0 12px 36px rgba(18,45,64,.22);color:#183646}
    .ss-section-editor-header{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 14px;background:#075985;color:#fff;cursor:move}
    .ss-section-editor-header h2{font-size:14px;line-height:1;margin:0;letter-spacing:0}
    .ss-section-editor-header button{width:30px;height:30px;border:0;background:transparent;color:#fff;font-size:22px}
    .ss-section-editor-body{height:calc(100% - 44px);overflow:auto;padding:12px;box-sizing:border-box}
    .ss-section-field{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:8px;margin-bottom:8px;font-size:11px;font-weight:600}
    .ss-section-field input,.ss-section-field select{width:100%;min-width:0;height:32px;padding:4px 7px;border:1px solid #b8c9d5;border-radius:5px;background:#fff;box-sizing:border-box;font-size:12px}
    .ss-section-dimensions{display:grid;grid-template-columns:1fr 1fr;gap:0 10px;padding:9px 10px 1px;margin:5px 0 10px;background:#f5f8fa;border:1px solid #d7e1e8;border-radius:6px}
    .ss-section-dimensions .ss-section-field{grid-template-columns:76px minmax(0,1fr)}
    .ss-section-visual{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px;align-items:center;border:1px solid #d7e1e8;border-radius:6px;padding:8px;background:#f9fbfc}
    .ss-section-visual canvas{display:block;position:static!important;inset:auto!important;width:100%;height:160px;max-width:260px;background:#f7fafc}
    .ss-section-property-summary{white-space:pre-line;font-size:11px;line-height:1.8;color:#385568;font-variant-numeric:tabular-nums}
    .ss-section-editor-status{min-height:34px;padding:9px 2px 3px;font-size:11px;line-height:1.4}
    .ss-section-editor-actions{display:flex;justify-content:flex-end;padding-top:5px}
    .ss-section-editor-actions button{height:34px;padding:0 14px;border:1px solid #075985;border-radius:5px;background:#075985;color:#fff;font-weight:700}
    @media(max-width:560px){.ss-section-editor{max-width:calc(100vw - 16px);max-height:calc(100vh - 16px)}.ss-section-visual{grid-template-columns:1fr}.ss-section-property-summary{display:grid;grid-template-columns:1fr 1fr}.ss-section-dimensions{grid-template-columns:1fr}}
  `;
  doc.head?.appendChild?.(style);
}
