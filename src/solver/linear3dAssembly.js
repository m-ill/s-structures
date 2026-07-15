import { materialOf, sectionOf } from '../core/catalogs.js';
import {
  condenseReleasedDofs,
  dirVec,
  localK12,
  localTrussK12,
  matMul,
  matTrans,
  matVec,
  maxAbs,
  memberAxes,
  memberReleaseDofs,
  solveLinear,
  solveLinearDetailed,
  transform12,
} from './linear3dElement.js';
import { buildFixedEndLoad, fixedEndTraceRow } from '../loads/fixedEnd/index.js';
import { buildDiaphragmDofMap } from './diaphragmDofMap.js';
import { reducedFixedDofs } from './diaphragmFixedDofs.js';
import { expandReducedDisplacements, reduceSystem } from './diaphragmReduce.js';
import { effectiveSectionMaterial } from './linear3dPost.js';
import { recoverMemberResult } from './linear3dRecovery.js';
import { buildSolverWarningDiagnostics } from './sparse/diagnostics.js';
import { cscMatVec, SPARSE_MATRIX_VERSION } from './sparse/cscMatrix.js';
import { buildFixedDofs } from './domain/supportConstraints.js';

export { buildFixedDofs } from './domain/supportConstraints.js';

function memberBehavior(member = {}) {
  const value = member.behavior || member.type;
  return ['truss', 'tensionOnly', 'compressionOnly'].includes(value) ? 'truss' : 'frame';
}

export function memberKinematics(member, a, b) {
  const base = memberAxes(a, b, member.localAxis);
  const oi = Number(member.endOffset?.i ?? 0);
  const oj = Number(member.endOffset?.j ?? 0);
  if (!Number.isFinite(oi) || !Number.isFinite(oj) || oi < 0 || oj < 0) {
    return offsetFailure('INVALID_MEMBER_OFFSET', member, 'Member end offsets must be finite nonnegative lengths.');
  }
  if (oi + oj >= base.L - 1e-9 && (oi || oj)) {
    return offsetFailure('INVALID_MEMBER_OFFSET_CLEAR_LENGTH', member, 'Member end offsets must leave a positive clear length.');
  }
  if (!(oi || oj)) return { ok: true, ax: base, T: transform12(base) };

  const rigidFactor = Number(member.endOffset?.rigidFactor ?? 1);
  if (!Number.isFinite(rigidFactor) || Math.abs(rigidFactor - 1) > 1e-12) {
    return offsetFailure(
      'UNSUPPORTED_MEMBER_OFFSET_RIGID_FACTOR',
      member,
      'Only fully rigid axial end offsets with rigidFactor=1 are supported.',
    );
  }

  const ae = { ...a, x: a.x + base.x[0] * oi, y: a.y + base.x[1] * oi, z: (a.z || 0) + base.x[2] * oi };
  const be = { ...b, x: b.x - base.x[0] * oj, y: b.y - base.x[1] * oj, z: (b.z || 0) - base.x[2] * oj };
  const ax = { ...memberAxes(ae, be, member.localAxis), grossL: base.L, offset: { i: oi, j: oj, rigidFactor: 1 } };
  const rigidArm = rigidArmTransform(oi, oj);
  return { ok: true, ax, T: matMul(rigidArm, transform12(ax)) };
}

function rigidArmTransform(oi, oj) {
  const transform = Array.from({ length: 12 }, (_row, i) => (
    Array.from({ length: 12 }, (_column, j) => (i === j ? 1 : 0))
  ));
  for (const [base, arm] of [[0, oi], [6, -oj]]) {
    transform[base + 1][base + 5] = arm;
    transform[base + 2][base + 4] = -arm;
  }
  return transform;
}

function offsetFailure(reason, member, message) {
  return { ok: false, reason, memberId: member.id, message };
}

export function analyzeComponent3D(nodes, members, loads, ctx = {}) {
  const getMat = ctx.mat || ((id) => materialOf(null, id));
  const getSec = ctx.sec || ((id) => sectionOf(null, id));
  const stationCount = Math.max(21, ctx.stations | 0 || 21);
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const idx = Object.fromEntries(nodes.map((node, i) => [node.id, i]));
  const ndof = nodes.length * 6;
  const cacheKey = elasticComponentCacheKey(ctx);
  const cached = cacheKey ? ctx.componentCache?.get(cacheKey) : null;
  const assembleStiffness = !cached;
  const sparseDecision = cached?.sparseDecision || sparseAssemblyDecision(ctx, ndof);
  const sparseAccumulator = assembleStiffness && sparseDecision.useSparse ? createSparseAccumulator(ndof, ndof) : null;
  let K = cached?.K || (sparseDecision.useSparse ? null : Array.from({ length: ndof }, () => new Array(ndof).fill(0)));
  const F = new Array(ndof).fill(0);
  const memData = {};

  for (const member of members) {
    const a = nodeMap[member.n1];
    const b = nodeMap[member.n2];
    if (!a || !b || idx[member.n1] == null || idx[member.n2] == null) continue;
    const kinematics = memberKinematics(member, a, b);
    if (!kinematics.ok) return kinematics;
    const { ax, T } = kinematics;
    if (ax.L < 1e-9) continue;
    const { section, material } = effectiveSectionMaterial(getSec, getMat, member);
    const kl = memberBehavior(member) === 'truss'
      ? localTrussK12(material.E, section.A, ax.L)
      : localK12(material.E, material.G, section.A, section.Iy, section.Iz, section.J, ax.L);
    const i1 = idx[member.n1] * 6;
    const i2 = idx[member.n2] * 6;
    const dof = [i1, i1 + 1, i1 + 2, i1 + 3, i1 + 4, i1 + 5, i2, i2 + 1, i2 + 2, i2 + 3, i2 + 4, i2 + 5];
    memData[member.id] = {
      ax,
      kl,
      T,
      dof,
      f0: new Array(12).fill(0),
      fixedEndLoads: [],
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
      const fixedEnd = buildFixedEndLoad(load, md.ax, md);
      if (!fixedEnd) continue;
      if (!fixedEnd.ok) {
        return {
          ok: false,
          reason: fixedEnd.reason || 'INVALID_MEMBER_LOAD',
          loadId: load.id || null,
          memberId: load.member || null,
        };
      }
      md.fixedEndLoads.push(fixedEndTraceRow(fixedEnd));
      for (let i = 0; i < 12; i += 1) md.f0[i] += fixedEnd.q0[i];
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

    if (assembleStiffness) {
      const kg = matMul(matTrans(md.T), matMul(klA, md.T));
      for (let i = 0; i < 12; i += 1) {
        for (let j = 0; j < 12; j += 1) {
          if (sparseDecision.useSparse) addSparseValue(sparseAccumulator, md.dof[i], md.dof[j], kg[i][j]);
          else K[md.dof[i]][md.dof[j]] += kg[i][j];
        }
      }
    }

    const feq = matVec(matTrans(md.T), f0A).map((v) => -v);
    for (let i = 0; i < 12; i += 1) F[md.dof[i]] += feq[i];
  }

  const restrainedDofs = buildFixedDofs(nodes);
  const fixedDofs = new Set(cached?.fixedDofs || restrainedDofs);
  const springValidation = validateNodeSpringInputs(nodes);
  if (!springValidation.ok) return springValidation;
  if (assembleStiffness) {
    if (sparseDecision.useSparse) applyNodeSpringsSparse(nodes, idx, sparseAccumulator, F);
    else applyNodeSprings(nodes, idx, K, F);
  } else {
    applyNodeSpringForces(nodes, idx, F);
  }
  if (!restrainedDofs.size && !nodes.some((node) => node.support === 'spring')) return { ok: false, reason: 'NO_SUPPORT' };

  if (assembleStiffness && sparseDecision.useSparse) {
    stabilizeUnsupportedRotationsSparse(sparseAccumulator, nodes, fixedDofs);
    K = sparseAccumulatorToCsc(sparseAccumulator);
    autoFixIsolatedDofsSparse(K, fixedDofs);
  } else if (assembleStiffness) {
    stabilizeUnsupportedRotations(K, nodes, fixedDofs);
    autoFixIsolatedDofs(K, fixedDofs);
  }
  const diaphragmGroups = activeDiaphragmGroups(nodes, ctx.diaphragms);
  const reduced = cached?.reduced
    ? { ...cached.reduced, F: reduceForceWithMap(F, cached.reduced.map) }
    : diaphragmGroups.length
      ? sparseDecision.useSparse
        ? reduceWithDiaphragmsSparse(K, F, nodes, fixedDofs, diaphragmGroups)
        : reduceWithDiaphragms(K, F, nodes, fixedDofs, diaphragmGroups)
      : null;
  const Ks = reduced?.K || K;
  const Fs = reduced?.F || F;
  const assembledValidation = validateAssembledSystem(Ks, Fs);
  if (!assembledValidation.ok) return assembledValidation;
  const fixed = new Set(reduced?.fixedDofs || fixedDofs);
  if (reduced && assembleStiffness) {
    if (sparseDecision.useSparse) autoFixIsolatedDofsSparse(Ks, fixed);
    else autoFixIsolatedDofs(Ks, fixed);
  }
  const prescribed = buildPrescribedDisplacements(nodes, restrainedDofs, fixedDofs, reduced?.map, fixed);
  if (!prescribed.ok) return prescribed;
  const criteriaModel = ctx.criteriaModel || ctx.model || ctx.analysisCriteria || {};
  const systemDofCount = matrixSize(Ks);
  const dofLabels = solverDofLabels(nodes, reduced?.map, systemDofCount);

  const free = cached?.free ? [...cached.free] : [];
  if (!cached?.free) {
    for (let i = 0; i < systemDofCount; i += 1) {
      if (!fixed.has(i)) free.push(i);
    }
  }

  let df = [];
  let solve = null;
  let Kff = null;
  let assemblyTelemetry = null;
  if (free.length) {
    Kff = cached?.Kff || (sparseDecision.useSparse
      ? extractCscSubmatrix(Ks, free, free)
      : free.map((i) => free.map((j) => Ks[i][j])));
    const prescribedForces = matrixMatVec(Ks, prescribed.values);
    const Ff = free.map((i) => Fs[i] - prescribedForces[i]);
    assemblyTelemetry = cached?.assemblyTelemetry
      ? { ...cached.assemblyTelemetry, stiffnessReused: true }
      : {
          ...buildAssemblyTelemetry({
            sparseDecision,
            globalK: K,
            systemK: Ks,
            freeK: Kff,
            reduced: !!reduced,
            accumulatorPeakEntries: sparseAccumulator?.peakEntries || 0,
            freeDofCount: free.length,
          }),
          stiffnessReused: false,
        };
    if (cacheKey && assembleStiffness) cacheElasticComponent(ctx.componentCache, cacheKey, {
      K,
      fixedDofs: [...fixedDofs],
      sparseDecision,
      reduced: reduced ? { K: reduced.K, fixedDofs: [...reduced.fixedDofs], map: reduced.map } : null,
      free: [...free],
      Kff,
      assemblyTelemetry,
    });
    solve = solveElasticSystem(Kff, Ff, {
      ...ctx,
      criteriaModel,
      labels: free.map((index) => dofLabels[index] || `dof:${index}`),
    });
    df = solve.x || [];
    if (!solve.ok) {
      const failed = buildSolverDiagnostics(
        Ks,
        Fs,
        prescribed.values,
        free,
        fixed,
        solve.diagnostics,
        criteriaModel,
        dofLabels,
        assemblyTelemetry,
      );
      return { ok: false, reason: 'SINGULAR', solver: failed };
    }
  } else {
    assemblyTelemetry = cached?.assemblyTelemetry
      ? { ...cached.assemblyTelemetry, stiffnessReused: true }
      : {
          ...buildAssemblyTelemetry({
            sparseDecision,
            globalK: K,
            systemK: Ks,
            freeK: null,
            reduced: !!reduced,
            accumulatorPeakEntries: sparseAccumulator?.peakEntries || 0,
            freeDofCount: 0,
          }),
          stiffnessReused: false,
        };
    if (cacheKey && assembleStiffness) cacheElasticComponent(ctx.componentCache, cacheKey, {
      K,
      fixedDofs: [...fixedDofs],
      sparseDecision,
      reduced: reduced ? { K: reduced.K, fixedDofs: [...reduced.fixedDofs], map: reduced.map } : null,
      free: [],
      Kff: null,
      assemblyTelemetry,
    });
  }

  const Q = prescribed.values.slice();
  free.forEach((globalIndex, i) => {
    Q[globalIndex] = df[i];
  });
  const D = reduced ? expandReducedDisplacements(Q, reduced.map) : Q;
  const solver = buildSolverDiagnostics(
    Ks,
    Fs,
    Q,
    free,
    fixed,
    solve?.diagnostics,
    criteriaModel,
    dofLabels,
    assemblyTelemetry,
  );
  solver.diaphragmCount = diaphragmGroups.length;
  solver.reducedDofCount = systemDofCount;
  solver.prescribedDofCount = prescribed.dofs.length;
  solver.prescribedDofs = prescribed.dofs;

  for (let i = 0; i < ndof; i += 1) {
    const limit = i % 6 < 3 ? 1e4 : 50;
    if (!Number.isFinite(D[i])) {
      return dofFailure('NONFINITE_DISPLACEMENT', nodes, i, D[i], 'Solved displacement is not finite.');
    }
    if (Math.abs(D[i]) > limit) {
      return dofFailure('UNBOUNDED_DISPLACEMENT', nodes, i, D[i], `Solved displacement exceeds ${limit}.`);
    }
  }

  const disp = {};
  nodes.forEach((node, i) => {
    disp[node.id] = D.slice(i * 6, i * 6 + 6);
  });

  const recoveredReactions = recoverReactionsDetailed(nodes, K, F, D, fixedDofs);
  if (!recoveredReactions.ok) return recoveredReactions;
  const reactions = recoveredReactions.reactions;
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

function reduceWithDiaphragmsSparse(K, F, nodes, fixedDofs, groups) {
  const map = buildDiaphragmDofMap(nodes, groups);
  const accumulator = createSparseAccumulator(map.ncols, map.ncols);
  const Fr = new Array(map.ncols).fill(0);
  for (let row = 0; row < map.rows.length; row += 1) {
    for (const [reducedRow, coefficient] of map.rows[row]) Fr[reducedRow] += coefficient * F[row];
  }
  for (let col = 0; col < K.colCount; col += 1) {
    for (let p = K.colPtr[col]; p < K.colPtr[col + 1]; p += 1) {
      const row = K.rowIdx[p];
      const value = K.values[p];
      for (const [reducedRow, rowCoefficient] of map.rows[row]) {
        for (const [reducedCol, colCoefficient] of map.rows[col]) {
          addSparseValue(accumulator, reducedRow, reducedCol, rowCoefficient * value * colCoefficient);
        }
      }
    }
  }
  return {
    K: sparseAccumulatorToCsc(accumulator),
    F: Fr,
    fixedDofs: reducedFixedDofs(fixedDofs, map),
    map,
  };
}

function reduceForceWithMap(F, map) {
  const reduced = new Array(map.ncols).fill(0);
  for (let row = 0; row < map.rows.length; row += 1) {
    for (const [column, coefficient] of map.rows[row]) reduced[column] += coefficient * F[row];
  }
  return reduced;
}

function elasticComponentCacheKey(ctx) {
  if (!ctx.componentCache || typeof ctx.componentCache.get !== 'function' || typeof ctx.componentCache.set !== 'function') return null;
  if (!ctx.factorGroupKey || !ctx.componentKey) return null;
  return `${ctx.factorGroupKey}::${ctx.componentKey}`;
}

function cacheElasticComponent(cache, key, value) {
  cache.set(key, Object.freeze(value));
}

function solveElasticSystem(Kff, Ff, ctx) {
  if (!ctx.factorSession) {
    return solveLinearDetailed(Kff, Ff, {
      criteriaModel: ctx.criteriaModel,
      labels: ctx.labels,
      solver: Kff?.format === 'csc' ? 'sparse' : ctx.solver,
      sparse: Kff?.format === 'csc' ? true : ctx.sparse,
      sparseThreshold: ctx.sparseThreshold,
    });
  }
  const result = ctx.factorSession.solve(Kff, Ff, {
    groupKey: ctx.factorGroupKey,
    componentKey: ctx.componentKey,
    matrixClass: 'spd',
    signal: ctx.signal,
  });
  const x = result.x ? Array.from(result.x) : null;
  const diagnostics = {
    ...(result.diagnostics || {}),
    diagnostics: result.ok
      ? buildSolverWarningDiagnostics(Kff, x, Ff, result.diagnostics || {}, ctx.criteriaModel, ctx.labels || [])
      : result.diagnostics?.diagnostics,
  };
  return { ok: result.ok, x, reason: result.reason, diagnostics };
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
    const kinematics = memberKinematics(member, a, b);
    if (!kinematics.ok) return { ...kinematics, K, free: [], fixedDofs: new Set(), nodeMap, idx, memData, ndof };
    const { ax, T } = kinematics;
    if (ax.L < 1e-9) continue;
    const { section, material } = effectiveSectionMaterial(getSec, getMat, member);
    const kl = memberBehavior(member) === 'truss'
      ? localTrussK12(material.E, section.A, ax.L)
      : localK12(material.E, material.G, section.A, section.Iy, section.Iz, section.J, ax.L);
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
  const F = new Array(ndof).fill(0);
  applyNodeSprings(nodes, idx, K, F);
  if (!fixedDofs.size && !nodes.some((node) => node.support === 'spring')) return { ok: false, reason: 'NO_SUPPORT', K, free: [], fixedDofs, nodeMap, idx, memData };
  stabilizeUnsupportedRotations(K, nodes, fixedDofs);
  autoFixIsolatedDofs(K, fixedDofs);
  const free = [];
  for (let i = 0; i < ndof; i += 1) {
    if (!fixedDofs.has(i)) free.push(i);
  }
  return { ok: true, K, free, fixedDofs, nodeMap, idx, memData, ndof };
}

function buildPrescribedDisplacements(nodes, restrainedDofs, fullFixedDofs, map, reducedFixedDofs) {
  const displacementKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const legacyKeys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const full = new Array(nodes.length * 6).fill(0);
  const explicit = new Set();
  const dofs = [];

  nodes.forEach((node, nodeIndex) => {
    if (!node.settlement || node.support === 'spring') return;
    displacementKeys.forEach((key, dofIndex) => {
      const legacyKey = legacyKeys[dofIndex];
      const hasValue = Object.hasOwn(node.settlement, key) || Object.hasOwn(node.settlement, legacyKey);
      if (!hasValue) return;
      const value = Number(node.settlement[legacyKey] ?? node.settlement[key]);
      const globalDof = nodeIndex * 6 + dofIndex;
      if (!Number.isFinite(value)) {
        dofs.push({ error: true, reason: 'INVALID_PRESCRIBED_DISPLACEMENT', nodeId: node.id, dof: key });
        return;
      }
      if (!restrainedDofs.has(globalDof)) {
        dofs.push({ error: true, reason: 'PRESCRIBED_DOF_NOT_RESTRAINED', nodeId: node.id, dof: key, value });
        return;
      }
      full[globalDof] = value;
      explicit.add(globalDof);
      dofs.push({ nodeId: node.id, dof: key, value });
    });
  });

  const invalid = dofs.find((row) => row.error);
  if (invalid) return { ok: false, ...invalid, message: `Cannot apply prescribed displacement at ${invalid.nodeId}.${invalid.dof}.` };
  if (!map) return { ok: true, values: full, dofs };

  const values = new Array(map.ncols).fill(0);
  const assigned = new Map();
  for (const fullDof of fullFixedDofs) {
    const row = map.rows[fullDof] || [];
    if (row.length !== 1 || Math.abs(row[0][1]) <= 1e-12) {
      if (explicit.has(fullDof)) {
        const nodeIndex = Math.floor(fullDof / 6);
        const dofIndex = fullDof % 6;
        return {
          ok: false,
          reason: 'UNSUPPORTED_PRESCRIBED_DIAPHRAGM_CONSTRAINT',
          nodeId: nodes[nodeIndex]?.id || null,
          dof: displacementKeys[dofIndex],
          message: 'Prescribed displacement coupled to multiple rigid-diaphragm coordinates is unsupported.',
        };
      }
      continue;
    }
    const [column, coefficient] = row[0];
    const value = full[fullDof] / coefficient;
    if (assigned.has(column) && Math.abs(assigned.get(column) - value) > 1e-10) {
      return {
        ok: false,
        reason: 'INCONSISTENT_PRESCRIBED_DIAPHRAGM_CONSTRAINT',
        message: 'Rigid-diaphragm constraints prescribe incompatible values to one reduced DOF.',
      };
    }
    assigned.set(column, value);
    values[column] = value;
    reducedFixedDofs.add(column);
  }
  return { ok: true, values, dofs };
}

export function applyNodeSprings(nodes, idx, K, F) {
  const keys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const dispKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const node of nodes) {
    if (node.support !== 'spring') continue;
    const base = idx[node.id] * 6;
    keys.forEach((key, i) => {
      const k = Number(node.spring?.[key] || 0);
      if (!(k > 0)) return;
      K[base + i][base + i] += k;
      const imposed = Number(node.settlement?.[key] ?? node.settlement?.[dispKeys[i]] ?? 0);
      if (Number.isFinite(imposed)) F[base + i] += k * imposed;
    });
  }
}

function applyNodeSpringForces(nodes, idx, F) {
  const keys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const dispKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const node of nodes) {
    if (node.support !== 'spring') continue;
    const base = idx[node.id] * 6;
    keys.forEach((key, index) => {
      const stiffness = Number(node.spring?.[key] || 0);
      if (!(stiffness > 0)) return;
      const imposed = Number(node.settlement?.[key] ?? node.settlement?.[dispKeys[index]] ?? 0);
      if (Number.isFinite(imposed)) F[base + index] += stiffness * imposed;
    });
  }
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
  const result = recoverReactionsDetailed(nodes, K, F, D, fixedDofs);
  if (result.ok) return result.reactions;
  const error = new Error(result.message || result.reason);
  Object.assign(error, result);
  throw error;
}

function recoverReactionsDetailed(nodes, K, F, D, fixedDofs) {
  const reactions = {};
  const internalForces = matrixMatVec(K, D);
  nodes.forEach((node, i) => {
    if (!node.support) return;
    if (node.support === 'spring') {
      reactions[node.id] = springReaction(node, D.slice(i * 6, i * 6 + 6));
      return;
    }
    const r = [];
    for (let k = 0; k < 6; k += 1) {
      const gi = i * 6 + k;
      if (!fixedDofs.has(gi)) {
        r.push(0);
        continue;
      }
      r.push(internalForces[gi] - F[gi]);
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
  const reactionKeys = ['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz'];
  for (const [nodeId, reaction] of Object.entries(reactions)) {
    for (const key of reactionKeys) {
      if (!Number.isFinite(reaction[key])) {
        return {
          ok: false,
          reason: 'NONFINITE_REACTION_COMPONENT',
          entityType: 'node',
          entityId: nodeId,
          nodeId,
          component: key,
          value: reaction[key],
          message: `Reaction ${nodeId}.${key} is not finite.`,
        };
      }
    }
  }
  return { ok: true, reactions };
}

function springReaction(node, d) {
  const keys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const dispKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const out = keys.map((key, i) => {
    const stiffness = Number(node.spring?.[key] ?? 0);
    const imposed = Number(node.settlement?.[key] ?? node.settlement?.[dispKeys[i]] ?? 0);
    return -stiffness * (d[i] - imposed);
  });
  return { rx: out[0], ry: out[1], rz: out[2], rmx: out[3], rmy: out[4], rmz: out[5] };
}

export function buildSolverDiagnostics(
  K,
  F,
  D,
  freeDofs,
  fixedDofs,
  solveDiagnostics = null,
  criteriaModel = {},
  dofLabels = [],
  assemblyTelemetry = null,
) {
  const residual = matrixMatVec(K, D).map((value, i) => value - F[i]);
  const freeResiduals = freeDofs.map((dof) => residual[dof]);
  const freeLoads = freeDofs.map((dof) => F[dof]);
  const residualMax = freeResiduals.length ? maxAbs(freeResiduals) : 0;
  const loadNorm = Math.max(1, freeLoads.length ? maxAbs(freeLoads) : 0);
  const diagonal = matrixDiagonal(K).map(Math.abs).filter((value) => value > 0);
  const freeK = isCscMatrix(K)
    ? extractCscSubmatrix(K, freeDofs, freeDofs)
    : freeDofs.map((i) => freeDofs.map((j) => K[i][j]));
  const freeD = freeDofs.map((i) => D[i]);
  const sparseDiagnostics = freeDofs.length
    ? solveDiagnostics?.diagnostics || buildSolverWarningDiagnostics(freeK, freeD, freeLoads, solveDiagnostics || {}, criteriaModel, freeDofs.map((index) => dofLabels[index] || `dof:${index}`))
    : {
      symmetryError: 0,
      residualMax: 0,
      residualNorm: 0,
      loadNorm: 1,
      conditionEstimate: 0,
      pivotRatio: 1,
      suspectedMechanismDofs: [],
      warnings: [],
    };
  return {
    type: 'linear_static_3d_frame',
    dofCount: matrixSize(K),
    freeDofCount: freeDofs.length,
    fixedDofCount: fixedDofs.size,
    residualMax,
    residualNorm: residualMax / loadNorm,
    loadNorm,
    displacementNorm: D.length ? maxAbs(D) : 0,
    diagonalMin: diagonal.length ? Math.min(...diagonal) : 0,
    diagonalMax: diagonal.length ? Math.max(...diagonal) : 0,
    diaphragmCount: 0,
    reducedDofCount: matrixSize(K),
    sparse: solveDiagnostics || assemblyTelemetry?.path === 'sparse-csc' ? {
      version: solveDiagnostics?.version || null,
      method: solveDiagnostics?.method || null,
      sparseAttempted: !!solveDiagnostics?.sparseAttempted,
      fallback: !!solveDiagnostics?.fallback,
      fallbackSucceeded: !!solveDiagnostics?.fallbackSucceeded,
      inputStorage: solveDiagnostics?.inputStorage || null,
      matrixStorage: solveDiagnostics?.matrixStorage || null,
      factorStorage: solveDiagnostics?.factorStorage || null,
      denseConversionCount: solveDiagnostics?.denseConversionCount ?? 0,
      nnz: solveDiagnostics?.nnz ?? null,
      density: solveDiagnostics?.density ?? null,
      fillInRatio: solveDiagnostics?.fillInRatio ?? null,
      factorizationMs: solveDiagnostics?.factorizationMs ?? 0,
      solveMs: solveDiagnostics?.solveMs ?? 0,
      totalMs: solveDiagnostics?.totalMs ?? 0,
      ordering: solveDiagnostics?.symbolic?.ordering || null,
      qualification: solveDiagnostics?.qualification || null,
      assembly: assemblyTelemetry,
    } : null,
    symmetryError: sparseDiagnostics.symmetryError,
    conditionEstimate: sparseDiagnostics.conditionEstimate,
    pivotRatio: sparseDiagnostics.pivotRatio,
    suspectedMechanismDofs: sparseDiagnostics.suspectedMechanismDofs,
    warnings: sparseDiagnostics.warnings,
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
    sparse: {
      componentCount: finite.filter((item) => item.sparse).length,
      sparseAttemptedCount: finite.filter((item) => item.sparse?.sparseAttempted).length,
      fallbackCount: finite.filter((item) => item.sparse?.fallback).length,
      maxFillInRatio: Math.max(0, ...finite.map((item) => Number(item.sparse?.fillInRatio) || 0)),
      totalFactorizationMs: finite.reduce((sum, item) => sum + (Number(item.sparse?.factorizationMs) || 0), 0),
      totalSolveMs: finite.reduce((sum, item) => sum + (Number(item.sparse?.solveMs) || 0), 0),
    },
    symmetryError: Math.max(0, ...finite.map((item) => Number(item.symmetryError) || 0)),
    conditionEstimate: Math.max(0, ...finite.map((item) => Number(item.conditionEstimate) || 0).filter(Number.isFinite)),
    pivotRatio: Math.min(...finite.map((item) => Number(item.pivotRatio) || 1)),
    warningCount: finite.reduce((sum, item) => sum + (item.warnings?.length || 0), 0),
    warnings: finite.flatMap((item) => item.warnings || []),
  };
}

function solverDofLabels(nodes, map, count) {
  if (!map || count === nodes.length * 6) {
    return nodes.flatMap((node) => ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'].map((dof) => `${node.id}.${dof}`));
  }
  return Array.from({ length: count }, (_item, index) => `reduced:${index}`);
}

function sparseAssemblyDecision(ctx, ndof) {
  const threshold = Math.max(1, Number(ctx.sparseThreshold ?? 256));
  const requested = ctx.solver === 'sparse' || ctx.sparse === true;
  const explicitlyDense = ctx.solver === 'dense' || ctx.sparse === false;
  const thresholdReached = ndof >= threshold;
  return {
    useSparse: requested || (thresholdReached && !explicitlyDense),
    requested,
    explicitlyDense,
    threshold,
    thresholdReached,
  };
}

function createSparseAccumulator(rowCount, colCount) {
  return {
    rowCount,
    colCount,
    entries: new Map(),
    peakEntries: 0,
  };
}

function addSparseValue(accumulator, row, col, value) {
  const number = Number(value);
  if (!number) return;
  const key = row * accumulator.colCount + col;
  const next = (accumulator.entries.get(key) || 0) + number;
  if (next) accumulator.entries.set(key, next);
  else accumulator.entries.delete(key);
  accumulator.peakEntries = Math.max(accumulator.peakEntries, accumulator.entries.size);
}

function sparseAccumulatorToCsc(accumulator) {
  const columns = Array.from({ length: accumulator.colCount }, () => []);
  for (const [key, value] of accumulator.entries) {
    const col = key % accumulator.colCount;
    const row = (key - col) / accumulator.colCount;
    if (value) columns[col].push([row, value]);
  }
  const colPtr = [0];
  const rowIdx = [];
  const values = [];
  for (const column of columns) {
    column.sort((a, b) => a[0] - b[0]);
    for (const [row, value] of column) {
      rowIdx.push(row);
      values.push(value);
    }
    colPtr.push(values.length);
  }
  accumulator.entries.clear();
  return {
    version: SPARSE_MATRIX_VERSION,
    format: 'csc',
    rowCount: accumulator.rowCount,
    colCount: accumulator.colCount,
    colPtr,
    rowIdx,
    values,
    nnz: values.length,
  };
}

function extractCscSubmatrix(matrix, rowIds, colIds) {
  const rowMap = new Int32Array(matrix.rowCount);
  const colMap = new Int32Array(matrix.colCount);
  rowMap.fill(-1);
  colMap.fill(-1);
  rowIds.forEach((row, index) => { rowMap[row] = index; });
  colIds.forEach((col, index) => { colMap[col] = index; });
  const accumulator = createSparseAccumulator(rowIds.length, colIds.length);
  for (const sourceCol of colIds) {
    const targetCol = colMap[sourceCol];
    for (let p = matrix.colPtr[sourceCol]; p < matrix.colPtr[sourceCol + 1]; p += 1) {
      const targetRow = rowMap[matrix.rowIdx[p]];
      if (targetRow >= 0) addSparseValue(accumulator, targetRow, targetCol, matrix.values[p]);
    }
  }
  return sparseAccumulatorToCsc(accumulator);
}

function applyNodeSpringsSparse(nodes, idx, accumulator, F) {
  const keys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const displacementKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const node of nodes) {
    if (node.support !== 'spring') continue;
    const base = idx[node.id] * 6;
    keys.forEach((key, index) => {
      const stiffness = Number(node.spring?.[key] ?? 0);
      if (!(stiffness > 0)) return;
      addSparseValue(accumulator, base + index, base + index, stiffness);
      const imposed = Number(node.settlement?.[key] ?? node.settlement?.[displacementKeys[index]] ?? 0);
      F[base + index] += stiffness * imposed;
    });
  }
}

function stabilizeUnsupportedRotationsSparse(accumulator, nodes, fixedDofs) {
  let trace = 0;
  for (let i = 0; i < accumulator.rowCount; i += 1) {
    trace += accumulator.entries.get(i * accumulator.colCount + i) || 0;
  }
  const stiffness = (trace / Math.max(1, accumulator.rowCount)) * 1e-9;
  if (!stiffness) return;
  nodes.forEach((node, nodeIndex) => {
    if (node.support && node.support !== 'fixed') {
      for (let component = 3; component < 6; component += 1) {
        const dof = nodeIndex * 6 + component;
        if (!fixedDofs.has(dof)) addSparseValue(accumulator, dof, dof, stiffness);
      }
    }
  });
}

function autoFixIsolatedDofsSparse(matrix, fixedDofs) {
  const diagonal = matrixDiagonal(matrix);
  const trace = diagonal.reduce((sum, value) => sum + value, 0);
  const threshold = (trace / Math.max(1, matrix.rowCount)) * 1e-8;
  for (let i = 0; i < matrix.rowCount; i += 1) {
    if (!fixedDofs.has(i) && Math.abs(diagonal[i]) < threshold) fixedDofs.add(i);
  }
}

function validateNodeSpringInputs(nodes) {
  const stiffnessKeys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const displacementKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const node of nodes) {
    if (node.support !== 'spring') continue;
    for (let index = 0; index < stiffnessKeys.length; index += 1) {
      const stiffnessKey = stiffnessKeys[index];
      const rawStiffness = node.spring?.[stiffnessKey];
      if (rawStiffness !== undefined) {
        const stiffness = Number(rawStiffness);
        if (!Number.isFinite(stiffness)) {
          return entityFailure(
            'NONFINITE_SPRING_STIFFNESS',
            node,
            stiffnessKey,
            rawStiffness,
            `Spring stiffness ${node.id}.${stiffnessKey} must be finite.`,
          );
        }
        if (stiffness < 0) {
          return entityFailure(
            'INVALID_SPRING_STIFFNESS',
            node,
            stiffnessKey,
            rawStiffness,
            `Spring stiffness ${node.id}.${stiffnessKey} must be nonnegative.`,
          );
        }
      }
      const displacementKey = displacementKeys[index];
      const hasSettlement = Object.hasOwn(node.settlement || {}, stiffnessKey)
        || Object.hasOwn(node.settlement || {}, displacementKey);
      if (hasSettlement) {
        const rawSettlement = node.settlement?.[stiffnessKey] ?? node.settlement?.[displacementKey];
        if (!Number.isFinite(Number(rawSettlement))) {
          return entityFailure(
            'NONFINITE_SPRING_SETTLEMENT',
            node,
            displacementKey,
            rawSettlement,
            `Spring imposed displacement ${node.id}.${displacementKey} must be finite.`,
          );
        }
      }
    }
  }
  return { ok: true };
}

function validateAssembledSystem(matrix, force) {
  for (let index = 0; index < force.length; index += 1) {
    if (!Number.isFinite(force[index])) {
      return {
        ok: false,
        reason: 'NONFINITE_ASSEMBLED_FORCE',
        entityType: 'dof',
        dof: index,
        value: force[index],
        message: `Assembled force at DOF ${index} is not finite.`,
      };
    }
  }
  if (isCscMatrix(matrix)) {
    for (let col = 0; col < matrix.colCount; col += 1) {
      for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
        if (!Number.isFinite(matrix.values[p])) {
          return {
            ok: false,
            reason: 'NONFINITE_ASSEMBLED_STIFFNESS',
            entityType: 'matrix-entry',
            row: matrix.rowIdx[p],
            col,
            value: matrix.values[p],
            message: `Assembled stiffness K[${matrix.rowIdx[p]},${col}] is not finite.`,
          };
        }
      }
    }
  } else {
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix[row].length; col += 1) {
        if (!Number.isFinite(matrix[row][col])) {
          return {
            ok: false,
            reason: 'NONFINITE_ASSEMBLED_STIFFNESS',
            entityType: 'matrix-entry',
            row,
            col,
            value: matrix[row][col],
            message: `Assembled stiffness K[${row},${col}] is not finite.`,
          };
        }
      }
    }
  }
  return { ok: true };
}

function entityFailure(reason, entity, component, value, message) {
  return {
    ok: false,
    reason,
    entityType: 'node',
    entityId: entity.id,
    nodeId: entity.id,
    component,
    value,
    message,
  };
}

function dofFailure(reason, nodes, dof, value, message) {
  const node = nodes[Math.floor(dof / 6)] || null;
  const components = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  return {
    ok: false,
    reason,
    entityType: 'dof',
    entityId: node?.id || null,
    nodeId: node?.id || null,
    dof,
    component: components[dof % 6],
    value,
    message,
  };
}

function isCscMatrix(matrix) {
  return matrix?.format === 'csc'
    && arrayLike(matrix.colPtr)
    && arrayLike(matrix.rowIdx)
    && arrayLike(matrix.values);
}

function arrayLike(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function matrixSize(matrix) {
  return isCscMatrix(matrix) ? matrix.rowCount : matrix.length;
}

function matrixMatVec(matrix, vector) {
  return isCscMatrix(matrix) ? cscMatVec(matrix, vector) : matVec(matrix, vector);
}

function matrixDiagonal(matrix) {
  if (!isCscMatrix(matrix)) return matrix.map((row, index) => Number(row[index]) || 0);
  const diagonal = new Array(matrix.colCount).fill(0);
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      if (matrix.rowIdx[p] === col) diagonal[col] += matrix.values[p];
    }
  }
  return diagonal;
}

function buildAssemblyTelemetry({
  sparseDecision,
  globalK,
  systemK,
  freeK,
  reduced,
  accumulatorPeakEntries,
  freeDofCount,
}) {
  const matrices = [];
  for (const matrix of [globalK, systemK, freeK]) {
    if (matrix && !matrices.includes(matrix)) matrices.push(matrix);
  }
  if (!sparseDecision.useSparse) {
    const denseEntries = matrices.map((matrix) => matrix.length * (matrix[0]?.length || 0));
    return {
      path: 'dense',
      requested: sparseDecision.requested,
      thresholdReached: sparseDecision.thresholdReached,
      threshold: sparseDecision.threshold,
      inputAllocation: 'dense-global-and-free-submatrix',
      denseSquareAllocationCount: 1 + (reduced ? 1 : 0) + (freeK ? 1 : 0),
      denseAllocatedEntries: denseEntries.reduce((sum, value) => sum + value, 0),
      cscToDenseConversionCount: 0,
      globalDofCount: matrixSize(globalK),
      freeDofCount,
    };
  }
  const descriptors = matrices.map(cscDescriptor);
  const peakMatrixNnz = Math.max(0, ...descriptors.map((item) => item.nnz));
  const peakConcurrentMatrixNnz = descriptors.reduce((sum, item) => sum + item.nnz, 0);
  const peakMatrixStorageEntries = descriptors.reduce((sum, item) => sum + item.storageEntries, 0);
  const denseEquivalentEntries = Math.max(0, ...matrices.map((matrix) => matrix.rowCount * matrix.colCount));
  return {
    path: 'sparse-csc',
    requested: sparseDecision.requested,
    thresholdReached: sparseDecision.thresholdReached,
    threshold: sparseDecision.threshold,
    inputAllocation: 'element-map-to-csc',
    inputMatrixStorage: 'csc',
    denseSquareAllocationCount: 0,
    denseGlobalMatrixAllocated: false,
    denseFreeMatrixAllocated: false,
    cscToDenseConversionCount: 0,
    assemblyAccumulatorPeakEntries: accumulatorPeakEntries,
    globalDofCount: globalK.rowCount,
    freeDofCount,
    globalMatrix: cscDescriptor(globalK),
    systemMatrix: cscDescriptor(systemK),
    freeMatrix: freeK ? cscDescriptor(freeK) : null,
    peakMatrixNnz,
    peakConcurrentMatrixNnz,
    peakMatrixStorageEntries,
    denseEquivalentEntries,
    storageToDenseRatio: denseEquivalentEntries > 0 ? peakMatrixStorageEntries / denseEquivalentEntries : 0,
  };
}

function cscDescriptor(matrix) {
  return {
    format: 'csc',
    rowCount: matrix.rowCount,
    colCount: matrix.colCount,
    nnz: matrix.nnz,
    storageEntries: matrix.values.length + matrix.rowIdx.length + matrix.colPtr.length,
  };
}
