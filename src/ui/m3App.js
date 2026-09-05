import {
  activeCombo,
  activeResult,
  addCombination,
  applyUdlToSelection,
  buildFrameModel,
  comboFactorText,
  createM3State,
  deleteActiveCombination,
  entitySummary,
  exportModelJson,
  format,
  importModelJson,
  memberLength,
  modalSeries,
  pDeltaSeries,
  replaceModel,
  resultOptions,
  saveActiveCombination,
  selectEntity,
  setActiveCombo,
  setActiveResult,
  setPDeltaEnabled,
  utilizationClass,
} from './m3State.js';
import { createPortalFrameSample } from '../examples/sampleFrame.js';

const state = createM3State();
const el = {
  modelMeta: byId('modelMeta'),
  sampleBtn: byId('sampleBtn'),
  analyzeBtn: byId('analyzeBtn'),
  exportBtn: byId('exportBtn'),
  importInput: byId('importInput'),
  buildFrameBtn: byId('buildFrameBtn'),
  baysX: byId('baysX'),
  baysY: byId('baysY'),
  stories: byId('stories'),
  bayX: byId('bayX'),
  bayY: byId('bayY'),
  storyH: byId('storyH'),
  selectionPanel: byId('selectionPanel'),
  loadCaseSelect: byId('loadCaseSelect'),
  loadDir: byId('loadDir'),
  loadValue: byId('loadValue'),
  applyLoadBtn: byId('applyLoadBtn'),
  comboSelect: byId('comboSelect'),
  comboType: byId('comboType'),
  comboName: byId('comboName'),
  comboFactors: byId('comboFactors'),
  saveComboBtn: byId('saveComboBtn'),
  addComboBtn: byId('addComboBtn'),
  deleteComboBtn: byId('deleteComboBtn'),
  enablePDelta: byId('enablePDelta'),
  viewPlanBtn: byId('viewPlanBtn'),
  viewElevBtn: byId('viewElevBtn'),
  showDeformed: byId('showDeformed'),
  showUtilization: byId('showUtilization'),
  resultSelect: byId('resultSelect'),
  modelView: byId('modelView'),
  summary: byId('summary'),
  pDeltaSummary: byId('pDeltaSummary'),
  pDeltaChart: byId('pDeltaChart'),
  dynamicsSummary: byId('dynamicsSummary'),
  modalChart: byId('modalChart'),
  modalTable: byId('modalTable'),
  memberTable: byId('memberTable'),
  designSummary: byId('designSummary'),
  designTable: byId('designTable'),
  rcDesignSummary: byId('rcDesignSummary'),
  rcDesignTable: byId('rcDesignTable'),
  messages: byId('messages'),
};

bindEvents();
render();

function bindEvents() {
  el.sampleBtn.addEventListener('click', () => {
    replaceModel(state, createPortalFrameSample());
    render();
  });
  el.analyzeBtn.addEventListener('click', () => {
    state.analysis = null;
    import('./m3State.js').then(({ analyzeState }) => {
      analyzeState(state);
      render();
    });
  });
  el.buildFrameBtn.addEventListener('click', () => {
    replaceModel(state, buildFrameModel({
      baysX: readInt(el.baysX, 1),
      baysY: readInt(el.baysY, 1),
      stories: readInt(el.stories, 1),
      bayX: readNumber(el.bayX, 6),
      bayY: readNumber(el.bayY, 4),
      storyH: readNumber(el.storyH, 3),
    }));
    render();
  });
  el.applyLoadBtn.addEventListener('click', () => {
    applyUdlToSelection(state, {
      w: readNumber(el.loadValue, 8),
      dir: el.loadDir.value,
      loadCase: el.loadCaseSelect.value,
    });
    render();
  });
  el.comboSelect.addEventListener('change', () => {
    setActiveCombo(state, el.comboSelect.value);
    render();
  });
  el.saveComboBtn.addEventListener('click', () => {
    saveActiveCombination(state, {
      name: el.comboName.value,
      type: el.comboType.value,
      factorsText: el.comboFactors.value,
    });
    render();
  });
  el.addComboBtn.addEventListener('click', () => {
    addCombination(state);
    render();
  });
  el.deleteComboBtn.addEventListener('click', () => {
    deleteActiveCombination(state);
    render();
  });
  el.enablePDelta.addEventListener('change', () => {
    setPDeltaEnabled(state, el.enablePDelta.checked);
    render();
  });
  el.resultSelect.addEventListener('change', () => {
    setActiveResult(state, el.resultSelect.value);
    render();
  });
  el.viewPlanBtn.addEventListener('click', () => {
    state.viewMode = 'plan';
    render();
  });
  el.viewElevBtn.addEventListener('click', () => {
    state.viewMode = 'elevation';
    render();
  });
  el.showDeformed.addEventListener('change', () => {
    state.showDeformed = el.showDeformed.checked;
    render();
  });
  el.showUtilization.addEventListener('change', () => {
    state.showUtilization = el.showUtilization.checked;
    render();
  });
  el.exportBtn.addEventListener('click', () => {
    const blob = new Blob([exportModelJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 's-structures-model.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  el.importInput.addEventListener('change', async () => {
    const file = el.importInput.files?.[0];
    if (!file) return;
    importModelJson(state, await file.text());
    el.importInput.value = '';
    render();
  });
}

function render() {
  el.modelMeta.textContent = `${state.model.nodes.length} nodes - ${state.model.members.length} members - ${state.model.loads.length} loads`;
  el.viewPlanBtn.classList.toggle('active', state.viewMode === 'plan');
  el.viewElevBtn.classList.toggle('active', state.viewMode === 'elevation');
  el.showDeformed.checked = state.showDeformed;
  el.showUtilization.checked = state.showUtilization;
  el.enablePDelta.checked = Boolean(state.model.analysisSettings?.includeGeometricStiffness);
  renderLoadCases();
  renderCombinations();
  renderResultModes();
  renderSelection();
  renderSummary();
  renderPDelta();
  renderDynamics();
  renderMembers();
  renderDesign();
  renderRcDesign();
  renderMessages();
  renderView();
}

function renderLoadCases() {
  el.loadCaseSelect.innerHTML = state.model.loadCases
    .map((loadCase) => `<option value="${escapeHtml(loadCase.id)}">${escapeHtml(loadCase.id)}</option>`)
    .join('');
}

function renderCombinations() {
  const combo = activeCombo(state);
  el.comboSelect.innerHTML = (state.model.loadCombinations || [])
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)}</option>`)
    .join('');
  el.comboSelect.value = combo?.id || '';
  el.comboType.value = combo?.type || 'strength';
  el.comboName.value = combo?.name || '';
  el.comboFactors.value = comboFactorText(combo);
  el.deleteComboBtn.disabled = (state.model.loadCombinations || []).length <= 1;
}

function renderResultModes() {
  const options = resultOptions(state);
  el.resultSelect.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`)
    .join('');
  el.resultSelect.value = state.activeResultId;
}

function renderSelection() {
  const summary = entitySummary(state);
  if (!summary) {
    el.selectionPanel.textContent = 'No selection';
    return;
  }
  el.selectionPanel.innerHTML = `<strong>${escapeHtml(summary.title)}</strong><dl>${summary.rows
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('')}</dl>`;
}

function renderSummary() {
  const result = activeResult(state);
  const summary = result?.summary;
  const governing = result?.governing?.maxUtilization;
  const metrics = [
    ['Status', state.analysis?.ok ? 'OK' : 'Check'],
    ['Max Disp', summary ? `${format(summary.maxDisplacement * 1000, 2)} mm` : '-'],
    ['Max Util.', summary ? format(summary.maxUtilization, 3) : '-'],
    ['Governing', governing ? `${governing.memberId} / ${governing.comboId}` : result?.combo?.id || '-'],
    ['Residual', summary?.equilibriumResidual != null ? summary.equilibriumResidual.toExponential(2) : '-'],
    ['Load Z', summary?.totalLoad ? `${format(summary.totalLoad[2], 2)} kN` : '-'],
    ['Reaction Z', summary?.totalReaction ? `${format(summary.totalReaction[2], 2)} kN` : '-'],
  ];
  el.summary.innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderPDelta() {
  const summary = state.analysis?.pDelta?.summary;
  const governing = summary?.governing;
  const metrics = [
    ['Status', state.analysis?.pDelta ? (state.analysis.pDelta.ok ? 'OK' : 'Check') : '-'],
    ['Max Amp.', summary ? format(summary.maxAmplification, 3) : '-'],
    ['Governing', governing ? governing.comboId : '-'],
    ['Converged', summary ? `${summary.convergedCount}/${summary.comboCount}` : '-'],
  ];
  el.pDeltaSummary.innerHTML = metrics
    .map(([label, value]) => `<div class="metric compact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');
  renderPDeltaChart(pDeltaSeries(state));
}

function renderPDeltaChart(series) {
  const svg = el.pDeltaChart;
  const width = 320;
  const height = 180;
  const pad = { left: 36, right: 12, top: 14, bottom: 28 };
  if (!series.length) {
    svg.innerHTML = `<line class="chart-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
      <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line>`;
    return;
  }
  const allPoints = series.flatMap((item) => item.points);
  const maxDisp = Math.max(1e-9, ...allPoints.flatMap((point) => [
    point.firstOrderRoofDisplacement,
    point.secondOrderRoofDisplacement,
  ]));
  const maxShear = Math.max(1e-9, ...allPoints.flatMap((point) => [
    point.firstOrderBaseShear,
    point.secondOrderBaseShear,
  ]));
  const colors = ['#0f5d8f', '#1f8a58', '#b36b00', '#7b61ff'];
  const x = (disp) => pad.left + (disp / maxDisp) * (width - pad.left - pad.right);
  const y = (shear) => height - pad.bottom - (shear / maxShear) * (height - pad.top - pad.bottom);
  const lines = series.map((item, index) => {
    const color = colors[index % colors.length];
    const first = item.points.map((point) => `${x(point.firstOrderRoofDisplacement)},${y(point.firstOrderBaseShear)}`).join(' ');
    const second = item.points.map((point) => `${x(point.secondOrderRoofDisplacement)},${y(point.secondOrderBaseShear)}`).join(' ');
    const circles = item.points.map((point) => `<circle class="chart-point" cx="${x(point.secondOrderRoofDisplacement)}" cy="${y(point.secondOrderBaseShear)}" r="2.5" fill="${color}"></circle>`).join('');
    return `<polyline class="chart-line" points="${first}" stroke="${color}" stroke-dasharray="4 3"></polyline><polyline class="chart-line" points="${second}" stroke="${color}"></polyline>${circles}`;
  }).join('');
  svg.innerHTML = `
    <line class="chart-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
    <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line>
    <text class="chart-label" x="${pad.left}" y="${height - 8}">0</text>
    <text class="chart-label" x="${width - pad.right - 36}" y="${height - 8}">Roof Δ</text>
    <text class="chart-label" x="4" y="${pad.top + 4}">${format(maxShear, 2)}</text>
    <text class="chart-label" x="4" y="${height - pad.bottom - 4}">V</text>
    ${lines}
  `;
}

function renderDynamics() {
  const dynamics = state.analysis?.dynamics;
  const first = dynamics?.modes?.[0];
  const rsa = dynamics?.rsa?.combined || {};
  const metrics = [
    ['Status', dynamics ? (dynamics.ok ? 'OK' : 'Check') : '-'],
    ['T1', first ? `${format(first.period, 3)} s` : '-'],
    ['F1', first ? `${format(first.frequencyHz, 3)} Hz` : '-'],
    ['Mass X', rsa.x ? `${format(rsa.x.participatingMassRatio * 100, 1)}%` : '-'],
    ['Mass Y', rsa.y ? `${format(rsa.y.participatingMassRatio * 100, 1)}%` : '-'],
    ['RSA X', rsa.x ? `${format((rsa.x.displacement ?? rsa.x.srssDisplacement) * 1000, 2)} mm` : '-'],
  ];
  el.dynamicsSummary.innerHTML = metrics
    .map(([label, value]) => `<div class="metric compact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');
  const modes = modalSeries(state);
  el.modalTable.innerHTML = modes.map((mode) => `<tr>
    <td>${escapeHtml(mode.id)}</td>
    <td>${format(mode.period, 3)}</td>
    <td>${format(mode.frequencyHz, 3)}</td>
    <td>${format(mode.massX * 100, 1)}%</td>
    <td>${format(mode.massY * 100, 1)}%</td>
  </tr>`).join('');
  renderModalChart(modes);
}

function renderModalChart(modes) {
  const svg = el.modalChart;
  const width = 320;
  const height = 180;
  const pad = { left: 36, right: 12, top: 14, bottom: 28 };
  if (!modes.length) {
    svg.innerHTML = `<line class="chart-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
      <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line>`;
    return;
  }
  const maxPeriod = Math.max(0.01, ...modes.map((mode) => mode.period));
  const barGap = 8;
  const plotW = width - pad.left - pad.right;
  const barW = Math.max(12, (plotW - barGap * (modes.length - 1)) / modes.length);
  const y = (period) => height - pad.bottom - (period / maxPeriod) * (height - pad.top - pad.bottom);
  const bars = modes.map((mode, index) => {
    const x = pad.left + index * (barW + barGap);
    const top = y(mode.period);
    const h = height - pad.bottom - top;
    const mass = Math.max(mode.massX, mode.massY, mode.massZ);
    const cls = mass >= 0.5 ? 'modal-bar strong' : 'modal-bar';
    return `<rect class="${cls}" x="${x}" y="${top}" width="${barW}" height="${h}"></rect>
      <text class="chart-label" x="${x + barW / 2 - 8}" y="${height - 8}">${mode.index}</text>`;
  }).join('');
  svg.innerHTML = `
    <line class="chart-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
    <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line>
    <text class="chart-label" x="4" y="${pad.top + 4}">${format(maxPeriod, 2)}s</text>
    ${bars}
  `;
}

function renderMembers() {
  const resultSet = activeResult(state);
  el.memberTable.innerHTML = state.model.members.map((member) => {
    const result = resultSet?.memberResults?.[member.id];
    const ratio = result?.check?.ratio;
    const governing = result?.governing?.utilization?.comboId || result?.check?.comboId || resultSet?.combo?.id || '-';
    const loads = state.model.loads.filter((load) => load.member === member.id).length;
    return `<tr data-member="${escapeHtml(member.id)}">
      <td>${escapeHtml(member.id)}</td>
      <td>${format(memberLength(state.model, member), 2)}</td>
      <td>${Number.isFinite(ratio) ? format(ratio, 3) : '-'}</td>
      <td>${escapeHtml(governing)}</td>
      <td>${loads}</td>
    </tr>`;
  }).join('');
  for (const row of el.memberTable.querySelectorAll('tr')) {
    row.addEventListener('click', () => {
      selectEntity(state, 'member', row.dataset.member);
      render();
    });
  }
}

function renderDesign() {
  const design = state.analysis?.design?.steel;
  const summary = design?.summary;
  const metrics = [
    ['Status', design ? (design.ok ? 'OK' : 'Check') : '-'],
    ['Max Util.', summary ? format(summary.maxUtilization, 3) : '-'],
    ['Governing', summary?.governing ? `${summary.governing.memberId} / ${summary.governing.checkId}` : '-'],
    ['Checked', summary ? summary.checkedMembers : '-'],
    ['Warn', summary ? summary.warnCount : '-'],
    ['NG', summary ? summary.ngCount : '-'],
  ];
  el.designSummary.innerHTML = metrics
    .map(([label, value]) => `<div class="metric compact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');

  el.designTable.innerHTML = state.model.members.map((member) => {
    const check = design?.memberResults?.[member.id];
    if (!check) {
      return `<tr data-member="${escapeHtml(member.id)}">
        <td>${escapeHtml(member.id)}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
      </tr>`;
    }
    return `<tr data-member="${escapeHtml(member.id)}">
      <td>${escapeHtml(member.id)}</td>
      <td>${escapeHtml(check.role)}</td>
      <td>${format(check.utilization, 3)}</td>
      <td>${escapeHtml(check.governingCheck)}</td>
      <td><span class="status-pill ${escapeHtml(check.status.toLowerCase())}">${escapeHtml(check.status)}</span></td>
    </tr>`;
  }).join('');

  for (const row of el.designTable.querySelectorAll('tr')) {
    row.addEventListener('click', () => {
      selectEntity(state, 'member', row.dataset.member);
      render();
    });
  }
}

function renderRcDesign() {
  const design = state.analysis?.design?.concrete;
  const summary = design?.summary;
  const metrics = [
    ['Status', design ? (design.ok ? 'OK' : 'Check') : '-'],
    ['Max Util.', summary ? format(summary.maxUtilization, 3) : '-'],
    ['Governing', summary?.governing ? `${summary.governing.memberId} / ${summary.governing.checkId}` : '-'],
    ['Checked', summary ? summary.checkedMembers : '-'],
    ['Warn', summary ? summary.warnCount : '-'],
    ['NG', summary ? summary.ngCount : '-'],
  ];
  el.rcDesignSummary.innerHTML = metrics
    .map(([label, value]) => `<div class="metric compact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');

  el.rcDesignTable.innerHTML = state.model.members.map((member) => {
    const check = design?.memberResults?.[member.id];
    if (!check) {
      return `<tr data-member="${escapeHtml(member.id)}">
        <td>${escapeHtml(member.id)}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
      </tr>`;
    }
    const requiredAs = Math.max(check.requiredRebar.AsZ || 0, check.requiredRebar.AsY || 0);
    return `<tr data-member="${escapeHtml(member.id)}">
      <td>${escapeHtml(member.id)}</td>
      <td>${escapeHtml(check.role)}</td>
      <td>${format(check.utilization, 3)}</td>
      <td>${format(requiredAs, 0)}</td>
      <td><span class="status-pill ${escapeHtml(check.status.toLowerCase())}">${escapeHtml(check.status)}</span></td>
    </tr>`;
  }).join('');

  for (const row of el.rcDesignTable.querySelectorAll('tr')) {
    row.addEventListener('click', () => {
      selectEntity(state, 'member', row.dataset.member);
      render();
    });
  }
}

function renderMessages() {
  el.messages.innerHTML = state.messages
    .map((item) => `<div class="${escapeHtml(item.level)}">${escapeHtml(item.message)}</div>`)
    .join('');
}

function renderView() {
  const svg = el.modelView;
  const projection = makeProjection(state.model, state.viewMode, svg.viewBox.baseVal.width || 900, svg.viewBox.baseVal.height || 620);
  const result = activeResult(state);
  const deformed = state.showDeformed && result ? deformedNodeMap(state.model, result, projection.scale) : null;
  const resultSet = activeResult(state);
  svg.innerHTML = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#b42318"></path></marker></defs>${gridLines(projection)}`;

  if (deformed) {
    svg.insertAdjacentHTML('beforeend', state.model.members.map((member) => {
      const a = deformed.get(member.n1);
      const b = deformed.get(member.n2);
      return `<line class="deformed" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
    }).join(''));
  }

  svg.insertAdjacentHTML('beforeend', state.model.members.map((member) => {
    const a = projection.project(nodeById(member.n1));
    const b = projection.project(nodeById(member.n2));
    const ratio = resultSet?.memberResults?.[member.id]?.check?.ratio;
    const cls = [
      'member',
      state.showUtilization ? utilizationClass(ratio) : '',
      state.selected.type === 'member' && state.selected.id === member.id ? 'selected' : '',
    ].filter(Boolean).join(' ');
    return `<line class="${cls}" data-member="${escapeHtml(member.id)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
  }).join(''));

  svg.insertAdjacentHTML('beforeend', state.model.loads.filter((load) => load.member).map((load) => {
    const member = state.model.members.find((item) => item.id === load.member);
    if (!member) return '';
    const a = projection.project(nodeById(member.n1));
    const b = projection.project(nodeById(member.n2));
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const vector = loadVector(load.dir || '-z', state.viewMode);
    return `<line class="load" x1="${mx - vector.x * 18}" y1="${my - vector.y * 18}" x2="${mx + vector.x * 18}" y2="${my + vector.y * 18}"></line>`;
  }).join(''));

  svg.insertAdjacentHTML('beforeend', state.model.nodes.map((node) => {
    const p = projection.project(node);
    const cls = ['node', node.support ? 'support' : '', state.selected.type === 'node' && state.selected.id === node.id ? 'selected' : ''].filter(Boolean).join(' ');
    return `<circle class="${cls}" data-node="${escapeHtml(node.id)}" cx="${p.x}" cy="${p.y}" r="5"></circle>`;
  }).join(''));

  for (const item of svg.querySelectorAll('[data-member]')) {
    item.addEventListener('click', () => {
      selectEntity(state, 'member', item.dataset.member);
      render();
    });
  }
  for (const item of svg.querySelectorAll('[data-node]')) {
    item.addEventListener('click', () => {
      selectEntity(state, 'node', item.dataset.node);
      render();
    });
  }
}

function nodeById(id) {
  return state.model.nodes.find((node) => node.id === id);
}

function makeProjection(model, mode, width, height) {
  const coords = model.nodes.map((node) => mode === 'plan' ? [node.x, node.y] : [node.x, node.z || 0]);
  const minX = Math.min(...coords.map((item) => item[0]), 0);
  const maxX = Math.max(...coords.map((item) => item[0]), 1);
  const minY = Math.min(...coords.map((item) => item[1]), 0);
  const maxY = Math.max(...coords.map((item) => item[1]), 1);
  const pad = 56;
  const sx = (width - pad * 2) / Math.max(1, maxX - minX);
  const sy = (height - pad * 2) / Math.max(1, maxY - minY);
  const scale = Math.min(sx, sy);
  return {
    width,
    height,
    scale,
    minX,
    maxX,
    minY,
    maxY,
    pad,
    project(node) {
      const x = mode === 'plan' ? node.x : node.x;
      const y = mode === 'plan' ? node.y : node.z || 0;
      return {
        x: pad + (x - minX) * scale,
        y: height - pad - (y - minY) * scale,
      };
    },
  };
}

function gridLines(projection) {
  const lines = [];
  for (let x = Math.ceil(projection.minX); x <= projection.maxX; x += 1) {
    const px = projection.pad + (x - projection.minX) * projection.scale;
    lines.push(`<line class="grid-line" x1="${px}" y1="${projection.pad}" x2="${px}" y2="${projection.height - projection.pad}"></line>`);
  }
  for (let y = Math.ceil(projection.minY); y <= projection.maxY; y += 1) {
    const py = projection.height - projection.pad - (y - projection.minY) * projection.scale;
    lines.push(`<line class="grid-line" x1="${projection.pad}" y1="${py}" x2="${projection.width - projection.pad}" y2="${py}"></line>`);
  }
  return lines.join('');
}

function deformedNodeMap(model, result, scale) {
  const maxDisp = result.summary?.maxDisplacement || 0;
  const visualScale = maxDisp > 0 ? Math.min(80, Math.max(8, 30 / (maxDisp * scale))) : 1;
  const map = new Map();
  const projection = makeProjection(model, state.viewMode, 900, 620);
  for (const node of model.nodes) {
    const disp = result.disp[node.id] || [0, 0, 0];
    const shifted = {
      ...node,
      x: node.x + disp[0] * visualScale,
      y: node.y + disp[1] * visualScale,
      z: (node.z || 0) + disp[2] * visualScale,
    };
    map.set(node.id, projection.project(shifted));
  }
  return map;
}

function loadVector(dir, mode) {
  const mapPlan = {
    '+x': { x: 1, y: 0 },
    '-x': { x: -1, y: 0 },
    '+y': { x: 0, y: -1 },
    '-y': { x: 0, y: 1 },
    '+z': { x: 0, y: 0 },
    '-z': { x: 0, y: 0 },
  };
  const mapElev = {
    '+x': { x: 1, y: 0 },
    '-x': { x: -1, y: 0 },
    '+y': { x: 0, y: 0 },
    '-y': { x: 0, y: 0 },
    '+z': { x: 0, y: -1 },
    '-z': { x: 0, y: 1 },
  };
  const v = (mode === 'plan' ? mapPlan : mapElev)[dir] || { x: 0, y: 1 };
  return v.x === 0 && v.y === 0 ? { x: 0, y: 1 } : v;
}

function byId(id) {
  return document.getElementById(id);
}

function readInt(input, fallback) {
  const value = Number.parseInt(input.value, 10);
  return Number.isFinite(value) ? value : fallback;
}

function readNumber(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
