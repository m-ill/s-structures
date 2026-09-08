import { materialOf, sectionOf } from '../../core/catalogs.js';
import { buildAnalysisCriteriaTrace, resolveCriterion } from '../../core/model.js';
import { AXIS, dirVec, memberAxes } from '../linear3dElement.js';
import { comboSnapshot, makeEnvelope } from '../linear3dPost.js';
import { normalizePDeltaMethod } from './method.js';
import { PDELTA_SECOND_ORDER_VERSION, runSecondOrderPDelta } from './secondOrder.js';
import { analyzeAll, signedAxial } from '../linear3dFirstOrder.js';
import { envelopeCompleteFor } from '../elastic/resultContracts.js';

export const PDELTA_DESIGN_SUMMARY_CORRECTNESS_VERSION = 'p10-m0-pdelta-design-summary-v1';
export function analyzePDeltaCombinations(model, combos, options = {}) {
  const requestedMethod = options.pDeltaMethod ?? model.analysisSettings?.pDeltaMethod;
  const method = normalizePDeltaMethod(requestedMethod, {
    legacyEnabled: requestedMethod == null,
    fallback: 'legacy',
  });
  if (method === 'direct') return analyzeDirectPDeltaCombinations(model, combos, options);
  if (method === 'off') {
    return {
      enabled: false,
      method: 'off',
      solverMethod: null,
      ok: true,
      byCombo: {},
      envelope: null,
      provenance: {
        requestedMethod: requestedMethod ?? 'off',
        routedMethod: 'off',
        solver: null,
      },
      designEligibility: { eligible: false, status: 'not-requested', reason: 'PDELTA_OFF' },
    };
  }

  const byCombo = {};
  const criteria = buildAnalysisCriteriaTrace(model);
  for (const combo of combos) {
    byCombo[combo.id] = analyzePDelta(model, combo.factors, model.analysisSettings || {});
    byCombo[combo.id].combo = comboSnapshot(combo);
    byCombo[combo.id].requestedMethod = 'legacy';
    byCombo[combo.id].provenance = {
      requestedMethod: 'legacy',
      routedMethod: 'legacy',
      solver: 'analyzePDelta',
      solverMethod: 'equivalent-lateral-load-iteration-legacy',
    };
    if (byCombo[combo.id].result) byCombo[combo.id].result.combo = comboSnapshot(combo);
    byCombo[combo.id].curve = buildPDeltaLoadStepCurve(model, combo.factors, byCombo[combo.id], model.analysisSettings || {});
  }
  const finalByCombo = {};
  for (const combo of combos) {
    finalByCombo[combo.id] = byCombo[combo.id].result;
  }
  const envelope = makeEnvelope(finalByCombo, combos);
  const summary = summarizePDelta(byCombo);
  const design = buildPDeltaDesignSummary(model, combos, byCombo, {
    ...(model.analysisSettings || {}),
    pDeltaMethod: 'legacy',
  });
  const thetaEligibility = design.designEligibility;
  const allCompared = combos.length > 0
    && combos.every((combo) => byCombo[combo.id]?.ok === true && byCombo[combo.id]?.converged === true);
  if (envelope) {
    envelope.designBlocked = true;
    envelope.designQualified = false;
    envelope.comparisonOnly = true;
    envelope.designBlockers = [
      ...(envelope.designBlockers || []),
      { comboId: null, status: 'BLOCKED', reason: 'LEGACY_PDELTA_DESIGN_BLOCKED' },
    ];
  }
  design.designBlocked = true;
  design.designQualified = false;
  design.reason = thetaEligibility.reason === 'PDELTA_SECOND_ORDER_REQUIRED'
    ? thetaEligibility.reason
    : 'LEGACY_PDELTA_DESIGN_BLOCKED';
  design.designEligibility = {
    eligible: false,
    status: 'blocked',
    reason: design.reason,
    source: 'legacy-pdelta-envelope',
  };
  return {
    enabled: true,
    method: 'legacy',
    solverMethod: 'equivalent-lateral-load-iteration-legacy',
    curveMethod: 'load-step-global-story-member-pdelta',
    ok: allCompared,
    comparisonOnly: true,
    byCombo,
    curves: summarizePDeltaCurves(byCombo),
    criteria,
    design,
    envelope,
    summary,
    provenance: {
      requestedMethod: requestedMethod ?? 'legacy',
      routedMethod: 'legacy',
      solver: 'analyzePDelta',
      solverMethod: 'equivalent-lateral-load-iteration-legacy',
    },
    convergence: {
      converged: Object.values(byCombo).every((item) => item.converged),
      convergedCount: Object.values(byCombo).filter((item) => item.converged).length,
      comboCount: combos.length,
    },
    designEligibility: {
      eligible: false,
      status: 'preliminary',
      reason: design.reason,
      source: 'legacy-pdelta-envelope',
      message: 'Legacy equivalent-load P-Delta is available for comparison only; use converged Direct P-Delta for design transfer.',
    },
  };
}


export function buildDirectPDeltaAnalysis(model, combos, runByCombo, options = {}) {
  return analyzeDirectPDeltaCombinations(model, combos, { ...options, runByCombo });
}


export function analyzeDirectPDeltaCombinations(model, combos, options = {}) {
  const byCombo = {};
  const finalByCombo = {};
  const settings = { ...(model.analysisSettings || {}), ...options, pDeltaMethod: 'direct' };
  for (const combo of combos) {
    const comboInfo = comboSnapshot(combo);
    const run = options.runByCombo?.[combo.id] || runSecondOrderPDelta(model, combo.factors, settings);
    run.combo = comboInfo;
    run.requestedMethod = 'direct';
    run.provenance = {
      ...(run.provenance || {}),
      requestedMethod: 'direct',
      routedMethod: 'direct',
      solver: 'runSecondOrderPDelta',
      solverMethod: run.method,
      solverVersion: run.version,
      comboId: combo.id,
    };
    if (run.result) {
      run.result.combo = comboInfo;
      run.result.method = 'direct';
      run.result.solverMethod = run.method;
      run.result.provenance = { ...run.provenance };
      run.result.convergence = run.convergence;
      finalByCombo[combo.id] = run.result;
    }
    byCombo[combo.id] = run;
  }

  const envelope = makeEnvelope(finalByCombo, combos);
  const runs = Object.values(byCombo);
  const convergedCount = runs.filter((item) => item.converged).length;
  const qualifiedCount = runs.filter((item) => item.designEligibility?.eligible).length;
  const limitationCodes = Array.from(new Set(runs.flatMap(
    (item) => item.designEligibility?.limitationCodes || [],
  )));
  const allQualified = combos.length > 0
    && runs.length === combos.length
    && qualifiedCount === combos.length;
  const failed = runs.find((item) => !item.ok || !item.converged || !item.designEligibility?.eligible);
  const graphs = buildDirectPDeltaGraphs(byCombo);
  if (envelope) {
    envelope.method = 'direct';
    envelope.solverMethod = 'geometric-stiffness-second-order-direct';
    envelope.provenance = {
      requestedMethod: 'direct',
      routedMethod: 'direct',
      solver: 'runSecondOrderPDelta',
      solverVersion: PDELTA_SECOND_ORDER_VERSION,
      comboIds: combos.map((combo) => combo.id),
      limitationCodes,
    };
    envelope.limitationCodes = limitationCodes;
  }
  const envelopeState = envelopeCompleteFor(envelope, combos);
  const analysisQualified = allQualified && envelopeState.complete;
  const design = buildPDeltaDesignSummary(model, combos, byCombo, settings);
  const designQualified = analysisQualified && design.designEligibility.eligible;
  const designReason = !analysisQualified
    ? failed?.designEligibility?.reason || failed?.reason || envelopeState.reasons[0] || 'DIRECT_PDELTA_NOT_QUALIFIED'
    : design.designEligibility.reason;
  design.designBlocked = !designQualified;
  design.designQualified = designQualified;
  design.reason = designQualified ? null : designReason;
  design.designEligibility = designQualified
    ? {
        eligible: true,
        status: limitationCodes.length ? 'qualified-with-limitation' : 'qualified',
        reason: null,
        limitationCodes,
        source: 'direct-pdelta-envelope',
      }
    : {
        eligible: false,
        status: 'blocked',
        reason: designReason,
        limitationCodes,
        source: 'direct-pdelta-envelope',
      };
  if (envelope) {
    envelope.designBlocked = !designQualified;
    envelope.designQualified = designQualified;
    envelope.designBlockers = designQualified
      ? []
      : [{ comboId: null, status: 'BLOCKED', reason: designReason }];
    envelope.designEligibility = { ...design.designEligibility };
  }

  return {
    enabled: true,
    method: 'direct',
    solverMethod: 'geometric-stiffness-second-order-direct',
    curveMethod: 'direct-load-step-tangent-response',
    ok: analysisQualified,
    reason: analysisQualified
      ? 'CONVERGED'
      : failed?.reason || envelopeState.reasons[0] || 'NO_DIRECT_RESULTS',
    byCombo,
    envelope,
    graphs,
    curves: graphs,
    criteria: buildAnalysisCriteriaTrace(model),
    design,
    summary: {
      ...summarizePDelta(byCombo),
      convergedCount,
      qualifiedCount,
      comboCount: runs.length,
      envelope: envelopeState,
      limitationCodes,
    },
    convergence: {
      converged: runs.length > 0 && convergedCount === runs.length,
      convergedCount,
      qualifiedCount,
      comboCount: runs.length,
      byCombo: Object.fromEntries(Object.entries(byCombo).map(([comboId, item]) => [comboId, item.convergence])),
    },
    provenance: {
      requestedMethod: 'direct',
      routedMethod: 'direct',
      solver: 'runSecondOrderPDelta',
      solverMethod: 'geometric-stiffness-second-order-direct',
      solverVersion: PDELTA_SECOND_ORDER_VERSION,
    },
    designEligibility: designQualified
      ? {
          eligible: true,
          status: limitationCodes.length ? 'qualified-with-limitation' : 'qualified',
          reason: null,
          limitationCodes,
          source: 'direct-pdelta-envelope',
        }
      : {
          eligible: false,
          status: 'blocked',
          reason: designReason,
          limitationCodes,
          message: !analysisQualified
            ? failed?.designEligibility?.message || 'Direct P-Delta results are incomplete or not converged.'
            : designReason === 'PDELTA_THETA_LIMIT_EXCEEDED'
              ? 'The governing stability coefficient reached or exceeded thetaStrong.'
              : 'Direct P-Delta design transfer is not qualified.',
        },
  };
}


export function buildDirectPDeltaGraphs(byCombo = {}) {
  const combinations = Object.entries(byCombo).map(([comboId, item]) => {
    const globalPoints = [{
      loadFactor: 0,
      maxDisplacement: 0,
      converged: true,
    }];
    for (const step of item.steps || []) {
      const last = [...(step.iterations || [])].reverse().find((iteration) => iteration.ok);
      globalPoints.push({
        loadFactor: step.lambda,
        maxDisplacement: last?.maxLateralDisplacement ?? last?.maxDisplacement ?? null,
        maxLateralDisplacement: last?.maxLateralDisplacement ?? null,
        maxVerticalDisplacement: last?.maxVerticalDisplacement ?? null,
        maxTotalDisplacement: last?.maxDisplacement ?? null,
        responseComponent: 'global-lateral-resultant',
        converged: !!step.converged,
        iterationCount: step.iterations?.length || 0,
      });
    }
    return {
      comboId,
      method: 'direct',
      globalPoints,
      storyRows: item.split?.storyRows || [],
      memberRows: item.split?.memberRows || [],
      summary: {
        loadStepCount: globalPoints.length,
        storyCount: item.split?.storyRows?.length || 0,
        memberCount: item.split?.memberRows?.length || 0,
        amplification: item.amplification ?? null,
        converged: !!item.converged,
      },
    };
  });
  return {
    version: 'p7-m8-direct-pdelta-graphs-v1',
    method: 'direct',
    combos: combinations.map((item) => ({
      comboId: item.comboId,
      globalPointCount: item.globalPoints.length,
      storyCount: item.storyRows.length,
      memberCount: item.memberRows.length,
      summary: item.summary,
    })),
    global: combinations.map(({ comboId, globalPoints }) => ({ comboId, points: globalPoints })),
    stories: combinations.map(({ comboId, storyRows }) => ({ comboId, rows: storyRows })),
    members: combinations.map(({ comboId, memberRows }) => ({ comboId, rows: memberRows })),
    combinations,
  };
}


export function buildPDeltaDesignSummary(model, combos = [], byCombo = {}, settings = {}) {
  const direct = normalizePDeltaMethod(settings.pDeltaMethod, { fallback: 'legacy' }) === 'direct';
  const thetaCaution = nonnegativeNumber(resolveCriterion(model, 'pdelta.thetaCaution'), settings.pDeltaThetaNegligible, 0.05);
  const thetaRequire = nonnegativeNumber(resolveCriterion(model, 'pdelta.thetaRequire'), 0.1);
  const thetaStrong = nonnegativeNumber(resolveCriterion(model, 'pdelta.thetaStrong'), settings.pDeltaThetaLimit, 0.2);
  const rows = [];
  const storyRows = [];
  const memberForceRows = [];

  for (const combo of combos || []) {
    const item = byCombo?.[combo.id];
    const result = item?.result || null;
    const firstOrder = item?.linear || null;
    const comboStoryRows = pDeltaDesignStoryRows(model, result, combo, { thetaCaution, thetaRequire, thetaStrong });
    storyRows.push(...comboStoryRows);
    memberForceRows.push(...pDeltaDesignMemberForceRows(model, firstOrder, result, combo));

    const directions = uniqueStrings(comboStoryRows.map((row) => row.direction));
    if (!directions.length) {
      rows.push({
        comboId: combo.id,
        comboName: combo.name || combo.id,
        direction: '-',
        governingStory: '-',
        maxTheta: 0,
        maxBDelta: 1,
        maxPDeltaShear: 0,
        maxPDeltaMoment: 0,
        converged: !!item?.converged,
        iterationCount: item?.iterations?.length || 0,
        status: item?.converged ? 'N/A' : 'NG',
        statusLegacy: item?.converged ? 'N/A' : 'NG',
        reason: item?.converged ? 'NO_LATERAL_STORY_SHEAR' : item?.reason || 'PDELTA_NOT_CONVERGED',
      });
    }
    for (const direction of directions) {
      const directionalRows = comboStoryRows.filter((row) => row.direction === direction);
      const governing = directionalRows.reduce((best, row) => (
        !best || row.theta > best.theta ? row : best
      ), null);
      const status = !item?.converged
        ? 'NG'
        : pDeltaDesignStatus(governing?.theta || 0, thetaCaution, thetaRequire, thetaStrong);
      rows.push({
        comboId: combo.id,
        comboName: combo.name || combo.id,
        direction,
        governingStory: governing?.storyId || '-',
        maxTheta: governing?.theta || 0,
        maxBDelta: governing?.bDelta || 1,
        maxPDeltaShear: Math.max(0, ...directionalRows.map((row) => row.pDeltaShear)),
        maxPDeltaMoment: Math.max(0, ...directionalRows.map((row) => row.pDeltaMoment)),
        converged: !!item?.converged,
        iterationCount: item?.iterations?.length || 0,
        status,
        statusLegacy: pDeltaLegacyStatus(status),
      });
    }
  }

  const governing = rows.reduce((best, row) => (
    !best || row.maxTheta > best.maxTheta ? row : best
  ), null);
  const status = worstStatus(rows.map((row) => row.status));
  const statusLegacy = pDeltaLegacyStatus(status);
  const designEligibility = pDeltaThetaDesignEligibility(rows, status, direct);
  return {
    version: 'pdelta-design-summary-v1',
    correctnessVersion: PDELTA_DESIGN_SUMMARY_CORRECTNESS_VERSION,
    method: direct
      ? 'direct-geometric-stiffness-combination-final'
      : 'legacy-equivalent-load-iteration-diagnostic',
    thetaLimits: {
      caution: thetaCaution,
      require: thetaRequire,
      strong: thetaStrong,
      negligible: thetaCaution,
      limit: thetaStrong,
    },
    summary: {
      comboCount: combos.length,
      rowCount: rows.length,
      storyRowCount: storyRows.length,
      memberForceRowCount: memberForceRows.length,
      maxTheta: governing?.maxTheta || 0,
      maxBDelta: governing?.maxBDelta || 1,
      maxPDeltaShear: Math.max(0, ...rows.map((row) => row.maxPDeltaShear)),
      maxPDeltaMoment: Math.max(0, ...rows.map((row) => row.maxPDeltaMoment)),
      governing,
      status,
      statusLegacy,
    },
    designEligibility,
    rows,
    storyRows,
    memberForceRows,
    notes: direct
      ? [
          'Values are recovered from the final converged Direct tangent-stiffness result for each factored combination.',
          'Automatic design transfer is allowed only when every requested combination has qualified reaction and member-station recovery.',
          'Member chord-drift rows are diagnostics; design checks use recovered final second-order member forces.',
        ]
      : [
          'Legacy equivalent-load iteration is retained for compatibility and is explicitly identified as legacy.',
          'Legacy design transfer uses the legacy combination envelope and never represents the Direct tangent method.',
          'Member diagnostic N-delta/L curves are not design forces.',
        ],
  };
}


export function analyzePDelta(model, factors = null, settings = {}) {
  const criteria = buildAnalysisCriteriaTrace(model);
  const maxIterations = Math.max(1, Math.trunc(positiveNumber(resolveCriterion(model, 'pdelta.maxIter'), settings.pDeltaMaxIterations, 12)));
  const tolerance = positiveNumber(resolveCriterion(model, 'pdelta.eR'), settings.pDeltaTolerance, 1e-4);
  const maxAmplification = positiveNumber(resolveCriterion(model, 'pdelta.ampLimit'), settings.pDeltaMaxAmplification, 2.5);
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
      method: 'equivalent-lateral-load-iteration-legacy',
      linear,
      result: linear,
      iterations,
      amplification: 1,
      criteria,
      convergence: { converged: false, reason: linear.reason || 'LINEAR_FAILED', iterationCount: 0 },
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
        memberRows: pLoads.memberRows,
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
    next.pDeltaMemberRows = pLoads.memberRows;
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
      memberRows: pLoads.memberRows,
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
    method: 'legacy',
    solverMethod: 'equivalent-lateral-load-iteration-legacy',
    converged,
    reason,
    amplification: finalAmp,
    iterations,
    criteria,
    warnings,
  };

  return {
    ok: result.ok && converged,
    converged,
    reason,
    method: 'equivalent-lateral-load-iteration-legacy',
    linear,
    result,
    iterations,
    amplification: finalAmp,
    criteria,
    convergence: {
      converged,
      reason,
      iterationCount: Math.max(0, iterations.length - 1),
      criteria: { tolerance, maxIterations, maxAmplification },
    },
    warnings,
  };
}


export function makePDeltaLoads(model, result, options = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const loads = [];
  const memberRows = [];
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
    const axial = compressionAxialForce(demand);
    if (axial < 1e-9) continue;
    const force = axial * driftMagnitude / length;
    if (!(force > 1e-12)) continue;
    total += force;
    const row = {
      iteration,
      memberId: member.id,
      topNodeId: top.id,
      bottomNodeId: bottom.id,
      axial,
      length,
      drift: driftMagnitude,
      driftX: drift[0],
      driftY: drift[1],
      force,
      direction: [drift[0] / driftMagnitude, drift[1] / driftMagnitude, 0],
    };
    memberRows.push(row);
    loads.push({
      id: `PD${iteration}_${member.id}`,
      type: 'nodal',
      node: top.id,
      P: force,
      direction: row.direction,
      case: 'PDELTA',
      source: 'pdelta',
      member: member.id,
    });
  }
  return { loads, total, memberRows };
}


export function buildPDeltaLoadStepCurve(model, factors = null, pDeltaResult = null, settings = {}) {
  const split = splitPDeltaFactors(model, factors || {});
  const loadFactors = pDeltaLoadFactors(settings);
  const globalPoints = [];
  const stories = new Map();
  const members = new Map();

  for (const loadFactor of loadFactors) {
    const stepFactors = composePDeltaStepFactors(split, loadFactor);
    const firstOrder = loadFactor === 1 && pDeltaResult?.linear
      ? pDeltaResult.linear
      : analyzeAll(model, stepFactors);
    const secondOrderRun = loadFactor === 1 && pDeltaResult?.result
      ? pDeltaResult
      : analyzePDelta(model, stepFactors, settings);
    const secondOrder = secondOrderRun?.result || null;
    const firstGlobal = pDeltaGlobalPoint(model, firstOrder, loadFactor);
    const secondGlobal = pDeltaGlobalPoint(model, secondOrder, loadFactor);
    globalPoints.push({
      loadFactor,
      ok: !!(firstOrder?.ok && secondOrder?.ok),
      converged: !!secondOrderRun?.converged,
      firstOrder: firstGlobal,
      secondOrder: secondGlobal,
      amplification: firstGlobal.roofDisplacement > 1e-12
        ? secondGlobal.roofDisplacement / firstGlobal.roofDisplacement
        : 1,
    });

    for (const row of pDeltaStoryRows(model, secondOrder, loadFactor)) {
      if (!stories.has(row.storyId)) stories.set(row.storyId, []);
      stories.get(row.storyId).push(row);
    }
    for (const row of pDeltaMemberContributionRows(model, secondOrder, loadFactor)) {
      if (!members.has(row.memberId)) members.set(row.memberId, []);
      members.get(row.memberId).push(row);
    }
  }

  const storySeries = [...stories.entries()].map(([storyId, points]) => ({ storyId, points }));
  const memberSeries = [...members.entries()].map(([memberId, points]) => ({ memberId, points }));
  return {
    version: 'pdelta-load-step-curves-v1',
    method: 'load-step curve postprocess from secondary-load P-Delta results',
    split,
    global: {
      title: 'Global P-Delta Response Curve',
      x: 'roofDisplacement',
      y: 'baseShear',
      points: globalPoints,
    },
    stories: storySeries,
    members: memberSeries,
    summary: summarizeSinglePDeltaCurve(globalPoints, storySeries, memberSeries),
  };
}


export function pDeltaLoadFactors(settings = {}) {
  const divisions = Math.min(20, Math.max(1, settings.pDeltaCurveSteps | 0 || settings.pDeltaLoadSteps | 0 || 5));
  return Array.from({ length: divisions + 1 }, (_item, index) => Number((index / divisions).toFixed(6)));
}


export function splitPDeltaFactors(model, factors = {}) {
  const loadCaseById = Object.fromEntries((model.loadCases || []).map((item) => [item.id, item]));
  const gravity = {};
  const lateral = {};
  for (const [caseId, factor] of Object.entries(factors || {})) {
    const category = classifyPDeltaLoadCase(model, loadCaseById[caseId], caseId);
    if (category === 'lateral') lateral[caseId] = factor;
    else gravity[caseId] = factor;
  }
  if (!Object.keys(lateral).length) {
    return {
      gravity: {},
      lateral: { ...(factors || {}) },
      fallback: 'scale-all-load-cases',
    };
  }
  return { gravity, lateral, fallback: null };
}


export function classifyPDeltaLoadCase(model, loadCase, caseId) {
  const type = String(loadCase?.type || '').toLowerCase();
  if (/(wind|seismic|earthquake|lateral|eq)/.test(type)) return 'lateral';
  if (/(dead|live|roof|snow|gravity|vertical)/.test(type)) return 'gravity';
  let horizontal = 0;
  let vertical = 0;
  for (const load of model.loads || []) {
    if ((load.case || 'LC1') !== caseId) continue;
    const direction = load.direction || AXIS[load.dir || '-z'] || [0, 0, -1];
    const hx = Math.hypot(Number(direction[0]) || 0, Number(direction[1]) || 0);
    const vz = Math.abs(Number(direction[2]) || 0);
    if (hx > vz) horizontal += Math.abs(Number(load.P ?? load.w ?? load.M) || 0);
    else vertical += Math.abs(Number(load.P ?? load.w ?? load.M) || 0);
  }
  return horizontal > vertical ? 'lateral' : 'gravity';
}


export function composePDeltaStepFactors(split, loadFactor) {
  const factors = {};
  for (const [caseId, factor] of Object.entries(split.gravity || {})) factors[caseId] = factor;
  for (const [caseId, factor] of Object.entries(split.lateral || {})) factors[caseId] = factor * loadFactor;
  return factors;
}


export function pDeltaGlobalPoint(model, result, loadFactor) {
  const bounds = modelVerticalBounds(model);
  const roofNodes = (model.nodes || []).filter((node) => Math.abs((node.z || 0) - bounds.maxZ) <= 1e-8);
  let roofDisplacement = 0;
  for (const node of roofNodes) {
    const d = result?.disp?.[node.id] || [0, 0, 0];
    roofDisplacement = Math.max(roofDisplacement, Math.hypot(Number(d[0]) || 0, Number(d[1]) || 0));
  }
  const base = pDeltaBaseShear(result);
  return {
    loadFactor,
    roofDisplacement,
    roofDriftRatio: bounds.height > 1e-12 ? roofDisplacement / bounds.height : 0,
    baseShear: base.baseShear,
    baseShearX: base.baseShearX,
    baseShearY: base.baseShearY,
  };
}


export function pDeltaBaseShear(result) {
  let sx = 0;
  let sy = 0;
  for (const reaction of Object.values(result?.reactions || {})) {
    sx += Number(reaction.rx) || 0;
    sy += Number(reaction.ry) || 0;
  }
  return {
    baseShearX: sx,
    baseShearY: sy,
    baseShear: Math.hypot(sx, sy),
  };
}


export function pDeltaStoryRows(model, result, loadFactor) {
  if (!result?.ok) return [];
  const levels = uniqueSorted((model.nodes || []).map((node) => Number(node.z) || 0));
  if (levels.length < 2) return [];
  const base = pDeltaBaseShear(result);
  return levels.slice(1).map((topZ, index) => {
    const bottomZ = levels[index];
    const height = topZ - bottomZ;
    const top = averageHorizontalDisplacementAtZ(model, result, topZ);
    const bottom = averageHorizontalDisplacementAtZ(model, result, bottomZ);
    const storyDriftX = top.x - bottom.x;
    const storyDriftY = top.y - bottom.y;
    const storyDrift = Math.hypot(storyDriftX, storyDriftY);
    const gravityLoad = storyCompressionLoad(model, result, bottomZ, topZ);
    const pDeltaShear = height > 1e-12 ? gravityLoad * storyDrift / height : 0;
    const pDeltaMoment = gravityLoad * storyDrift;
    const storyShear = base.baseShear;
    const stabilityIndex = storyShear > 1e-12 && height > 1e-12 ? (gravityLoad * storyDrift) / (storyShear * height) : 0;
    return {
      loadFactor,
      storyId: `ST${index + 1}`,
      bottomZ,
      topZ,
      height,
      storyDrift,
      storyDriftX,
      storyDriftY,
      storyDriftRatio: height > 1e-12 ? storyDrift / height : 0,
      storyShear,
      gravityLoad,
      pDeltaShear,
      pDeltaMoment,
      stabilityIndex,
      bDelta: stabilityIndex < 1 ? 1 / (1 - stabilityIndex) : null,
    };
  });
}


export function pDeltaDesignStoryRows(model, result, combo, options = {}) {
  if (!result?.ok) return [];
  const levels = uniqueSorted((model.nodes || []).map((node) => Number(node.z) || 0));
  if (levels.length < 2) return [];
  const shears = storyShearVectors(model, combo?.factors || {}, levels);
  const rows = [];
  for (let index = 1; index < levels.length; index += 1) {
    const bottomZ = levels[index - 1];
    const topZ = levels[index];
    const height = topZ - bottomZ;
    if (!(height > 1e-12)) continue;
    const top = averageHorizontalDisplacementAtZ(model, result, topZ);
    const bottom = averageHorizontalDisplacementAtZ(model, result, bottomZ);
    const drift = {
      X: top.x - bottom.x,
      Y: top.y - bottom.y,
    };
    const gravityLoad = storyCompressionLoad(model, result, bottomZ, topZ);
    const shear = shears.get(topZ) || { x: 0, y: 0 };
    for (const direction of ['X', 'Y']) {
      const storyDriftSigned = direction === 'X' ? drift.X : drift.Y;
      const storyDrift = Math.abs(storyDriftSigned);
      const storyShearSigned = direction === 'X' ? shear.x : shear.y;
      const storyShear = Math.abs(storyShearSigned);
      const pDeltaMoment = gravityLoad * storyDrift;
      const pDeltaShear = pDeltaMoment / height;
      const theta = storyShear > 1e-12 ? pDeltaShear / storyShear : 0;
      if (!(storyDrift > 1e-12 || storyShear > 1e-12 || pDeltaShear > 1e-12)) continue;
      const status = pDeltaDesignStatus(theta, options.thetaCaution, options.thetaRequire, options.thetaStrong);
      rows.push({
        comboId: combo.id,
        comboName: combo.name || combo.id,
        direction,
        storyId: `ST${index}`,
        bottomZ,
        topZ,
        height,
        gravityLoad,
        storyDrift,
        storyDriftSigned,
        storyDriftRatio: storyDrift / height,
        storyShear,
        storyShearSigned,
        pDeltaMoment,
        pDeltaShear,
        theta,
        bDelta: theta < 1 ? 1 / (1 - theta) : null,
        requiresSecondOrder: theta >= nonnegativeNumber(options.thetaRequire, 0.1),
        status,
        statusLegacy: pDeltaLegacyStatus(status),
      });
    }
  }
  return rows;
}


export function pDeltaDesignMemberForceRows(model, firstOrder, secondOrder, combo) {
  if (!secondOrder?.memberResults) return [];
  return (model.members || [])
    .map((member) => {
      const first = firstOrder?.memberResults?.[member.id] || null;
      const second = secondOrder.memberResults?.[member.id] || null;
      if (!second) return null;
      return {
        comboId: combo.id,
        comboName: combo.name || combo.id,
        memberId: member.id,
        firstOrder: memberForceEnvelope(first),
        secondOrder: memberForceEnvelope(second),
        amplification: {
          N: forceAmplification(first?.Nmax, second.Nmax),
          Vy: forceAmplification(first?.Vymax, second.Vymax),
          Vz: forceAmplification(first?.Vzmax, second.Vzmax),
          My: forceAmplification(first?.Mymax, second.Mymax),
          Mz: forceAmplification(first?.Mzmax, second.Mzmax),
        },
      };
    })
    .filter(Boolean);
}


export function memberForceEnvelope(result) {
  if (!result) return null;
  return {
    N: Number(result.Nmax) || 0,
    Vy: Number(result.Vymax) || 0,
    Vz: Number(result.Vzmax) || 0,
    My: Number(result.Mymax) || 0,
    Mz: Number(result.Mzmax) || 0,
  };
}


export function forceAmplification(first, second) {
  const a = Math.abs(Number(first) || 0);
  const b = Math.abs(Number(second) || 0);
  if (a <= 1e-12) return b > 1e-12 ? null : 1;
  return b / a;
}


export function pDeltaMemberContributionRows(model, result, loadFactor) {
  if (!result?.ok) return [];
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const rows = [];
  for (const member of model.members || []) {
    const demand = result.memberResults?.[member.id];
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    if (!demand || !a || !b) continue;
    const axes = demand.ax || memberAxes(a, b, member.localAxis);
    const length = axes.L || Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    if (!(length > 1e-12)) continue;
    const da = result.disp?.[a.id] || [0, 0, 0];
    const db = result.disp?.[b.id] || [0, 0, 0];
    const du = [
      (Number(db[0]) || 0) - (Number(da[0]) || 0),
      (Number(db[1]) || 0) - (Number(da[1]) || 0),
      (Number(db[2]) || 0) - (Number(da[2]) || 0),
    ];
    const axialForce = compressionAxialForce(demand);
    const localChordDriftY = dot3(du, axes.y);
    const localChordDriftZ = dot3(du, axes.z);
    const pDeltaShearY = axialForce * localChordDriftY / length;
    const pDeltaShearZ = axialForce * localChordDriftZ / length;
    const pDeltaShear = Math.hypot(pDeltaShearY, pDeltaShearZ);
    const critical = memberEulerCriticalLoad(model, member, length);
    const axialRatio = critical > 1e-12 ? axialForce / critical : null;
    rows.push({
      loadFactor,
      memberId: member.id,
      axialForce,
      length,
      localChordDriftY,
      localChordDriftZ,
      localChordDrift: Math.hypot(localChordDriftY, localChordDriftZ),
      pDeltaShearY,
      pDeltaShearZ,
      pDeltaShear,
      pDeltaMomentY: axialForce * localChordDriftZ,
      pDeltaMomentZ: axialForce * localChordDriftY,
      criticalLoad: Number.isFinite(critical) && critical > 0 ? critical : null,
      axialRatio,
      amplificationB: axialRatio != null && axialRatio < 1 ? 1 / (1 - axialRatio) : null,
    });
  }
  return rows;
}


export function averageHorizontalDisplacementAtZ(model, result, z) {
  const nodes = (model.nodes || []).filter((node) => Math.abs((node.z || 0) - z) <= 1e-8);
  if (!nodes.length) return { x: 0, y: 0 };
  const sum = nodes.reduce((acc, node) => {
    const d = result?.disp?.[node.id] || [0, 0, 0];
    acc.x += Number(d[0]) || 0;
    acc.y += Number(d[1]) || 0;
    return acc;
  }, { x: 0, y: 0 });
  return { x: sum.x / nodes.length, y: sum.y / nodes.length };
}


export function storyCompressionLoad(model, result, bottomZ, topZ) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  let total = 0;
  for (const member of model.members || []) {
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    const demand = result?.memberResults?.[member.id];
    if (!a || !b || !demand) continue;
    const z1 = Number(a.z) || 0;
    const z2 = Number(b.z) || 0;
    if (Math.min(z1, z2) > bottomZ + 1e-8 || Math.max(z1, z2) < topZ - 1e-8) continue;
    const axes = demand.ax || memberAxes(a, b, member.localAxis);
    if (Math.abs(axes.x?.[2] || 0) < 0.5) continue;
    total += compressionAxialForce(demand);
  }
  return total;
}


export function storyShearVectors(model, factors = {}, levels = []) {
  const floorLoads = lateralFloorLoads(model, factors);
  const shears = new Map();
  for (const topZ of levels.slice(1)) {
    const shear = { x: 0, y: 0 };
    for (const [zKey, load] of floorLoads.entries()) {
      const z = Number(zKey);
      if (z >= topZ - 1e-8) {
        shear.x += load.x;
        shear.y += load.y;
      }
    }
    shears.set(topZ, shear);
  }
  return shears;
}


export function lateralFloorLoads(model, factors = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const members = Object.fromEntries((model.members || []).map((member) => [member.id, member]));
  const loadsByZ = new Map();
  const add = (z, x, y) => {
    if (!(Number.isFinite(z) && (Math.abs(x) > 1e-12 || Math.abs(y) > 1e-12))) return;
    const key = nearestLevelKey(model, z);
    const row = loadsByZ.get(key) || { x: 0, y: 0 };
    row.x += x;
    row.y += y;
    loadsByZ.set(key, row);
  };
  for (const load of model.loads || []) {
    const scale = Number(factors[load.case || 'LC1'] ?? 0);
    if (!scale) continue;
    const direction = dirVec(load);
    const hx = Number(direction[0]) || 0;
    const hy = Number(direction[1]) || 0;
    if (Math.hypot(hx, hy) <= 1e-12) continue;
    if (load.type === 'nodal') {
      const node = nodes[load.node];
      if (!node) continue;
      add(Number(node.z) || 0, hx * Number(load.P || 0) * scale, hy * Number(load.P || 0) * scale);
    } else if (load.type === 'point') {
      const member = members[load.member];
      const a = member ? nodes[member.n1] : null;
      const b = member ? nodes[member.n2] : null;
      if (!a || !b) continue;
      const t = Math.max(0, Math.min(1, Number(load.t ?? load.at ?? 0.5)));
      const p = Number(load.P || 0) * scale;
      add(Number(a.z) || 0, hx * p * (1 - t), hy * p * (1 - t));
      add(Number(b.z) || 0, hx * p * t, hy * p * t);
    } else if (load.type === 'udl') {
      const member = members[load.member];
      const a = member ? nodes[member.n1] : null;
      const b = member ? nodes[member.n2] : null;
      if (!a || !b) continue;
      const length = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
      const total = Number(load.w || 0) * length * scale;
      add(Number(a.z) || 0, hx * total * 0.5, hy * total * 0.5);
      add(Number(b.z) || 0, hx * total * 0.5, hy * total * 0.5);
    }
  }
  return loadsByZ;
}


export function nearestLevelKey(model, z) {
  const levels = uniqueSorted((model.nodes || []).map((node) => Number(node.z) || 0));
  if (!levels.length) return Number(z.toFixed(8));
  return levels.reduce((best, level) => (
    Math.abs(level - z) < Math.abs(best - z) ? level : best
  ), levels[0]);
}


export function compressionAxialForce(memberResult) {
  const values = (memberResult?.N || [])
    .map((value) => Number(value))
    .filter(Number.isFinite);
  if (!values.length) return Math.max(0, -signedAxial(memberResult));
  return Math.max(0, ...values.map((value) => -value));
}


export function pDeltaDesignStatus(theta, caution = 0.05, require = 0.1, strong = 0.2) {
  const value = Number(theta) || 0;
  if (value >= strong || value >= 1) return 'NG';
  if (value >= require) return 'REQUIRE-2ND';
  if (value >= caution) return 'CAUTION';
  return 'OK';
}


export function worstStatus(statuses = []) {
  if (statuses.includes('NG')) return 'NG';
  if (statuses.includes('REQUIRE-2ND')) return 'REQUIRE-2ND';
  if (statuses.includes('CAUTION') || statuses.includes('WARN')) return 'CAUTION';
  if (statuses.includes('OK')) return 'OK';
  return 'N/A';
}


export function pDeltaLegacyStatus(status) {
  if (status === 'NG') return 'NG';
  if (status === 'CAUTION' || status === 'REQUIRE-2ND' || status === 'WARN') return 'WARN';
  if (status === 'OK') return 'OK';
  return 'N/A';
}


export function pDeltaThetaDesignEligibility(rows, status, direct) {
  const failed = rows.find((row) => row.converged === false);
  if (failed) {
    return {
      eligible: false,
      status: 'blocked',
      reason: failed.reason || 'PDELTA_NOT_CONVERGED',
      source: 'pdelta-theta-screening',
    };
  }
  if (status === 'NG') {
    return {
      eligible: false,
      status: 'blocked',
      reason: 'PDELTA_THETA_LIMIT_EXCEEDED',
      source: 'pdelta-theta-screening',
    };
  }
  if (status === 'REQUIRE-2ND' && !direct) {
    return {
      eligible: false,
      status: 'blocked',
      reason: 'PDELTA_SECOND_ORDER_REQUIRED',
      source: 'pdelta-theta-screening',
    };
  }
  return {
    eligible: true,
    status: 'qualified',
    reason: null,
    source: 'pdelta-theta-screening',
  };
}


export function memberEulerCriticalLoad(model, member, length) {
  const material = materialOf(model, member.matId);
  const section = sectionOf(model, member.secId);
  const ky = positiveNumber(member.Ky, member.design?.Ky, model.designSettings?.defaultKy, model.analysisSettings?.defaultKy, 1);
  const kz = positiveNumber(member.Kz, member.design?.Kz, model.designSettings?.defaultKz, model.analysisSettings?.defaultKz, 1);
  const pcry = section.Iy > 0 ? (Math.PI ** 2 * material.E * section.Iy) / ((ky * length) ** 2) : null;
  const pcrz = section.Iz > 0 ? (Math.PI ** 2 * material.E * section.Iz) / ((kz * length) ** 2) : null;
  const candidates = [pcry, pcrz].filter((value) => value > 0 && Number.isFinite(value));
  return candidates.length ? Math.min(...candidates) : 0;
}


export function summarizeSinglePDeltaCurve(globalPoints, stories, members) {
  const storyPoints = stories.flatMap((item) => item.points || []);
  const memberPoints = members.flatMap((item) => item.points || []);
  return {
    loadStepCount: globalPoints.length,
    maxRoofDisplacement: Math.max(0, ...globalPoints.map((point) => point.secondOrder?.roofDisplacement || 0)),
    maxRoofDriftRatio: Math.max(0, ...globalPoints.map((point) => point.secondOrder?.roofDriftRatio || 0)),
    maxBaseShear: Math.max(0, ...globalPoints.map((point) => point.secondOrder?.baseShear || 0)),
    maxStoryStabilityIndex: Math.max(0, ...storyPoints.map((point) => point.stabilityIndex || 0)),
    maxMemberPDeltaShear: Math.max(0, ...memberPoints.map((point) => point.pDeltaShear || 0)),
    maxMemberAxialRatio: Math.max(0, ...memberPoints.map((point) => point.axialRatio || 0).filter(Number.isFinite)),
  };
}


export function summarizePDeltaCurves(byCombo) {
  const curves = Object.entries(byCombo || {}).map(([comboId, item]) => ({ comboId, curve: item.curve })).filter((item) => item.curve);
  return {
    version: 'pdelta-curve-summary-v1',
    combos: curves.map(({ comboId, curve }) => ({
      comboId,
      globalPointCount: curve.global?.points?.length || 0,
      storyCount: curve.stories?.length || 0,
      memberCount: curve.members?.length || 0,
      summary: curve.summary,
    })),
    global: curves.map(({ comboId, curve }) => ({ comboId, points: curve.global?.points || [] })),
  };
}


export function modelVerticalBounds(model) {
  const zs = (model.nodes || []).map((node) => Number(node.z) || 0);
  const minZ = zs.length ? Math.min(...zs) : 0;
  const maxZ = zs.length ? Math.max(...zs) : 0;
  return { minZ, maxZ, height: Math.max(0, maxZ - minZ) };
}


export function uniqueSorted(values) {
  const next = [];
  for (const value of values) {
    if (!next.some((item) => Math.abs(item - value) <= 1e-8)) next.push(value);
  }
  return next.sort((a, b) => a - b);
}


export function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}


export function constraintNodeIds(constraint = {}) {
  return [...new Set([
    constraint.master?.node,
    constraint.slave?.node,
    ...(constraint.terms || []).map((term) => term?.node),
  ].filter((id) => id != null))];
}


export function dot3(a, b) {
  return (Number(a?.[0]) || 0) * (Number(b?.[0]) || 0)
    + (Number(a?.[1]) || 0) * (Number(b?.[1]) || 0)
    + (Number(a?.[2]) || 0) * (Number(b?.[2]) || 0);
}


export function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}


export function nonnegativeNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return 0;
}


export function summarizePDelta(byCombo) {
  let governing = null;
  let convergedCount = 0;
  let maxAmplification = 1;
  let maxStoryStabilityIndex = 0;
  let maxMemberAxialRatio = 0;
  for (const [comboId, item] of Object.entries(byCombo || {})) {
    if (item.converged) convergedCount += 1;
    if (Number(item.amplification) > maxAmplification) maxAmplification = item.amplification;
    if (Number(item.curve?.summary?.maxStoryStabilityIndex) > maxStoryStabilityIndex) {
      maxStoryStabilityIndex = item.curve.summary.maxStoryStabilityIndex;
    }
    if (Number(item.curve?.summary?.maxMemberAxialRatio) > maxMemberAxialRatio) {
      maxMemberAxialRatio = item.curve.summary.maxMemberAxialRatio;
    }
    if (!governing || Number(item.amplification) > Number(governing.amplification)) {
      governing = { comboId, amplification: item.amplification, converged: item.converged, reason: item.reason };
    }
  }
  return {
    convergedCount,
    comboCount: Object.keys(byCombo || {}).length,
    maxAmplification,
    maxStoryStabilityIndex,
    maxMemberAxialRatio,
    governing,
  };
}
