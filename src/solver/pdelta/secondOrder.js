import { resolveCriterion } from '../../core/analysisCriteria.js';
import { memberRotationalSpringEntries } from '../../core/memberReleaseContract.js';
import { buildFixedEndLoad, fixedEndTraceRow } from '../../loads/fixedEnd/index.js';
import { axialForcesFromDisplacements } from '../geometricStiffness.js';
import { buildFixedDofs, conditionMemberLocalSystem } from '../linear3dAssembly.js';
import {
  dirVec,
  matTrans,
  matVec,
  memberReleaseDofs,
  solveLinearDetailed,
} from '../linear3dElement.js';
import { buildEquilibriumSummary } from '../linear3dPost.js';
import {
  buildFoundationEndActionContract,
  evaluateStationEndClosure,
} from '../foundation/index.js';
import { recoverMemberResult, sectionCheck } from '../linear3dRecovery.js';
import { PARTIAL_FIXITY_LIMITATION_CODES } from '../partialFixity.js';
import { buildExpandedAnalysisDomain } from './analysisDomain.js';
import { buildPDeltaSplitTrace } from './split.js';
import {
  PDELTA_STABILITY_VERSION,
  bracketCriticalLoadScale,
  evaluateConstrainedTangentStability,
} from './stability.js';
import { buildPDeltaTangentStiffness } from './tangentStiffness.js';
import {
  buildConstraintSystem,
  expandConstraintDisplacements,
  reduceConstraintMatrix,
  reduceConstraintVector,
} from '../domain/constraintSystem.js';
import { resolveRigidDiaphragms } from '../../core/diaphragmGroups.js';
import { resolvePDeltaFirstOrderSeed } from './firstOrderSeed.js';

export const PDELTA_SECOND_ORDER_VERSION = 'p6-m5-pdelta-second-order-v1';
export const PDELTA_DIRECT_PRODUCT_VERSION = 'p7-m8-direct-pdelta-product-v3';

const DIRECT_METHOD = 'geometric-stiffness-second-order-direct';
const ITERATION_METHOD = 'picard-fixed-point-updated-axial-stiffness';
const DISPLACEMENT_KEYS = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
const LEGACY_SETTLEMENT_KEYS = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
const SPRING_KEYS = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];

export function runSecondOrderPDelta(model = {}, factors = null, options = {}) {
  const machine = runSecondOrderPDeltaMachine(model, factors, options);
  let state = machine.next();
  while (!state.done) {
    const request = state.value;
    state = machine.next(solvePartitionedTangent(
      request.K,
      request.F,
      request.Dc,
      request.free,
      request.fixedDofs,
      request.model,
    ));
  }
  return state.value;
}

export async function runSecondOrderPDeltaAsync(model = {}, factors = null, options = {}) {
  if (typeof options.tangentSolver !== 'function') {
    throw Object.assign(new Error('An async Direct P-Delta tangent solver is required.'), { code: 'PDELTA_ASYNC_TANGENT_SOLVER_REQUIRED' });
  }
  const machine = runSecondOrderPDeltaMachine(model, factors, options);
  let state = machine.next();
  while (!state.done) state = machine.next(await options.tangentSolver(state.value));
  return state.value;
}

function* runSecondOrderPDeltaMachine(model = {}, factors = null, options = {}) {
  const domain = options.domain || buildExpandedAnalysisDomain(model, factors, { ...options, domainAdapter: 'direct-pdelta' });
  if (!domain.ok) return failedDirectResult(domain.reason || 'CANONICAL_DOMAIN_INVALID', {
    domain,
    message: 'The canonical analysis domain is invalid.',
    status: 'blocked',
  });
  const compatibility = directCompatibility(model, domain);
  if (!compatibility.supported) return blockedDirectResult(compatibility, domain);

  const linear = resolvePDeltaFirstOrderSeed(model, factors, options);
  if (!linear.ok) {
    return failedDirectResult(linear.reason || 'LINEAR_FAILED', {
      linear,
      compatibility,
      domain,
      message: 'The first-order seed analysis failed.',
    });
  }

  const directModel = { ...domain.solverModel, members: domain.members };
  const seedTangent = buildPDeltaTangentStiffness(directModel, { axialForces: {} });
  if (!seedTangent.ok) {
    return failedDirectResult(seedTangent.reason || 'TANGENT_ASSEMBLY_FAILED', {
      linear,
      tangent: seedTangent,
      compatibility,
      domain,
      message: 'The direct tangent stiffness could not be assembled.',
    });
  }

  const criteria = directCriteria(model, options);
  const loadStepCount = Math.max(1, Math.trunc(Number(options.loadSteps ?? options.pDeltaLoadSteps) || 4));
  const assembly = seedTangent.assembly;
  const loadState = buildFactoredLoadState(domain, assembly);
  if (!loadState.ok) {
    return failedDirectResult(loadState.reason || 'PARTIAL_FIXITY_LOAD_CONDENSATION_FAILED', {
      linear,
      compatibility,
      domain,
      tangent: seedTangent,
      memberId: loadState.memberId || null,
      message: 'The factored member-load vector could not be conditioned for the connection springs.',
    });
  }
  const prescribed = buildPrescribedDisplacementState(domain.nodes, assembly);
  if (!prescribed.ok) {
    return failedDirectResult(prescribed.reason, {
      linear,
      compatibility,
      domain,
      tangent: seedTangent,
      message: prescribed.message,
      status: 'blocked',
    });
  }

  const characteristicLength = modelCharacteristicLength(domain);
  const linearD = displacementVector(domain.nodes, linear, assembly);
  const referenceAxialForces = axialForcesFromDisplacements(assembly, linearD);
  const critical = estimateCriticalStability(
    directModel,
    assembly,
    referenceAxialForces,
    criteria.stabilityTolerance,
    seedTangent.Kt,
  );
  const initialStability = evaluateConstrainedTangentStability(tangentMatrix(seedTangent), tangentFreeDofs(seedTangent, assembly), {
    tolerance: criteria.stabilityTolerance,
    referenceMatrix: tangentMatrix(seedTangent),
  });
  if (!initialStability.stable) {
    return failedDirectResult('ELASTIC_TANGENT_NOT_POSITIVE_DEFINITE', {
      linear,
      compatibility,
      domain,
      tangent: seedTangent,
      status: 'unstable',
      message: 'The constrained elastic tangent is not positive definite.',
      stability: { status: 'unstable', initial: initialStability, critical },
    });
  }

  let currentD = new Array(linearD.length).fill(0);
  let currentAxial = {};
  let finalTangent = seedTangent;
  let finalDiagnostics = null;
  let finalF = new Array(loadState.F.length).fill(0);
  let finalLoadFactor = 0;
  let converged = true;
  let reason = 'CONVERGED';
  let instability = null;
  const steps = [];

  for (let step = 1; step <= loadStepCount; step += 1) {
    const lambda = step / loadStepCount;
    const targetF = loadState.F.map((value) => value * lambda);
    const targetDc = prescribed.values.map((value) => value * lambda);
    let stepConverged = false;
    const iterations = [];

    for (let iteration = 1; iteration <= criteria.maxIter; iteration += 1) {
      const axialForces = iteration === 1 && !Object.keys(currentAxial).length
        ? scaleAxialForces(referenceAxialForces, lambda)
        : currentAxial;
      const tangent = buildPDeltaTangentStiffness(directModel, {
        assembly,
        axialForces,
        includeTensionKg: criteria.includeTensionKg,
      });
      const trialStability = evaluateConstrainedTangentStability(tangentMatrix(tangent), tangentFreeDofs(tangent, assembly), {
        tolerance: criteria.stabilityTolerance,
        referenceMatrix: tangentMatrix(seedTangent),
      });
      if (!trialStability.stable) {
        converged = false;
        reason = 'TANGENT_INSTABILITY';
        instability = { stage: 'trial', step, iteration, lambda, ...trialStability };
        finalTangent = tangent;
        iterations.push({
          iteration,
          ok: false,
          status: 'unstable',
          reason,
          lambda,
          stability: trialStability,
        });
        break;
      }

      const solved = yield {
        K: tangent.Kt,
        F: targetF,
        Dc: targetDc,
        free: assembly.free,
        fixedDofs: assembly.fixedDofs,
        model: directModel,
        step,
        iteration,
        lambda,
      };
      if (!solved.ok) {
        converged = false;
        reason = solved.reason || 'TANGENT_SOLVE_FAILED';
        iterations.push({
          iteration,
          ok: false,
          status: 'failed',
          reason,
          lambda,
          diagnostics: solved.diagnostics,
          stability: trialStability,
        });
        break;
      }

      const nextD = solved.D;
      const nextAxial = axialForcesFromDisplacements(assembly, nextD, {
        fixedEndScale: lambda,
      });
      const updatedTangent = buildPDeltaTangentStiffness(directModel, {
        assembly,
        axialForces: nextAxial,
        includeTensionKg: criteria.includeTensionKg,
      });
      const updatedStability = evaluateConstrainedTangentStability(tangentMatrix(updatedTangent), tangentFreeDofs(updatedTangent, assembly), {
        tolerance: criteria.stabilityTolerance,
        referenceMatrix: tangentMatrix(seedTangent),
      });
      const incrementNorms = scaledIncrementNorms(nextD, currentD, assembly.free, characteristicLength);
      const residualNorms = updatedTangent.constraint
        ? scaledResidualNorms(
          updatedTangent.constrainedKt,
          solved.constraintCoordinates,
          reduceConstraintVector(updatedTangent.constraint, targetF),
          updatedTangent.constrainedFreeDofs,
        )
        : scaledResidualNorms(updatedTangent.Kt, nextD, targetF, assembly.free);
      const convergenceNorms = {
        translationIncrement: incrementNorms.translationIncrement,
        rotationIncrement: incrementNorms.rotationIncrement,
        forceResidual: residualNorms.forceResidual,
        momentResidual: residualNorms.momentResidual,
        dimensions: {
          ...incrementNorms.dimensions,
          ...residualNorms.dimensions,
        },
      };
      const iterationConverged = convergenceNorms.translationIncrement <= criteria.translationIncrement
        && convergenceNorms.rotationIncrement <= criteria.rotationIncrement
        && convergenceNorms.forceResidual <= criteria.forceResidual
        && convergenceNorms.momentResidual <= criteria.momentResidual;

      iterations.push({
        iteration,
        ok: updatedStability.stable,
        status: updatedStability.stable ? (iterationConverged ? 'converged' : 'iterating') : 'unstable',
        lambda,
        convergenceNorms,
        convergenceScales: {
          translation: incrementNorms.translationScale,
          rotation: incrementNorms.rotationScale,
          force: residualNorms.forceScale,
          moment: residualNorms.momentScale,
        },
        maxDisplacement: maxTranslationalDisplacement(domain.nodes, nextD, assembly),
        maxLateralDisplacement: maxLateralDisplacement(domain.nodes, nextD, assembly),
        maxVerticalDisplacement: maxVerticalDisplacement(domain.nodes, nextD, assembly),
        stability: updatedStability,
        tangent: {
          geometricMemberCount: updatedTangent.summary.geometricMemberCount,
          compressionMemberCount: updatedTangent.summary.compressionMemberCount,
          maxAbsAxialForce: updatedTangent.summary.maxAbsAxialForce,
          limitationCodes: updatedTangent.summary.limitationCodes || [],
        },
      });
      currentD = nextD;
      currentAxial = nextAxial;
      finalTangent = updatedTangent;
      finalDiagnostics = solved.diagnostics;
      finalF = targetF;
      finalLoadFactor = lambda;

      if (!updatedStability.stable) {
        converged = false;
        reason = 'TANGENT_INSTABILITY';
        instability = { stage: 'updated', step, iteration, lambda, ...updatedStability };
        break;
      }
      if (iterationConverged) {
        stepConverged = true;
        break;
      }
    }

    steps.push({
      step,
      lambda,
      converged: stepConverged,
      status: instability ? 'unstable' : stepConverged ? 'converged' : 'failed',
      iterations,
    });
    if (!stepConverged) {
      converged = false;
      if (reason === 'CONVERGED') reason = 'MAX_ITERATIONS';
      break;
    }
  }

  const finalIteration = steps.at(-1)?.iterations?.at(-1) || null;
  const stability = {
    version: PDELTA_STABILITY_VERSION,
    status: instability ? 'unstable' : converged ? 'stable' : 'not-qualified',
    stable: !instability && converged,
    tolerance: criteria.stabilityTolerance,
    initial: initialStability,
    final: finalIteration?.stability || initialStability,
    instability,
    critical,
  };
  const convergence = {
    converged,
    reason,
    iterationMethod: ITERATION_METHOD,
    solverClass: 'total-displacement-fixed-point',
    newtonRaphson: false,
    criteria,
    loadStepCount,
    completedLoadSteps: steps.filter((step) => step.converged).length,
    iterationCount: steps.reduce((sum, step) => sum + step.iterations.length, 0),
    finalLoadFactor,
    finalNorms: finalIteration?.convergenceNorms || null,
  };
  const result = buildDirectResult({
    model,
    domain,
    assembly,
    D: currentD,
    axialForces: currentAxial,
    F: finalF,
    loadState,
    tangent: finalTangent,
    convergence,
    stability,
    criteria,
    diagnostics: finalDiagnostics,
  });
  const qualified = converged && stability.stable && result.recovery.qualified;
  result.ok = qualified;
  result.anyOk = qualified;
  result.pDelta = {
    enabled: true,
    method: 'direct',
    solverMethod: DIRECT_METHOD,
    iterationMethod: ITERATION_METHOD,
    convergence,
    stability,
  };

  const limitationCodes = Array.from(new Set([
    ...(compatibility.limitationCodes || []),
    ...(seedTangent.summary?.limitationCodes || []),
    ...(finalTangent.summary?.limitationCodes || []),
  ]));
  const finalCompatibility = {
    ...compatibility,
    status: limitationCodes.length ? 'supported-with-limitation' : 'supported',
    limitationCodes,
  };
  const amplificationTrace = translationalAmplification(domain.nodes, assembly, linearD, currentD);
  const designEligibility = directDesignEligibility(converged, stability, result.recovery, finalCompatibility);
  const provenance = { ...directProvenance(domain, loadState), limitationCodes };
  result.pDelta.limitationCodes = limitationCodes;
  result.provenance = provenance;
  result.designEligibility = designEligibility;
  result.analysisDomain = domain.adapterIdentity || null;

  return {
    version: PDELTA_SECOND_ORDER_VERSION,
    productVersion: PDELTA_DIRECT_PRODUCT_VERSION,
    ok: qualified,
    converged,
    status: instability ? 'unstable' : qualified ? 'converged' : 'failed',
    reason,
    method: DIRECT_METHOD,
    iterationMethod: ITERATION_METHOD,
    algorithm: 'load-step Picard fixed-point iteration with updated member axial geometric stiffness',
    newtonRaphson: false,
    criteria,
    loadStepCount,
    linear,
    result,
    amplification: amplificationTrace.value,
    amplificationTrace,
    steps,
    iterations: steps.flatMap((step) => step.iterations.map((iteration) => ({ step: step.step, ...iteration }))),
    convergence,
    stability,
    compatibility: finalCompatibility,
    prescribedDisplacements: prescribed.trace,
    designEligibility,
    provenance,
    analysisDomain: domain.adapterIdentity || null,
    split: buildPDeltaSplitTrace(model, linear, result),
    notes: [
      'Direct analysis assembles Kt = Ke + Kg(N) with the project tension-positive axial sign convention.',
      'The constrained free tangent must remain positive definite at every trial and updated iteration.',
      'Reactions and member stations use the same elastic-plus-geometric member end-force formulation.',
      ...(limitationCodes.length ? [`Solver limitations: ${limitationCodes.join(', ')}.`] : []),
      'Legacy equivalent-load iteration is a separate diagnostic method and is not used by this route.',
    ],
  };
}

function directCriteria(model, options) {
  const eU = positive(resolveCriterion(model, 'pdelta.eU'), options.tolerance, options.pDeltaTolerance, 1e-6);
  const eR = positive(resolveCriterion(model, 'pdelta.eR'), options.residualTolerance, options.pDeltaResidualTolerance, 1e-6);
  return {
    eU,
    eR,
    translationIncrement: positive(options.translationTolerance, options.pDeltaTranslationTolerance, eU),
    rotationIncrement: positive(options.rotationTolerance, options.pDeltaRotationTolerance, eU),
    forceResidual: positive(options.forceResidualTolerance, options.pDeltaForceResidualTolerance, eR),
    momentResidual: positive(options.momentResidualTolerance, options.pDeltaMomentResidualTolerance, eR),
    stabilityTolerance: positive(options.stabilityTolerance, options.pDeltaStabilityTolerance, 1e-9),
    closureTolerance: positive(options.closureTolerance, options.pDeltaClosureTolerance, 1e-7),
    maxIter: Math.max(1, Math.trunc(positive(
      resolveCriterion(model, 'pdelta.maxIter'),
      options.maxIterations,
      options.pDeltaMaxIterations,
      20,
    ))),
    includeTensionKg: resolveCriterion(model, 'pdelta.includeTensionKg', true) !== false,
  };
}

function estimateCriticalStability(model, assembly, referenceAxialForces, tolerance, referenceMatrix) {
  const compressionByMember = Object.fromEntries(Object.entries(referenceAxialForces)
    .filter(([, value]) => Number(value) < 0)
    .map(([memberId, value]) => [memberId, -Number(value)]));
  const referenceCompression = Math.max(0, ...Object.values(compressionByMember));
  const critical = bracketCriticalLoadScale((scale) => buildPDeltaTangentStiffness(model, {
    assembly,
    axialForces: scaleAxialForces(referenceAxialForces, scale),
  }), assembly.free, {
    tolerance,
    referenceCompression,
    referenceMatrix,
  });
  const criticalLoadFactor = Number(critical.criticalLoadFactor);
  return {
    ...critical,
    referenceAxialForces,
    referenceCompressionByMember: compressionByMember,
    referenceCompression,
    demandLoadFactor: 1,
    demandToCriticalRatio: Number.isFinite(criticalLoadFactor) && criticalLoadFactor > 0
      ? 1 / criticalLoadFactor
      : null,
    loadFactorMargin: Number.isFinite(criticalLoadFactor)
      ? criticalLoadFactor - 1
      : null,
  };
}

function buildFactoredLoadState(domain, assembly) {
  const F = new Array(assembly.ndof).fill(0);
  const nodalExternal = new Array(assembly.ndof).fill(0);
  for (const md of Object.values(assembly.memData || {})) {
    md.f0 = new Array(12).fill(0);
    md.fixedEndLoads = [];
  }

  for (const load of domain.loads) {
    if (load.type === 'nodal') {
      if (assembly.idx[load.node] == null || !Number.isFinite(Number(load.P))) continue;
      const direction = dirVec(load);
      const base = assembly.idx[load.node] * 6;
      for (let index = 0; index < 3; index += 1) {
        const value = direction[index] * Number(load.P);
        F[base + index] += value;
        nodalExternal[base + index] += value;
      }
      continue;
    }
    if (load.type === 'nmoment') {
      if (assembly.idx[load.node] == null || !Number.isFinite(Number(load.M))) continue;
      const axisIndex = { x: 0, y: 1, z: 2 }[load.axis || 'z'];
      if (axisIndex != null) {
        const dof = assembly.idx[load.node] * 6 + 3 + axisIndex;
        F[dof] += Number(load.M);
        nodalExternal[dof] += Number(load.M);
      }
      continue;
    }
    const md = assembly.memData?.[load.member];
    if (!md) continue;
    const fixedEnd = buildFixedEndLoad(load, md.ax, md);
    if (!fixedEnd) continue;
    md.fixedEndLoads.push(fixedEndTraceRow(fixedEnd));
    for (let i = 0; i < 12; i += 1) md.f0[i] += fixedEnd.q0[i];
  }

  for (const [memberId, md] of Object.entries(assembly.memData || {})) {
    const conditioned = conditionMemberLocalSystem(md, memberId);
    if (!conditioned.ok) return conditioned;
    const equivalent = matVec(matTrans(md.T), conditioned.f0A).map((value) => -value);
    for (let i = 0; i < 12; i += 1) F[md.dof[i]] += equivalent[i];
  }
  addSpringSettlementLoads(domain.nodes, assembly.idx, F);
  return {
    ok: true,
    F,
    nodalExternal,
    loadCount: domain.loads.length,
    nonzeroDofCount: F.filter((value) => Math.abs(value) > 1e-14).length,
  };
}

function addSpringSettlementLoads(nodes, idx, F) {
  for (const node of nodes) {
    if (node.support !== 'spring') continue;
    const base = idx[node.id] * 6;
    SPRING_KEYS.forEach((key, index) => {
      const stiffness = Number(node.spring?.[key] || 0);
      const imposed = Number(node.settlement?.[key] ?? node.settlement?.[DISPLACEMENT_KEYS[index]] ?? 0);
      if (stiffness > 0 && Number.isFinite(imposed)) F[base + index] += stiffness * imposed;
    });
  }
}

function buildPrescribedDisplacementState(nodes, assembly) {
  const restrained = buildFixedDofs(nodes);
  const values = new Array(assembly.ndof).fill(0);
  const dofs = [];
  for (const [nodeIndex, node] of nodes.entries()) {
    if (!node.settlement || node.support === 'spring') continue;
    for (let dofIndex = 0; dofIndex < 6; dofIndex += 1) {
      const key = DISPLACEMENT_KEYS[dofIndex];
      const legacyKey = LEGACY_SETTLEMENT_KEYS[dofIndex];
      const supplied = Object.hasOwn(node.settlement, key) || Object.hasOwn(node.settlement, legacyKey);
      if (!supplied) continue;
      const value = Number(node.settlement[legacyKey] ?? node.settlement[key]);
      const globalDof = nodeIndex * 6 + dofIndex;
      if (!Number.isFinite(value)) {
        return {
          ok: false,
          reason: 'INVALID_PRESCRIBED_DISPLACEMENT',
          message: `Cannot apply non-finite prescribed displacement at ${node.id}.${key}.`,
        };
      }
      if (!restrained.has(globalDof) || !assembly.fixedDofs.has(globalDof)) {
        return {
          ok: false,
          reason: 'PRESCRIBED_DOF_NOT_RESTRAINED',
          message: `Cannot apply prescribed displacement at unrestrained DOF ${node.id}.${key}.`,
        };
      }
      values[globalDof] = value;
      dofs.push({ nodeId: node.id, dof: key, globalDof, value });
    }
  }
  return {
    ok: true,
    values,
    trace: {
      method: 'partitioned-Kff-Df-equals-Ff-minus-Kfc-Dc',
      count: dofs.length,
      dofs,
      springSettlementMethod: 'equivalent-spring-load-with-recovered-spring-reaction',
    },
  };
}

function solvePartitionedTangent(K, F, Dc, free, fixedDofs, model) {
  if ((model.constraints || []).length) {
    const constraint = buildConstraintSystem(
      model.nodes || [],
      resolveRigidDiaphragms(model, model.nodes || []),
      { constraints: model.constraints },
    );
    if (!constraint.ok) return { ok: false, reason: constraint.reason, diagnostics: constraint };
    const Kr = reduceConstraintMatrix(constraint, K);
    const KuBar = K.map((row) => row.reduce((sum, value, column) => sum + value * constraint.prescribed[column], 0));
    const Fr = reduceConstraintVector(constraint, F.map((value, index) => value - KuBar[index]));
    const settings = model.analysisSettings || {};
    const solved = solveLinearDetailed(Kr, Fr, {
      criteriaModel: model,
      labels: constraint.reducedDofs.map((row) => row.key),
      solver: settings.solver || settings.linearSolver,
      sparse: settings.useSparseSolver,
      sparseThreshold: settings.sparseThreshold,
    });
    if (!solved.ok) return { ok: false, reason: solved.reason, diagnostics: solved.diagnostics };
    return {
      ok: true,
      x: solved.x,
      D: expandConstraintDisplacements(constraint, solved.x),
      constraintCoordinates: solved.x,
      constraint,
      diagnostics: solved.diagnostics,
    };
  }
  const system = buildPartitionedTangentSystem(K, F, Dc, free, fixedDofs);
  if (!system.free.length) return assemblePartitionedTangentSolution(system, [], null);
  const settings = model.analysisSettings || {};
  const solved = solveLinearDetailed(system.Kff, system.Ff, {
    criteriaModel: model,
    labels: system.free.map((dof) => `dof:${dof}`),
    solver: settings.solver || settings.linearSolver,
    sparse: settings.useSparseSolver,
    sparseThreshold: settings.sparseThreshold,
  });
  if (!solved.ok) return { ok: false, reason: solved.reason, diagnostics: solved.diagnostics };
  return assemblePartitionedTangentSolution(system, solved.x, solved.diagnostics);
}

export function buildPartitionedTangentSystem(K, F, Dc, free, fixedDofs) {
  const freeDofs = Array.from(free || [], Number);
  const constrained = [...(fixedDofs || [])].filter((dof) => Math.abs(Dc[dof] || 0) > 0);
  const Kff = freeDofs.map((i) => freeDofs.map((j) => K[i][j]));
  const Ff = freeDofs.map((i) => F[i] - constrained.reduce(
    (sum, dof) => sum + K[i][dof] * Dc[dof],
    0,
  ));
  return Object.freeze({
    Kff,
    Ff: Object.freeze(Ff),
    Dc: Object.freeze(Array.from(Dc || [], Number)),
    free: Object.freeze(freeDofs),
    constrained: Object.freeze(constrained),
  });
}

export function assemblePartitionedTangentSolution(system, solution, diagnostics = null) {
  const x = Array.from(solution || [], Number);
  if (x.length !== system.free.length || x.some((value) => !Number.isFinite(value))) {
    return { ok: false, reason: 'PDELTA_TANGENT_SOLUTION_INVALID', diagnostics };
  }
  const D = Array.from(system.Dc);
  system.free.forEach((dof, index) => {
    D[dof] = x[index] || 0;
  });
  return { ok: true, x, D, diagnostics };
}

function buildDirectResult({
  model,
  domain,
  assembly,
  D,
  axialForces,
  F,
  loadState,
  tangent,
  convergence,
  stability,
  criteria,
  diagnostics,
}) {
  const disp = Object.fromEntries(domain.nodes.map((node) => {
    const base = assembly.idx[node.id] * 6;
    return [node.id, D.slice(base, base + 6)];
  }));
  const memberResults = {};
  const foundationResults = {};
  const allMemberResults = {};
  const missingMemberIds = [];
  const stationCount = Math.max(21, model.analysisSettings?.memberStations | 0 || 21);
  for (const member of domain.members) {
    const md = assembly.memData?.[member.id];
    if (!md) {
      if (!member.generated) missingMemberIds.push(member.id);
      continue;
    }
    const recovered = recoverConsistentMemberResult(
      member,
      md,
      D,
      domain.loads,
      stationCount,
      tangent.geometric.memberData?.[member.id],
    );
    allMemberResults[member.id] = recovered;
    if (!member.generated) {
      memberResults[member.id] = recovered;
      if (recovered.foundation) foundationResults[member.id] = recovered.foundation;
    }
  }

  const reactionState = buildConsistentReactionState(
    domain,
    assembly,
    D,
    allMemberResults,
    loadState.nodalExternal.map((value) => value * convergence.finalLoadFactor),
    criteria.closureTolerance,
  );
  const recovery = {
    qualified: missingMemberIds.length === 0 && reactionState.closure.qualified,
    status: missingMemberIds.length || !reactionState.closure.qualified ? 'blocked' : 'qualified',
    method: 'consistent-elastic-plus-geometric-member-end-force-recovery',
    resistingForceEquation: tangent.summary?.partialFixityApproximationCount > 0
      ? 'q_total = q_elastic(d_member_face, Ke_raw, f0_raw) + Kg_prismatic(N) * d_joint_local'
      : 'q_total = (Ke_local + Kg_local(N)) * d_local + f0_local',
    equilibriumForceEquation: tangent.summary?.partialFixityApproximationCount > 0
      ? 'q_equilibrium = q_elastic(d_member_face, Ke_raw, f0_raw) + Kg_prismatic(N) * d_joint_local + Kf*d_local'
      : 'q_equilibrium = (Ke_local + Kg_local(N) + Kf) * d_local + f0_local',
    connectionKinematics: tangent.summary?.partialFixityApproximationCount > 0
      ? {
          elastic: 'recovered-member-face-rotation',
          geometric: 'joint-local-rotation',
          limitationCode: PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
        }
      : null,
    memberCount: Object.keys(memberResults).length,
    generatedMemberCount: Object.keys(allMemberResults).length - Object.keys(memberResults).length,
    reactionNodeCount: Object.keys(reactionState.reactions).length,
    missingMemberIds,
    elementNodeClosure: reactionState.closure,
  };
  const out = {
    ok: recovery.qualified,
    anyOk: recovery.qualified,
    disp,
    reactions: reactionState.reactions,
    memberResults,
    foundationResults,
    axialForces,
    recovery,
    convergence,
    stability,
    resistingForces: {
      method: recovery.method,
      memberNodal: reactionState.memberNodal,
      nodalExternal: reactionState.nodalExternal,
      reactionVector: reactionState.reactionVector,
      constraintForces: reactionState.constraintForces,
      closureResidual: reactionState.closureResidual,
    },
    unstableMembers: new Set(),
    dmax: maxTranslationalDisplacement(domain.nodes, D, assembly),
    maxRatio: 0,
    ngCount: 0,
    okCount: 0,
    solver: directSolverSummary(tangent, D, F, assembly.free, diagnostics),
    elasticExpansion: domain.expansion.trace,
    semiRigidDiaphragm: domain.semiRigid,
    shellFrameAssembly: domain.shellAssembly,
    analysisDomain: domain.adapterIdentity || null,
  };
  for (const memberResult of Object.values(memberResults)) {
    out.dmax = Math.max(out.dmax, memberResult.dmaxM || 0);
    out.maxRatio = Math.max(out.maxRatio, memberResult.check?.ratio || 0);
    if (memberResult.check?.ok) out.okCount += 1;
    else out.ngCount += 1;
  }
  out.summary = buildDirectEquilibriumSummary(domain, out, tangent.geometric.KG, D, model);
  recovery.globalEquilibriumQualified = out.summary.equilibriumOk === true;
  recovery.qualified = recovery.qualified && recovery.globalEquilibriumQualified;
  recovery.status = recovery.qualified ? 'qualified' : 'blocked';
  if (!reactionState.closure.qualified) recovery.reason = 'DIRECT_PDELTA_ELEMENT_NODE_CLOSURE_FAILED';
  else if (!recovery.globalEquilibriumQualified) recovery.reason = 'DIRECT_PDELTA_GLOBAL_EQUILIBRIUM_FAILED';
  return out;
}

function recoverConsistentMemberResult(member, md, D, loads, stationCount, geometricData) {
  const recovered = recoverMemberResult(member, md, D, loads, stationCount);
  const elasticEnd = (recovered.structuralEnd || recovered.end).slice();
  const jointLocalDisplacement = matVec(md.T, md.dof.map((dof) => Number(D[dof]) || 0));
  const geometricEnd = geometricData?.local
    ? matVec(geometricData.local, jointLocalDisplacement)
    : new Array(12).fill(0);
  const totalEnd = elasticEnd.map((value, index) => value + geometricEnd[index]);
  const endActionContract = buildFoundationEndActionContract({
    foundation: md.foundation,
    localDisplacements: recovered.dl,
    structuralEnd: totalEnd,
    structuralEquation: 'Ks*d+f0_external+Kg*d',
  });
  const foundationEnd = endActionContract.foundationEnd;
  const equilibriumEnd = endActionContract.equilibriumEnd;
  const quantities = ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz'];
  const elasticStations = Object.fromEntries(quantities.map((key) => [key, recovered[key].slice()]));
  const elasticConstitutiveStations = Object.fromEntries(quantities.map((key) => [
    key,
    (recovered.constitutiveStations?.[key] || recovered[key]).slice(),
  ]));
  const geometricStations = geometricStationContributions(geometricEnd, recovered.xs, recovered.L);
  for (const key of quantities) {
    recovered[key] = elasticStations[key].map((value, index) => value + geometricStations[key][index]);
  }
  recovered.elasticEnd = elasticEnd;
  recovered.geometricEnd = geometricEnd;
  recovered.structuralEnd = endActionContract.structuralEnd;
  recovered.foundationEnd = foundationEnd;
  recovered.end = totalEnd;
  recovered.secondOrderEnd = totalEnd;
  recovered.equilibriumEnd = equilibriumEnd;
  recovered.endActionContract = endActionContract;
  recovered.elasticStations = elasticStations;
  recovered.geometricStations = geometricStations;
  recovered.constitutiveStations = {
    xs: recovered.xs,
    ...Object.fromEntries(quantities.map((key) => [
      key,
      elasticConstitutiveStations[key].map((value, index) => value + geometricStations[key][index]),
    ])),
  };
  recovered.equilibriumStations = {
    xs: recovered.xs,
    ...Object.fromEntries(quantities.map((key) => [key, recovered[key]])),
  };
  recovered.constitutiveStationEndClosure = evaluateStationEndClosure(
    recovered.structuralEnd,
    recovered.constitutiveStations,
    { basis: 'secondOrderStructuralEnd' },
  );
  recovered.stationEndClosure = evaluateStationEndClosure(
    equilibriumEnd,
    recovered.equilibriumStations,
    { basis: 'secondOrderEquilibriumEnd' },
  );
  recovered.globalEnd = matVec(matTrans(md.T), totalEnd);
  recovered.globalEquilibriumEnd = matVec(matTrans(md.T), equilibriumEnd);
  recovered.recoveryMethod = 'elastic-shared-recovery-plus-end-consistent-geometric-recovery';
  recovered.matrixOwnership = {
    ...(recovered.matrixOwnership || {}),
    structuralEndForce: 'klStructural*d+f0External+kg*d',
    foundationEndForce: recovered.foundation ? 'klFoundation*d' : 'zero',
    equilibriumEndForce: 'structuralEnd+foundationEnd',
    stationRecoveryStart: 'secondOrderEquilibriumEnd',
  };
  recovered.geometricRecoveryKinematics = md.partialFixity?.enabled
    ? 'joint-rotation-prismatic-kg-approximation'
    : 'member-joint-local-displacement';
  if (recovered.partialFixity?.enabled) {
    for (const row of recovered.partialFixity.rows || []) {
      row.elasticMemberEndMoment = row.memberEndMoment;
      row.geometricJointEndMoment = Number(geometricEnd[row.dof]) || 0;
      row.totalReportedEndMoment = Number(totalEnd[row.dof]) || 0;
      row.elasticClosureResidual = row.closureResidual;
      row.closureBasis = 'elastic-condensed-ke';
      row.geometricContributionAppliedToSpring = false;
      row.totalEndClosure = 'not-applicable-under-prismatic-kg-approximation';
      row.limitationCode = PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION;
    }
    recovered.partialFixity.maxElasticClosureResidual = Math.max(
      0,
      ...(recovered.partialFixity.rows || []).map((row) => Math.abs(row.elasticClosureResidual)),
    );
    recovered.partialFixity.secondOrderApproximation = {
      code: PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
      elasticClosurePreserved: true,
      totalEndClosure: 'not-applicable-under-prismatic-kg-approximation',
      message: 'Connection closure is exact for condensed elastic Ke; raw prismatic Kg is recovered separately at joint rotations.',
    };
  }
  recovered.Nmax = maxAbsValues(recovered.N);
  recovered.Vymax = maxAbsValues(recovered.Vy);
  recovered.Vzmax = maxAbsValues(recovered.Vz);
  recovered.Tmax = maxAbsValues(recovered.Tq);
  recovered.Mymax = maxAbsValues(recovered.My);
  recovered.Mzmax = maxAbsValues(recovered.Mz);
  recovered.check = sectionCheck(md.section, md.material, recovered, recovered.L);
  recovered.geometricStationEndClosure = geometricStationEndClosure(geometricEnd, geometricStations);
  return recovered;
}

function geometricStationContributions(end, xs, L) {
  const endpointValues = {
    N: [-end[0], end[6]],
    Vy: [-end[1], end[7]],
    Vz: [-end[2], end[8]],
    Tq: [-end[3], end[9]],
    My: [end[4], -end[10]],
    Mz: [-end[5], end[11]],
  };
  return Object.fromEntries(Object.entries(endpointValues).map(([key, [start, finish]]) => [
    key,
    xs.map((x) => {
      const ratio = L > 0 ? Math.max(0, Math.min(1, x / L)) : 0;
      return start * (1 - ratio) + finish * ratio;
    }),
  ]));
}

function geometricStationEndClosure(end, stations) {
  const expected = {
    N: [-end[0], end[6]],
    Vy: [-end[1], end[7]],
    Vz: [-end[2], end[8]],
    Tq: [-end[3], end[9]],
    My: [end[4], -end[10]],
    Mz: [-end[5], end[11]],
  };
  const residuals = {};
  let maximumResidual = 0;
  for (const [key, values] of Object.entries(stations)) {
    residuals[key] = [values[0] - expected[key][0], values.at(-1) - expected[key][1]];
    maximumResidual = Math.max(maximumResidual, ...residuals[key].map(Math.abs));
  }
  return { ok: maximumResidual <= 1e-12, maximumResidual, residuals };
}

function buildConsistentReactionState(domain, assembly, D, allMemberResults, nodalExternal, tolerance) {
  const memberNodal = new Array(assembly.ndof).fill(0);
  for (const [memberId, result] of Object.entries(allMemberResults)) {
    const md = assembly.memData[memberId];
    const equilibriumEnd = result.globalEquilibriumEnd || result.globalEnd;
    if (!md || !equilibriumEnd) continue;
    for (let index = 0; index < 12; index += 1) memberNodal[md.dof[index]] += equilibriumEnd[index];
  }
  const restrained = buildFixedDofs(domain.nodes);
  const reactions = {};
  const reactionVector = new Array(assembly.ndof).fill(0);
  const constraintDofs = directConstraintDofs(domain);
  const constraintForces = new Array(assembly.ndof).fill(0);
  for (const dof of constraintDofs) {
    if (!restrained.has(dof)) constraintForces[dof] = memberNodal[dof] - nodalExternal[dof];
  }
  for (const [nodeIndex, node] of domain.nodes.entries()) {
    if (!node.support) continue;
    const base = nodeIndex * 6;
    const values = node.support === 'spring'
      ? springReactionValues(node, D.slice(base, base + 6))
      : Array.from({ length: 6 }, (_item, dofIndex) => {
          const dof = base + dofIndex;
          return restrained.has(dof) ? memberNodal[dof] - nodalExternal[dof] : 0;
        });
    for (let index = 0; index < 6; index += 1) reactionVector[base + index] = values[index];
    reactions[node.id] = reactionObject(values);
  }

  const closureResidual = memberNodal.map((value, dof) => (
    value - nodalExternal[dof] - reactionVector[dof] - constraintForces[dof]
  ));
  const forceIndices = closureResidual.map((_value, dof) => dof).filter((dof) => dof % 6 < 3);
  const momentIndices = closureResidual.map((_value, dof) => dof).filter((dof) => dof % 6 >= 3);
  const forceScale = Math.max(
    1,
    vectorNorm(forceIndices.map((dof) => memberNodal[dof])),
    vectorNorm(forceIndices.map((dof) => nodalExternal[dof])),
    vectorNorm(forceIndices.map((dof) => reactionVector[dof])),
  );
  const momentScale = Math.max(
    1,
    vectorNorm(momentIndices.map((dof) => memberNodal[dof])),
    vectorNorm(momentIndices.map((dof) => nodalExternal[dof])),
    vectorNorm(momentIndices.map((dof) => reactionVector[dof])),
  );
  const forceResidualNorm = vectorNorm(forceIndices.map((dof) => closureResidual[dof])) / forceScale;
  const momentResidualNorm = vectorNorm(momentIndices.map((dof) => closureResidual[dof])) / momentScale;
  const closure = {
    version: 'p7-m8-element-node-closure-v1',
    method: constraintDofs.size
      ? 'assembled-member-forces-minus-nodal-loads-minus-reactions-minus-constraint-forces'
      : 'assembled-total-member-end-forces-minus-nodal-loads-minus-reactions',
    qualified: forceResidualNorm <= tolerance && momentResidualNorm <= tolerance,
    status: forceResidualNorm <= tolerance && momentResidualNorm <= tolerance ? 'PASS' : 'FAIL',
    tolerance,
    forceResidualNorm,
    momentResidualNorm,
    forceScale,
    momentScale,
    maximumForceResidual: Math.max(0, ...forceIndices.map((dof) => Math.abs(closureResidual[dof]))),
    maximumMomentResidual: Math.max(0, ...momentIndices.map((dof) => Math.abs(closureResidual[dof]))),
  };
  return { reactions, reactionVector, memberNodal, nodalExternal, constraintForces, closureResidual, closure };
}

function directConstraintDofs(domain) {
  const nodes = domain.nodes || [];
  const index = new Map(nodes.map((node, nodeIndex) => [String(node.id), nodeIndex]));
  const out = new Set();
  for (const constraint of domain.solverModel?.constraints || []) {
    const endpoints = [constraint.slave, constraint.master, ...(constraint.terms || [])];
    for (const endpoint of endpoints) {
      const nodeIndex = index.get(String(endpoint?.node));
      if (nodeIndex == null) continue;
      if (endpoint?.dof) {
        const component = DISPLACEMENT_KEYS.indexOf(endpoint.dof);
        if (component >= 0) out.add(nodeIndex * 6 + component);
      } else {
        for (let component = 0; component < 6; component += 1) out.add(nodeIndex * 6 + component);
      }
    }
  }
  return out;
}

function tangentMatrix(tangent) {
  return tangent.constrainedKt || tangent.Kt;
}

function tangentFreeDofs(tangent, assembly) {
  return tangent.constrainedFreeDofs || assembly.free;
}

function springReactionValues(node, displacement) {
  return SPRING_KEYS.map((key, index) => {
    const imposed = Number(node.settlement?.[key] ?? node.settlement?.[DISPLACEMENT_KEYS[index]] ?? 0);
    return -Number(node.spring?.[key] || 0) * ((displacement[index] || 0) - (Number.isFinite(imposed) ? imposed : 0));
  });
}

function reactionObject(values) {
  return {
    rx: values[0],
    ry: values[1],
    rz: values[2],
    rmx: values[3],
    rmy: values[4],
    rmz: values[5],
  };
}

function buildDirectEquilibriumSummary(domain, out, KG, D, criteriaModel = {}) {
  const base = buildEquilibriumSummary(domain.nodes, domain.members, domain.loads, out, {
    equilibriumLimit: resolveCriterion(criteriaModel, 'audit.equilibriumRelative', 1e-8),
  });
  if (!Array.isArray(base.forceResidual) || !Array.isArray(base.momentResidual) || !Array.isArray(KG)) {
    return { ...base, equilibriumMethod: 'shared-static-audit-no-geometric-correction' };
  }
  const geometric = nodalResultant(domain.nodes, matVec(KG, D));
  const forceResidual = subtract3(base.forceResidual, geometric.force);
  const momentResidual = subtract3(base.momentResidual, geometric.moment);
  const forceScale = Math.max(base.forceScale || 1, maxAbs3(geometric.force));
  const momentScale = Math.max(base.momentScale || 1, maxAbs3(geometric.moment));
  const forceResidualNorm = maxAbs3(forceResidual) / forceScale;
  const momentResidualNorm = maxAbs3(momentResidual) / momentScale;
  const equilibriumResidual = Math.max(forceResidualNorm, momentResidualNorm);
  const equilibriumLimit = Number(base.equilibriumLimit) || 1e-8;
  const equilibriumStatus = forceResidualNorm <= equilibriumLimit && momentResidualNorm <= equilibriumLimit
    ? 'PASS'
    : 'FAIL';
  return {
    ...base,
    equilibriumVersion: 'p7-m8-direct-geometric-resultant-equilibrium-v2',
    equilibriumMethod: 'independent-global-resultant-audit-with-assembled-KG-u-correction',
    uncorrectedResidualResultant: base.residualResultant,
    uncorrectedEquilibriumResidual: base.equilibriumResidual,
    geometricStiffnessForceResultant: geometric.force,
    geometricStiffnessMomentResultant: geometric.moment,
    geometricStiffnessResultant: [...geometric.force, ...geometric.moment],
    forceResidual,
    momentResidual,
    residualResultant: [...forceResidual, ...momentResidual],
    forceScale,
    momentScale,
    forceResidualNorm,
    momentResidualNorm,
    forceEquilibriumResidual: forceResidualNorm,
    momentEquilibriumResidual: momentResidualNorm,
    equilibriumResidual,
    equilibriumStatus,
    equilibriumOk: equilibriumStatus === 'PASS',
  };
}

function nodalResultant(nodes, values) {
  const force = [0, 0, 0];
  const moment = [0, 0, 0];
  nodes.forEach((node, index) => {
    const base = index * 6;
    const nodalForce = values.slice(base, base + 3);
    const nodalCouple = values.slice(base + 3, base + 6);
    const point = [Number(node.x) || 0, Number(node.y) || 0, Number(node.z) || 0];
    add3Into(force, nodalForce);
    add3Into(moment, cross3(point, nodalForce));
    add3Into(moment, nodalCouple);
  });
  return { force, moment };
}

function directCompatibility(model, domain) {
  const releaseMemberIds = domain.members
    .filter((member) => memberReleaseDofs(member).length > 0)
    .map((member) => member.id);
  const rigidDiaphragmIds = (model.diaphragms || [])
    .filter((item) => item.type === 'rigid' && (item.nodeIds || []).length > 1)
    .map((item) => item.id);
  const unilateralMemberIds = domain.members
    .filter((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type))
    .map((member) => member.id);
  const prescribedIssues = prescribedCompatibilityIssues(domain.nodes);
  const partialFixityRows = domain.members
    .map((member) => ({ memberId: member.id, entries: memberRotationalSpringEntries(member) }))
    .filter((row) => row.entries.length);
  const partialFixityMemberIds = partialFixityRows.map((row) => row.memberId);
  const partialFixityReleaseLimitMemberIds = partialFixityRows
    .filter((row) => row.entries.some((entry) => entry.stiffness === 0))
    .map((row) => row.memberId);
  const blockers = [];
  if (releaseMemberIds.length) blockers.push({
    code: 'DIRECT_PDELTA_RELEASE_UNSUPPORTED',
    message: 'Direct P-Delta requires combined elastic-geometric release condensation before recovery can be qualified.',
    memberIds: releaseMemberIds,
  });
  if (rigidDiaphragmIds.length) blockers.push({
    code: 'DIRECT_PDELTA_RIGID_DIAPHRAGM_UNSUPPORTED',
    message: 'Direct P-Delta does not yet use the rigid-diaphragm reduced tangent system.',
    diaphragmIds: rigidDiaphragmIds,
  });
  if (unilateralMemberIds.length) blockers.push({
    code: 'DIRECT_PDELTA_UNILATERAL_UNSUPPORTED',
    message: 'Direct P-Delta does not yet combine tangent iteration with unilateral active-set iteration.',
    memberIds: unilateralMemberIds,
  });
  if (partialFixityReleaseLimitMemberIds.length) blockers.push({
    code: 'DIRECT_PDELTA_PARTIAL_FIXITY_RELEASE_LIMIT_UNSUPPORTED',
    message: 'A zero-stiffness connection spring requires combined elastic-geometric release condensation.',
    memberIds: partialFixityReleaseLimitMemberIds,
  });
  blockers.push(...prescribedIssues);
  const limitationCodes = partialFixityMemberIds.length
    ? ['PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION']
    : [];
  return {
    supported: blockers.length === 0,
    status: blockers.length ? 'blocked' : limitationCodes.length ? 'supported-with-limitation' : 'supported',
    blockers,
    releaseMemberIds,
    rigidDiaphragmIds,
    unilateralMemberIds,
    partialFixityMemberIds,
    partialFixityReleaseLimitMemberIds,
    limitationCodes,
    prescribedIssues,
    expandedDomain: {
      version: domain.version,
      memberCount: domain.members.length,
      generatedMemberCount: domain.generatedMemberIds.length,
      loadCount: domain.loads.length,
    },
  };
}

function prescribedCompatibilityIssues(nodes) {
  const issues = [];
  const restrained = buildFixedDofs(nodes);
  for (const [nodeIndex, node] of nodes.entries()) {
    const explicit = node.prescribedDisplacement && typeof node.prescribedDisplacement === 'object' && !Array.isArray(node.prescribedDisplacement)
      ? node.prescribedDisplacement
      : node.prescribed && typeof node.prescribed === 'object' && !Array.isArray(node.prescribed)
        ? node.prescribed
        : null;
    if (explicit) {
      for (let dofIndex = 0; dofIndex < 6; dofIndex += 1) {
        const key = DISPLACEMENT_KEYS[dofIndex];
        const legacyKey = LEGACY_SETTLEMENT_KEYS[dofIndex];
        if (!Object.hasOwn(explicit, key) && !Object.hasOwn(explicit, legacyKey)) continue;
        issues.push({
          code: 'DIRECT_PDELTA_EXPLICIT_PRESCRIBED_UNSUPPORTED',
          message: `Direct P-Delta does not yet apply explicit prescribed displacement ${node.id}.${key}.`,
          nodeId: node.id,
          dof: key,
        });
      }
    }
    if (!node.settlement) continue;
    for (let dofIndex = 0; dofIndex < 6; dofIndex += 1) {
      const key = DISPLACEMENT_KEYS[dofIndex];
      const legacyKey = LEGACY_SETTLEMENT_KEYS[dofIndex];
      const supplied = Object.hasOwn(node.settlement, key) || Object.hasOwn(node.settlement, legacyKey);
      if (!supplied) continue;
      const value = Number(node.settlement[legacyKey] ?? node.settlement[key]);
      if (!Number.isFinite(value)) {
        issues.push({
          code: 'INVALID_PRESCRIBED_DISPLACEMENT',
          message: `Prescribed displacement ${node.id}.${key} is not finite.`,
          nodeId: node.id,
          dof: key,
        });
        continue;
      }
      if (node.support === 'spring') {
        if (Math.abs(value) > 0 && !(Number(node.spring?.[SPRING_KEYS[dofIndex]]) > 0)) {
          issues.push({
            code: 'SPRING_SETTLEMENT_WITHOUT_STIFFNESS',
            message: `Spring settlement ${node.id}.${key} has no positive support stiffness.`,
            nodeId: node.id,
            dof: key,
          });
        }
        continue;
      }
      const globalDof = nodeIndex * 6 + dofIndex;
      if (!restrained.has(globalDof)) {
        issues.push({
          code: 'PRESCRIBED_DOF_NOT_RESTRAINED',
          message: `Prescribed displacement ${node.id}.${key} is not restrained.`,
          nodeId: node.id,
          dof: key,
        });
      }
    }
  }
  return issues;
}

function blockedDirectResult(compatibility, domain) {
  const blocker = compatibility.blockers[0];
  return failedDirectResult(blocker.code, {
    compatibility,
    domain,
    message: blocker.message,
    status: 'blocked',
  });
}

function failedDirectResult(reason, details = {}) {
  const designEligibility = {
    eligible: false,
    status: 'blocked',
    reason,
    message: details.message || 'Direct P-Delta did not produce a qualified result.',
  };
  return {
    version: PDELTA_SECOND_ORDER_VERSION,
    productVersion: PDELTA_DIRECT_PRODUCT_VERSION,
    ok: false,
    converged: false,
    reason,
    status: details.status || 'failed',
    method: DIRECT_METHOD,
    iterationMethod: ITERATION_METHOD,
    linear: details.linear || null,
    tangent: details.tangent || null,
    result: null,
    iterations: [],
    steps: [],
    convergence: {
      converged: false,
      reason,
      iterationMethod: ITERATION_METHOD,
      solverClass: 'total-displacement-fixed-point',
      newtonRaphson: false,
      loadStepCount: 0,
      completedLoadSteps: 0,
      iterationCount: 0,
    },
    stability: details.stability || null,
    compatibility: details.compatibility || null,
    designEligibility,
    provenance: directProvenance(details.domain),
    analysisDomain: details.domain?.adapterIdentity || null,
  };
}

function directDesignEligibility(converged, stability, recovery, compatibility = null) {
  if (stability.status === 'unstable') {
    return {
      eligible: false,
      status: 'blocked',
      reason: 'DIRECT_PDELTA_TANGENT_INSTABILITY',
      message: 'The constrained tangent lost positive definiteness before the full load was completed.',
    };
  }
  if (!converged) {
    return {
      eligible: false,
      status: 'blocked',
      reason: 'DIRECT_PDELTA_NOT_CONVERGED',
      message: 'Direct P-Delta did not converge for the full factored combination.',
    };
  }
  if (!recovery.qualified) {
    return {
      eligible: false,
      status: 'blocked',
      reason: recovery.reason || 'DIRECT_PDELTA_RECOVERY_NOT_QUALIFIED',
      message: 'Element-node closure or global equilibrium did not qualify.',
    };
  }
  const limitationCodes = Array.from(new Set(compatibility?.limitationCodes || []));
  return {
    eligible: true,
    status: limitationCodes.length ? 'qualified-with-limitation' : 'qualified',
    reason: null,
    limitationCodes,
    source: 'direct-pdelta-recovered-result',
  };
}

function directProvenance(domain, loadState = null) {
  return {
    requestedMethod: 'direct',
    routedMethod: 'direct',
    solver: 'runSecondOrderPDelta',
    solverMethod: DIRECT_METHOD,
    iterationMethod: ITERATION_METHOD,
    solverVersion: PDELTA_SECOND_ORDER_VERSION,
    productVersion: PDELTA_DIRECT_PRODUCT_VERSION,
    analysisDomainVersion: domain?.version || null,
    canonicalDomain: domain?.adapterIdentity || null,
    loadVectorSource: loadState ? 'expanded-factored-load-domain' : null,
    recovery: 'consistent-elastic-plus-geometric-member-end-force-recovery',
  };
}

function scaledIncrementNorms(next, previous, free, characteristicLength) {
  const translation = free.filter((dof) => dof % 6 < 3);
  const rotation = free.filter((dof) => dof % 6 >= 3);
  const translationDelta = vectorNorm(translation.map((dof) => (next[dof] || 0) - (previous[dof] || 0)));
  const rotationDelta = vectorNorm(rotation.map((dof) => (next[dof] || 0) - (previous[dof] || 0)));
  const translationScale = Math.max(
    characteristicLength * 1e-12,
    vectorNorm(translation.map((dof) => next[dof] || 0)),
    vectorNorm(translation.map((dof) => previous[dof] || 0)),
  );
  const rotationScale = Math.max(
    1e-12,
    vectorNorm(rotation.map((dof) => next[dof] || 0)),
    vectorNorm(rotation.map((dof) => previous[dof] || 0)),
  );
  return {
    translationIncrement: translationDelta / translationScale,
    rotationIncrement: rotationDelta / rotationScale,
    translationScale,
    rotationScale,
    dimensions: {
      translationIncrement: 'length/length',
      rotationIncrement: 'rotation/rotation',
    },
  };
}

function scaledResidualNorms(K, D, F, free) {
  const resisting = matVec(K, D);
  const residual = resisting.map((value, index) => value - F[index]);
  const force = free.filter((dof) => dof % 6 < 3);
  const moment = free.filter((dof) => dof % 6 >= 3);
  const forceScale = Math.max(
    1,
    vectorNorm(force.map((dof) => F[dof] || 0)),
    vectorNorm(force.map((dof) => resisting[dof] || 0)),
  );
  const momentScale = Math.max(
    1,
    vectorNorm(moment.map((dof) => F[dof] || 0)),
    vectorNorm(moment.map((dof) => resisting[dof] || 0)),
  );
  return {
    forceResidual: vectorNorm(force.map((dof) => residual[dof] || 0)) / forceScale,
    momentResidual: vectorNorm(moment.map((dof) => residual[dof] || 0)) / momentScale,
    forceScale,
    momentScale,
    dimensions: {
      forceResidual: 'force/force',
      momentResidual: 'moment/moment',
    },
  };
}

function translationalAmplification(nodes, assembly, firstOrder, secondOrder) {
  const candidates = [];
  let referenceScale = 0;
  for (const node of nodes) {
    const base = assembly.idx[node.id] * 6;
    for (let component = 0; component < 3; component += 1) {
      referenceScale = Math.max(referenceScale, Math.abs(Number(firstOrder[base + component]) || 0));
    }
  }
  const floor = Math.max(1e-15, referenceScale * 1e-10);
  for (const node of nodes) {
    const base = assembly.idx[node.id] * 6;
    for (let component = 0; component < 3; component += 1) {
      const first = Number(firstOrder[base + component]) || 0;
      const second = Number(secondOrder[base + component]) || 0;
      if (Math.abs(first) <= floor) continue;
      candidates.push({
        nodeId: node.id,
        component: DISPLACEMENT_KEYS[component],
        firstOrder: first,
        secondOrder: second,
        ratio: Math.abs(second) / Math.abs(first),
      });
    }
  }
  const governing = candidates.reduce((best, row) => (
    !best || row.ratio > best.ratio ? row : best
  ), null);
  return {
    method: 'maximum-translational-component-ratio',
    value: governing?.ratio ?? 1,
    governing,
    referenceScale,
    candidateCount: candidates.length,
    excludesRotations: true,
  };
}

function displacementVector(nodes, result, assembly) {
  const D = new Array(assembly.ndof || nodes.length * 6).fill(0);
  for (const node of nodes) {
    const base = assembly.idx[node.id] * 6;
    const d = result.disp?.[node.id] || [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6; i += 1) D[base + i] = Number(d[i]) || 0;
  }
  return D;
}

function modelCharacteristicLength(domain) {
  return Math.max(1e-9, ...Object.values(domain.solverModel?.members || domain.members).map((member) => {
    const a = domain.nodes.find((node) => node.id === member.n1);
    const b = domain.nodes.find((node) => node.id === member.n2);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)) : 0;
  }));
}

function maxTranslationalDisplacement(nodes, D, assembly) {
  return Math.max(0, ...nodes.map((node) => {
    const base = assembly.idx[node.id] * 6;
    return Math.hypot(D[base] || 0, D[base + 1] || 0, D[base + 2] || 0);
  }));
}

function maxLateralDisplacement(nodes, D, assembly) {
  return Math.max(0, ...nodes.map((node) => {
    const base = assembly.idx[node.id] * 6;
    return Math.hypot(D[base] || 0, D[base + 1] || 0);
  }));
}

function maxVerticalDisplacement(nodes, D, assembly) {
  return Math.max(0, ...nodes.map((node) => {
    const base = assembly.idx[node.id] * 6;
    return Math.abs(D[base + 2] || 0);
  }));
}

function directSolverSummary(tangent, D, F, free, diagnostics) {
  const K = tangent.Kt;
  const residuals = tangent.constraint
    ? constrainedResidualNorms(tangent.constraint, K, D, F)
    : scaledResidualNorms(K, D, F, free);
  return {
    type: 'pdelta-direct-geometric-tangent',
    method: DIRECT_METHOD,
    iterationMethod: ITERATION_METHOD,
    forceResidualNorm: residuals.forceResidual,
    momentResidualNorm: residuals.momentResidual,
    forceScale: residuals.forceScale,
    momentScale: residuals.momentScale,
    diagnostics,
  };
}

function constrainedResidualNorms(constraint, K, D, F) {
  const residual = K.map((row, rowIndex) => (
    row.reduce((sum, value, column) => sum + value * D[column], 0) - F[rowIndex]
  ));
  const reducedResidual = reduceConstraintVector(constraint, residual);
  const reducedLoad = reduceConstraintVector(constraint, F);
  const scale = Math.max(1, vectorNorm(reducedLoad));
  const normalized = vectorNorm(reducedResidual) / scale;
  return {
    forceResidual: normalized,
    momentResidual: normalized,
    forceScale: scale,
    momentScale: scale,
  };
}

function scaleAxialForces(forces, scale) {
  return Object.fromEntries(Object.entries(forces).map(([memberId, value]) => [memberId, value * scale]));
}

function vectorNorm(values) {
  return Math.hypot(...values.map((value) => Number(value) || 0));
}

function maxAbsValues(values) {
  return Math.max(0, ...values.map((value) => Math.abs(Number(value) || 0)));
}

function subtract3(a, b) {
  return [0, 1, 2].map((index) => (Number(a[index]) || 0) - (Number(b[index]) || 0));
}

function add3Into(target, values) {
  for (let index = 0; index < 3; index += 1) target[index] += Number(values[index]) || 0;
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function maxAbs3(values) {
  return Math.max(0, ...values.map((value) => Math.abs(Number(value) || 0)));
}

function positive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}
