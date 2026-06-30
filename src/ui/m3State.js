import {
  addLoadCombination,
  analyzeModel,
  createModel,
  createPortalFrameSample,
  factorText,
  modelToJson,
  parseCombinationFactors,
  parseModelJson,
  removeLoadCombination,
  normalizeStories,
  updateLoadCombination,
} from '../index.js';

export function createM3State(initialModel = createPortalFrameSample()) {
  const state = {
    model: initialModel,
    analysis: null,
    selected: { type: null, id: null },
    viewMode: 'plan',
    showDeformed: true,
    showUtilization: true,
    activeComboId: initialModel.loadCombinations?.[0]?.id || null,
    activeResultId: 'ENVELOPE',
    messages: [],
  };
  analyzeState(state);
  return state;
}

export function analyzeState(state) {
  state.analysis = analyzeModel(state.model);
  ensureActiveIds(state);
  state.messages = collectMessages(state.analysis);
  return state.analysis;
}

export function buildFrameModel({ baysX = 1, baysY = 1, stories = 1, bayX = 6, bayY = 4, storyH = 3 } = {}) {
  const model = createModel();
  let nextNode = 1;
  let nextMember = 1;
  const nodeAt = new Map();
  const nodeId = (ix, iy, iz) => `${ix}:${iy}:${iz}`;

  for (let iz = 0; iz <= stories; iz += 1) {
    for (let iy = 0; iy <= baysY; iy += 1) {
      for (let ix = 0; ix <= baysX; ix += 1) {
        const node = {
          id: `N${nextNode++}`,
          x: ix * bayX,
          y: iy * bayY,
          z: iz * storyH,
          support: iz === 0 ? 'fixed' : null,
        };
        nodeAt.set(nodeId(ix, iy, iz), node.id);
        model.nodes.push(node);
      }
    }
  }

  const addMember = (n1, n2) => {
    model.members.push({
      id: `M${nextMember++}`,
      type: 'frame',
      n1,
      n2,
      matId: 'steel',
      secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
      releases: { i: 'rigid', j: 'rigid' },
    });
  };

  for (let iz = 0; iz < stories; iz += 1) {
    for (let iy = 0; iy <= baysY; iy += 1) {
      for (let ix = 0; ix <= baysX; ix += 1) {
        addMember(nodeAt.get(nodeId(ix, iy, iz)), nodeAt.get(nodeId(ix, iy, iz + 1)));
      }
    }
  }

  for (let iz = 1; iz <= stories; iz += 1) {
    for (let iy = 0; iy <= baysY; iy += 1) {
      for (let ix = 0; ix < baysX; ix += 1) {
        addMember(nodeAt.get(nodeId(ix, iy, iz)), nodeAt.get(nodeId(ix + 1, iy, iz)));
      }
    }
    for (let ix = 0; ix <= baysX; ix += 1) {
      for (let iy = 0; iy < baysY; iy += 1) {
        addMember(nodeAt.get(nodeId(ix, iy, iz)), nodeAt.get(nodeId(ix, iy + 1, iz)));
      }
    }
  }

  return normalizeStories(model);
}

export function replaceModel(state, model) {
  state.model = model;
  state.selected = { type: null, id: null };
  state.activeComboId = model.loadCombinations?.[0]?.id || null;
  state.activeResultId = 'ENVELOPE';
  analyzeState(state);
}

export function selectEntity(state, type, id) {
  state.selected = { type, id };
}

export function selectedMembers(state) {
  if (state.selected.type === 'member') {
    const member = state.model.members.find((item) => item.id === state.selected.id);
    return member ? [member] : [];
  }
  if (state.selected.type === 'node') {
    return state.model.members.filter((member) => member.n1 === state.selected.id || member.n2 === state.selected.id);
  }
  return [];
}

export function applyUdlToSelection(state, { w = 8, dir = '-z', loadCase = 'D' } = {}) {
  const members = selectedMembers(state);
  if (!members.length) {
    state.messages = [{ level: 'warning', message: 'Select a member or connected node before applying a load.' }];
    return [];
  }
  let next = nextNumericId(state.model.loads, 'L');
  const newLoads = members.map((member) => ({
    id: `L${next++}`,
    type: 'udl',
    member: member.id,
    w: Number(w),
    dir,
    case: loadCase,
  }));
  state.model.loads.push(...newLoads);
  analyzeState(state);
  return newLoads;
}

export function activeCombo(state) {
  return state.model.loadCombinations?.find((combo) => combo.id === state.activeComboId)
    || state.model.loadCombinations?.[0]
    || null;
}

export function setActiveCombo(state, comboId) {
  state.activeComboId = comboId;
  if (state.activeResultId !== 'ENVELOPE' && state.activeResultId !== 'PDELTA_ENVELOPE') {
    state.activeResultId = state.activeResultId.startsWith('PDELTA:')
      ? `PDELTA:${comboId}`
      : comboId;
  }
  ensureActiveIds(state);
}

export function comboFactorText(combo) {
  return factorText(combo?.factors || {});
}

export function saveActiveCombination(state, { name, type, factorsText }) {
  const combo = activeCombo(state);
  if (!combo) return null;
  try {
    const factors = parseCombinationFactors(factorsText, state.model.loadCases);
    const updated = updateLoadCombination(state.model, combo.id, {
      name: name || combo.name,
      type: type || combo.type,
      factors,
    });
    state.activeComboId = updated.id;
    analyzeState(state);
    return updated;
  } catch (error) {
    state.messages = [{ level: 'error', message: error.message }];
    return null;
  }
}

export function addCombination(state) {
  const combo = activeCombo(state);
  const added = addLoadCombination(state.model, {
    type: combo?.type || 'strength',
    factors: combo?.factors || Object.fromEntries((state.model.loadCases || []).map((loadCase) => [loadCase.id, 1])),
  });
  added.name = `${added.name} Copy`;
  state.activeComboId = added.id;
  state.activeResultId = added.id;
  analyzeState(state);
  return added;
}

export function deleteActiveCombination(state) {
  const combo = activeCombo(state);
  if (!combo) return false;
  const removed = removeLoadCombination(state.model, combo.id);
  if (!removed) {
    state.messages = [{ level: 'warning', message: 'At least one combination must remain.' }];
    return false;
  }
  state.activeComboId = state.model.loadCombinations[0]?.id || null;
  state.activeResultId = 'ENVELOPE';
  analyzeState(state);
  return true;
}

export function resultOptions(state) {
  const options = [];
  if (state.analysis?.envelope) options.push({ id: 'ENVELOPE', label: 'Envelope' });
  if (state.analysis?.pDelta?.envelope) options.push({ id: 'PDELTA_ENVELOPE', label: 'P-Delta Envelope' });
  for (const combo of state.analysis?.combos || state.model.loadCombinations || []) {
    options.push({ id: combo.id, label: combo.name || combo.id });
  }
  if (state.analysis?.pDelta?.byCombo) {
    for (const combo of state.analysis?.combos || state.model.loadCombinations || []) {
      if (state.analysis.pDelta.byCombo[combo.id]?.result) {
        options.push({ id: `PDELTA:${combo.id}`, label: `P-Delta ${combo.name || combo.id}` });
      }
    }
  }
  return options;
}

export function activeResult(state) {
  if (state.activeResultId === 'ENVELOPE') return state.analysis?.envelope || firstSolvedResult(state);
  if (state.activeResultId === 'PDELTA_ENVELOPE') return state.analysis?.pDelta?.envelope || state.analysis?.envelope || firstSolvedResult(state);
  if (state.activeResultId?.startsWith('PDELTA:')) {
    const comboId = state.activeResultId.slice('PDELTA:'.length);
    return state.analysis?.pDelta?.byCombo?.[comboId]?.result || state.analysis?.pDelta?.envelope || state.analysis?.envelope || firstSolvedResult(state);
  }
  return state.analysis?.byCombo?.[state.activeResultId] || state.analysis?.envelope || firstSolvedResult(state);
}

export function setActiveResult(state, resultId) {
  state.activeResultId = resultId;
  ensureActiveIds(state);
}

export function setPDeltaEnabled(state, enabled) {
  state.model.analysisSettings ||= {};
  state.model.analysisSettings.includeGeometricStiffness = Boolean(enabled);
  state.activeResultId = enabled ? 'PDELTA_ENVELOPE' : 'ENVELOPE';
  analyzeState(state);
}

export function pDeltaSeries(state) {
  const byCombo = state.analysis?.pDelta?.byCombo || {};
  return Object.entries(byCombo)
    .filter(([, result]) => result?.iterations?.length)
    .map(([comboId, result]) => ({
      id: comboId,
      label: comboId,
      converged: result.converged,
      points: result.iterations.map((item) => ({
        iteration: item.iteration,
        amplification: Number(item.amplification) || 1,
        displacement: Number(item.maxDisplacement) || 0,
        secondaryLoad: Number(item.secondaryLoad) || 0,
        residual: item.residual == null ? null : Number(item.residual),
      })),
    }));
}

export function modalSeries(state) {
  return (state.analysis?.dynamics?.modes || []).map((mode) => ({
    id: mode.id,
    index: mode.index,
    period: Number(mode.period) || 0,
    frequencyHz: Number(mode.frequencyHz) || 0,
    massX: Number(mode.participation?.x?.massRatio) || 0,
    massY: Number(mode.participation?.y?.massRatio) || 0,
    massZ: Number(mode.participation?.z?.massRatio) || 0,
  }));
}

export function importModelJson(state, text) {
  const parsed = parseModelJson(text);
  if (!parsed.ok) {
    state.messages = parsed.validation.errors.map((item) => ({ level: 'error', message: item.message }));
    return parsed;
  }
  replaceModel(state, parsed.model);
  if (parsed.migrations.length) {
    state.messages.unshift({ level: 'warning', message: `${parsed.migrations.length} migration step(s) applied.` });
  }
  return parsed;
}

export function exportModelJson(state) {
  return modelToJson(state.model, { exportedAt: new Date().toISOString() });
}

export function memberLength(model, member) {
  const a = model.nodes.find((node) => node.id === member.n1);
  const b = model.nodes.find((node) => node.id === member.n2);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
}

export function entitySummary(state) {
  if (state.selected.type === 'node') {
    const node = state.model.nodes.find((item) => item.id === state.selected.id);
    if (!node) return null;
    return {
      title: node.id,
      rows: [
        ['Type', 'Node'],
        ['X', format(node.x)],
        ['Y', format(node.y)],
        ['Z', format(node.z || 0)],
        ['Support', node.support || '-'],
      ],
    };
  }
  if (state.selected.type === 'member') {
    const member = state.model.members.find((item) => item.id === state.selected.id);
    if (!member) return null;
    const result = activeResult(state)?.memberResults?.[member.id];
    const governing = result?.governing?.utilization;
    const design = state.analysis?.design?.steel?.memberResults?.[member.id]
      || state.analysis?.design?.concrete?.memberResults?.[member.id];
    return {
      title: member.id,
      rows: [
        ['Type', 'Member'],
        ['Nodes', `${member.n1} - ${member.n2}`],
        ['Length', `${format(memberLength(state.model, member))} m`],
        ['Section', member.secId],
        ['Utilization', result ? format(result.check.ratio, 3) : '-'],
        ['Governing', governing ? governing.comboId : result?.check?.comboId || '-'],
        ['Design', design ? `${design.status} / ${format(design.utilization, 3)}` : '-'],
        ['Check', design?.governingCheck || '-'],
      ],
    };
  }
  return null;
}

export function utilizationClass(ratio) {
  if (!Number.isFinite(ratio)) return '';
  if (ratio > 1) return 'ng';
  if (ratio >= 0.7) return 'warn';
  return 'ok';
}

export function collectMessages(analysis) {
  const messages = [];
  for (const error of analysis?.validation?.errors || []) messages.push({ level: 'error', message: `${error.code}: ${error.message}` });
  for (const warning of analysis?.validation?.warnings || []) messages.push({ level: 'warning', message: `${warning.code}: ${warning.message}` });
  for (const result of Object.values(analysis?.pDelta?.byCombo || {})) {
    for (const warning of result.warnings || []) messages.push({ level: 'warning', message: `${warning.code}: ${warning.message}` });
  }
  if (analysis?.ok && messages.length === 0) messages.push({ level: 'info', message: 'Analysis complete.' });
  return messages;
}

export function format(value, digits = 4) {
  if (!Number.isFinite(Number(value))) return '-';
  const abs = Math.abs(Number(value));
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return Number(value).toExponential(2);
  return Number(value).toFixed(digits).replace(/\.?0+$/, '');
}

function ensureActiveIds(state) {
  const combos = state.model.loadCombinations || [];
  if (!combos.some((combo) => combo.id === state.activeComboId)) state.activeComboId = combos[0]?.id || null;
  const optionIds = resultOptions(state).map((option) => option.id);
  if (!optionIds.includes(state.activeResultId)) state.activeResultId = optionIds[0] || 'ENVELOPE';
}

function firstSolvedResult(state) {
  if (!state.analysis?.byCombo) return null;
  return Object.values(state.analysis.byCombo).find((result) => result?.ok) || null;
}

function nextNumericId(items, prefix) {
  let max = 0;
  for (const item of items) {
    const match = String(item.id || '').match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}
