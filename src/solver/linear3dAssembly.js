import { materialOf, sectionOf } from '../core/catalogs.js';
import {
  condenseReleasedDofs,
  dirVec,
  fixedEndForces3D,
  localK12,
  matMul,
  matTrans,
  matVec,
  maxAbs,
  memberAxes,
  memberReleaseDofs,
  solveLinear,
  transform12,
} from './linear3dElement.js';
import { buildDiaphragmDofMap } from './diaphragmDofMap.js';
import { reducedFixedDofs } from './diaphragmFixedDofs.js';
import { expandReducedDisplacements, reduceSystem } from './diaphragmReduce.js';
import { effectiveSectionMaterial } from './linear3dPost.js';
import { recoverMemberResult } from './linear3dRecovery.js';

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
    if (!a || !b || idx[member.n1] == null || idx[member.n2] == null) continue;
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

  if (!Object.keys(memData).length) return { ok: false, reason: 'NO_VALID_MEMBERS' };

  for (const load of loads) {
    if (load.type === 'nodal') {
      if (idx[load.node] == null || !Number.isFinite(Number(load.P))) continue;
      const direction = dirVec(load);
      const i = idx[load.node] * 6;
      const force = Number(load.P);
      F[i] += direction[0] * force;
      F[i + 1] += direction[1] * force;
      F[i + 2] += direction[2] * force;
    } else if (load.type === 'nmoment') {
      if (idx[load.node] == null || !Number.isFinite(Number(load.M))) continue;
      const axisIndex = { x: 0, y: 1, z: 2 }[load.axis || 'z'];
      if (axisIndex == null) continue;
      F[idx[load.node] * 6 + 3 + axisIndex] += Number(load.M);
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
  const diaphragmGroups = activeDiaphragmGroups(nodes, ctx.diaphragms);
  const reduced = diaphragmGroups.length ? reduceWithDiaphragms(K, F, nodes, fixedDofs, diaphragmGroups) : null;
  const Ks = reduced?.K || K;
  const Fs = reduced?.F || F;
  const fixed = reduced?.fixedDofs || fixedDofs;
  if (reduced) autoFixIsolatedDofs(Ks, fixed);

  const free = [];
  for (let i = 0; i < Ks.length; i += 1) {
    if (!fixed.has(i)) free.push(i);
  }

  let df = [];
  if (free.length) {
    df = solveLinear(
      free.map((i) => free.map((j) => Ks[i][j])),
      free.map((i) => Fs[i]),
    );
    if (!df) return { ok: false, reason: 'SINGULAR' };
  }

  const Q = new Array(Ks.length).fill(0);
  free.forEach((globalIndex, i) => {
    Q[globalIndex] = df[i];
  });
  const D = reduced ? expandReducedDisplacements(Q, reduced.map) : Q;
  const solver = buildSolverDiagnostics(Ks, Fs, Q, free, fixed);
  solver.diaphragmCount = diaphragmGroups.length;
  solver.reducedDofCount = Ks.length;

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

function activeDiaphragmGroups(nodes, groups = []) {
  const ids = new Set(nodes.map((node) => node.id));
  return groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => ids.has(id)) }))
    .filter((group) => group.nodeIds.length > 1);
}

function reduceWithDiaphragms(K, F, nodes, fixedDofs, groups) {
  const map = buildDiaphragmDofMap(nodes, groups);
  const reduced = reduceSystem(K, F, map);
  return { ...reduced, fixedDofs: reducedFixedDofs(fixedDofs, map), map };
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

export function buildFixedDofs(nodes) {
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

export function stabilizeUnsupportedRotations(K, nodes, fixedDofs) {
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

export function autoFixIsolatedDofs(K, fixedDofs) {
  const ndof = K.length;
  const tr = K.reduce((sum, row, i) => sum + row[i], 0);
  const eps0 = (tr / ndof) * 1e-8;
  for (let i = 0; i < ndof; i += 1) {
    if (!fixedDofs.has(i) && Math.abs(K[i][i]) < eps0) fixedDofs.add(i);
  }
}

export function recoverReactions(nodes, K, F, D, fixedDofs) {
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

export function buildSolverDiagnostics(K, F, D, freeDofs, fixedDofs) {
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
    diaphragmCount: 0,
    reducedDofCount: K.length,
  };
}

export function summarizeSolverDiagnostics(components) {
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
      diaphragmCount: 0,
      reducedDofCount: 0,
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
    diaphragmCount: finite.reduce((sum, item) => sum + (item.diaphragmCount || 0), 0),
    reducedDofCount: finite.reduce((sum, item) => sum + (item.reducedDofCount || item.dofCount || 0), 0),
  };
}
