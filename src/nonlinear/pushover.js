import { materialOf, sectionOf } from '../core/catalogs.js';
import { analyzeAll } from '../solver/linear3d.js';

export const PUSHOVER_VERSION = 'm15-pushover-preliminary';

const AXIS = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
};

export function runPushover(model, options = {}) {
  const direction = normalizeDirection(options.direction || '+x');
  const controlNodeId = options.controlNodeId || pickControlNode(model, direction);
  if (!controlNodeId) {
    return {
      ok: false,
      version: PUSHOVER_VERSION,
      reason: 'NO_CONTROL_NODE',
      curve: [],
      warnings: [{ code: 'PUSHOVER_NO_CONTROL_NODE', message: 'No control node is available.' }],
    };
  }

  const steps = Math.max(1, Math.trunc(number(options.steps, 12)));
  const maxLoadFactor = Math.max(0, number(options.maxLoadFactor, 1));
  const referenceBaseShear = Math.max(0, number(options.referenceBaseShear, 10));
  const combo = pickCombo(model, options);
  const curve = [];
  let finalStates = {};
  let firstYield = null;
  let stopped = false;
  const warnings = [];

  for (let step = 0; step <= steps; step += 1) {
    const loadFactor = (maxLoadFactor * step) / steps;
    const lateral = buildLateralPatternLoads(model, {
      direction,
      total: referenceBaseShear * loadFactor,
      pattern: options.pattern || 'triangular',
      step,
    });
    const result = analyzeAll(model, combo?.factors || null, { extraLoads: lateral.loads });
    const controlDisplacement = controlDisp(result, controlNodeId, direction.vector);
    const hinge = evaluateHinges(model, result, options);
    const plasticMemberCount = hinge.yieldedMemberCount + hinge.ultimateMemberCount;
    finalStates = hinge.memberStates;
    if (!firstYield && plasticMemberCount > 0) {
      firstYield = { step, loadFactor, baseShear: lateral.total, controlDisplacement };
    }
    curve.push({
      step,
      loadFactor,
      baseShear: lateral.total,
      controlDisplacement,
      plasticMemberCount,
      yieldedMemberCount: hinge.yieldedMemberCount,
      ultimateMemberCount: hinge.ultimateMemberCount,
      ok: !!result.ok,
      reason: result.reason || null,
    });

    if (!result.ok) {
      warnings.push({ code: 'PUSHOVER_STEP_FAILED', message: `Pushover step ${step} failed: ${result.reason || 'analysis failed'}.` });
      stopped = true;
      break;
    }
    if (options.targetDisplacement != null && Math.abs(controlDisplacement) >= Math.abs(Number(options.targetDisplacement))) {
      stopped = true;
      break;
    }
  }

  if (!firstYield) {
    warnings.push({ code: 'PUSHOVER_NO_YIELD', message: 'No plastic hinge reached yield within the requested load range.' });
  }

  const last = curve.at(-1) || {};
  return {
    ok: curve.some((point) => point.ok),
    version: PUSHOVER_VERSION,
    type: 'lumped_hinge_preliminary_pushover',
    comboId: combo?.id || null,
    controlNodeId,
    direction: direction.id,
    pattern: options.pattern || 'triangular',
    referenceBaseShear,
    maxLoadFactor,
    stopped,
    firstYield,
    summary: {
      stepCount: curve.length,
      maxBaseShear: Math.max(0, ...curve.map((point) => Math.abs(point.baseShear))),
      maxControlDisplacement: Math.max(0, ...curve.map((point) => Math.abs(point.controlDisplacement))),
      plasticMemberCount: (last.yieldedMemberCount || 0) + (last.ultimateMemberCount || 0),
      yieldedMemberCount: last.yieldedMemberCount || 0,
      ultimateMemberCount: last.ultimateMemberCount || 0,
    },
    curve,
    memberStates: finalStates,
    warnings,
  };
}

export function buildLateralPatternLoads(model, options = {}) {
  const direction = normalizeDirection(options.direction || '+x');
  const total = Math.max(0, number(options.total, 0));
  const nodes = (model.nodes || []).filter((node) => !node.support && number(node.z) > minimumZ(model) + 1e-9);
  if (!nodes.length || total === 0) return { total: 0, loads: [] };
  const weights = nodes.map((node) => lateralWeight(node, model, options.pattern || 'triangular'));
  const weightSum = weights.reduce((sum, item) => sum + item, 0) || nodes.length;
  const loads = nodes.map((node, index) => ({
    id: `PUSH${options.step || 0}_${node.id}`,
    type: 'nodal',
    node: node.id,
    P: (total * weights[index]) / weightSum,
    direction: direction.vector,
    case: 'PUSH',
    source: 'pushover',
  }));
  return { total, loads };
}

function evaluateHinges(model, result, options = {}) {
  const memberStates = {};
  let yieldedMemberCount = 0;
  let ultimateMemberCount = 0;
  for (const member of model.members || []) {
    const demand = result.memberResults?.[member.id];
    const capacity = hingeCapacity(model, member, options);
    const state = memberHingeState(demand, capacity);
    memberStates[member.id] = state;
    if (state.overall === 'yielded') yieldedMemberCount += 1;
    if (state.overall === 'ultimate') ultimateMemberCount += 1;
  }
  return { memberStates, yieldedMemberCount, ultimateMemberCount };
}

function memberHingeState(demand, capacity) {
  if (!demand || !capacity.ok) {
    return {
      overall: 'unknown',
      i: { ratio: 0, state: 'unknown' },
      j: { ratio: 0, state: 'unknown' },
      capacity,
    };
  }
  const end = demand.end || [];
  const iRatio = Math.max(
    capacity.my > 0 ? Math.abs(number(end[4])) / capacity.my : 0,
    capacity.mz > 0 ? Math.abs(number(end[5])) / capacity.mz : 0,
  );
  const jRatio = Math.max(
    capacity.my > 0 ? Math.abs(number(end[10])) / capacity.my : 0,
    capacity.mz > 0 ? Math.abs(number(end[11])) / capacity.mz : 0,
  );
  const i = { ratio: iRatio, state: hingeState(iRatio) };
  const j = { ratio: jRatio, state: hingeState(jRatio) };
  const overall = [i.state, j.state].includes('ultimate')
    ? 'ultimate'
    : [i.state, j.state].includes('yielded') ? 'yielded' : 'elastic';
  return { overall, i, j, capacity };
}

function hingeCapacity(model, member, options) {
  const material = materialOf(model, member.matId);
  const section = sectionOf(model, member.secId);
  const scale = Math.max(1e-9, number(options.plasticMomentScale, 1));
  const fy = number(material.Fy, material.fb, 0);
  const my = number(options.capacityMy, section.Zy * fy * scale);
  const mz = number(options.capacityMz, section.Zz * fy * scale);
  return {
    ok: my > 0 || mz > 0,
    my,
    mz,
    basis: 'section-plastic-moment-preliminary',
  };
}

function hingeState(ratio) {
  if (ratio >= 1.5) return 'ultimate';
  if (ratio >= 1) return 'yielded';
  return 'elastic';
}

function pickCombo(model, options) {
  if (options.factors) return { id: options.comboId || 'USER', factors: options.factors };
  return (model.loadCombinations || []).find((combo) => combo.id === options.comboId)
    || (model.loadCombinations || [])[0]
    || null;
}

function pickControlNode(model, direction) {
  const nodes = model.nodes || [];
  if (!nodes.length) return null;
  return nodes
    .slice()
    .sort((a, b) => {
      const dz = number(b.z) - number(a.z);
      if (Math.abs(dz) > 1e-9) return dz;
      return projection(b, direction.vector) - projection(a, direction.vector);
    })[0]?.id || null;
}

function controlDisp(result, nodeId, vector) {
  const d = result.disp?.[nodeId] || [0, 0, 0];
  return number(d[0]) * vector[0] + number(d[1]) * vector[1] + number(d[2]) * vector[2];
}

function lateralWeight(node, model, pattern) {
  if (pattern === 'uniform') return 1;
  if (pattern === 'mass') {
    if (Array.isArray(node.mass)) return Math.max(0, number(node.mass[0], node.mass[1], node.mass[2], 1));
    return Math.max(0, number(node.mass, 1));
  }
  const base = minimumZ(model);
  return Math.max(1e-9, number(node.z) - base);
}

function minimumZ(model) {
  return Math.min(0, ...(model.nodes || []).map((node) => number(node.z)));
}

function projection(node, vector) {
  return number(node.x) * vector[0] + number(node.y) * vector[1] + number(node.z) * vector[2];
}

function normalizeDirection(value) {
  if (Array.isArray(value) && value.length >= 3) {
    const length = Math.hypot(number(value[0]), number(value[1]), number(value[2])) || 1;
    return { id: 'custom', vector: [number(value[0]) / length, number(value[1]) / length, number(value[2]) / length] };
  }
  const id = AXIS[value] ? value : '+x';
  return { id, vector: AXIS[id] };
}

function number(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
