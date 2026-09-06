import {
  createNumberControl,
  createRibbonGroup,
  createSelectControl,
} from './indexNativeRibbonDom.js';

export const PUSHOVER_DIRECTIONS = ['+x', '-x', '+y', '-y'];
export const PUSHOVER_PATTERNS = ['triangular', 'uniform', 'mass'];

export function populateNonlinearRibbon(target) {
  const doc = target?.document;
  const panel = doc?.querySelector?.('[data-ss-ribbon-panel="nonlinear"]');
  if (!panel || panel.querySelector?.('[data-ss-nonlinear-ribbon="1"]')) return;

  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-nonlinear-ribbon', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);
  populateHingeAssignmentPanel(target, panel);

  const setup = createRibbonGroup(doc, 'nonlinear-setup', '설정');
  const setupItems = setup.querySelector('[data-ss-ribbon-items]');
  setupItems.appendChild(createSelectControl(doc, {
    id: 'ssPushoverDirection',
    label: '방향',
    values: PUSHOVER_DIRECTIONS,
  }));
  setupItems.appendChild(createSelectControl(doc, {
    id: 'ssPushoverPattern',
    label: '패턴',
    values: PUSHOVER_PATTERNS,
  }));
  setupItems.appendChild(createNumberControl(doc, {
    id: 'ssPushoverSteps',
    label: '스텝',
    value: 8,
    min: 1,
    max: 80,
  }));
  panel.appendChild(setup);

  const runGroup = createRibbonGroup(doc, 'nonlinear-run', '실행');
  const runItems = runGroup.querySelector('[data-ss-ribbon-items]');
  const runButton = doc.createElement('button');
  runButton.type = 'button';
  runButton.className = 'ss-ribbon-command';
  runButton.id = 'ssRunPushover';
  runButton.setAttribute('data-ss-ribbon-item', 'run-pushover');
  runButton.setAttribute('data-agent-id', 'native-run-pushover');
  runButton.innerHTML = '<span class="ss-ribbon-icon">▶</span><span>Pushover</span>';
  runButton.addEventListener?.('click', () => runNativePushover(target));
  runItems.appendChild(runButton);

  const status = doc.createElement('span');
  status.id = 'ssPushoverStatus';
  status.className = 'ss-ribbon-status';
  status.textContent = '대기';
  status.setAttribute('data-ss-ribbon-item', 'pushover-status');
  status.setAttribute('data-agent-id', 'native-pushover-status');
  runItems.appendChild(status);
  panel.appendChild(runGroup);

  const curveGroup = createRibbonGroup(doc, 'nonlinear-curve', '곡선');
  const curveItems = curveGroup.querySelector('[data-ss-ribbon-items]');
  const curve = doc.createElement('div');
  curve.id = 'ssPushoverCurve';
  curve.className = 'ss-pushover-sparkline';
  curve.setAttribute('data-ss-ribbon-item', 'pushover-curve');
  curve.setAttribute('data-agent-id', 'native-pushover-curve');
  curveItems.appendChild(curve);
  panel.appendChild(curveGroup);
}

export function summarizeNativePushover(target) {
  const view = target?.SStructuresNativePushoverView;
  if (!view) return { available: false, status: 'Not run' };
  return {
    available: !!view.available,
    ok: !!view.ok,
    status: view.status || null,
    summary: view.summary || null,
    options: view.options || null,
  };
}

function runNativePushover(target) {
  const doc = target?.document;
  const status = doc?.getElementById?.('ssPushoverStatus');
  const curve = doc?.getElementById?.('ssPushoverCurve');
  const options = {
    direction: doc?.getElementById?.('ssPushoverDirection')?.value || '+x',
    pattern: doc?.getElementById?.('ssPushoverPattern')?.value || 'triangular',
    steps: Math.max(1, Math.trunc(Number(doc?.getElementById?.('ssPushoverSteps')?.value) || 8)),
  };

  try {
    const result = target?.SStructuresEngine?.runPushover?.(options)
      || target?.SStructuresAgent?.runPushover?.(options)
      || null;
    target.SStructuresNativePushoverView = buildNativePushoverView(result, options);
    if (status) status.textContent = target.SStructuresNativePushoverView.status;
    renderPushoverSparkline(curve, result);
    return target.SStructuresNativePushoverView;
  } catch (error) {
    target.SStructuresNativePushoverView = {
      available: false,
      status: error?.message || '실행 실패',
      options,
    };
    if (status) status.textContent = target.SStructuresNativePushoverView.status;
    if (curve) curve.innerHTML = '';
    return target.SStructuresNativePushoverView;
  }
}

function buildNativePushoverView(result, options) {
  if (!result) {
    return {
      available: false,
      status: '모델 없음',
      options,
    };
  }
  const stepCount = result.summary?.stepCount || result.curve?.length || 0;
  const baseShear = result.summary?.maxBaseShear || 0;
  const displacement = result.summary?.maxControlDisplacement || 0;
  return {
    available: true,
    ok: !!result.ok,
    status: `${result.ok ? 'OK' : 'WARN'} · ${stepCount} step · V=${formatNumber(baseShear)} · Δ=${formatNumber(displacement)}`,
    options,
    summary: {
      stepCount,
      maxBaseShear: baseShear,
      maxControlDisplacement: displacement,
      plasticMemberCount: result.summary?.plasticMemberCount || 0,
    },
    result,
  };
}

function renderPushoverSparkline(container, result) {
  if (!container) return;
  const curve = result?.curve || [];
  if (curve.length < 2) {
    container.innerHTML = '';
    return;
  }
  const width = 132;
  const height = 34;
  const maxX = Math.max(1e-9, ...curve.map((point) => Math.abs(Number(point.controlDisplacement) || 0)));
  const maxY = Math.max(1e-9, ...curve.map((point) => Math.abs(Number(point.baseShear) || 0)));
  const points = curve.map((point) => {
    const x = (Math.abs(Number(point.controlDisplacement) || 0) / maxX) * (width - 8) + 4;
    const y = height - 4 - (Math.abs(Number(point.baseShear) || 0) / maxY) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function populateHingeAssignmentPanel(target, panel) {
  const doc = target?.document;
  if (!doc || panel.querySelector?.('#ssHingePanel')) return;

  const group = createRibbonGroup(doc, 'hinge-assignment', 'Hinges');
  group.id = 'ssHingePanel';
  group.setAttribute('id', 'ssHingePanel');
  group.setAttribute('data-agent-id', 'native-hinge-panel');
  const items = group.querySelector('[data-ss-ribbon-items]');

  items.appendChild(createCheckboxControl(doc, 'ssHingeEndI', 'I', true));
  items.appendChild(createCheckboxControl(doc, 'ssHingeEndJ', 'J', true));
  items.appendChild(createHingeBackboneControl(doc));
  items.appendChild(createSelectControl(doc, {
    id: 'ssHingeType',
    label: 'Type',
    values: ['moment', 'pmm'],
  }));

  const assign = doc.createElement('button');
  assign.type = 'button';
  assign.id = 'ssHingeAssign';
  assign.setAttribute('id', 'ssHingeAssign');
  assign.className = 'ss-ribbon-command';
  assign.setAttribute('data-agent-id', 'native-hinge-assign');
  assign.textContent = 'Assign';
  assign.addEventListener?.('click', () => assignNativeHinge(target));
  items.appendChild(assign);

  const clear = doc.createElement('button');
  clear.type = 'button';
  clear.id = 'ssHingeClear';
  clear.setAttribute('id', 'ssHingeClear');
  clear.className = 'ss-ribbon-command';
  clear.setAttribute('data-agent-id', 'native-hinge-clear');
  clear.textContent = 'Clear';
  clear.addEventListener?.('click', () => clearNativeHinge(target));
  items.appendChild(clear);

  const status = doc.createElement('span');
  status.id = 'ssHingeStatus';
  status.setAttribute('id', 'ssHingeStatus');
  status.className = 'ss-ribbon-status';
  status.setAttribute('data-agent-id', 'native-hinge-status');
  status.textContent = 'Ready';
  items.appendChild(status);

  const markers = doc.createElement('div');
  markers.id = 'ssHingeMarkers';
  markers.setAttribute('id', 'ssHingeMarkers');
  markers.className = 'ss-hinge-markers';
  markers.setAttribute('data-agent-id', 'native-hinge-markers');
  items.appendChild(markers);

  panel.appendChild(group);
  refreshHingeBackboneOptions(target);
  refreshHingeMarkers(target);
}

function createCheckboxControl(doc, id, label, checked) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ribbon-field ss-ribbon-field-inline';
  wrap.setAttribute('data-ss-ribbon-item', id);
  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.setAttribute('id', id);
  input.checked = !!checked;
  wrap.appendChild(input);
  const title = doc.createElement('span');
  title.textContent = label;
  wrap.appendChild(title);
  return wrap;
}

function createHingeBackboneControl(doc) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ribbon-field';
  wrap.setAttribute('data-ss-ribbon-item', 'ssHingeBackbone');
  const title = doc.createElement('span');
  title.textContent = 'Backbone';
  wrap.appendChild(title);
  const select = doc.createElement('select');
  select.id = 'ssHingeBackbone';
  select.setAttribute('id', 'ssHingeBackbone');
  wrap.appendChild(select);
  return wrap;
}

function assignNativeHinge(target) {
  refreshHingeBackboneOptions(target);
  const doc = target?.document;
  const status = doc?.getElementById?.('ssHingeStatus');
  const memberId = selectedMemberId(target);
  if (!memberId) {
    if (status) status.textContent = 'Select member';
    return null;
  }
  const payload = {
    memberId,
    ends: selectedHingeEnds(doc),
    type: doc?.getElementById?.('ssHingeType')?.value || 'moment',
    backbone: doc?.getElementById?.('ssHingeBackbone')?.value || selectedMember(target)?.matId || 'default',
  };
  const result = target?.SStructuresAgent?.execute?.('assignHinge', payload) || null;
  const view = refreshHingeMarkers(target);
  if (status) status.textContent = `Assigned ${payload.ends.join(',')}`;
  return { result, view };
}

function clearNativeHinge(target) {
  const doc = target?.document;
  const status = doc?.getElementById?.('ssHingeStatus');
  const memberId = selectedMemberId(target);
  if (!memberId) {
    if (status) status.textContent = 'Select member';
    return null;
  }
  const ends = selectedHingeEnds(doc);
  const result = target?.SStructuresAgent?.execute?.('removeHinge', { memberId, ends }) || null;
  const view = refreshHingeMarkers(target);
  if (status) status.textContent = `Cleared ${ends.join(',')}`;
  return { result, view };
}

function refreshHingeBackboneOptions(target) {
  const doc = target?.document;
  const select = doc?.getElementById?.('ssHingeBackbone');
  if (!select) return;
  clearElement(select);
  const model = currentModel(target);
  const selected = selectedMember(target);
  const values = new Set(['default']);
  if (selected?.matId) values.add(selected.matId);
  for (const material of model?.materials || []) {
    const id = material.version ? `${material.id}@${material.version}` : material.id;
    if (id && Array.isArray(material.nonlinear?.backbone) && material.nonlinear.backbone.length >= 2) values.add(id);
  }
  for (const value of values) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = selected?.matId && values.has(selected.matId) ? selected.matId : [...values][0];
}

function refreshHingeMarkers(target) {
  const doc = target?.document;
  const markers = doc?.getElementById?.('ssHingeMarkers');
  const view = target?.SStructuresAgent?.getHingeAssignments?.() || null;
  target.SStructuresNativeHingeView = view;
  if (!markers) return view;
  clearElement(markers);
  for (const member of view?.members || []) {
    for (const hinge of member.nonlinear?.hinges || []) {
      const marker = doc.createElement('span');
      marker.className = 'ss-hinge-marker';
      marker.setAttribute('data-agent-id', `native-hinge-marker-${member.memberId}-${hinge.end}`);
      marker.setAttribute('data-member-id', member.memberId);
      marker.setAttribute('data-end', hinge.end);
      marker.textContent = `${member.memberId}:${hinge.end}`;
      markers.appendChild(marker);
    }
  }
  return view;
}

function selectedHingeEnds(doc) {
  const ends = [];
  if (doc?.getElementById?.('ssHingeEndI')?.checked !== false) ends.push('i');
  if (doc?.getElementById?.('ssHingeEndJ')?.checked === true) ends.push('j');
  return ends.length ? ends : ['i'];
}

function selectedMemberId(target) {
  const selection = target?.__SStructuresAgentState?.selection;
  return selection?.type === 'member' ? selection.id : null;
}

function selectedMember(target) {
  const id = selectedMemberId(target);
  return id ? (currentModel(target)?.members || []).find((member) => member.id === id) || null : null;
}

function currentModel(target) {
  return target?.SStructuresEngine?.getCurrentModel?.()
    || (typeof target?.model === 'function' ? target.model() : null);
}

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
  if (Array.isArray(element.children)) element.children.length = 0;
  if (Array.isArray(element.options)) element.options.length = 0;
  element.innerHTML = '';
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(3);
}
