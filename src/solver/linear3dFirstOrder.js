import { materialOf, sectionOf } from '../core/catalogs.js';
import { resolveCriterion } from '../core/model.js';
import { vlen } from '../core/vector.js';
import { resolveRigidDiaphragms } from '../core/diaphragmGroups.js';
import { stableHash } from '../core/stableHash.js';
import { constraintConnectivityGroups } from '../core/constraintDefinitions.js';
import {
  analyzeComponent3D,
  summarizeSolverDiagnostics,
} from './linear3dAssembly.js';
import {
  buildEquilibriumSummary,
  connectedComponentGroups,
} from './linear3dPost.js';
import { buildExpandedAnalysisDomain } from './pdelta/analysisDomain.js';

export const LINEAR3D_FIRST_ORDER_VERSION = 'p15-m8-linear3d-first-order-v1';

/**
 * Canonical first-order 3-D elastic analysis used by both the public linear
 * workflow and the direct P-Delta seed. Keeping it below both orchestrators
 * removes import-order registration and prevents a linear3d <-> P-Delta cycle.
 */
export function analyzeAll(model, factors = null, options = {}) {
  if (!options.skipUnilateral && hasUnilateralMembers(model)) {
    return analyzeUnilateralMembers(model, factors, options);
  }
  return analyzeAllOnce(model, factors, options);
}

function analyzeAllOnce(model, factors = null, options = {}) {
  const domain = options.expandedDomain || buildExpandedAnalysisDomain(model, factors, options);
  const { nodes, members, loads, solverModel } = domain;
  if (!domain.ok) {
    const shellDomainBlockers = [
      ...(domain.shellAssembly?.errors || []).map((error) => error.code || 'SHELL_ASSEMBLY_INVALID'),
      ...(domain.shellLoadErrors || []).map((error) => error.code || 'SHELL_LOAD_INVALID'),
    ];
    return {
      ok: false,
      anyOk: false,
      reason: domain.reason || 'CANONICAL_DOMAIN_INVALID',
      analysisDomain: domain.adapterIdentity || null,
      domainErrors: [...(domain.elementErrors || []), ...(domain.constraint?.errors || []), ...(domain.capabilities?.blocking || [])],
      unstableMembers: new Set(),
      failedComponents: [],
      shellResults: Object.create(null),
      shellFem: summarizeShellResultQualification(Object.create(null), {
        expectedElementCount: domain.shellAssembly?.femElementCount || 0,
        inheritedBlockers: shellDomainBlockers,
      }),
    };
  }
  if (!members.length) return {
    ok: false,
    empty: true,
    anyOk: false,
    reason: 'NO_SOLVED_COMPONENT',
    unstableMembers: new Set(),
    failedComponents: [],
    analysisDomain: domain.adapterIdentity,
  };

  const analysisSettings = model.analysisSettings || {};
  const materialCache = new Map();
  const sectionCache = new Map();

  const ctx = {
    mat: (id) => cachedCatalogValue(materialCache, id, () => materialOf(solverModel, id)),
    sec: (id) => cachedCatalogValue(sectionCache, id, () => sectionOf(solverModel, id)),
    stations: Math.max(21, analysisSettings.memberStations | 0 || 21),
    criteriaModel: model,
    solver: analysisSettings.solver || analysisSettings.linearSolver,
    sparse: analysisSettings.useSparseSolver,
    sparseThreshold: analysisSettings.sparseThreshold,
    componentCache: options.componentCache,
    factorSession: options.factorSession,
    factorGroupKey: options.factorGroupKey,
    captureSystemsOnly: options.captureSystemsOnly === true,
    precomputedSolutions: options.precomputedSolutions,
    signal: options.signal,
    shells: domain.shellAssembly?.femElements || [],
    shellCriteria: {
      drillingAlpha: resolveCriterion(model, 'shell.drillingAlpha', 1e-5),
      drillingStiffnessRatioMax: resolveCriterion(model, 'shell.drillingStiffnessRatioMax', 1e-4),
      warpTol: resolveCriterion(model, 'shell.warpTol', 1e-2),
    },
  };
  const diaphragms = resolveRigidDiaphragms(model, nodes);
  ctx.diaphragms = diaphragms;
  ctx.constraints = model.constraints || [];

  const constraintGroups = constraintConnectivityGroups(ctx.constraints);
  const groups = connectedComponentGroups(nodes, members, [
    ...diaphragms.map((group) => group.nodeIds),
    ...constraintGroups,
  ]);
  const out = {
    ok: true,
    disp: {},
    reactions: {},
    memberResults: {},
    foundationResults: {},
    shellResults: Object.create(null),
    solver: {
      type: 'linear_static_3d_frame',
      components: [],
    },
    elasticExpansion: domain.expansion.trace,
    analysisDomain: domain.adapterIdentity,
    unstableMembers: new Set(),
    failedComponents: [],
    dmax: 0,
    anyOk: false,
    maxRatio: 0,
    ngCount: 0,
    okCount: 0,
  };
  if (options.captureSystemsOnly) out.systemCaptures = [];
  const capturedComponents = [];

  for (const group of Object.values(groups)) {
    const ns = nodes.filter((node) => group.nids.has(node.id));
    const ms = members.filter((member) => group.mids.has(member.id));
    const groupShellIds = new Set(ctx.shells.filter((shell) => (shell.nodeIds || []).every((id) => group.nids.has(id))).map((shell) => shell.id));
    const ls = loads.filter((load) => (
      (load.node && group.nids.has(load.node)) ||
      (load.member && group.mids.has(load.member)) ||
      ((load.shell || load.panel || load.target) && groupShellIds.has(load.shell || load.panel || load.target))
    ));
    const componentKey = stableHash({
      nodeIds: [...group.nids].map(String).sort(),
      memberIds: [...group.mids].map(String).sort(),
    });
    const constraints = ctx.constraints.filter((constraint) => constraintNodeIds(constraint).every((id) => group.nids.has(id)));
    const result = analyzeComponent3D(ns, ms, ls, { ...ctx, constraints, componentKey });
    if (result.capture) {
      out.anyOk = true;
      out.systemCaptures.push(result.capture);
      capturedComponents.push({ group, ms, capture: result.capture, resume: result.resume });
      continue;
    }
    if (!result.ok) {
      group.mids.forEach((id) => out.unstableMembers.add(id));
      out.failedComponents.push({
        reason: result.reason || 'COMPONENT_SOLVE_FAILED',
        memberIds: [...group.mids],
        nodeIds: [...group.nids],
        solver: result.solver || null,
        location: result.entityType === 'dof'
          ? {
              entityType: result.entityType,
              nodeId: result.nodeId || null,
              component: result.component ?? null,
              dof: result.dof ?? null,
              value: result.value ?? null,
            }
          : null,
      });
      continue;
    }
    out.anyOk = true;
    out.solver.components.push(result.solver);
    Object.assign(out.disp, result.disp);
    Object.assign(out.reactions, result.reactions);
    Object.assign(out.foundationResults, result.foundationResults || {});
    Object.assign(out.shellResults, result.shellResults || {});
    Object.entries(result.memberResults).forEach(([id, row]) => {
      if (!ms.find((member) => member.id === id)?.generated) out.memberResults[id] = row;
    });
  }

  if (options.captureSystemsOnly) {
    out.ok = out.failedComponents.length === 0 && out.systemCaptures.length > 0;
    out.reason = out.ok ? null : out.failedComponents[0]?.reason || 'NO_CAPTURED_COMPONENT_SYSTEM';
    out.resume = (precomputedSolutions) => {
      out.ok = true;
      out.anyOk = false;
      out.reason = null;
      out.disp = {};
      out.reactions = {};
      out.memberResults = {};
      out.foundationResults = {};
      out.shellResults = Object.create(null);
      out.unstableMembers = new Set();
      out.failedComponents = [];
      out.solver = { type: 'linear_static_3d_frame', components: [] };
      for (const row of capturedComponents) {
        const replay = typeof precomputedSolutions?.get === 'function'
          ? precomputedSolutions.get(row.capture.componentKey)
          : precomputedSolutions?.[row.capture.componentKey];
        const result = replay
          ? row.resume(replay)
          : { ok: false, reason: 'HYBRID_ELASTIC_PRECOMPUTED_SOLUTION_MISSING' };
        if (!result.ok) {
          row.group.mids.forEach((id) => out.unstableMembers.add(id));
          out.failedComponents.push({
            reason: result.reason || 'COMPONENT_SOLVE_FAILED',
            memberIds: [...row.group.mids],
            nodeIds: [...row.group.nids],
            solver: result.solver || null,
            location: result.entityType === 'dof'
              ? {
                  entityType: result.entityType,
                  nodeId: result.nodeId || null,
                  component: result.component ?? null,
                  dof: result.dof ?? null,
                  value: result.value ?? null,
                }
              : null,
          });
          continue;
        }
        out.anyOk = true;
        out.solver.components.push(result.solver);
        Object.assign(out.disp, result.disp);
        Object.assign(out.reactions, result.reactions);
        Object.assign(out.foundationResults, result.foundationResults || {});
        Object.assign(out.shellResults, result.shellResults || {});
        Object.entries(result.memberResults).forEach(([id, memberResult]) => {
          if (!row.ms.find((member) => member.id === id)?.generated) out.memberResults[id] = memberResult;
        });
      }
      delete out.systemCaptures;
      delete out.resume;
      return finalizeSolvedOutput();
    };
    out.solver = {
      type: 'elastic-component-system-capture',
      componentCount: out.systemCaptures.length,
      solved: false,
    };
    return out;
  }

  return finalizeSolvedOutput();

  function finalizeSolvedOutput() {
    out.dmax = 0;
    out.maxRatio = 0;
    out.ngCount = 0;
    out.okCount = 0;
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
    const componentShellBlockers = out.solver.components.flatMap((component) => component?.shellFem?.blockers || []);
    out.solver = summarizeSolverDiagnostics(out.solver.components);
    out.shellFem = summarizeShellResultQualification(out.shellResults, {
      expectedElementCount: domain.shellAssembly?.femElementCount || 0,
      inheritedBlockers: componentShellBlockers,
    });
    out.semiRigidDiaphragm = domain.semiRigid;
    out.shellFrameAssembly = domain.shellAssembly;
    out.summary = buildEquilibriumSummary(nodes, members, loads, out, {
      equilibriumLimit: resolveCriterion(model, 'audit.equilibriumRelative', 1e-8),
      offsetEquilibriumTol: resolveCriterion(model, 'offset.equilibriumTol', 1e-10),
    });
    return out;
  }
}

export function summarizeShellNumericalQualification(byCombo = {}) {
  const rows = Object.entries(byCombo).map(([comboId, result]) => ({
    comboId,
    ...(result?.shellFem || summarizeShellResultQualification(result?.shellResults || {})),
  }));
  const blockers = [...new Set(rows.flatMap((row) => row.blockers))];
  return {
    status: blockers.length ? 'blocked' : 'qualified',
    designTransferAllowed: blockers.length === 0,
    blockers,
    byCombo: rows,
  };
}

function summarizeShellResultQualification(shellResults = {}, options = {}) {
  const results = Object.values(shellResults || {});
  const expectedElementCount = options.expectedElementCount == null
    ? results.length
    : Math.max(0, Number(options.expectedElementCount) || 0);
  const blockers = [...new Set([
    ...(options.inheritedBlockers || []),
    ...results.flatMap(shellResultQualificationBlockers),
    ...(results.length === expectedElementCount ? [] : ['SHELL_RESULTS_INCOMPLETE']),
  ])];
  return {
    elementCount: results.length,
    expectedElementCount,
    qualificationStatus: blockers.length ? 'blocked' : 'qualified',
    designTransferAllowed: blockers.length === 0,
    blockers,
  };
}

function shellResultQualificationBlockers(result = {}) {
  const explicit = result.designEligibility?.reasonCodes || [];
  const status = String(result.qualification?.status || '').toLowerCase();
  if (status === 'pass' && result.designEligibility?.allowed === true && explicit.length === 0) return [];
  if (explicit.length) return explicit;
  return [result.qualification?.reason || 'SHELL_NUMERICAL_QUALIFICATION_REQUIRED'];
}

function cachedCatalogValue(cache, id, resolve) {
  if (!cache.has(id)) cache.set(id, resolve());
  return cache.get(id);
}

function analyzeUnilateralMembers(model, factors = null, options = {}) {
  const unilateral = (model.members || []).filter((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type));
  const maxIterations = Math.max(1, model.analysisSettings?.unilateralMaxIterations | 0 || 10);
  const tolerance = Number(model.analysisSettings?.unilateralTolerance) >= 0 ? Number(model.analysisSettings.unilateralTolerance) : 1e-7;
  const active = new Set((model.members || []).map((member) => member.id));
  const iterations = [];
  let result = null;
  let converged = false;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    result = analyzeAllOnce(model, factors, { ...options, skipUnilateral: true, activeMemberIds: active });
    const newlyInactive = [];
    if (result.ok) {
      for (const member of unilateral) {
        if (!active.has(member.id)) continue;
        const axial = signedAxial(result.memberResults?.[member.id]);
        const behavior = member.behavior || member.type;
        if (behavior === 'tensionOnly' && axial < -tolerance) newlyInactive.push({ memberId: member.id, axial, reason: 'compression-in-tension-only' });
        if (behavior === 'compressionOnly' && axial > tolerance) newlyInactive.push({ memberId: member.id, axial, reason: 'tension-in-compression-only' });
      }
    }
    for (const row of newlyInactive) active.delete(row.memberId);
    iterations.push({
      iteration,
      ok: !!result.ok,
      activeMemberIds: [...active].sort(),
      newlyInactive,
      inactiveMemberIds: unilateral.map((member) => member.id).filter((id) => !active.has(id)).sort(),
    });
    if (!result.ok || !newlyInactive.length) {
      converged = !!result.ok;
      break;
    }
  }

  const lastIteration = iterations[iterations.length - 1];
  if (!result || (!converged && lastIteration?.newlyInactive?.length)) {
    result = analyzeAllOnce(model, factors, { ...options, skipUnilateral: true, activeMemberIds: active });
  }
  result.unilateral = {
    version: 'p3-m11-unilateral-member-iteration',
    enabled: true,
    converged,
    maxIterations,
    iterationCount: iterations.length,
    activeMemberIds: [...active].sort(),
    inactiveMemberIds: unilateral.map((member) => member.id).filter((id) => !active.has(id)).sort(),
    iterations,
    warning: converged ? null : 'UNILATERAL_NOT_CONVERGED',
  };
  return result;
}

function hasUnilateralMembers(model = {}) {
  return (model.members || []).some((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type));
}

export function signedAxial(memberResult) {
  const values = memberResult?.N || [];
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function constraintNodeIds(constraint = {}) {
  return uniqueStrings([
    ...(constraint.nodeIds || []),
    typeof constraint.master === 'string' ? constraint.master : constraint.master?.node,
    typeof constraint.slave === 'string' ? constraint.slave : constraint.slave?.node,
    constraint.masterNode,
    constraint.slaveNode,
    ...(constraint.terms || []).map((term) => term?.node),
  ].filter(Boolean));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(String))].sort();
}
