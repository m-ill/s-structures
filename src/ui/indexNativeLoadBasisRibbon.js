import {
  createNumberControl,
  createRibbonGroup,
  createSelectControl,
} from './indexNativeRibbonDom.js';

export const LOAD_BASIS_OCCUPANCIES = ['office', 'residential', 'school', 'hospital', 'parking', 'warehouse'];
export const LOAD_BASIS_FIELDS = [
  { id: 'floorArea', controlId: 'ssLoadBasisFloorArea', label: 'A', value: 0, min: 0, max: 100000, step: 1 },
  { id: 'roofArea', controlId: 'ssLoadBasisRoofArea', label: 'Ar', value: 0, min: 0, max: 100000, step: 1 },
  { id: 'deadLoad', controlId: 'ssLoadBasisDead', label: 'D', value: 5.0, min: 0, max: 30, step: 0.1 },
  { id: 'liveLoad', controlId: 'ssLoadBasisLive', label: 'L', value: 2.5, min: 0, max: 30, step: 0.1 },
  { id: 'roofLiveLoad', controlId: 'ssLoadBasisRoofLive', label: 'Lr', value: 1.0, min: 0, max: 30, step: 0.1 },
  { id: 'windPressureX', controlId: 'ssLoadBasisWindX', label: 'WX', value: 0.7, min: 0, max: 10, step: 0.05 },
  { id: 'windPressureY', controlId: 'ssLoadBasisWindY', label: 'WY', value: 0.7, min: 0, max: 10, step: 0.05 },
  { id: 'seismicCoefficientX', controlId: 'ssLoadBasisSeisX', label: 'EX', value: 0.10, min: 0, max: 2, step: 0.01 },
  { id: 'seismicCoefficientY', controlId: 'ssLoadBasisSeisY', label: 'EY', value: 0.10, min: 0, max: 2, step: 0.01 },
  { id: 'seismicLiveLoadFactor', controlId: 'ssLoadBasisSeisLiveFactor', label: 'psiE', value: 0.25, min: 0, max: 1, step: 0.05 },
  { id: 'accidentalEccentricityRatio', controlId: 'ssLoadBasisAccEcc', label: 'eA', value: 0.05, min: 0, max: 0.3, step: 0.01 },
];

export function populateNativeLoadBasisControls(target, panel) {
  const doc = target?.document;
  if (!doc || panel.querySelector?.('[data-ss-native-load-basis="1"]')) return;
  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-native-load-basis', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);

  const group = createRibbonGroup(doc, 'elastic-load-basis', 'Load basis');
  group.id = 'ssKdsPanel';
  group.setAttribute('id', 'ssKdsPanel');
  group.setAttribute('data-agent-id', 'native-kds-panel');
  const items = group.querySelector('[data-ss-ribbon-items]');

  const occupancy = createSelectControl(doc, {
    id: 'ssLoadBasisOccupancy',
    label: 'Occ.',
    values: LOAD_BASIS_OCCUPANCIES,
  });
  occupancy.setAttribute('data-agent-id', 'native-load-basis-occupancy');
  occupancy.querySelector?.('select')?.addEventListener?.('change', () => {
    syncLoadBasisToKdsAlias(target);
    fillNativeOccupancyDefaults(target);
  });
  items.appendChild(occupancy);
  items.appendChild(createKdsSelect(doc, 'ssKdsOccupancy', LOAD_BASIS_OCCUPANCIES, 'office', () => {
    syncKdsAliasToLoadBasis(target);
    fillNativeOccupancyDefaults(target);
  }));
  items.appendChild(createKdsSelect(doc, 'ssKdsRegion', ['seoul', 'central', 'southern', 'coastal'], 'seoul'));
  items.appendChild(createKdsSelect(doc, 'ssKdsSoil', ['S1', 'S2', 'S3', 'S4', 'S5'], 'S2'));
  items.appendChild(createKdsSelect(doc, 'ssKdsImportance', ['1.0', '1.2', '1.5'], '1.0'));

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
  const kdsPreview = doc.createElement('button');
  kdsPreview.type = 'button';
  kdsPreview.id = 'ssKdsPreview';
  kdsPreview.className = 'ss-ribbon-command';
  kdsPreview.setAttribute('data-ss-ribbon-item', 'kds-preview-design-basis-loads');
  kdsPreview.setAttribute('data-agent-id', 'native-kds-preview');
  kdsPreview.innerHTML = '<span class="ss-ribbon-icon">K</span><span>KDS Preview</span>';
  kdsPreview.addEventListener?.('click', () => previewNativeDesignBasis(target));
  items.appendChild(kdsPreview);

  const apply = doc.createElement('button');
  apply.type = 'button';
  apply.id = 'ssApplyDesignBasisLoads';
  apply.className = 'ss-ribbon-command';
  apply.setAttribute('data-ss-ribbon-item', 'apply-design-basis-loads');
  apply.setAttribute('data-agent-id', 'native-apply-design-basis-loads');
  apply.innerHTML = '<span class="ss-ribbon-icon">L</span><span>Apply</span>';
  apply.addEventListener?.('click', () => applyNativeDesignBasisLoads(target));
  items.appendChild(apply);
  const kdsApply = doc.createElement('button');
  kdsApply.type = 'button';
  kdsApply.id = 'ssKdsApply';
  kdsApply.className = 'ss-ribbon-command';
  kdsApply.setAttribute('data-ss-ribbon-item', 'kds-apply-design-basis-loads');
  kdsApply.setAttribute('data-agent-id', 'native-kds-apply');
  kdsApply.innerHTML = '<span class="ss-ribbon-icon">K</span><span>KDS Apply</span>';
  kdsApply.addEventListener?.('click', () => applyNativeDesignBasisLoads(target));
  items.appendChild(kdsApply);

  const massInput = doc.createElement('input');
  massInput.id = 'ssFloorMassPerFloor';
  massInput.setAttribute('id', 'ssFloorMassPerFloor');
  massInput.type = 'number';
  massInput.value = '10';
  massInput.min = '0';
  massInput.step = '0.1';
  massInput.setAttribute('data-ss-ribbon-item', 'floor-mass-per-floor');
  massInput.setAttribute('data-agent-id', 'native-floor-mass-per-floor');
  items.appendChild(massInput);

  const massApply = doc.createElement('button');
  massApply.type = 'button';
  massApply.id = 'ssFloorMassGenerate';
  massApply.className = 'ss-ribbon-command';
  massApply.setAttribute('data-ss-ribbon-item', 'generate-floor-mass');
  massApply.setAttribute('data-agent-id', 'native-generate-floor-mass');
  massApply.innerHTML = '<span class="ss-ribbon-icon">M</span><span>Floor Mass</span>';
  massApply.addEventListener?.('click', () => generateNativeFloorMass(target));
  items.appendChild(massApply);

  const status = doc.createElement('span');
  status.id = 'ssLoadBasisStatus';
  status.className = 'ss-ribbon-status';
  status.textContent = 'Not applied';
  status.setAttribute('data-ss-ribbon-item', 'load-basis-status');
  status.setAttribute('data-agent-id', 'native-load-basis-status');
  items.appendChild(status);
  const massStatus = doc.createElement('span');
  massStatus.id = 'ssFloorMassStatus';
  massStatus.setAttribute('id', 'ssFloorMassStatus');
  massStatus.className = 'ss-ribbon-status';
  massStatus.textContent = 'Mass not generated';
  massStatus.setAttribute('data-ss-ribbon-item', 'floor-mass-status');
  massStatus.setAttribute('data-agent-id', 'native-floor-mass-status');
  items.appendChild(massStatus);

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
    combinationCount: view.combinationCount || 0,
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
  const occupancy = doc?.getElementById?.('ssKdsOccupancy')?.value || doc?.getElementById?.('ssLoadBasisOccupancy')?.value || 'office';
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
    const combos = agent.execute?.('applyKdsRuleBasedLoadCombinations', { append: false });
    const state = agent.getDesignBasisInput?.({ designBasis }) || { basis: designBasis, applied: result?.loadEstimation };
    target.SStructuresNativeLoadBasisView = buildNativeLoadBasisView(state, 'applied');
    target.SStructuresNativeLoadBasisView.combinationCount = combos?.kdsLoadCombinations?.appliedCount || combos?.kdsLoadCombinations?.combinationIds?.length || 0;
    updateNativeLoadBasisStatus(target);
    return target.SStructuresNativeLoadBasisView;
  } catch (error) {
    return setNativeLoadBasisError(target, error?.message || 'Apply failed');
  }
}

function readNativeDesignBasisInput(doc) {
  const basis = {
    occupancy: doc?.getElementById?.('ssKdsOccupancy')?.value || doc?.getElementById?.('ssLoadBasisOccupancy')?.value || 'office',
    region: doc?.getElementById?.('ssKdsRegion')?.value || 'seoul',
    soil: doc?.getElementById?.('ssKdsSoil')?.value || 'S2',
    importance: Number(doc?.getElementById?.('ssKdsImportance')?.value || 1),
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
  const kdsOccupancy = doc?.getElementById?.('ssKdsOccupancy');
  if (kdsOccupancy) kdsOccupancy.value = next.occupancy || 'office';
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
  const combos = view.combinationCount ? `, combos=${view.combinationCount}` : '';
  status.textContent = `${view.status}: ${count} loads${combos}, D=${dead}, WX=${wind}`;
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
    floorArea: 0,
    roofArea: 0,
    windPressureX: 0.7,
    windPressureY: 0.7,
    seismicCoefficientX: 0.10,
    seismicCoefficientY: 0.10,
    seismicLiveLoadFactor: 0.25,
    accidentalEccentricityRatio: 0.05,
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

function createKdsSelect(doc, id, values, value, onChange) {
  const select = doc.createElement('select');
  select.id = id;
  select.setAttribute('id', id);
  select.setAttribute('data-ss-ribbon-item', id);
  select.setAttribute('data-agent-id', `native-${id}`);
  for (const item of values) {
    const option = doc.createElement('option');
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  }
  select.value = value;
  if (onChange) select.addEventListener?.('change', onChange);
  return select;
}

function syncKdsAliasToLoadBasis(target) {
  const doc = target?.document;
  const source = doc?.getElementById?.('ssKdsOccupancy');
  const targetInput = doc?.getElementById?.('ssLoadBasisOccupancy');
  if (source && targetInput) targetInput.value = source.value;
}

function syncLoadBasisToKdsAlias(target) {
  const doc = target?.document;
  const source = doc?.getElementById?.('ssLoadBasisOccupancy');
  const targetInput = doc?.getElementById?.('ssKdsOccupancy');
  if (source && targetInput) targetInput.value = source.value;
}

function generateNativeFloorMass(target) {
  const agent = target?.SStructuresAgent;
  const doc = target?.document;
  const status = doc?.getElementById?.('ssFloorMassStatus');
  if (!agent) {
    if (status) status.textContent = 'Agent unavailable';
    return null;
  }
  const massPerFloor = readNumber(doc?.getElementById?.('ssFloorMassPerFloor'), 10);
  const result = agent.execute?.('generateFloorMass', { massPerFloor });
  const action = result?.actionResult || {};
  if (status) status.textContent = `Mass generated: ${action.updatedNodes || 0} nodes, ${action.floorCount || 0} floors`;
  return action;
}
