import { materialOf, sectionOf } from '../core/catalogs.js';
import { resolveLoadDirection } from '../loads/fixedEnd/common.js';
import { maxAbs, memberAxes } from './linear3dElement.js';
import { buildShellLocalFrame, pressureLoad24, quadAreaInPlane } from './shell/shellElementMath.js';
import { resolveShellPressureLoad } from '../core/shellPressureLoad.js';

const DEFAULT_EQUILIBRIUM_LIMIT = 1e-8;

export function defaultCombos(model) {
  const loadCaseId = model.loadCases?.[0]?.id || 'LC1';
  return [
    { id: 'CO1', name: `1.0 x ${loadCaseId}`, type: 'strength', factors: { [loadCaseId]: 1 } },
    { id: 'SLS1', name: `Service 1.0 x ${loadCaseId}`, type: 'service', factors: { [loadCaseId]: 1 } },
  ];
}

export function makeEnvelope(byCombo, combos) {
  const requested = combos.map((combo) => {
    const snapshot = comboSnapshot(combo);
    const result = byCombo[combo.id];
    return { combo: snapshot, result, ...combinationEnvelopeStatus(snapshot, result) };
  });
  const pairs = requested.filter((item) => item.included);
  const failed = requested.filter((item) => !item.included);
  const complete = requested.length > 0 && failed.length === 0;
  const provenance = requested.map(({ combo, result, status, included, reason }) => ({
    comboId: combo.id,
    comboName: combo.name,
    comboType: combo.type,
    factors: { ...combo.factors },
    status,
    included,
    reason,
    resultOk: !!result?.ok,
    anyOk: !!result?.anyOk,
    unstableMemberIds: [...(result?.unstableMembers || [])],
  }));

  const env = {
    ok: complete && pairs.length > 0,
    anyOk: pairs.length > 0,
    isEnvelope: true,
    status: complete ? 'COMPLETE' : 'INCOMPLETE',
    complete,
    incomplete: !complete,
    designBlocked: !complete,
    designBlockers: failed.map(({ combo, status, reason }) => ({ comboId: combo.id, status, reason })),
    requestedComboCount: requested.length,
    successfulComboCount: pairs.length,
    failedComboCount: failed.length,
    requestedSources: requested.map(({ combo }) => combo),
    successfulSources: pairs.map(({ combo }) => combo),
    failedSources: failed.map(({ combo, status, reason }) => ({ ...combo, status, reason })),
    combinationStatus: provenance,
    sources: pairs.map(({ combo }) => combo),
    disp: {},
    reactions: {},
    memberResults: {},
    governing: {
      maxDisplacement: null,
      maxUtilization: null,
    },
    unstableMembers: new Set(),
    dmax: 0,
    maxRatio: 0,
    ngCount: 0,
    okCount: 0,
  };

  if (!pairs.length) {
    env.summary = {
      totalLoad: null,
      totalReaction: null,
      equilibriumResidual: null,
      maxDisplacement: null,
      maxUtilization: null,
      note: 'no-successful-combinations',
      complete: false,
      designBlocked: true,
    };
    return env;
  }

  for (const { combo, result } of pairs) {
    env.dmax = Math.max(env.dmax, result.dmax);
    if (!env.governing.maxDisplacement || result.dmax > env.governing.maxDisplacement.value) {
      env.governing.maxDisplacement = { comboId: combo.id, comboName: combo.name, value: result.dmax };
    }
    (result.unstableMembers || []).forEach((id) => env.unstableMembers.add(id));
  }

  const nodeIds = new Set();
  pairs.forEach(({ result }) => Object.keys(result.disp).forEach((id) => nodeIds.add(id)));
  for (const id of nodeIds) {
    const e = [0, 0, 0, 0, 0, 0];
    for (const { result } of pairs) {
      const d = result.disp[id];
      if (!d) continue;
      for (let i = 0; i < 6; i += 1) {
        if (Math.abs(d[i]) > Math.abs(e[i])) e[i] = d[i];
      }
    }
    env.disp[id] = e;
  }

  const reactionIds = new Set();
  pairs.forEach(({ result }) => Object.keys(result.reactions).forEach((id) => reactionIds.add(id)));
  for (const id of reactionIds) {
    const e = { rx: 0, ry: 0, rz: 0, rmx: 0, rmy: 0, rmz: 0 };
    for (const { result } of pairs) {
      const reaction = result.reactions[id];
      if (!reaction) continue;
      for (const key of Object.keys(e)) {
        if (Math.abs(reaction[key]) > Math.abs(e[key])) e[key] = reaction[key];
      }
    }
    env.reactions[id] = e;
  }

  const memberIds = new Set();
  pairs.forEach(({ result }) => Object.keys(result.memberResults).forEach((id) => memberIds.add(id)));
  for (const id of memberIds) {
    const results = pairs
      .map(({ combo, result }) => ({ combo, member: result.memberResults[id] }))
      .filter(({ member }) => Boolean(member));
    if (!results.length) continue;
    const base = results[0].member;
    const xs = unionStations(results.map(({ member }) => member.xs));
    const e = {
      ax: base.ax,
      L: base.L,
      xs,
      end: envelopeEnd(results),
      dl: base.dl,
      shape: base.shape,
      dmaxM: 0,
      N: [],
      Vy: [],
      Vz: [],
      Tq: [],
      My: [],
      Mz: [],
      check: { ...base.check },
      governing: {
        quantities: {},
        deformation: null,
        utilization: null,
      },
    };

    for (const quantity of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
      const item = envelopeQuantity(results, quantity, xs);
      e[quantity] = item.values;
      e.governing.quantities[`${quantity}max`] = item.governing;
    }

    for (const { combo, member } of results) {
      if (member.dmaxM > e.dmaxM) {
        e.dmaxM = member.dmaxM;
        e.shape = member.shape;
        e.dl = member.dl;
        e.governing.deformation = { comboId: combo.id, comboName: combo.name, value: member.dmaxM };
      }
      if (member.check.ratio > e.check.ratio) e.check = { ...member.check };
    }

    e.Nmax = maxAbs(e.N);
    e.Vymax = maxAbs(e.Vy);
    e.Vzmax = maxAbs(e.Vz);
    e.Tmax = maxAbs(e.Tq);
    e.Mymax = maxAbs(e.My);
    e.Mzmax = maxAbs(e.Mz);

    const checkSource = results.reduce((best, item) => (
      !best || item.member.check.ratio > best.member.check.ratio ? item : best
    ), null);
    if (checkSource) {
      const peak = governingPeakForCheck(checkSource.member);
      e.check = {
        ...checkSource.member.check,
        comboId: checkSource.combo.id,
        comboName: checkSource.combo.name,
        source: 'envelope',
      };
      e.governing.utilization = {
        comboId: checkSource.combo.id,
        comboName: checkSource.combo.name,
        ratio: checkSource.member.check.ratio,
        status: checkSource.member.check.status,
        quantity: checkSource.member.check.governing,
        x: peak.x,
        value: peak.value,
      };
    }

    env.memberResults[id] = e;
  }

  for (const memberResult of Object.values(env.memberResults)) {
    const check = memberResult.check;
    env.maxRatio = Math.max(env.maxRatio, check.ratio);
    if (!env.governing.maxUtilization || check.ratio > env.governing.maxUtilization.ratio) {
      env.governing.maxUtilization = {
        memberId: Object.entries(env.memberResults).find(([, result]) => result === memberResult)?.[0] || null,
        comboId: check.comboId || null,
        comboName: check.comboName || null,
        ratio: check.ratio,
      };
    }
    if (check.ok) env.okCount += 1;
    else env.ngCount += 1;
  }

  env.summary = {
    totalLoad: null,
    totalReaction: null,
    equilibriumResidual: null,
    maxDisplacement: env.dmax,
    maxUtilization: env.maxRatio,
    note: complete ? 'envelope' : 'incomplete-envelope',
    complete,
    designBlocked: !complete,
  };
  return env;
}

export function createEnvelopeAccumulator(combos = []) {
  const requestedCombos = combos.map(comboSnapshot);
  const successful = [];
  const failed = [];
  const provenance = [];
  const env = {
    ok: false,
    anyOk: false,
    isEnvelope: true,
    status: 'INCOMPLETE',
    complete: false,
    incomplete: true,
    designBlocked: true,
    designBlockers: [],
    requestedComboCount: requestedCombos.length,
    successfulComboCount: 0,
    failedComboCount: 0,
    requestedSources: requestedCombos,
    successfulSources: successful,
    failedSources: failed,
    combinationStatus: provenance,
    sources: successful,
    disp: {},
    reactions: {},
    memberResults: {},
    governing: { maxDisplacement: null, maxUtilization: null },
    unstableMembers: new Set(),
    dmax: 0,
    maxRatio: 0,
    ngCount: 0,
    okCount: 0,
  };
  let addedCount = 0;

  return Object.freeze({ add, finalize });

  function add(comboInput, result) {
    const combo = comboSnapshot(comboInput);
    const status = combinationEnvelopeStatus(combo, result);
    provenance.push({
      comboId: combo.id,
      comboName: combo.name,
      comboType: combo.type,
      factors: { ...combo.factors },
      status: status.status,
      included: status.included,
      reason: status.reason,
      resultOk: !!result?.ok,
      anyOk: !!result?.anyOk,
      unstableMemberIds: [...(result?.unstableMembers || [])],
    });
    addedCount += 1;
    if (!status.included) {
      failed.push({ ...combo, status: status.status, reason: status.reason });
      return status;
    }

    successful.push(combo);
    env.anyOk = true;
    env.dmax = Math.max(env.dmax, Number(result.dmax || 0));
    if (!env.governing.maxDisplacement || result.dmax > env.governing.maxDisplacement.value) {
      env.governing.maxDisplacement = { comboId: combo.id, comboName: combo.name, value: result.dmax };
    }
    (result.unstableMembers || []).forEach((id) => env.unstableMembers.add(id));
    mergeDisplacements(env.disp, result.disp || {});
    mergeReactions(env.reactions, result.reactions || {});
    for (const [memberId, member] of Object.entries(result.memberResults || {})) {
      const current = env.memberResults[memberId];
      env.memberResults[memberId] = current
        ? mergeEnvelopeMember(current, combo, member)
        : initialEnvelopeMember(combo, member);
    }
    return status;
  }

  function finalize() {
    const complete = requestedCombos.length > 0
      && addedCount === requestedCombos.length
      && failed.length === 0
      && successful.length === requestedCombos.length;
    env.ok = complete && env.anyOk;
    env.status = complete ? 'COMPLETE' : 'INCOMPLETE';
    env.complete = complete;
    env.incomplete = !complete;
    env.designBlocked = !complete;
    env.designBlockers = failed.map((item) => ({ comboId: item.id, status: item.status, reason: item.reason }));
    env.successfulComboCount = successful.length;
    env.failedComboCount = failed.length;
    env.maxRatio = 0;
    env.ngCount = 0;
    env.okCount = 0;
    env.governing.maxUtilization = null;
    for (const [memberId, memberResult] of Object.entries(env.memberResults)) {
      const check = memberResult.check;
      env.maxRatio = Math.max(env.maxRatio, Number(check?.ratio || 0));
      if (!env.governing.maxUtilization || check.ratio > env.governing.maxUtilization.ratio) {
        env.governing.maxUtilization = {
          memberId,
          comboId: check.comboId || null,
          comboName: check.comboName || null,
          ratio: check.ratio,
        };
      }
      if (check.ok) env.okCount += 1;
      else env.ngCount += 1;
    }
    env.summary = {
      totalLoad: null,
      totalReaction: null,
      equilibriumResidual: null,
      maxDisplacement: env.dmax,
      maxUtilization: env.maxRatio,
      note: complete ? 'envelope' : 'incomplete-envelope',
      complete,
      designBlocked: !complete,
    };
    return env;
  }
}

function mergeDisplacements(target, source) {
  for (const [nodeId, values] of Object.entries(source)) {
    const current = target[nodeId] || [0, 0, 0, 0, 0, 0];
    for (let index = 0; index < 6; index += 1) {
      if (Math.abs(values[index]) > Math.abs(current[index])) current[index] = values[index];
    }
    target[nodeId] = current;
  }
}

function mergeReactions(target, source) {
  for (const [nodeId, values] of Object.entries(source)) {
    const current = target[nodeId] || { rx: 0, ry: 0, rz: 0, rmx: 0, rmy: 0, rmz: 0 };
    for (const key of Object.keys(current)) {
      if (Math.abs(values[key]) > Math.abs(current[key])) current[key] = values[key];
    }
    target[nodeId] = current;
  }
}

function initialEnvelopeMember(combo, member) {
  const result = {
    ax: member.ax,
    L: member.L,
    xs: [...member.xs],
    end: [...member.end],
    dl: member.dl,
    shape: member.shape,
    dmaxM: member.dmaxM,
    check: { ...member.check, comboId: combo.id, comboName: combo.name, source: 'envelope' },
    governing: {
      quantities: {},
      deformation: { comboId: combo.id, comboName: combo.name, value: member.dmaxM },
      utilization: null,
    },
  };
  for (const quantity of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
    result[quantity] = [...member[quantity]];
    result.governing.quantities[`${quantity}max`] = envelopeQuantity([{ combo, member }], quantity, result.xs).governing;
  }
  attachEnvelopeExtrema(result);
  const peak = governingPeakForCheck(member);
  result.governing.utilization = {
    comboId: combo.id,
    comboName: combo.name,
    ratio: member.check.ratio,
    status: member.check.status,
    quantity: member.check.governing,
    x: peak.x,
    value: peak.value,
  };
  return result;
}

function mergeEnvelopeMember(current, combo, member) {
  const priorXs = current.xs;
  const xs = unionStations([priorXs, member.xs]);
  current.end = current.end.map((value, index) => (
    Math.abs(member.end[index]) > Math.abs(value) ? member.end[index] : value
  ));
  for (const quantity of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
    const priorValues = current[quantity];
    const values = xs.map((x) => {
      const prior = stationValue(priorXs, priorValues, x);
      const candidate = stationValue(member.xs, member[quantity], x);
      return Math.abs(candidate) > Math.abs(prior) ? candidate : prior;
    });
    const candidate = envelopeQuantity([{ combo, member }], quantity, xs).governing;
    const existing = current.governing.quantities[`${quantity}max`];
    if (candidate && (!existing || Math.abs(candidate.value) > Math.abs(existing.value))) {
      current.governing.quantities[`${quantity}max`] = candidate;
    }
    current[quantity] = values;
  }
  current.xs = xs;
  if (member.dmaxM > current.dmaxM) {
    current.dmaxM = member.dmaxM;
    current.shape = member.shape;
    current.dl = member.dl;
    current.governing.deformation = { comboId: combo.id, comboName: combo.name, value: member.dmaxM };
  }
  if (member.check.ratio > current.check.ratio) {
    const peak = governingPeakForCheck(member);
    current.check = { ...member.check, comboId: combo.id, comboName: combo.name, source: 'envelope' };
    current.governing.utilization = {
      comboId: combo.id,
      comboName: combo.name,
      ratio: member.check.ratio,
      status: member.check.status,
      quantity: member.check.governing,
      x: peak.x,
      value: peak.value,
    };
  }
  attachEnvelopeExtrema(current);
  return current;
}

function attachEnvelopeExtrema(member) {
  member.Nmax = maxAbs(member.N);
  member.Vymax = maxAbs(member.Vy);
  member.Vzmax = maxAbs(member.Vz);
  member.Tmax = maxAbs(member.Tq);
  member.Mymax = maxAbs(member.My);
  member.Mzmax = maxAbs(member.Mz);
}

function combinationEnvelopeStatus(combo, result) {
  if (!result) return { status: 'MISSING', included: false, reason: 'COMBINATION_RESULT_MISSING' };
  if (!result.ok || !result.anyOk) {
    return { status: 'NOT_SOLVED', included: false, reason: result.reason || 'COMBINATION_NOT_SOLVED' };
  }
  const integrityIssue = resultIntegrityIssue(result);
  if (integrityIssue) return { status: 'INVALID_RESULTS', included: false, reason: integrityIssue.code, issue: integrityIssue };
  const equilibriumStatus = result.summary?.equilibriumStatus;
  if (['FAIL', 'NOT_AVAILABLE', 'NOT_SOLVED'].includes(equilibriumStatus)
    || (result.summary?.designBlocked && equilibriumStatus !== 'PASS')) {
    return {
      status: 'INVALID_RESULTS',
      included: false,
      reason: result.summary?.equilibriumFailureReason || result.summary?.equilibriumStatus || 'EQUILIBRIUM_RESULTS_BLOCKED',
    };
  }
  return { status: 'SOLVED', included: true, reason: null };
}

function resultIntegrityIssue(result) {
  for (const [nodeId, reaction] of Object.entries(result.reactions || {})) {
    for (const key of ['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz']) {
      if (finiteNumber(reaction?.[key]) == null) {
        return { code: 'NONFINITE_REACTION_COMPONENT', nodeId, component: key, value: reaction?.[key] };
      }
    }
  }
  for (const field of ['totalLoadResultant', 'totalReactionResultant', 'residualResultant']) {
    const resultant = result.summary?.[field];
    if (resultant == null) continue;
    if (!Array.isArray(resultant) || resultant.length !== 6) {
      return { code: 'INVALID_EQUILIBRIUM_RESULTANT', component: field, value: resultant };
    }
    const index = resultant.findIndex((value) => finiteNumber(value) == null);
    if (index >= 0) return { code: 'NONFINITE_EQUILIBRIUM_RESULTANT', component: `${field}[${index}]`, value: resultant[index] };
  }
  return null;
}

export function comboSnapshot(combo = {}) {
  return {
    id: combo.id,
    name: combo.name || combo.id,
    type: combo.type || 'user',
    factors: { ...(combo.factors || {}) },
  };
}

export function unionStations(stationLists) {
  const values = [];
  for (const stations of stationLists) {
    for (const x of stations || []) {
      if (!values.some((value) => Math.abs(value - x) <= 1e-8)) values.push(x);
    }
  }
  return values.sort((a, b) => a - b);
}

export function envelopeQuantity(results, quantity, xs) {
  const values = [];
  let governing = null;
  for (const x of xs) {
    let bestValue = 0;
    let bestCombo = null;
    for (const { combo, member } of results) {
      const value = stationValue(member.xs, member[quantity], x);
      if (!Number.isFinite(value)) continue;
      if (!bestCombo || Math.abs(value) > Math.abs(bestValue)) {
        bestValue = value;
        bestCombo = combo;
      }
    }
    values.push(bestValue);
    if (bestCombo && (!governing || Math.abs(bestValue) > Math.abs(governing.value))) {
      governing = { comboId: bestCombo.id, comboName: bestCombo.name, x, value: bestValue };
    }
  }
  return { values, governing };
}

export function envelopeEnd(results) {
  const end = new Array(12).fill(0);
  for (let i = 0; i < 12; i += 1) {
    for (const { member } of results) {
      const value = member.end[i];
      if (Math.abs(value) > Math.abs(end[i])) end[i] = value;
    }
  }
  return end;
}

export function stationValue(xs, values, x) {
  if (!xs?.length || !values?.length) return 0;
  for (let i = 0; i < xs.length; i += 1) {
    if (Math.abs(xs[i] - x) <= 1e-8) return values[i];
  }
  if (x <= xs[0]) return values[0];
  if (x >= xs[xs.length - 1]) return values[values.length - 1];
  for (let i = 0; i < xs.length - 1; i += 1) {
    if (xs[i] <= x && x <= xs[i + 1]) {
      const length = xs[i + 1] - xs[i];
      const t = length > 0 ? (x - xs[i]) / length : 0;
      return values[i] * (1 - t) + values[i + 1] * t;
    }
  }
  return 0;
}

export function governingPeakForCheck(memberResult) {
  const quantities = memberResult.check?.governing === 'shear' ? ['Vy', 'Vz'] : ['N', 'My', 'Mz'];
  return quantities.reduce((best, quantity) => {
    const peak = peakForQuantity(memberResult, quantity);
    return !best || Math.abs(peak.value) > Math.abs(best.value) ? peak : best;
  }, null) || { x: 0, value: 0 };
}

export function peakForQuantity(memberResult, quantity) {
  let peak = { x: 0, value: 0 };
  const values = memberResult[quantity] || [];
  for (let i = 0; i < values.length; i += 1) {
    if (Math.abs(values[i]) > Math.abs(peak.value)) {
      peak = { x: memberResult.xs?.[i] || 0, value: values[i] };
    }
  }
  return peak;
}

export function effectiveSectionMaterial(getSec, getMat, member) {
  let section = getSec(member.secId);
  let material = getMat(member.matId);
  const custom = member.customProps;
  if (custom) {
    if (Number(custom.E) > 0 || Number(custom.G) > 0) {
      material = {
        ...material,
        E: Number(custom.E) > 0 ? Number(custom.E) * 1000 : material.E,
        G: Number(custom.G) > 0 ? Number(custom.G) * 1000 : material.G,
      };
    }
    const customArea = Number(custom.A) > 0 ? Number(custom.A) * 1e-4 : section.A;
    const areaScale = Number(section.A) > 0 ? customArea / section.A : 1;
    const customAy = Number(custom.Ay ?? custom.As_y ?? custom.AsY);
    const customAz = Number(custom.Az ?? custom.As_z ?? custom.AsZ);
    section = {
      ...section,
      A: customArea,
      Ay: customAy > 0 ? customAy * 1e-4 : Number(section.Ay) > 0 ? section.Ay * areaScale : undefined,
      Az: customAz > 0 ? customAz * 1e-4 : Number(section.Az) > 0 ? section.Az * areaScale : undefined,
      Iz: Number(custom.Iz) > 0 ? Number(custom.Iz) * 1e-8 : section.Iz,
      Iy: Number(custom.Iy) > 0 ? Number(custom.Iy) * 1e-8 : section.Iy,
      J: Number(custom.J) > 0 ? Number(custom.J) * 1e-8 : section.J,
      Zz: Number(custom.Zz) > 0 ? Number(custom.Zz) * 1e-6 : section.Zz,
      Zy: Number(custom.Zy) > 0 ? Number(custom.Zy) * 1e-6 : section.Zy,
    };
    section.ry = Math.sqrt(section.Iy / section.A);
    section.rz = Math.sqrt(section.Iz / section.A);
  }
  return { section, material };
}

export function createSelfWeightLoads(model) {
  const swCase = model.loadCases?.find((loadCase) => loadCase.id === 'D' || loadCase.type === 'dead') || model.loadCases?.[0] || { id: 'LC1' };
  return (model.members || []).flatMap((member) => {
    const { section, material } = effectiveSectionMaterial((id) => sectionOf(model, id), (id) => materialOf(model, id), member);
    const w = material.density * 9.80665 * section.A;
    if (!(w > 1e-9)) return [];
    return [{
      id: `sw_${member.id}`,
      type: 'udl',
      member: member.id,
      w,
      dir: '-z',
      direction: [0, 0, -1],
      coordinate: 'global',
      unit: 'kN/m',
      case: swCase.id,
    }];
  });
}

export function connectedComponentGroups(nodes, members, nodeGroups = []) {
  const parent = {};
  nodes.forEach((node) => {
    parent[node.id] = node.id;
  });

  const find = (id) => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]];
      id = parent[id];
    }
    return id;
  };

  members.forEach((member) => {
    if (!Object.hasOwn(parent, member.n1) || !Object.hasOwn(parent, member.n2)) return;
    const a = find(member.n1);
    const b = find(member.n2);
    if (a !== b) parent[a] = b;
  });
  nodeGroups.forEach((group) => {
    const first = group.find((id) => Object.hasOwn(parent, id));
    if (!first) return;
    const root = find(first);
    group.forEach((id) => {
      if (Object.hasOwn(parent, id)) parent[find(id)] = root;
    });
  });

  const groups = {};
  members.forEach((member) => {
    if (!Object.hasOwn(parent, member.n1) || !Object.hasOwn(parent, member.n2)) return;
    const root = find(member.n1);
    groups[root] ||= { mids: new Set(), nids: new Set() };
    groups[root].mids.add(member.id);
  });
  // A node group (for example, a rigid diaphragm) can join a memberless
  // master/support node to a component.  Populate component nodes from the
  // completed union-find topology rather than only from member endpoints.
  nodes.forEach((node) => {
    const group = groups[find(node.id)];
    if (group) group.nids.add(node.id);
  });
  return groups;
}

export function buildEquilibriumSummary(nodes, members, loads, out, options = {}) {
  const requestedLimit = Number(options.equilibriumLimit);
  const equilibriumLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? requestedLimit
    : DEFAULT_EQUILIBRIUM_LIMIT;
  const referencePoint = [0, 0, 0];
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const memberMap = Object.fromEntries(members.map((member) => [member.id, member]));
  const shellMap = new Map((out.shellFrameAssembly?.femElements || []).map((shell) => [shell.id, shell]));
  const memberResultMap = out.memberResults || {};
  const totalLoad = [0, 0, 0];
  const totalLoadMoment = [0, 0, 0];
  let loadForceScale = 0;
  let loadMomentScale = 0;
  const equilibriumIssues = [];

  for (const load of loads) {
    const resultant = loadResultant(load, nodeMap, memberMap, referencePoint, memberResultMap, shellMap);
    if (!resultant) continue;
    if (resultant.issue) {
      equilibriumIssues.push(resultant.issue);
      continue;
    }
    if (!finiteVector(resultant.force) || !finiteVector(resultant.moment)) {
      equilibriumIssues.push(equilibriumIssue('NONFINITE_LOAD_RESULTANT', load.id || null, null, { force: resultant.force, moment: resultant.moment }));
      continue;
    }
    addInto(totalLoad, resultant.force);
    addInto(totalLoadMoment, resultant.moment);
    loadForceScale += maxAbs3(resultant.force);
    loadMomentScale += maxAbs3(resultant.moment);
  }

  const totalReaction = [0, 0, 0];
  const totalReactionMoment = [0, 0, 0];
  let reactionForceScale = 0;
  let reactionMomentScale = 0;
  for (const [nodeId, reaction] of Object.entries(out.reactions || {})) {
    const node = nodeMap[nodeId];
    const point = pointOf(node);
    if (!node || !point) {
      equilibriumIssues.push(equilibriumIssue('REACTION_NODE_NOT_AVAILABLE', nodeId, null, node));
      continue;
    }
    const force = strictComponents(reaction, ['rx', 'ry', 'rz']);
    const couple = strictComponents(reaction, ['rmx', 'rmy', 'rmz']);
    if (!force || !couple) {
      const component = [...['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz']]
        .find((key) => finiteNumber(reaction?.[key]) == null);
      equilibriumIssues.push(equilibriumIssue('NONFINITE_REACTION_COMPONENT', nodeId, component, reaction?.[component]));
      continue;
    }
    const arm = subtract(point, referencePoint);
    const moment = add(cross(arm, force), couple);
    addInto(totalReaction, force);
    addInto(totalReactionMoment, moment);
    reactionForceScale += maxAbs3(force);
    reactionMomentScale += maxAbs3(moment);
  }

  const totalFoundationReaction = [0, 0, 0];
  const totalFoundationReactionMoment = [0, 0, 0];
  for (const [memberId, result] of Object.entries(memberResultMap)) {
    const foundation = result?.foundation;
    if (!foundation) continue;
    if (!finiteVector(foundation.globalForce) || !finiteVector(foundation.globalMoment)) {
      equilibriumIssues.push(equilibriumIssue('NONFINITE_FOUNDATION_REACTION', memberId, null, foundation, 'reaction'));
      continue;
    }
    addInto(totalFoundationReaction, foundation.globalForce);
    addInto(totalFoundationReactionMoment, foundation.globalMoment);
    addInto(totalReaction, foundation.globalForce);
    addInto(totalReactionMoment, foundation.globalMoment);
    reactionForceScale += maxAbs3(foundation.globalForce);
    reactionMomentScale += maxAbs3(foundation.globalMoment);
  }

  const offsetRows = Object.entries(memberResultMap)
    .filter(([, result]) => result?.offset?.applied)
    .map(([memberId, result]) => ({
      memberId,
      residual: Number(result.offset.maxEquilibriumResidual),
      vector3d: result.offset.vector3d === true,
    }));
  const requestedOffsetTolerance = Number(options.offsetEquilibriumTol);
  const offsetEquilibriumTol = Number.isFinite(requestedOffsetTolerance) && requestedOffsetTolerance > 0
    ? requestedOffsetTolerance
    : 1e-10;
  const maximumOffsetEquilibriumResidual = Math.max(0, ...offsetRows.map((row) => row.residual));
  const offsetEquilibriumStatus = offsetRows.length === 0
    ? 'NOT_APPLICABLE'
    : offsetRows.every((row) => Number.isFinite(row.residual))
      && maximumOffsetEquilibriumResidual <= offsetEquilibriumTol ? 'PASS' : 'FAIL';
  const available = !!out.anyOk
    && !(out.unstableMembers?.size > 0)
    && equilibriumIssues.length === 0;
  const forceResidual = available ? add(totalLoad, totalReaction) : null;
  const momentResidual = available ? add(totalLoadMoment, totalReactionMoment) : null;
  const forceScale = Math.max(1, loadForceScale, reactionForceScale);
  const momentScale = Math.max(1, loadMomentScale, reactionMomentScale);
  const forceResidualNorm = forceResidual ? maxAbs3(forceResidual) / forceScale : null;
  const momentResidualNorm = momentResidual ? maxAbs3(momentResidual) / momentScale : null;
  const equilibriumResidual = available ? Math.max(forceResidualNorm, momentResidualNorm) : null;
  const equilibriumStatus = equilibriumResidual == null
    ? 'NOT_AVAILABLE'
    : equilibriumResidual <= equilibriumLimit && offsetEquilibriumStatus !== 'FAIL' ? 'PASS' : 'FAIL';
  const equilibriumFailureReason = !out.anyOk
    ? 'COMBINATION_NOT_SOLVED'
    : out.unstableMembers?.size > 0
      ? 'UNSTABLE_COMPONENT'
      : equilibriumIssues[0]?.code
        || (offsetEquilibriumStatus === 'FAIL' ? 'OFFSET_EQUILIBRIUM_LIMIT_EXCEEDED' : null)
        || (equilibriumStatus === 'FAIL' ? 'EQUILIBRIUM_LIMIT_EXCEEDED' : null);
  const loadResultantsAvailable = !equilibriumIssues.some((issue) => issue.source === 'load');
  const reactionResultantsAvailable = !equilibriumIssues.some((issue) => issue.source === 'reaction');

  return {
    equilibriumVersion: 'p14-m1-six-resultant-equilibrium-v3-winkler-foundation',
    referencePoint,
    totalLoad: loadResultantsAvailable ? totalLoad : null,
    totalReaction: reactionResultantsAvailable ? totalReaction : null,
    totalLoadMoment: loadResultantsAvailable ? totalLoadMoment : null,
    totalReactionMoment: reactionResultantsAvailable ? totalReactionMoment : null,
    totalFoundationReaction: reactionResultantsAvailable ? totalFoundationReaction : null,
    totalFoundationReactionMoment: reactionResultantsAvailable ? totalFoundationReactionMoment : null,
    totalFoundationReactionResultant: reactionResultantsAvailable ? [...totalFoundationReaction, ...totalFoundationReactionMoment] : null,
    totalLoadResultant: loadResultantsAvailable ? [...totalLoad, ...totalLoadMoment] : null,
    totalReactionResultant: reactionResultantsAvailable ? [...totalReaction, ...totalReactionMoment] : null,
    forceResidual,
    momentResidual,
    residualResultant: available ? [...forceResidual, ...momentResidual] : null,
    forceScale,
    momentScale,
    forceResidualNorm,
    momentResidualNorm,
    forceEquilibriumResidual: forceResidualNorm,
    momentEquilibriumResidual: momentResidualNorm,
    equilibriumResidual,
    equilibriumLimit,
    equilibriumStatus,
    equilibriumOk: equilibriumStatus === 'PASS',
    equilibriumFailureReason,
    equilibriumIssues,
    offsetEquilibrium: {
      version: 'p10-m4-rigid-arm-equilibrium-audit-v1',
      status: offsetEquilibriumStatus,
      passed: offsetEquilibriumStatus !== 'FAIL',
      tolerance: offsetEquilibriumTol,
      memberCount: offsetRows.length,
      vector3dMemberCount: offsetRows.filter((row) => row.vector3d).length,
      maximumResidual: maximumOffsetEquilibriumResidual,
      rows: offsetRows,
    },
    designBlocked: equilibriumStatus !== 'PASS',
    solverResidualNorm: out.solver?.residualNorm ?? null,
    solverResidualMax: out.solver?.residualMax ?? null,
    maxDisplacement: out.dmax,
    maxUtilization: out.maxRatio,
  };
}

function loadResultant(load, nodeMap, memberMap, referencePoint, memberResultMap = {}, shellMap = new Map()) {
  if (load.type === 'nodal') {
    const node = nodeMap[load.node];
    const magnitude = Number(load.P);
    const point = pointOf(node);
    const direction = resolvedDirection(load);
    if (!node || !point) return loadResultantFailure(load, 'LOAD_NODE_NOT_AVAILABLE', 'node', load.node);
    if (!Number.isFinite(magnitude)) return loadResultantFailure(load, 'NONFINITE_LOAD_COMPONENT', 'P', load.P);
    if (!direction.ok) return { issue: { ...direction.issue, source: 'load' } };
    return forceAtPoint(scale(direction.global, magnitude), point, referencePoint);
  }
  if (load.type === 'nmoment') {
    if (!nodeMap[load.node]) return loadResultantFailure(load, 'LOAD_NODE_NOT_AVAILABLE', 'node', load.node);
    const magnitude = Number(load.M);
    const axis = globalAxis(load.axis || 'z');
    if (!Number.isFinite(magnitude)) return loadResultantFailure(load, 'NONFINITE_LOAD_COMPONENT', 'M', load.M);
    if (!axis) return loadResultantFailure(load, 'UNSUPPORTED_NODAL_MOMENT_AXIS', 'axis', load.axis);
    return { force: [0, 0, 0], moment: scale(axis, magnitude) };
  }
  if (['temperature', 'tgradient'].includes(load.type)) return null;
  if (load.type === 'pressure' || load.type === 'shellPressure') {
    const pressureLoad = resolveShellPressureLoad(load);
    if (!pressureLoad.ok) return loadResultantFailure(load, pressureLoad.reason, 'shell', null);
    const target = pressureLoad.target;
    const shell = shellMap.get(target);
    if (!shell) return loadResultantFailure(load, 'SHELL_LOAD_GEOMETRY_NOT_AVAILABLE', 'shell', target);
    const nodes = (shell.nodeIds || []).map((id) => nodeMap[id]);
    const frame = buildShellLocalFrame(nodes);
    if (!frame.ok) return loadResultantFailure(load, frame.reason || 'SHELL_LOAD_GEOMETRY_NOT_AVAILABLE', 'shell', target);
    const pressure = pressureLoad.q;
    const area = quadAreaInPlane(frame.projected);
    let vector;
    try {
      vector = pressureLoad24(frame, area, pressure);
    } catch (error) {
      return loadResultantFailure(load, error.code || 'SHELL_PRESSURE_RESULTANT_NOT_AVAILABLE', 'shell', target);
    }
    const force = [0, 0, 0];
    const moment = [0, 0, 0];
    for (let local = 0; local < 4; local += 1) {
      const nodalForce = vector.slice(local * 6, local * 6 + 3);
      const point = pointOf(nodes[local]);
      if (!point || !finiteVector(nodalForce)) return loadResultantFailure(load, 'NONFINITE_LOAD_RESULTANT', 'shell', target);
      addInto(force, nodalForce);
      addInto(moment, cross(subtract(point, referencePoint), nodalForce));
    }
    return { force, moment };
  }

  const member = memberMap[load.member];
  const geometry = memberLoadGeometry(member, nodeMap, memberResultMap[member?.id]);
  if (!geometry) return loadResultantFailure(load, 'MEMBER_LOAD_GEOMETRY_NOT_AVAILABLE', 'member', load.member);

  if (load.type === 'mmoment') {
    const magnitude = Number(load.M);
    const axis = localAxis(geometry.ax, load.axis || 'z');
    const position = finiteNumber(load.at ?? load.t ?? 0.5);
    if (!Number.isFinite(magnitude)) return loadResultantFailure(load, 'NONFINITE_LOAD_COMPONENT', 'M', load.M);
    if (!axis) return loadResultantFailure(load, 'UNSUPPORTED_MEMBER_MOMENT_AXIS', 'axis', load.axis);
    if (position == null || position < 0 || position > 1) return loadResultantFailure(load, 'INVALID_MEMBER_LOAD_POSITION', 'at', load.at ?? load.t);
    return { force: [0, 0, 0], moment: scale(axis, magnitude) };
  }

  const direction = resolvedDirection(load, geometry.ax);
  if (!direction.ok) return { issue: { ...direction.issue, source: 'load' } };
  if (load.type === 'point') {
    const magnitude = Number(load.P);
    if (!Number.isFinite(magnitude)) return loadResultantFailure(load, 'NONFINITE_LOAD_COMPONENT', 'P', load.P);
    const inputRatio = finiteNumber(load.t ?? load.at ?? 0.5);
    if (inputRatio == null || inputRatio < 0 || inputRatio > 1) {
      return loadResultantFailure(load, 'INVALID_MEMBER_LOAD_POSITION', 't', load.t ?? load.at);
    }
    const ratio = inputRatio;
    const point = add(geometry.start, scale(geometry.ax.x, ratio * geometry.ax.L));
    return forceAtPoint(scale(direction.global, magnitude), point, referencePoint);
  }
  if (['udl', 'udl-partial', 'trapezoid'].includes(load.type)) {
    const integrals = distributedLoadIntegrals(load, geometry.ax.L);
    if (!integrals) return loadResultantFailure(load, 'DISTRIBUTED_LOAD_RESULTANT_NOT_AVAILABLE', 'magnitude/range', load);
    const force = scale(direction.global, integrals.force);
    const startArm = subtract(geometry.start, referencePoint);
    const moment = add(
      scale(cross(startArm, direction.global), integrals.force),
      scale(cross(geometry.ax.x, direction.global), integrals.firstMoment),
    );
    return { force, moment };
  }
  return loadResultantFailure(load, 'UNSUPPORTED_LOAD_RESULTANT', 'type', load.type);
}

function distributedLoadIntegrals(load, L) {
  if (!(L > 0)) return null;
  if (load.type === 'udl') {
    const w = Number(load.w);
    if (!Number.isFinite(w)) return null;
    if (load.shape === 'asc') return { force: w * L / 2, firstMoment: w * L ** 2 / 3 };
    if (load.shape === 'desc') return { force: w * L / 2, firstMoment: w * L ** 2 / 6 };
    return { force: w * L, firstMoment: w * L ** 2 / 2 };
  }

  const from = finiteNumber(load.from);
  const to = finiteNumber(load.to);
  if (from == null || to == null || from < 0 || to > 1 || !(to > from)) return null;
  if (load.type === 'udl-partial') {
    const w = Number(load.w);
    if (!Number.isFinite(w)) return null;
    return {
      force: w * L * (to - from),
      firstMoment: w * L ** 2 * (to ** 2 - from ** 2) / 2,
    };
  }

  const w1 = Number(load.w1);
  const w2 = Number(load.w2);
  if (!Number.isFinite(w1) || !Number.isFinite(w2)) return null;
  const span = to - from;
  return {
    force: L * span * (w1 + w2) / 2,
    firstMoment: L ** 2 * (
      from * span * (w1 + w2) / 2 + span ** 2 * (w1 + 2 * w2) / 6
    ),
  };
}

function memberLoadGeometry(member, nodeMap, memberResult = null) {
  if (!member) return null;
  const a = nodeMap[member.n1];
  const b = nodeMap[member.n2];
  const startNode = pointOf(a);
  const endNode = pointOf(b);
  if (!a || !b || !startNode || !endNode) return null;
  if (memberResult?.ax?.flexibleStart && memberResult?.ax?.L > 0) {
    return {
      ax: memberResult.ax,
      start: pointOf(memberResult.ax.flexibleStart),
    };
  }
  const base = memberAxes(a, b, member.localAxis);
  if (!(base.L > 0) || !finiteVector(base.x) || !finiteVector(base.y) || !finiteVector(base.z)) return null;
  const oi = Number(member.endOffset?.i ?? 0);
  const oj = Number(member.endOffset?.j ?? 0);
  if (!Number.isFinite(oi) || !Number.isFinite(oj) || oi < 0 || oj < 0 || oi + oj >= base.L) return null;
  return {
    ax: { ...base, L: base.L - oi - oj },
    start: add(startNode, scale(base.x, oi)),
  };
}

function forceAtPoint(force, point, referencePoint) {
  return { force, moment: cross(subtract(point, referencePoint), force) };
}

function resolvedDirection(load, ax = null) {
  return resolveLoadDirection(load, ax);
}

function globalAxis(axis) {
  return { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis] || null;
}

function localAxis(ax, axis) {
  return { x: ax.x, y: ax.y, z: ax.z }[axis] || null;
}

function pointOf(node) {
  if (!node) return null;
  const point = [finiteNumber(node.x), finiteNumber(node.y), finiteNumber(node.z ?? 0)];
  return point.every((value) => value != null) ? point : null;
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function addInto(target, values) {
  for (let i = 0; i < 3; i += 1) target[i] += values[i];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function maxAbs3(values) {
  return Math.max(Math.abs(values[0]), Math.abs(values[1]), Math.abs(values[2]));
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteVector(value, length = 3) {
  return Array.isArray(value) && value.length === length && value.every((component) => finiteNumber(component) != null);
}

function strictComponents(source, keys) {
  const values = keys.map((key) => finiteNumber(source?.[key]));
  return values.every((value) => value != null) ? values : null;
}

function loadResultantFailure(load, code, component, value) {
  return { issue: equilibriumIssue(code, load.id || null, component, value, 'load') };
}

function equilibriumIssue(code, entityId, component, value, source = null) {
  return {
    code,
    source: source || (String(code).includes('REACTION') ? 'reaction' : 'load'),
    entityId,
    component,
    value,
  };
}
