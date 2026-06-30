import { materialOf, sectionOf } from '../core/catalogs.js';
import { dirVec, maxAbs } from './linear3dElement.js';

export function defaultCombos(model) {
  const loadCaseId = model.loadCases?.[0]?.id || 'LC1';
  return [
    { id: 'CO1', name: `1.0 x ${loadCaseId}`, type: 'strength', factors: { [loadCaseId]: 1 } },
    { id: 'SLS1', name: `Service 1.0 x ${loadCaseId}`, type: 'service', factors: { [loadCaseId]: 1 } },
  ];
}

export function makeEnvelope(byCombo, combos) {
  const pairs = combos
    .map((combo) => ({ combo: comboSnapshot(combo), result: byCombo[combo.id] }))
    .filter(({ result }) => result?.ok && result.anyOk);
  if (!pairs.length) return null;

  const env = {
    ok: true,
    anyOk: true,
    isEnvelope: true,
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

  for (const { combo, result } of pairs) {
    env.dmax = Math.max(env.dmax, result.dmax);
    if (!env.governing.maxDisplacement || result.dmax > env.governing.maxDisplacement.value) {
      env.governing.maxDisplacement = { comboId: combo.id, comboName: combo.name, value: result.dmax };
    }
    result.unstableMembers.forEach((id) => env.unstableMembers.add(id));
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
    note: 'envelope',
  };
  return env;
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
    if (Number(custom.E) > 0) material = { ...material, E: Number(custom.E) * 1000 };
    section = {
      ...section,
      A: Number(custom.A) > 0 ? Number(custom.A) * 1e-4 : section.A,
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
    groups[root].nids.add(member.n1);
    groups[root].nids.add(member.n2);
  });
  return groups;
}

export function buildEquilibriumSummary(nodes, members, loads, out) {
  const totalLoad = [0, 0, 0];
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const load of loads) {
    if (load.type === 'nmoment') continue;
    const direction = dirVec(load);
    let magnitude = 0;
    if (load.type === 'udl') {
      const member = members.find((m) => m.id === load.member);
      if (!member) continue;
      const a = nodes.find((node) => node.id === member.n1);
      const b = nodes.find((node) => node.id === member.n2);
      if (!a || !b) continue;
      const loadIntensity = Number(load.w);
      if (!Number.isFinite(loadIntensity)) continue;
      magnitude = loadIntensity * Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
      if (load.shape && load.shape !== 'uniform') magnitude *= 0.5;
    } else if (load.member) {
      const member = members.find((m) => m.id === load.member);
      if (!member || !nodeIds.has(member.n1) || !nodeIds.has(member.n2)) continue;
      magnitude = Number(load.P);
    } else {
      if (load.type === 'nodal' && !nodeIds.has(load.node)) continue;
      if (load.node && !nodeIds.has(load.node)) continue;
      magnitude = Number(load.P);
    }
    if (!Number.isFinite(magnitude)) continue;
    totalLoad[0] += direction[0] * magnitude;
    totalLoad[1] += direction[1] * magnitude;
    totalLoad[2] += direction[2] * magnitude;
  }

  const totalReaction = [0, 0, 0];
  for (const reaction of Object.values(out.reactions)) {
    totalReaction[0] += reaction.rx;
    totalReaction[1] += reaction.ry;
    totalReaction[2] += reaction.rz;
  }

  const denom = Math.max(1, Math.abs(totalLoad[0]), Math.abs(totalLoad[1]), Math.abs(totalLoad[2]));
  const equilibriumResidual = out.anyOk && !out.unstableMembers.size
    ? Math.max(
      Math.abs(totalLoad[0] + totalReaction[0]),
      Math.abs(totalLoad[1] + totalReaction[1]),
      Math.abs(totalLoad[2] + totalReaction[2]),
    ) / denom
    : null;

  return {
    totalLoad,
    totalReaction,
    equilibriumResidual,
    solverResidualNorm: out.solver?.residualNorm ?? null,
    solverResidualMax: out.solver?.residualMax ?? null,
    maxDisplacement: out.dmax,
    maxUtilization: out.maxRatio,
  };
}
