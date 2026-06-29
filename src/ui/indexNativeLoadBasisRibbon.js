import {
  createNumberControl,
  createRibbonGroup,
  createSelectControl,
} from './indexNativeRibbonDom.js';

export const LOAD_BASIS_OCCUPANCIES = ['office', 'residential', 'school', 'hospital', 'parking', 'warehouse'];
export const LOAD_BASIS_FIELDS = [
  { id: 'deadLoad', controlId: 'ssLoadBasisDead', label: 'D', value: 5.0, min: 0, max: 30, step: 0.1 },
  { id: 'liveLoad', controlId: 'ssLoadBasisLive', label: 'L', value: 2.5, min: 0, max: 30, step: 0.1 },
  { id: 'roofLiveLoad', controlId: 'ssLoadBasisRoofLive', label: 'Lr', value: 1.0, min: 0, max: 30, step: 0.1 },
  { id: 'windPressureX', controlId: 'ssLoadBasisWindX', label: 'WX', value: 0.7, min: 0, max: 10, step: 0.05 },
  { id: 'windPressureY', controlId: 'ssLoadBasisWindY', label: 'WY', value: 0.7, min: 0, max: 10, step: 0.05 },
  { id: 'seismicCoefficientX', controlId: 'ssLoadBasisSeisX', label: 'EX', value: 0.10, min: 0, max: 2, step: 0.01 },
  { id: 'seismicCoefficientY', controlId: 'ssLoadBasisSeisY', label: 'EY', value: 0.10, min: 0, max: 2, step: 0.01 },
];

export function populateNativeLoadBasisControls(target, panel) {
  const doc = target?.document;
  if (!doc || panel.querySelector?.('[data-ss-native-load-basis="1"]')) return;
  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-native-load-basis', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);

  const group = createRibbonGroup(doc, 'elastic-load-basis', 'Load basis');
  const items = group.querySelector('[data-ss-ribbon-items]');

  const occupancy = createSelectControl(doc, {
    id: 'ssLoadBasisOccupancy',
    label: 'Occ.',
    values: LOAD_BASIS_OCCUPANCIES,
  });
  occupancy.setAttribute('data-agent-id', 'native-load-basis-occupancy');
  occupancy.querySelector?.('select')?.addEventListener?.('change', () => fillNativeOccupancyDefaults(target));
  items.appendChild(occupancy);

  for (const field of LOAD_BASIS_FIELDS) {
    const control = createNumberControl(doc, {
      id: field.controlId,
      label: field.label,
      value: field.value,
      min: field.min,
      max: field.max,
      step: field.step,
    });
    control.setAttribute('data-agent-id', `native-load-basis-${field.id}`);
    items.appendChild(control);
  }

  const preview = doc.createElement('button');
  preview.type = 'button';
  preview.id = 'ssPreviewDesignBasisLoads';
  preview.className = 'ss-ribbon-command';
  preview.setAttribute('data-ss-ribbon-item', 'preview-design-basis-loads');
  preview.setAttribute('data-agent-id', 'native-preview-design-basis-loads');
  preview.innerHTML = '<span class="ss-ribbon-icon">?</span><span>Preview</span>';
  preview.addEventListener?.('click', () => previewNativeDesignBasis(target));
  items.appendChild(preview);

  const apply = doc.createElement('button');
  apply.type = 'button';
  apply.id = 'ssApplyDesignBasisLoads';
  apply.className = 'ss-ribbon-command';
  apply.setAttribute('data-ss-ribbon-item', 'apply-design-basis-loads');
  apply.setAttribute('data-agent-id', 'native-apply-design-basis-loads');
  apply.innerHTML = '<span class="ss-ribbon-icon">L</span><span>Apply</span>';
  apply.addEventListener?.('click', () => applyNativeDesignBasisLoads(target));
  items.appendChild(apply);

  const status = doc.createElement('span');
  status.id = 'ssLoadBasisStatus';
  status.className = 'ss-ribbon-status';
  status.textContent = 'Not applied';
  status.setAttribute('data-ss-ribbon-item', 'load-basis-status');
  status.setAttribute('data-agent-id', 'native-load-basis-status');
  items.appendChild(status);

  panel.appendChild(group);
  initializeNativeLoadBasisControls(target);
}

export function summarizeNativeLoadBasis(target) {
  const view = target?.SStructuresNativeLoadBasisView;
  if (!view) return { available: false, status: 'Not configured' };
  return {
    available: !!view.available,
    status: view.status || null,
    basis: view.basis || null,
    previewSummary: view.previewSummary || null,
    appliedSummary: view.appliedSummary || null,
    generatedModelLoadCount: view.generatedModelLoadCount || 0,
  };
}

function initializeNativeLoadBasisControls(target) {
  const state = target?.SStructuresAgent?.getDesignBasisInput?.() || {
    basis: defaultNativeDesignBasis(),
    preview: { summary: {} },
  };
  writeNativeDesignBasisControls(target?.document, state.basis);
  target.SStructuresNativeLoadBasisView = buildNativeLoadBasisView(state, 'ready');
  updateNativeLoadBasisStatus(target);
}

function fillNativeOccupancyDefaults(target) {
  const doc = target?.document;
  const occupancy = doc?.getElementById?.('ssLoadBasisOccupancy')?.value || 'office';
  writeNativeDesignBasisControls(doc, defaultNativeDesignBasis(occupancy));
}

function previewNativeDesignBasis(target) {
  const agent = target?.SStructuresAgent;
  if (!agent) return setNativeLoadBasisError(target, 'Agent unavailable');
  try {
    const designBasis = readNativeDesignBasisInput(target.document);
    const result = agent.execute?.('setDesignBasisInput', { designBasis });
    const state = result?.designBasisInput || agent.getDesignBasisInput?.({ designBasis });
    target.SStructuresNativeLoadBasisView = buildNativeLoadBasisView(state, 'preview');
    updateNativeLoadBasisStatus(target);
    return target.SStructuresNativeLoadBasisView;
  } catch (error) {
    return setNativeLoadBasisError(target, error?.message || 'Preview failed');
  }
}

function applyNativeDesignBasisLoads(target) {
  const agent = target?.SStructuresAgent;
  if (!agent) return setNativeLoadBasisError(target, 'Agent unavailable');
  try {
    const designBasis = readNativeDesignBasisInput(target.document);
    const result = agent.execute?.('applyDesignBasisLoads', { designBasis });
    const state = agent.getDesignBasisInput?.({ designBasis }) || { basis: designBasis, applied: result?.loadEstimation };
    target.SStructuresNativeLoadBasisView = buildNativeLoadBasisView(state, 'applied');
    updateNativeLoadBasisStatus(target);
    return target.SStructuresNativeLoadBasisView;
  } catch (error) {
    return setNativeLoadBasisError(target, error?.message || 'Apply failed');
  }
}

function readNativeDesignBasisInput(doc) {
  const basis = {
    occupancy: doc?.getElementById?.('ssLoadBasisOccupancy')?.value || 'office',
  };
  for (const field of LOAD_BASIS_FIELDS) {
    basis[field.id] = readNumber(doc?.getElementById?.(field.controlId), field.value);
  }
  return basis;
}

function writeNativeDesignBasisControls(doc, basis = {}) {
  const next = { ...defaultNativeDesignBasis(basis.occupancy), ...basis };
  const occupancy = doc?.getElementById?.('ssLoadBasisOccupancy');
  if (occupancy) occupancy.value = next.occupancy || 'office';
  for (const field of LOAD_BASIS_FIELDS) {
    const input = doc?.getElementById?.(field.controlId);
    if (input) input.value = formatControlNumber(next[field.id] ?? field.value);
  }
}

function buildNativeLoadBasisView(state, status) {
  const summary = state?.preview?.summary || state?.applied?.summary || {};
  return {
    available: !!state,
    status,
    version: state?.version || null,
    basis: state?.basis || null,
    previewSummary: state?.preview?.summary || null,
    appliedSummary: state?.applied?.summary || null,
    generatedModelLoadCount: state?.generatedModelLoadCount ?? summary.generatedLoadCount ?? 0,
  };
}

function updateNativeLoadBasisStatus(target) {
  const status = target?.document?.getElementById?.('ssLoadBasisStatus');
  if (!status) return;
  const view = target?.SStructuresNativeLoadBasisView;
  if (!view?.available) {
    status.textContent = view?.status || 'Not available';
    return;
  }
  const summary = view.appliedSummary || view.previewSummary || {};
  const count = view.generatedModelLoadCount || summary.generatedLoadCount || 0;
  const dead = formatNumber(summary.totalDead || 0);
  const wind = formatNumber(summary.totalWindX || 0);
  status.textContent = `${view.status}: ${count} loads, D=${dead}, WX=${wind}`;
}

function setNativeLoadBasisError(target, message) {
  target.SStructuresNativeLoadBasisView = {
    available: false,
    status: message,
  };
  updateNativeLoadBasisStatus(target);
  return target.SStructuresNativeLoadBasisView;
}

function defaultNativeDesignBasis(occupancy = 'office') {
  const presets = {
    office: { deadLoad: 5.0, liveLoad: 2.5, roofLiveLoad: 1.0 },
    residential: { deadLoad: 4.5, liveLoad: 2.0, roofLiveLoad: 1.0 },
    school: { deadLoad: 5.0, liveLoad: 3.0, roofLiveLoad: 1.0 },
    hospital: { deadLoad: 5.5, liveLoad: 3.0, roofLiveLoad: 1.0 },
    parking: { deadLoad: 5.5, liveLoad: 4.0, roofLiveLoad: 1.0 },
    warehouse: { deadLoad: 4.0, liveLoad: 5.0, roofLiveLoad: 1.0 },
  };
  return {
    occupancy,
    ...(presets[occupancy] || presets.office),
    windPressureX: 0.7,
    windPressureY: 0.7,
    seismicCoefficientX: 0.10,
    seismicCoefficientY: 0.10,
  };
}

function readNumber(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function formatControlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toFixed(4))) : '0';
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(3);
}
