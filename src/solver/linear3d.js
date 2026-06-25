import { materialOf, sectionOf } from '../core/catalogs.js';
import { migrateToV3, validateModel } from '../core/model.js';
import { analyzeDynamics } from '../dynamics/modal.js';
import { vadd, vcross, vdot, vlen, vnorm, vscale, vsub } from '../core/vector.js';
import { runDesignChecks } from '../design/steel.js';

export const AXIS = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

export function analyzeModel(inputModel) {
  const model = migrateToV3(inputModel);
  const validation = model.analysisSettings?.validateBeforeSolve === false
    ? { errors: [], warnings: [] }
    : validateModel(model);
  const output = { ok: validation.errors.length === 0, validation, model };

  if (!model.members?.length) {
    output.ok = false;
    output.empty = true;
    return output;
  }
  if (!output.ok) return output;

  const combos = model.loadCombinations?.length ? model.loadCombinations : defaultCombos(model);
  output.combos = combos;
  output.byCombo = {};
  for (const combo of combos) {
    const result = analyzeAll(model, combo.factors);
    result.combo = comboSnapshot(combo);
    output.byCombo[combo.id] = result;
  }
  output.envelope = makeEnvelope(output.byCombo, combos);
  if (model.analysisSettings?.includeGeometricStiffness) {
    output.pDelta = analyzePDeltaCombinations(model, combos);
  }
  if (model.analysisSettings?.responseSpectrum?.enabled !== false) {
    output.dynamics = analyzeDynamics(model);
  }
  output.design = runDesignChecks(model, output, {
    resultSet: output.pDelta?.ok ? output.pDelta.envelope : output.envelope,
  });

  const first = output.byCombo[combos[0]?.id];
  if (first?.unstableMembers?.size) {
    validation.errors.push({
      code: 'SINGULAR',
      message: 'The structure has unstable members or an unsolved stiffness matrix.',
      target: [...first.unstableMembers].join(','),
    });
    output.ok = false;
  }

  return output;
}

export function analyzeAll(model, factors = null, options = {}) {
  const nodes = model.nodes || [];
  const members = model.members || [];
  if (!members.length) return { ok: false, empty: true };

  const analysisSettings = model.analysisSettings || {};
  let loads = [...(model.loads || [])];
  if (analysisSettings.includeSelfWeight) {
    loads = loads.concat(createSelfWeightLoads(model));
  }

  const scaleFn = options.scale;
  if (factors || scaleFn) {
    loads = loads
      .map((load) => {
        let factor = 1;
        if (factors) {
          const loadFactor = factors[load.case || 'LC1'];
          if (loadFactor == null || loadFactor === 0) return null;
          factor *= loadFactor;
        }
        if (scaleFn) {
          factor *= scaleFn(load);
          if (factor === 0) return null;
        }
        const scaled = { ...load };
        if (scaled.P != null) scaled.P *= factor;
        if (scaled.w != null) scaled.w *= factor;
        if (scaled.M != null) scaled.M *= factor;
        return scaled;
      })
      .filter(Boolean);
  }
  if (Array.isArray(options.extraLoads) && options.extraLoads.length) {
    loads = loads.concat(options.extraLoads.map((load) => ({ ...load })));
  }

  const ctx = {
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
    stations: Math.max(21, analysisSettings.memberStations | 0 || 21),
  };

  const groups = connectedComponentGroups(nodes, members);
  const out = {
    ok: true,
    disp: {},
    reactions: {},
    memberResults: {},
    solver: {
      type: 'linear_static_3d_frame',
      components: [],
    },
    unstableMembers: new Set(),
    dmax: 0,
    anyOk: false,
    maxRatio: 0,
    ngCount: 0,
    okCount: 0,
  };

  for (const group of Object.values(groups)) {
    const ns = nodes.filter((node) => group.nids.has(node.id));
    const ms = members.filter((member) => group.mids.has(member.id));
    const ls = loads.filter((load) => (
      (load.node && group.nids.has(load.node)) ||
      (load.member && group.mids.has(load.member))
    ));
    const result = analyzeComponent3D(ns, ms, ls, ctx);
    if (!result.ok) {
      group.mids.forEach((id) => out.unstableMembers.add(id));
      continue;
    }
    out.anyOk = true;
    out.solver.components.push(result.solver);
    Object.assign(out.disp, result.disp);
    Object.assign(out.reactions, result.reactions);
    Object.assign(out.memberResults, result.memberResults);
  }

  for (const id of Object.keys(out.disp)) {
    out.dmax = Math.max(out.dmax, vlen(out.disp[id].slice(0, 3)));
  }
  for (const id of Object.keys(out.memberResults)) {
    const memberResult = out.memberResults[id];
    out.dmax = Math.max(out.dmax, memberResult.dmaxM);
    out.maxRatio = Math.max(out.maxRatio, memberResult.check.ratio);
    if (memberResult.check.ok) out.okCount += 1;
    else out.ngCount += 1;
  }

  if (!out.anyOk) {
    out.ok = false;
    out.reason = 'NO_SOLVED_COMPONENT';
  } else if (out.unstableMembers.size) {
    out.ok = false;
    out.reason = 'UNSTABLE_COMPONENT';
  }
  out.solver = summarizeSolverDiagnostics(out.solver.components);
  out.summary = buildEquilibriumSummary(nodes, members, loads, out);
  return out;
}

export function analyzePDeltaCombinations(model, combos) {
  const byCombo = {};
  for (const combo of combos) {
    byCombo[combo.id] = analyzePDelta(model, combo.factors, model.analysisSettings || {});
    if (byCombo[combo.id].result) byCombo[combo.id].result.combo = comboSnapshot(combo);
  }
  const finalByCombo = {};
  for (const combo of combos) {
    finalByCombo[combo.id] = byCombo[combo.id].result;
  }
  const envelope = makeEnvelope(finalByCombo, combos);
  const summary = summarizePDelta(byCombo);
  return {
    enabled: true,
    ok: Object.values(byCombo).some((item) => item.ok),
    byCombo,
    envelope,
    summary,
  };
}

export function analyzePDelta(model, factors = null, settings = {}) {
  const maxIterations = Math.max(1, settings.pDeltaMaxIterations | 0 || 12);
  const tolerance = Number(settings.pDeltaTolerance) > 0 ? Number(settings.pDeltaTolerance) : 1e-4;
  const maxAmplification = Number(settings.pDeltaMaxAmplification) > 0 ? Number(settings.pDeltaMaxAmplification) : 2.5;
  const linear = analyzeAll(model, factors);
  const iterations = [{
    iteration: 0,
    maxDisplacement: linear.summary?.maxDisplacement || 0,
    amplification: 1,
    secondaryLoad: 0,
    residual: null,
  }];
  if (!linear.ok) {
    return {
      ok: false,
      converged: false,
      reason: linear.reason || 'LINEAR_FAILED',
      linear,
      result: linear,
      iterations,
      amplification: 1,
      warnings: [{ code: 'PDELTA_LINEAR_FAILED', message: 'Linear seed result failed.' }],
    };
  }

  let previous = linear;
  let result = linear;
  let converged = false;
  let reason = 'MAX_ITERATIONS';

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const pLoads = makePDeltaLoads(model, previous, { iteration });
    const next = analyzeAll(model, factors, { extraLoads: pLoads.loads });
    if (!next.ok) {
      result = next;
      reason = next.reason || 'PDELTA_FAILED';
      iterations.push({
        iteration,
        maxDisplacement: null,
        amplification: null,
        secondaryLoad: pLoads.total,
        residual: null,
      });
      break;
    }
    const previousD = previous.summary?.maxDisplacement || 0;
    const nextD = next.summary?.maxDisplacement || 0;
    const linearD = linear.summary?.maxDisplacement || 0;
    const residual = Math.abs(nextD - previousD) / Math.max(1e-12, Math.abs(nextD));
    const amplification = linearD > 0 ? nextD / linearD : 1;
    next.pDeltaLoads = pLoads.loads;
    next.pDelta = {
      iteration,
      secondaryLoad: pLoads.total,
      amplification,
      residual,
    };
    iterations.push({
      iteration,
      maxDisplacement: nextD,
      amplification,
      secondaryLoad: pLoads.total,
      residual,
    });
    result = next;
    previous = next;
    if (residual <= tolerance) {
      converged = true;
      reason = 'CONVERGED';
      break;
    }
    if (amplification > maxAmplification) {
      reason = 'AMPLIFICATION_LIMIT';
      break;
    }
  }

  const finalAmp = iterations.at(-1)?.amplification ?? 1;
  const warnings = [];
  if (!converged) warnings.push({ code: 'PDELTA_NOT_CONVERGED', message: reason });
  if (finalAmp > maxAmplification) warnings.push({ code: 'PDELTA_HIGH_AMPLIFICATION', message: `Amplification ${finalAmp.toFixed(3)} exceeds limit.` });

  result.pDelta = {
    enabled: true,
    converged,
    reason,
    amplification: finalAmp,
    iterations,
    warnings,
  };

  return {
    ok: result.ok && converged,
    converged,
    reason,
    linear,
    result,
    iterations,
    amplification: finalAmp,
    warnings,
  };
}

export function makePDeltaLoads(model, result, options = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const loads = [];
  let total = 0;
  const iteration = options.iteration || 1;
  for (const member of model.members || []) {
    const demand = result.memberResults?.[member.id];
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    if (!demand || !a || !b) continue;
    const axis = demand.ax || memberAxes(a, b, member.localAxis);
    if (Math.abs(axis.x?.[2] || 0) < 0.5) continue;
    const length = axis.L || Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    if (!(length > 1e-9)) continue;
    const top = (b.z || 0) >= (a.z || 0) ? b : a;
    const bottom = top === b ? a : b;
    const topDisp = result.disp?.[top.id] || [0, 0, 0];
    const bottomDisp = result.disp?.[bottom.id] || [0, 0, 0];
    const drift = [
      topDisp[0] - bottomDisp[0],
      topDisp[1] - bottomDisp[1],
      0,
    ];
    const driftMagnitude = Math.hypot(drift[0], drift[1]);
    if (driftMagnitude < 1e-12) continue;
    const axial = Math.abs(demand.Nmax || 0);
    if (axial < 1e-9) continue;
    const force = axial * driftMagnitude / length;
    if (!(force > 1e-12)) continue;
    total += force;
    loads.push({
      id: `PD${iteration}_${member.id}`,
      type: 'nodal',
      node: top.id,
      P: force,
      direction: [drift[0] / driftMagnitude, drift[1] / driftMagnitude, 0],
      case: 'PDELTA',
      source: 'pdelta',
      member: member.id,
    });
  }
  return { loads, total };
}

function summarizePDelta(byCombo) {
  let governing = null;
  let convergedCount = 0;
  let maxAmplification = 1;
  for (const [comboId, item] of Object.entries(byCombo || {})) {
    if (item.converged) convergedCount += 1;
    if (Number(item.amplification) > maxAmplification) maxAmplification = item.amplification;
    if (!governing || Number(item.amplification) > Number(governing.amplification)) {
      governing = { comboId, amplification: item.amplification, converged: item.converged, reason: item.reason };
    }
  }
  return {
    convergedCount,
    comboCount: Object.keys(byCombo || {}).length,
    maxAmplification,
    governing,
  };
}

export function analyzeComponent3D(nodes, members, loads, ctx = {}) {
  const getMat = ctx.mat || ((id) => materialOf(null, id));
  const getSec = ctx.sec || ((id) => sectionOf(null, id));
  const stationCount = Math.max(21, ctx.stations | 0 || 21);
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const idx = Object.fromEntries(nodes.map((node, i) => [node.id, i]));
  const ndof = nodes.length * 6;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const F = new Array(ndof).fill(0);
  const memData = {};

  for (const member of members) {
    const a = nodeMap[member.n1];
    const b = nodeMap[member.n2];
    const ax = memberAxes(a, b, member.localAxis);
    if (ax.L < 1e-9) continue;
    const { section, material } = effectiveSectionMaterial(getSec, getMat, member);
    const kl = localK12(material.E, material.G, section.A, section.Iy, section.Iz, section.J, ax.L);
    const T = transform12(ax);
    const i1 = idx[member.n1] * 6;
    const i2 = idx[member.n2] * 6;
    const dof = [i1, i1 + 1, i1 + 2, i1 + 3, i1 + 4, i1 + 5, i2, i2 + 1, i2 + 2, i2 + 3, i2 + 4, i2 + 5];
    memData[member.id] = {
      ax,
      kl,
      T,
      dof,
      f0: new Array(12).fill(0),
      section,
      material,
      rel: memberReleaseDofs(member),
    };
  }

  for (const load of loads) {
    if (load.type === 'nodal') {
      const direction = dirVec(load);
      const i = idx[load.node] * 6;
      F[i] += direction[0] * load.P;
      F[i + 1] += direction[1] * load.P;
      F[i + 2] += direction[2] * load.P;
    } else if (load.type === 'nmoment') {
      const axisIndex = { x: 0, y: 1, z: 2 }[load.axis || 'z'];
      F[idx[load.node] * 6 + 3 + axisIndex] += load.M;
    } else {
      const md = memData[load.member];
      if (!md) continue;
      const f0 = fixedEndForces3D(load, md.ax);
      for (let i = 0; i < 12; i += 1) md.f0[i] += f0[i];
    }
  }

  for (const member of members) {
    const md = memData[member.id];
    if (!md) continue;
    let klA = md.kl;
    let f0A = md.f0;
    if (md.rel.length) {
      const condensed = condenseReleasedDofs(md.kl, md.f0, md.rel);
      if (condensed) {
        klA = condensed.klC;
        f0A = condensed.f0C;
      }
    }

    const kg = matMul(matTrans(md.T), matMul(klA, md.T));
    for (let i = 0; i < 12; i += 1) {
      for (let j = 0; j < 12; j += 1) K[md.dof[i]][md.dof[j]] += kg[i][j];
    }

    const feq = matVec(matTrans(md.T), f0A).map((v) => -v);
    for (let i = 0; i < 12; i += 1) F[md.dof[i]] += feq[i];
  }

  const fixedDofs = buildFixedDofs(nodes);
  if (!fixedDofs.size) return { ok: false, reason: 'NO_SUPPORT' };

  stabilizeUnsupportedRotations(K, nodes, fixedDofs);
  autoFixIsolatedDofs(K, fixedDofs);

  const free = [];
  for (let i = 0; i < ndof; i += 1) {
    if (!fixedDofs.has(i)) free.push(i);
  }

  let df = [];
  if (free.length) {
    df = solveLinear(
      free.map((i) => free.map((j) => K[i][j])),
      free.map((i) => F[i]),
    );
    if (!df) return { ok: false, reason: 'SINGULAR' };
  }

  const D = new Array(ndof).fill(0);
  free.forEach((globalIndex, i) => {
    D[globalIndex] = df[i];
  });
  const solver = buildSolverDiagnostics(K, F, D, free, fixedDofs);

  for (let i = 0; i < ndof; i += 1) {
    const limit = i % 6 < 3 ? 1e4 : 50;
    if (!Number.isFinite(D[i]) || Math.abs(D[i]) > limit) {
      return { ok: false, reason: 'UNBOUNDED_DISPLACEMENT' };
    }
  }

  const disp = {};
  nodes.forEach((node, i) => {
    disp[node.id] = D.slice(i * 6, i * 6 + 6);
  });

  const reactions = recoverReactions(nodes, K, F, D, fixedDofs);
  const memberResults = {};
  for (const member of members) {
    const md = memData[member.id];
    if (!md) continue;
    memberResults[member.id] = recoverMemberResult(member, md, D, loads, stationCount);
  }

  return { ok: true, disp, reactions, memberResults, solver };
}

export function assembleStiffness3D(nodes, members, ctx = {}) {
  const getMat = ctx.mat || ((id) => materialOf(null, id));
  const getSec = ctx.sec || ((id) => sectionOf(null, id));
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const idx = Object.fromEntries(nodes.map((node, i) => [node.id, i]));
  const ndof = nodes.length * 6;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const memData = {};

  for (const member of members) {
    const a = nodeMap[member.n1];
    const b = nodeMap[member.n2];
    if (!a || !b) continue;
    const ax = memberAxes(a, b, member.localAxis);
    if (ax.L < 1e-9) continue;
    const { section, material } = effectiveSectionMaterial(getSec, getMat, member);
    const kl = localK12(material.E, material.G, section.A, section.Iy, section.Iz, section.J, ax.L);
    const T = transform12(ax);
    const i1 = idx[member.n1] * 6;
    const i2 = idx[member.n2] * 6;
    const dof = [i1, i1 + 1, i1 + 2, i1 + 3, i1 + 4, i1 + 5, i2, i2 + 1, i2 + 2, i2 + 3, i2 + 4, i2 + 5];
    memData[member.id] = {
      ax,
      kl,
      T,
      dof,
      f0: new Array(12).fill(0),
      section,
      material,
      rel: memberReleaseDofs(member),
    };
  }

  for (const member of members) {
    const md = memData[member.id];
    if (!md) continue;
    let klA = md.kl;
    if (md.rel.length) {
      const condensed = condenseReleasedDofs(md.kl, md.f0, md.rel);
      if (condensed) klA = condensed.klC;
    }
    const kg = matMul(matTrans(md.T), matMul(klA, md.T));
    for (let i = 0; i < 12; i += 1) {
      for (let j = 0; j < 12; j += 1) K[md.dof[i]][md.dof[j]] += kg[i][j];
    }
  }

  const fixedDofs = buildFixedDofs(nodes);
  if (!fixedDofs.size) return { ok: false, reason: 'NO_SUPPORT', K, free: [], fixedDofs, nodeMap, idx, memData };
  stabilizeUnsupportedRotations(K, nodes, fixedDofs);
  autoFixIsolatedDofs(K, fixedDofs);
  const free = [];
  for (let i = 0; i < ndof; i += 1) {
    if (!fixedDofs.has(i)) free.push(i);
  }
  return { ok: true, K, free, fixedDofs, nodeMap, idx, memData, ndof };
}

export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    }
    if (Math.abs(M[pivot][c]) < 1e-10) return null;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = c + 1; r < n; r += 1) {
      const factor = M[r][c] / M[c][c];
      if (!factor) continue;
      for (let k = c; k <= n; k += 1) M[r][k] -= factor * M[c][k];
    }
  }

  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = M[r][n];
    for (let k = r + 1; k < n; k += 1) sum -= M[r][k] * x[k];
    x[r] = sum / M[r][r];
  }
  return x;
}

export function memberAxes(a, b, localAxis) {
  const v = [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)];
  const L = vlen(v);
  const x = vnorm(v);
  let aux = localAxis?.refVector && Array.isArray(localAxis.refVector) && vlen(localAxis.refVector) > 1e-9
    ? vnorm(localAxis.refVector)
    : Math.abs(x[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
  let z = vcross(x, aux);
  if (vlen(z) < 1e-9) {
    aux = Math.abs(x[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
    z = vcross(x, aux);
  }
  z = vnorm(z);
  let y = vcross(z, x);

  const roll = Number(localAxis?.roll || 0);
  if (roll) {
    const t = (roll * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const y2 = vadd(vscale(y, c), vscale(z, s));
    const z2 = vsub(vscale(z, c), vscale(y, s));
    y = y2;
    z = z2;
  }

  return { L, x, y, z };
}

export function localK12(E, G, A, Iy, Iz, J, L) {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const set = (i, j, value) => {
    k[i][j] = value;
    k[j][i] = value;
  };

  const EA = (E * A) / L;
  const GJ = (G * J) / L;
  set(0, 0, EA);
  set(6, 6, EA);
  set(0, 6, -EA);
  set(3, 3, GJ);
  set(9, 9, GJ);
  set(3, 9, -GJ);

  const az = (12 * E * Iz) / L ** 3;
  const bz = (6 * E * Iz) / L ** 2;
  const cz = (4 * E * Iz) / L;
  const dz = (2 * E * Iz) / L;
  set(1, 1, az);
  set(7, 7, az);
  set(1, 7, -az);
  set(1, 5, bz);
  set(1, 11, bz);
  set(5, 7, -bz);
  set(7, 11, -bz);
  set(5, 5, cz);
  set(11, 11, cz);
  set(5, 11, dz);

  const ay = (12 * E * Iy) / L ** 3;
  const by = (6 * E * Iy) / L ** 2;
  const cy = (4 * E * Iy) / L;
  const dy = (2 * E * Iy) / L;
  set(2, 2, ay);
  set(8, 8, ay);
  set(2, 8, -ay);
  set(2, 4, -by);
  set(2, 10, -by);
  set(4, 8, by);
  set(8, 10, by);
  set(4, 4, cy);
  set(10, 10, cy);
  set(4, 10, dy);

  return k;
}

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

function comboSnapshot(combo = {}) {
  return {
    id: combo.id,
    name: combo.name || combo.id,
    type: combo.type || 'user',
    factors: { ...(combo.factors || {}) },
  };
}

function unionStations(stationLists) {
  const values = [];
  for (const stations of stationLists) {
    for (const x of stations || []) {
      if (!values.some((value) => Math.abs(value - x) <= 1e-8)) values.push(x);
    }
  }
  return values.sort((a, b) => a - b);
}

function envelopeQuantity(results, quantity, xs) {
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

function envelopeEnd(results) {
  const end = new Array(12).fill(0);
  for (let i = 0; i < 12; i += 1) {
    for (const { member } of results) {
      const value = member.end[i];
      if (Math.abs(value) > Math.abs(end[i])) end[i] = value;
    }
  }
  return end;
}

function stationValue(xs, values, x) {
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

function governingPeakForCheck(memberResult) {
  const quantities = memberResult.check?.governing === 'shear' ? ['Vy', 'Vz'] : ['N', 'My', 'Mz'];
  return quantities.reduce((best, quantity) => {
    const peak = peakForQuantity(memberResult, quantity);
    return !best || Math.abs(peak.value) > Math.abs(best.value) ? peak : best;
  }, null) || { x: 0, value: 0 };
}

function peakForQuantity(memberResult, quantity) {
  let peak = { x: 0, value: 0 };
  const values = memberResult[quantity] || [];
  for (let i = 0; i < values.length; i += 1) {
    if (Math.abs(values[i]) > Math.abs(peak.value)) {
      peak = { x: memberResult.xs?.[i] || 0, value: values[i] };
    }
  }
  return peak;
}

function effectiveSectionMaterial(getSec, getMat, member) {
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

function createSelfWeightLoads(model) {
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

function connectedComponentGroups(nodes, members) {
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
    const a = find(member.n1);
    const b = find(member.n2);
    if (a !== b) parent[a] = b;
  });

  const groups = {};
  members.forEach((member) => {
    const root = find(member.n1);
    groups[root] ||= { mids: new Set(), nids: new Set() };
    groups[root].mids.add(member.id);
    groups[root].nids.add(member.n1);
    groups[root].nids.add(member.n2);
  });
  return groups;
}

function buildEquilibriumSummary(nodes, members, loads, out) {
  const totalLoad = [0, 0, 0];
  for (const load of loads) {
    if (load.type === 'nmoment') continue;
    const direction = dirVec(load);
    let magnitude = 0;
    if (load.type === 'udl') {
      const member = members.find((m) => m.id === load.member);
      if (member) {
        const a = nodes.find((node) => node.id === member.n1);
        const b = nodes.find((node) => node.id === member.n2);
        if (a && b) {
          magnitude = load.w * Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
          if (load.shape && load.shape !== 'uniform') magnitude *= 0.5;
        }
      }
    } else {
      magnitude = load.P || 0;
    }
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

function buildFixedDofs(nodes) {
  const fixedDofs = new Set();
  nodes.forEach((node, i) => {
    const b = i * 6;
    if (node.support === 'fixed') {
      for (let k = 0; k < 6; k += 1) fixedDofs.add(b + k);
    } else if (node.support === 'pin') {
      fixedDofs.add(b);
      fixedDofs.add(b + 1);
      fixedDofs.add(b + 2);
    } else if (node.support === 'roller') {
      fixedDofs.add(b + 2);
    } else if (node.support === 'custom' && node.fix) {
      node.fix.forEach((isFixed, k) => {
        if (isFixed) fixedDofs.add(b + k);
      });
    }
  });
  return fixedDofs;
}

function stabilizeUnsupportedRotations(K, nodes, fixedDofs) {
  const ndof = nodes.length * 6;
  const tr = K.reduce((sum, row, i) => sum + row[i], 0);
  const ks = (tr / ndof) * 1e-9;
  nodes.forEach((node, i) => {
    if (node.support && node.support !== 'fixed') {
      for (let k = 3; k < 6; k += 1) {
        const dof = i * 6 + k;
        if (!fixedDofs.has(dof)) K[dof][dof] += ks;
      }
    }
  });
}

function autoFixIsolatedDofs(K, fixedDofs) {
  const ndof = K.length;
  const tr = K.reduce((sum, row, i) => sum + row[i], 0);
  const eps0 = (tr / ndof) * 1e-8;
  for (let i = 0; i < ndof; i += 1) {
    if (!fixedDofs.has(i) && Math.abs(K[i][i]) < eps0) fixedDofs.add(i);
  }
}

function recoverReactions(nodes, K, F, D, fixedDofs) {
  const ndof = nodes.length * 6;
  const reactions = {};
  nodes.forEach((node, i) => {
    if (!node.support) return;
    const r = [];
    for (let k = 0; k < 6; k += 1) {
      const gi = i * 6 + k;
      if (!fixedDofs.has(gi)) {
        r.push(0);
        continue;
      }
      let sum = 0;
      for (let j = 0; j < ndof; j += 1) sum += K[gi][j] * D[j];
      r.push(sum - F[gi]);
    }
    reactions[node.id] = {
      rx: r[0],
      ry: r[1],
      rz: r[2],
      rmx: r[3],
      rmy: r[4],
      rmz: r[5],
    };
  });
  return reactions;
}

function recoverMemberResult(member, md, D, loads, stationCount) {
  const { ax, section, material } = md;
  const L = ax.L;
  const dl = matVec(md.T, md.dof.map((dof) => D[dof]));

  if (md.rel.length) {
    const retained = [...Array(12).keys()].filter((i) => !md.rel.includes(i));
    const kcc = md.rel.map((i) => md.rel.map((j) => md.kl[i][j]));
    const rhs = md.rel.map((i) => {
      let sum = md.f0[i];
      for (const j of retained) sum += md.kl[i][j] * dl[j];
      return -sum;
    });
    const dc = solveLinear(kcc.map((row) => row.slice()), rhs);
    if (dc) md.rel.forEach((releaseDof, k) => {
      dl[releaseDof] = dc[k];
    });
  }

  const endForces = matVec(md.kl, dl).map((value, i) => value + md.f0[i]);
  const spanLoads = collectMemberSpanLoads(member.id, loads, ax);
  const { xs, N, Vy, Vz, Tq, My, Mz } = recoverMemberStations(endForces, spanLoads, L, stationCount);
  const { shape, dmaxM } = recoverMemberShape(dl, spanLoads, ax, material, section, L, stationCount);

  const memberResult = {
    end: endForces,
    dl,
    ax,
    xs,
    N,
    Vy,
    Vz,
    Tq,
    My,
    Mz,
    L,
    shape,
    dmaxM,
    Nmax: maxAbs(N),
    Vymax: maxAbs(Vy),
    Vzmax: maxAbs(Vz),
    Tmax: maxAbs(Tq),
    Mymax: maxAbs(My),
    Mzmax: maxAbs(Mz),
  };
  memberResult.check = sectionCheck(section, material, memberResult, L);
  return memberResult;
}

function collectMemberSpanLoads(memberId, loads, ax) {
  const spanLoads = [];
  for (const load of loads) {
    if (load.member !== memberId) continue;
    const direction = dirVec(load);
    const magnitude = load.type === 'udl' ? load.w : load.P;
    const q = [vdot(ax.x, direction) * magnitude, vdot(ax.y, direction) * magnitude, vdot(ax.z, direction) * magnitude];
    if (load.type === 'point') spanLoads.push({ type: 'point', a: load.t * ax.L, q });
    else spanLoads.push({ type: 'udl', q, shape: load.shape || 'uniform' });
  }
  return spanLoads;
}

function recoverMemberStations(endForces, spanLoads, L, stationCount) {
  const xset = new Set();
  for (let i = 0; i < stationCount; i += 1) xset.add((L * i) / (stationCount - 1));
  spanLoads.forEach((load) => {
    if (load.type === 'point') {
      xset.add(Math.max(0, load.a - 1e-9));
      xset.add(Math.min(L, load.a + 1e-9));
    }
  });

  const xs = [...xset].sort((p, q) => p - q);
  const N = [];
  const Vy = [];
  const Vz = [];
  const Tq = [];
  const My = [];
  const Mz = [];

  for (const x of xs) {
    let n = -endForces[0];
    let vy = endForces[1];
    let vz = endForces[2];
    let mz = -endForces[5] + endForces[1] * x;
    let my = endForces[4] + endForces[2] * x;
    for (const load of spanLoads) {
      if (load.type === 'point' && load.a <= x) {
        n -= load.q[0];
        vy += load.q[1];
        vz += load.q[2];
        mz += load.q[1] * (x - load.a);
        my += load.q[2] * (x - load.a);
      } else if (load.type === 'udl') {
        const { fI, mI } = integratedUniformLoad(load.shape, x, L);
        n -= load.q[0] * fI;
        vy += load.q[1] * fI;
        vz += load.q[2] * fI;
        mz += load.q[1] * mI;
        my += load.q[2] * mI;
      }
    }
    N.push(n);
    Vy.push(-vy);
    Vz.push(-vz);
    Tq.push(-endForces[3]);
    My.push(my);
    Mz.push(mz);
  }

  return { xs, N, Vy, Vz, Tq, My, Mz };
}

function recoverMemberShape(dl, spanLoads, ax, material, section, L, stationCount) {
  const EIz = material.E * section.Iz;
  const EIy = material.E * section.Iy;
  const shape = [];
  let dmaxM = 0;

  for (let i = 0; i < stationCount; i += 1) {
    const xi = i / (stationCount - 1);
    const x = xi * L;
    const u = dl[0] * (1 - xi) + dl[6] * xi;
    const H1 = 1 - 3 * xi * xi + 2 * xi ** 3;
    const H2 = L * xi * (1 - xi) * (1 - xi);
    const H3 = 3 * xi * xi - 2 * xi ** 3;
    const H4 = L * xi * xi * (xi - 1);
    let v = H1 * dl[1] + H2 * dl[5] + H3 * dl[7] + H4 * dl[11];
    let w = H1 * dl[2] + H2 * -dl[4] + H3 * dl[8] + H4 * -dl[10];

    for (const load of spanLoads) {
      if (load.type === 'udl') {
        const f = fixedFixedDeflectionFunction(load.shape, x, L);
        v += (load.q[1] * f) / EIz;
        w += (load.q[2] * f) / EIy;
      } else {
        const c = fixedFixedPointDeflectionFunction(load.a, x, L);
        v += (load.q[1] * c) / EIz;
        w += (load.q[2] * c) / EIy;
      }
    }

    const global = vadd(vadd(vscale(ax.x, u), vscale(ax.y, v)), vscale(ax.z, w));
    shape.push(global);
    dmaxM = Math.max(dmaxM, vlen(global));
  }

  return { shape, dmaxM };
}

function sectionCheck(section, material, memberResult, L) {
  const Fa = material.fa || material.fb;
  const Fb = material.fb;
  const Fv = material.fs;
  const rN = memberResult.Nmax / (section.A * Fa);
  const rM = memberResult.Mzmax / (section.Zz * Fb) + memberResult.Mymax / (section.Zy * Fb);
  const rV = (1.5 * Math.max(memberResult.Vymax, memberResult.Vzmax)) / (section.A * Fv);
  const ratio = Math.max(rN + rM, rV);
  return {
    formula: 'elastic_stress_interaction',
    expression: '|N|/(A*Fa) + |Mz|/(Zz*Fb) + |My|/(Zy*Fb) <= 1, shear 1.5V/(A*Fv) <= 1',
    inputs: {
      N: memberResult.Nmax,
      Mz: memberResult.Mzmax,
      My: memberResult.Mymax,
      Vmax: Math.max(memberResult.Vymax, memberResult.Vzmax),
      A: section.A,
      Zz: section.Zz,
      Zy: section.Zy,
      Fa,
      Fb,
      Fv,
      KLry: section.ry ? Number((L / section.ry).toFixed(1)) : null,
      KLrz: section.rz ? Number((L / section.rz).toFixed(1)) : null,
    },
    rN,
    rM,
    rV,
    ratio,
    limit: 1,
    ok: ratio <= 1,
    status: ratio <= 1 ? 'OK' : 'NG',
    governing: rN + rM >= rV ? 'axial+bending' : 'shear',
  };
}

function dirVec(load) {
  if (Array.isArray(load.direction) && load.direction.length === 3) {
    const l = Math.hypot(load.direction[0], load.direction[1], load.direction[2]) || 1;
    return [load.direction[0] / l, load.direction[1] / l, load.direction[2] / l];
  }
  return AXIS[load.dir || '-z'];
}

function transform12(ax) {
  const T = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const R = [ax.x, ax.y, ax.z];
  for (let block = 0; block < 12; block += 3) {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) T[block + i][block + j] = R[i][j];
    }
  }
  return T;
}

function fixedEndForces3D(load, ax) {
  const { L } = ax;
  const f0 = new Array(12).fill(0);
  const direction = dirVec(load);
  const magnitude = load.type === 'udl' ? load.w : load.P;
  const q = [vdot(ax.x, direction) * magnitude, vdot(ax.y, direction) * magnitude, vdot(ax.z, direction) * magnitude];

  if (load.type === 'point') {
    const a = load.t * L;
    const b = L - a;
    f0[0] -= (q[0] * b) / L;
    f0[6] -= (q[0] * a) / L;
    f0[1] -= (q[1] * b * b * (3 * a + b)) / L ** 3;
    f0[7] -= (q[1] * a * a * (a + 3 * b)) / L ** 3;
    f0[5] -= (q[1] * a * b * b) / L ** 2;
    f0[11] += (q[1] * a * a * b) / L ** 2;
    f0[2] -= (q[2] * b * b * (3 * a + b)) / L ** 3;
    f0[8] -= (q[2] * a * a * (a + 3 * b)) / L ** 3;
    f0[4] += (q[2] * a * b * b) / L ** 2;
    f0[10] -= (q[2] * a * a * b) / L ** 2;
  } else if (load.type === 'udl') {
    const coeffs = fixedEndUniformCoefficients(load.shape || 'uniform', L);
    f0[0] -= q[0] * coeffs.a1;
    f0[6] -= q[0] * coeffs.a2;
    f0[1] -= q[1] * coeffs.sh1;
    f0[7] -= q[1] * coeffs.sh2;
    f0[5] -= q[1] * coeffs.m1;
    f0[11] += q[1] * coeffs.m2;
    f0[2] -= q[2] * coeffs.sh1;
    f0[8] -= q[2] * coeffs.sh2;
    f0[4] += q[2] * coeffs.m1;
    f0[10] -= q[2] * coeffs.m2;
  }

  return f0;
}

function fixedEndUniformCoefficients(shape, L) {
  if (shape === 'asc') return { a1: L / 6, a2: L / 3, sh1: (3 * L) / 20, sh2: (7 * L) / 20, m1: L ** 2 / 30, m2: L ** 2 / 20 };
  if (shape === 'desc') return { a1: L / 3, a2: L / 6, sh1: (7 * L) / 20, sh2: (3 * L) / 20, m1: L ** 2 / 20, m2: L ** 2 / 30 };
  return { a1: L / 2, a2: L / 2, sh1: L / 2, sh2: L / 2, m1: L ** 2 / 12, m2: L ** 2 / 12 };
}

function condenseReleasedDofs(kl, f0, rel) {
  const retained = [...Array(12).keys()].filter((i) => !rel.includes(i));
  const kcc = rel.map((i) => rel.map((j) => kl[i][j]));
  const aug = rel.map((ri) => retained.map((j) => kl[ri][j]).concat([f0[ri]]));
  const X = [];
  for (let col = 0; col <= retained.length; col += 1) {
    const x = solveLinear(kcc.map((row) => row.slice()), aug.map((row) => row[col]));
    if (!x) return null;
    X.push(x);
  }

  const klC = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const f0C = new Array(12).fill(0);
  for (let i = 0; i < retained.length; i += 1) {
    for (let j = 0; j < retained.length; j += 1) {
      let sum = kl[retained[i]][retained[j]];
      for (let k = 0; k < rel.length; k += 1) sum -= kl[retained[i]][rel[k]] * X[j][k];
      klC[retained[i]][retained[j]] = sum;
    }
    let sf = f0[retained[i]];
    for (let k = 0; k < rel.length; k += 1) sf -= kl[retained[i]][rel[k]] * X[retained.length][k];
    f0C[retained[i]] = sf;
  }
  return { klC, f0C };
}

function memberReleaseDofs(member) {
  const rel = [];
  const iRelease = member.rel1 || member.releases?.i;
  const jRelease = member.rel2 || member.releases?.j;
  if (iRelease === 'pin') rel.push(4, 5);
  if (jRelease === 'pin') rel.push(10, 11);
  return rel;
}

function integratedUniformLoad(shape, x, L) {
  if (shape === 'asc') return { fI: x ** 2 / (2 * L), mI: x ** 3 / (6 * L) };
  if (shape === 'desc') return { fI: x - x ** 2 / (2 * L), mI: x ** 2 / 2 - x ** 3 / (6 * L) };
  return { fI: x, mI: x ** 2 / 2 };
}

function fixedFixedDeflectionFunction(shape, x, L) {
  if (shape === 'asc') return x ** 5 / (120 * L) - (L * x ** 3) / 40 + (L ** 2 * x ** 2) / 60;
  if (shape === 'desc') {
    const xm = L - x;
    return xm ** 5 / (120 * L) - (L * xm ** 3) / 40 + (L ** 2 * xm ** 2) / 60;
  }
  return (x ** 2 * (L - x) ** 2) / 24;
}

function fixedFixedPointDeflectionFunction(a, x, L) {
  const b = L - a;
  if (x <= a) return (b ** 2 * x ** 2 * (3 * a * L - (3 * a + b) * x)) / (6 * L ** 3);
  const x2 = L - x;
  return (a ** 2 * x2 ** 2 * (3 * b * L - (3 * b + a) * x2)) / (6 * L ** 3);
}

function matMul(A, B) {
  const n = A.length;
  const m = B[0].length;
  const K = B.length;
  const R = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let p = 0; p < K; p += 1) {
      const a = A[i][p];
      if (!a) continue;
      for (let j = 0; j < m; j += 1) R[i][j] += a * B[p][j];
    }
  }
  return R;
}

function matTrans(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

function matVec(A, v) {
  return A.map((row) => row.reduce((sum, x, i) => sum + x * v[i], 0));
}

function maxAbs(values) {
  return Math.max(...values.map((value) => Math.abs(value)));
}

function buildSolverDiagnostics(K, F, D, freeDofs, fixedDofs) {
  const residual = matVec(K, D).map((value, i) => value - F[i]);
  const freeResiduals = freeDofs.map((dof) => residual[dof]);
  const freeLoads = freeDofs.map((dof) => F[dof]);
  const residualMax = freeResiduals.length ? maxAbs(freeResiduals) : 0;
  const loadNorm = Math.max(1, freeLoads.length ? maxAbs(freeLoads) : 0);
  const diagonal = K.map((row, i) => Math.abs(row[i])).filter((value) => value > 0);
  return {
    type: 'linear_static_3d_frame',
    dofCount: K.length,
    freeDofCount: freeDofs.length,
    fixedDofCount: fixedDofs.size,
    residualMax,
    residualNorm: residualMax / loadNorm,
    loadNorm,
    displacementNorm: D.length ? maxAbs(D) : 0,
    diagonalMin: diagonal.length ? Math.min(...diagonal) : 0,
    diagonalMax: diagonal.length ? Math.max(...diagonal) : 0,
  };
}

function summarizeSolverDiagnostics(components) {
  const finite = components.filter(Boolean);
  if (!finite.length) {
    return {
      type: 'linear_static_3d_frame',
      componentCount: 0,
      dofCount: 0,
      freeDofCount: 0,
      fixedDofCount: 0,
      residualMax: null,
      residualNorm: null,
      loadNorm: null,
      displacementNorm: null,
    };
  }
  return {
    type: 'linear_static_3d_frame',
    componentCount: finite.length,
    dofCount: finite.reduce((sum, item) => sum + item.dofCount, 0),
    freeDofCount: finite.reduce((sum, item) => sum + item.freeDofCount, 0),
    fixedDofCount: finite.reduce((sum, item) => sum + item.fixedDofCount, 0),
    residualMax: Math.max(...finite.map((item) => item.residualMax)),
    residualNorm: Math.max(...finite.map((item) => item.residualNorm)),
    loadNorm: Math.max(...finite.map((item) => item.loadNorm)),
    displacementNorm: Math.max(...finite.map((item) => item.displacementNorm)),
    diagonalMin: Math.min(...finite.map((item) => item.diagonalMin)),
    diagonalMax: Math.max(...finite.map((item) => item.diagonalMax)),
  };
}
