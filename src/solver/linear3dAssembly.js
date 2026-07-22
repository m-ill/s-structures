import { materialOf, sectionOf } from '../core/catalogs.js';
import { stableHash } from '../core/stableHash.js';
import {
  condenseReleasedDofs,
  dirVec,
  localK12,
  localTrussK12,
  matMul,
  matTrans,
  matVec,
  maxAbs,
  memberReleaseDofs,
  solveLinear,
  solveLinearDetailed,
} from './linear3dElement.js';
import { buildFixedEndLoad, fixedEndTraceRow } from '../loads/fixedEnd/index.js';
import { buildDiaphragmDofMap } from './diaphragmDofMap.js';
import { resolveReducedDofConstraints } from './diaphragmFixedDofs.js';
import { expandReducedDisplacements, reduceSystem } from './diaphragmReduce.js';
import { effectiveSectionMaterial } from './linear3dPost.js';
import { recoverMemberResult } from './linear3dRecovery.js';
import { buildSolverWarningDiagnostics } from './sparse/diagnostics.js';
import { cscMatVec, SPARSE_MATRIX_VERSION } from './sparse/cscMatrix.js';
import { buildFixedDofs, collectPrescribedDofs } from './domain/supportConstraints.js';
import { condensePartialFixity, resolveMemberPartialFixity } from './partialFixity.js';
import { resolveMemberTimoshenko } from './timoshenko.js';
import { resolveMemberOffsetKinematics } from './memberOffsets.js';
import { applyPanelZoneConnectionSprings, attachPanelZoneSources } from './panelZone.js';

export { buildFixedDofs } from './domain/supportConstraints.js';

export const ELASTIC_COMPONENT_SYSTEM_VERSION = 'p9-m5-elastic-component-system-v1';

function memberBehavior(member = {}) {
  const value = member.behavior || member.type;
  return ['truss', 'tensionOnly', 'compressionOnly'].includes(value) ? 'truss' : 'frame';
}

export function memberKinematics(member, a, b, section = {}) {
  return resolveMemberOffsetKinematics(member, a, b, section);
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
    const { section, material } = effectiveSectionMaterial(getSec, getMat, member);
    const kinematics = memberKinematics(member, a, b, section);
    if (!kinematics.ok) return kinematics;
    const { ax, T } = kinematics;
    if (ax.L < 1e-9) continue;
    const behavior = memberBehavior(member);
    const timoshenko = resolveMemberTimoshenko(ctx.model || ctx.criteriaModel || {}, member, section, material, ax.L);
    const connection = applyPanelZoneConnectionSprings(member, { i: a, j: b }, material);
    if (!connection.ok) return connection;
    const partialFixity = attachPanelZoneSources(
      resolveMemberPartialFixity(ctx.model || ctx.criteriaModel || {}, connection.member, section, material, ax.L),
      connection,
    );
    const kl = behavior === 'truss'
      ? localTrussK12(material.E, section.A, ax.L)
      : localK12(material.E, material.G, section.A, section.Iy, section.Iz, section.J, ax.L, timoshenko.phiY, timoshenko.phiZ);
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
      timoshenko,
      rel: memberReleaseDofs(member),
      partialFixity,
      panelZone: connection,
      offsetKinematics: kinematics,
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
    const conditioned = conditionMemberLocalSystem(md, member.id);
    if (!conditioned.ok) return conditioned;
    const { klA, f0A } = conditioned;

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
  const prescribedConstraints = collectPrescribedDofs(nodes, restrainedDofs);
  if (!prescribedConstraints.ok) return prescribedConstraintFailure(prescribedConstraints.errors[0]);
  // Cache only load-independent constraints.  Isolated DOFs are classified for
  // every RHS below because an unloaded mechanism may become loaded in a later
  // combination that reuses this stiffness matrix.
  const fixedDofs = new Set(cached?.fixedDofs || restrainedDofs);
  const structuralFixedDofs = [...fixedDofs];
  const autoFixedDofs = [];
  const autoFixedReducedDofs = [];
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
  } else if (assembleStiffness) {
    stabilizeUnsupportedRotations(K, nodes, fixedDofs);
  }
  const diaphragmGroups = activeDiaphragmGroups(nodes, ctx.diaphragms);
  const reduced = cached?.reduced
    ? { ...cached.reduced, F: reduceForceWithMap(F, cached.reduced.map) }
    : diaphragmGroups.length
      ? sparseDecision.useSparse
        ? reduceWithDiaphragmsSparse(K, F, nodes, fixedDofs, diaphragmGroups)
        : reduceWithDiaphragms(K, F, nodes, fixedDofs, diaphragmGroups)
      : null;
  if (reduced?.constraintResolution?.ok === false) {
    return reducedConstraintFailure(reduced.constraintResolution, nodes);
  }
  const Ks = reduced?.K || K;
  const Fs = reduced?.F || F;
  const assembledValidation = validateAssembledSystem(Ks, Fs);
  if (!assembledValidation.ok) return assembledValidation;
  const fixed = reduced ? new Set(reduced.fixedDofs) : fixedDofs;

  // Diaphragm slave loads are meaningful only after T'F reduction.  Checking
  // the unreduced vector incorrectly labels a valid slave load as a mechanism.
  const loadedMechanismDof = firstLoadedIsolatedDof(Ks, Fs, fixed);
  if (loadedMechanismDof != null) {
    return reducedDofFailure(
      'MECHANISM_DOF',
      nodes,
      loadedMechanismDof,
      reduced?.map,
      Fs[loadedMechanismDof],
      'A loaded degree of freedom has no assembled stiffness.',
    );
  }
  if (sparseDecision.useSparse) {
    const added = autoFixIsolatedDofsSparse(Ks, fixed);
    (reduced ? autoFixedReducedDofs : autoFixedDofs).push(...added);
  } else {
    const added = autoFixIsolatedDofs(Ks, fixed);
    (reduced ? autoFixedReducedDofs : autoFixedDofs).push(...added);
  }
  const prescribed = buildPrescribedDisplacements(
    nodes,
    prescribedConstraints.entries,
    fixedDofs,
    reduced?.map,
    fixed,
  );
  if (!prescribed.ok) return prescribed;
  const criteriaModel = ctx.criteriaModel || ctx.model || ctx.analysisCriteria || {};
  const systemDofCount = matrixSize(Ks);
  const dofLabels = solverDofLabels(nodes, reduced?.map, systemDofCount);

  const free = [];
  for (let i = 0; i < systemDofCount; i += 1) {
    if (!fixed.has(i)) free.push(i);
  }

  let df = [];
  let solve = null;
  let Kff = null;
  let Ff = [];
  let assemblyTelemetry = null;
  if (free.length) {
    Kff = sparseDecision.useSparse
      ? extractCscSubmatrix(Ks, free, free)
      : free.map((i) => free.map((j) => Ks[i][j]));
    const prescribedForces = matrixMatVec(Ks, prescribed.values);
    Ff = free.map((i) => Fs[i] - prescribedForces[i]);
    assemblyTelemetry = {
      ...buildAssemblyTelemetry({
        sparseDecision,
        globalK: K,
        systemK: Ks,
        freeK: Kff,
        reduced: !!reduced,
        accumulatorPeakEntries: sparseAccumulator?.peakEntries || cached?.accumulatorPeakEntries || 0,
        freeDofCount: free.length,
      }),
      stiffnessReused: !!cached,
    };
    if (cacheKey && assembleStiffness) cacheElasticComponent(ctx.componentCache, cacheKey, {
      K,
      fixedDofs: structuralFixedDofs,
      sparseDecision,
      reduced: reduced ? {
        K: reduced.K,
        fixedDofs: [...reduced.fixedDofs],
        map: reduced.map,
        constraintResolution: reduced.constraintResolution,
      } : null,
      accumulatorPeakEntries: sparseAccumulator?.peakEntries || 0,
    });
    if (!ctx.captureSystemsOnly) {
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
    }
  } else {
    assemblyTelemetry = {
      ...buildAssemblyTelemetry({
        sparseDecision,
        globalK: K,
        systemK: Ks,
        freeK: null,
        reduced: !!reduced,
        accumulatorPeakEntries: sparseAccumulator?.peakEntries || cached?.accumulatorPeakEntries || 0,
        freeDofCount: 0,
      }),
      stiffnessReused: !!cached,
    };
    if (cacheKey && assembleStiffness) cacheElasticComponent(ctx.componentCache, cacheKey, {
      K,
      fixedDofs: structuralFixedDofs,
      sparseDecision,
      reduced: reduced ? {
        K: reduced.K,
        fixedDofs: [...reduced.fixedDofs],
        map: reduced.map,
        constraintResolution: reduced.constraintResolution,
      } : null,
      accumulatorPeakEntries: sparseAccumulator?.peakEntries || 0,
    });
  }

  if (ctx.captureSystemsOnly) {
    const capture = {
      version: ELASTIC_COMPONENT_SYSTEM_VERSION,
      componentKey: String(ctx.componentKey || 'component'),
      factorGroupKey: String(ctx.factorGroupKey || 'ungrouped'),
      matrixClass: 'spd',
      matrix: Kff,
      rhs: Float64Array.from(Ff),
      freeDofCount: free.length,
      systemDofCount,
      labels: free.map((index) => dofLabels[index] || `dof:${index}`),
      assemblyTelemetry,
    };
    capture.systemHash = elasticComponentSystemHash(capture.matrix, capture.rhs, capture.componentKey);
    return {
      ok: true,
      capture,
      resume(replay) {
        const resumed = replayElasticSolution(Kff, Ff, {
          ...ctx,
          criteriaModel,
          labels: capture.labels,
        }, replay);
        if (!resumed.ok) return { ok: false, reason: resumed.reason, solver: resumed.diagnostics };
        return finishSolvedComponent(resumed);
      },
    };
  }

  return finishSolvedComponent(solve);

  function finishSolvedComponent(solved) {
    const solvedDf = solved?.x || [];
    const Q = prescribed.values.slice();
    free.forEach((globalIndex, i) => {
      Q[globalIndex] = solvedDf[i];
    });
    const D = reduced ? expandReducedDisplacements(Q, reduced.map) : Q;
    const solver = buildSolverDiagnostics(
      Ks,
      Fs,
      Q,
      free,
      fixed,
      solved?.diagnostics,
      criteriaModel,
      dofLabels,
      assemblyTelemetry,
    );
    solver.diaphragmCount = diaphragmGroups.length;
    solver.reducedDofCount = systemDofCount;
    solver.prescribedDofCount = prescribed.dofs.length;
    solver.prescribedDofs = prescribed.dofs;
    solver.autoFixedDofs = [...new Set(autoFixedDofs)]
      .map((index) => fullDofLabel(nodes, index));
    solver.autoFixedReducedDofs = [...new Set(autoFixedReducedDofs)]
      .map((index) => dofLabels[index] || `reduced:${index}`);
    solver.partialFixity = summarizePartialFixity(memData);
    solver.warnings = [
      ...(solver.warnings || []),
      ...solver.partialFixity.warnings,
    ];

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

    const reactionRecovery = reduced
      ? buildReducedReactionRecovery(Ks, Fs, Q, fixedDofs, reduced.map)
      : null;
    if (reactionRecovery?.ok === false) return reactionRecovery;
    solver.reactionRecovery = reactionRecovery?.trace || {
      applied: false,
      method: 'full-system-residual',
      ambiguousCoordinateCount: 0,
    };
    const recoveredReactions = recoverReactionsDetailed(
      nodes,
      K,
      F,
      D,
      fixedDofs,
      reactionRecovery?.overrides,
      new Set(prescribedConstraints.entries.map((entry) => entry.fullDof)),
    );
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
}

function activeDiaphragmGroups(nodes, groups = []) {
  const ids = new Set(nodes.map((node) => node.id));
  return groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => ids.has(id)) }))
    .filter((group) => group.nodeIds.length > 1);
}

function reduceWithDiaphragms(K, F, nodes, fixedDofs, groups) {
  const map = buildDiaphragmDofMap(nodes, groups);
  const reduced = reduceSystem(K, F, map);
  const constraintResolution = resolveReducedDofConstraints(fixedDofs, map);
  return { ...reduced, fixedDofs: constraintResolution.fixedDofs, constraintResolution, map };
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
  const constraintResolution = resolveReducedDofConstraints(fixedDofs, map);
  return {
    K: sparseAccumulatorToCsc(accumulator),
    F: Fr,
    fixedDofs: constraintResolution.fixedDofs,
    constraintResolution,
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
  const replay = resolvePrecomputedSolution(ctx.precomputedSolutions, ctx.componentKey);
  if (replay) return replayElasticSolution(Kff, Ff, ctx, replay);
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

export function elasticComponentSystemHash(matrix, rhs, componentKey = 'component') {
  return stableHash({
    version: ELASTIC_COMPONENT_SYSTEM_VERSION,
    componentKey: String(componentKey),
    matrix: serializableMatrix(matrix),
    rhs: Array.from(rhs || [], Number),
  });
}

function resolvePrecomputedSolution(solutions, componentKey) {
  if (!solutions) return null;
  if (typeof solutions.get === 'function') return solutions.get(componentKey) || null;
  return solutions[componentKey] || null;
}

function replayElasticSolution(Kff, Ff, ctx, replay) {
  const systemHash = elasticComponentSystemHash(Kff, Ff, ctx.componentKey);
  if (replay.systemHash !== systemHash) {
    return { ok: false, x: null, reason: 'HYBRID_ELASTIC_SYSTEM_HASH_MISMATCH', diagnostics: { systemHash, replaySystemHash: replay.systemHash || null } };
  }
  const x = Array.from(replay.x || [], Number);
  if (x.length !== Ff.length || x.some((value) => !Number.isFinite(value))) {
    return { ok: false, x: null, reason: 'HYBRID_ELASTIC_SOLUTION_INVALID', diagnostics: { expectedLength: Ff.length, actualLength: x.length } };
  }
  if (replay.designTransferAllowed !== true || replay.f64Residual?.ok !== true) {
    return {
      ok: false,
      x: null,
      reason: replay.reason || 'HYBRID_ELASTIC_F64_AUDIT_REQUIRED',
      diagnostics: { f64Residual: replay.f64Residual || null, designTransferAllowed: replay.designTransferAllowed === true },
    };
  }
  return {
    ok: true,
    x,
    diagnostics: {
      version: ELASTIC_COMPONENT_SYSTEM_VERSION,
      method: 'p9-m5-hybrid-mixed-f32-f64-replay',
      systemHash,
      fallback: false,
      denseConversionCount: 0,
      mixedPrecision: replay.diagnostics || null,
      f64Residual: replay.f64Residual,
      designTransferAllowed: true,
    },
  };
}

function serializableMatrix(matrix) {
  if (Array.isArray(matrix)) return matrix;
  if (matrix?.format === 'csc') {
    return {
      format: 'csc',
      rowCount: matrix.rowCount,
      colCount: matrix.colCount,
      colPtr: Array.from(matrix.colPtr || []),
      rowIdx: Array.from(matrix.rowIdx || []),
      values: Array.from(matrix.values || []),
    };
  }
  return matrix || null;
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
    const { section, material } = effectiveSectionMaterial(getSec, getMat, member);
    const kinematics = memberKinematics(member, a, b, section);
    if (!kinematics.ok) return { ...kinematics, K, free: [], fixedDofs: new Set(), nodeMap, idx, memData, ndof };
    const { ax, T } = kinematics;
    if (ax.L < 1e-9) continue;
    const behavior = memberBehavior(member);
    const timoshenko = resolveMemberTimoshenko(ctx.model || ctx.criteriaModel || {}, member, section, material, ax.L);
    const connection = applyPanelZoneConnectionSprings(member, { i: a, j: b }, material);
    if (!connection.ok) return { ...connection, K, free: [], fixedDofs: new Set(), nodeMap, idx, memData, ndof };
    const partialFixity = attachPanelZoneSources(
      resolveMemberPartialFixity(ctx.model || ctx.criteriaModel || {}, connection.member, section, material, ax.L),
      connection,
    );
    const kl = behavior === 'truss'
      ? localTrussK12(material.E, section.A, ax.L)
      : localK12(material.E, material.G, section.A, section.Iy, section.Iz, section.J, ax.L, timoshenko.phiY, timoshenko.phiZ);
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
      timoshenko,
      rel: memberReleaseDofs(member),
      partialFixity,
      panelZone: connection,
      offsetKinematics: kinematics,
    };
  }

  for (const member of members) {
    const md = memData[member.id];
    if (!md) continue;
    const conditioned = conditionMemberLocalSystem(md, member.id);
    if (!conditioned.ok) return { ...conditioned, K, free: [], fixedDofs: new Set(), nodeMap, idx, memData, ndof };
    const { klA } = conditioned;
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
  const autoFixedDofs = autoFixIsolatedDofs(K, fixedDofs);
  const free = [];
  for (let i = 0; i < ndof; i += 1) {
    if (!fixedDofs.has(i)) free.push(i);
  }
  return {
    ok: true,
    K,
    free,
    fixedDofs,
    autoFixedDofs: autoFixedDofs.map((index) => fullDofLabel(nodes, index)),
    nodeMap,
    idx,
    memData,
    ndof,
    partialFixity: summarizePartialFixity(memData),
  };
}

export function conditionMemberLocalSystem(md, memberId) {
  let klA = md.kl;
  let f0A = md.f0;
  md.releaseCondensation = null;
  if (md.rel.length) {
    const condensed = condenseReleasedDofs(klA, f0A, md.rel);
    if (!condensed) {
      return {
        ok: false,
        reason: 'MEMBER_RELEASE_CONDENSATION_FAILED',
        memberId,
      };
    }
    md.releaseCondensation = condensed;
    klA = condensed.klC;
    f0A = condensed.f0C;
  }
  const partialApplication = condensePartialFixity(klA, f0A, md.partialFixity);
  if (!partialApplication.ok) {
    return {
      ok: false,
      reason: partialApplication.reason || 'PARTIAL_FIXITY_CONDENSATION_FAILED',
      memberId,
      partialFixity: md.partialFixity,
    };
  }
  md.partialFixityApplication = partialApplication;
  md.klA = partialApplication.klC;
  md.f0A = partialApplication.f0C;
  return { ok: true, klA: md.klA, f0A: md.f0A };
}

function summarizePartialFixity(memData = {}) {
  const members = Object.entries(memData)
    .filter(([, md]) => md.partialFixity?.enabled)
    .map(([memberId, md]) => ({
      memberId,
      method: md.partialFixityApplication?.method || null,
      entries: (md.partialFixity.entries || []).map((entry) => ({ ...entry })),
      warnings: (md.partialFixity.warnings || []).map((item) => ({ ...item })),
    }));
  return {
    enabled: members.length > 0,
    memberCount: members.length,
    springCount: members.reduce((sum, row) => sum + row.entries.length, 0),
    members,
    warnings: members.flatMap((row) => row.warnings),
  };
}

function buildPrescribedDisplacements(nodes, entries, fullFixedDofs, map, reducedFixedDofs) {
  const full = new Array(nodes.length * 6).fill(0);
  const dofs = entries.map((entry) => ({
    nodeId: entry.nodeId,
    dof: entry.component,
    value: entry.value,
  }));
  for (const entry of entries) full[entry.fullDof] = entry.value;
  if (!map) return { ok: true, values: full, dofs };

  const values = new Array(map.ncols).fill(0);
  const resolved = resolveReducedDofConstraints(
    fullFixedDofs,
    map,
    new Map(entries.map((entry) => [entry.fullDof, entry.value])),
  );
  if (!resolved.ok) return reducedConstraintFailure(resolved, nodes);
  for (const [column, value] of resolved.values) {
    values[column] = value;
    reducedFixedDofs.add(column);
  }
  return { ok: true, values, dofs };
}

function prescribedConstraintFailure(issue = {}) {
  const reason = issue.code === 'NONFINITE_PRESCRIBED_DISPLACEMENT'
    ? 'INVALID_PRESCRIBED_DISPLACEMENT'
    : issue.code === 'PRESCRIBED_DISPLACEMENT_DOF_NOT_RESTRAINED'
      ? 'PRESCRIBED_DOF_NOT_RESTRAINED'
      : 'PRESCRIBED_DISPLACEMENT_INVALID';
  return {
    ok: false,
    reason,
    nodeId: issue.nodeId || null,
    dof: issue.component || null,
    value: issue.value,
    message: `Cannot apply prescribed displacement at ${issue.nodeId || 'unknown'}.${issue.component || 'unknown'}.`,
  };
}

function reducedConstraintFailure(resolution = {}, nodes = []) {
  const fullDof = resolution.fullDof ?? resolution.unresolvedFullDofs?.[0] ?? null;
  const node = fullDof == null ? null : nodes[Math.floor(fullDof / 6)];
  const component = fullDof == null ? null : ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'][fullDof % 6];
  return {
    ok: false,
    reason: resolution.reason || 'UNSUPPORTED_COUPLED_DIAPHRAGM_CONSTRAINT',
    entityType: fullDof == null ? null : 'dof',
    entityId: node?.id || null,
    nodeId: node?.id || null,
    dof: fullDof,
    component,
    unresolvedFullDofs: [...(resolution.unresolvedFullDofs || [])],
    message: resolution.reason === 'INCONSISTENT_PRESCRIBED_DIAPHRAGM_CONSTRAINT'
      ? 'Rigid-diaphragm support and prescribed-displacement constraints are inconsistent.'
      : 'Coupled rigid-diaphragm restraint cannot be represented safely by the reduced solver.',
  };
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
  const diagonal = K.map((row, index) => Math.abs(Number(row[index]) || 0));
  const eps0 = numericalZeroThreshold(diagonal);
  const added = [];
  for (let i = 0; i < ndof; i += 1) {
    if (!fixedDofs.has(i) && Math.abs(K[i][i]) < eps0) {
      fixedDofs.add(i);
      added.push(i);
    }
  }
  return added;
}

export function recoverReactions(nodes, K, F, D, fixedDofs) {
  const result = recoverReactionsDetailed(nodes, K, F, D, fixedDofs);
  if (result.ok) return result.reactions;
  const error = new Error(result.message || result.reason);
  Object.assign(error, result);
  throw error;
}

function recoverReactionsDetailed(
  nodes,
  K,
  F,
  D,
  fixedDofs,
  overrides = null,
  prescribedDofs = new Set(),
) {
  const reactions = {};
  const internalForces = matrixMatVec(K, D);
  const reactionKeys = ['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz'];
  nodes.forEach((node, i) => {
    const base = i * 6;
    const hasExplicitConstraint = Array.from({ length: 6 }, (_value, component) => base + component)
      .some((dof) => prescribedDofs.has(dof));
    if (!node.support && !hasExplicitConstraint) return;
    if (node.support === 'spring') {
      const reaction = springReaction(node, D.slice(i * 6, i * 6 + 6));
      for (let component = 0; component < 6; component += 1) {
        const gi = base + component;
        if (!prescribedDofs.has(gi)) continue;
        reaction[reactionKeys[component]] += overrides?.has(gi)
          ? overrides.get(gi)
          : internalForces[gi] - F[gi];
      }
      reactions[node.id] = reaction;
      return;
    }
    const r = [];
    for (let k = 0; k < 6; k += 1) {
      const gi = i * 6 + k;
      const reportable = node.support ? fixedDofs.has(gi) : prescribedDofs.has(gi);
      if (!reportable) {
        r.push(0);
        continue;
      }
      r.push(overrides?.has(gi) ? overrides.get(gi) : internalForces[gi] - F[gi]);
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

function buildReducedReactionRecovery(K, F, Q, fullFixedDofs, map) {
  const reducedResidual = matrixMatVec(K, Q).map((value, index) => value - F[index]);
  const candidates = [];
  for (const fullDof of [...fullFixedDofs].sort((a, b) => a - b)) {
    const terms = (map.rows[fullDof] || []).filter(([, coefficient]) => Math.abs(coefficient) > 1e-12);
    if (terms.length) candidates.push({ fullDof, terms });
  }

  const overrides = new Map();
  const rowsByColumn = new Map();
  candidates.forEach((candidate, rowIndex) => candidate.terms.forEach(([column]) => {
    if (!rowsByColumn.has(column)) rowsByColumn.set(column, []);
    rowsByColumn.get(column).push(rowIndex);
  }));
  const visited = new Set();
  let ambiguousCoordinateCount = 0;
  let maximumClosureResidual = 0;
  let componentCount = 0;
  for (let seed = 0; seed < candidates.length; seed += 1) {
    if (visited.has(seed)) continue;
    const rowIndices = [];
    const columns = new Set();
    const queue = [seed];
    visited.add(seed);
    while (queue.length) {
      const rowIndex = queue.shift();
      rowIndices.push(rowIndex);
      for (const [column] of candidates[rowIndex].terms) {
        if (!columns.has(column)) columns.add(column);
        for (const neighbor of rowsByColumn.get(column) || []) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const orderedColumns = [...columns].sort((a, b) => a - b);
    const columnIndex = new Map(orderedColumns.map((column, index) => [column, index]));
    const columnScales = orderedColumns.map((column) => Math.sqrt(rowIndices.reduce((sum, rowIndex) => {
      const coefficient = candidates[rowIndex].terms.find(([candidateColumn]) => candidateColumn === column)?.[1] || 0;
      return sum + coefficient * coefficient;
    }, 0)));
    const normal = Array.from({ length: orderedColumns.length }, () => new Array(orderedColumns.length).fill(0));
    for (const rowIndex of rowIndices) {
      const terms = candidates[rowIndex].terms;
      for (const [leftColumn, leftCoefficient] of terms) {
        for (const [rightColumn, rightCoefficient] of terms) {
          const left = columnIndex.get(leftColumn);
          const right = columnIndex.get(rightColumn);
          normal[left][right] += (leftCoefficient / columnScales[left]) * (rightCoefficient / columnScales[right]);
        }
      }
    }
    const rhs = orderedColumns.map((column, index) => reducedResidual[column] / columnScales[index]);
    const dual = solveLinear(normal, rhs, { pivotTolerance: 1e-12 });
    if (!dual) {
      return {
        ok: false,
        reason: 'REDUCED_REACTION_RECOVERY_SINGULAR',
        message: 'Rigid-diaphragm support reactions could not be recovered from the reduced residual.',
      };
    }
    for (const rowIndex of rowIndices) {
      const candidate = candidates[rowIndex];
      const reaction = candidate.terms.reduce(
        (sum, [column, coefficient]) => {
          const index = columnIndex.get(column);
          return sum + (coefficient / columnScales[index]) * dual[index];
        },
        0,
      );
      overrides.set(candidate.fullDof, reaction);
    }
    for (const column of orderedColumns) {
      const recovered = rowIndices.reduce((sum, rowIndex) => {
        const coefficient = candidates[rowIndex].terms.find(([candidateColumn]) => candidateColumn === column)?.[1] || 0;
        return sum + coefficient * overrides.get(candidates[rowIndex].fullDof);
      }, 0);
      maximumClosureResidual = Math.max(maximumClosureResidual, Math.abs(recovered - reducedResidual[column]));
    }
    if (rowIndices.length > orderedColumns.length) ambiguousCoordinateCount += 1;
    componentCount += 1;
  }
  const residualScale = Math.max(1, ...reducedResidual.map((value) => Math.abs(value)));
  if (maximumClosureResidual > residualScale * 1e-8) {
    return {
      ok: false,
      reason: 'REDUCED_REACTION_RECOVERY_RESIDUAL',
      value: maximumClosureResidual / residualScale,
      message: 'Rigid-diaphragm reaction recovery does not close the reduced residual.',
    };
  }
  return {
    ok: true,
    overrides,
    trace: {
      applied: overrides.size > 0,
      method: 'reduced-residual-minimum-norm-restraint-allocation',
      recoveredDofCount: overrides.size,
      ambiguousCoordinateCount,
      ambiguousDistribution: ambiguousCoordinateCount > 0 ? 'minimum-norm' : null,
      componentCount,
      maximumClosureResidual,
    },
  };
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
  const executionMethods = [...new Set(finite.map((item) => item.sparse?.method).filter(Boolean))].sort();
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
    suspectedMechanismDofs: [...new Set(finite.flatMap((item) => item.suspectedMechanismDofs || []))],
    autoFixedDofs: [...new Set(finite.flatMap((item) => item.autoFixedDofs || []))],
    autoFixedReducedDofs: [...new Set(finite.flatMap((item) => item.autoFixedReducedDofs || []))],
    executionMethods,
    mixedPrecisionComponentCount: finite.filter((item) => item.sparse?.method === 'p9-m5-hybrid-mixed-f32-f64-replay').length,
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
  const threshold = numericalZeroThreshold(diagonal);
  const added = [];
  for (let i = 0; i < matrix.rowCount; i += 1) {
    if (!fixedDofs.has(i) && Math.abs(diagonal[i]) < threshold) {
      fixedDofs.add(i);
      added.push(i);
    }
  }
  return added;
}

function firstLoadedIsolatedDof(matrix, loads, fixedDofs) {
  const diagonal = matrixDiagonal(matrix);
  const stiffnessThreshold = numericalZeroThreshold(diagonal);
  const loadScale = Math.max(1, maxAbs(loads));
  for (let index = 0; index < diagonal.length; index += 1) {
    if (fixedDofs.has(index)) continue;
    if (Math.abs(diagonal[index]) >= stiffnessThreshold) continue;
    if (Math.abs(Number(loads[index]) || 0) > loadScale * 1e-14) return index;
  }
  return null;
}

function numericalZeroThreshold(diagonal) {
  const scale = Math.max(1, ...diagonal.map((value) => Math.abs(Number(value) || 0)));
  return scale * Number.EPSILON * Math.max(10, diagonal.length * 4);
}

function fullDofLabel(nodes, index) {
  const components = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const node = nodes[Math.floor(Number(index) / 6)];
  return node ? `${node.id}.${components[Number(index) % 6]}` : `dof:${index}`;
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

function reducedDofFailure(reason, nodes, dof, map, value, message) {
  if (!map) return dofFailure(reason, nodes, dof, value, message);
  const fullDof = map.rows.findIndex((row) => (
    row.some(([column, coefficient]) => column === dof && Math.abs(coefficient) > 1e-12)
  ));
  if (fullDof >= 0) {
    return {
      ...dofFailure(reason, nodes, fullDof, value, message),
      reducedDof: dof,
      solverLabel: `reduced:${dof}`,
    };
  }
  return {
    ok: false,
    reason,
    entityType: 'dof',
    entityId: null,
    nodeId: null,
    dof,
    reducedDof: dof,
    component: null,
    solverLabel: `reduced:${dof}`,
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
