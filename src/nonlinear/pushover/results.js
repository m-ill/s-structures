import { stableHash } from '../../core/stableHash.js';
import { evaluatePhysicalControlCoordinate } from '../equilibrium/displacementControl.js';

export const PRODUCTION_PUSHOVER_RESULT_VERSION = 'p8-m5-production-pushover-result-v1';
export const PUSHOVER_ARC_LENGTH_HANDOFF_VERSION = 'p8-m5-arc-length-handoff-v1';

const STATE_RANK = Object.freeze({
  origin: 0,
  elastic: 0,
  'elastic-unloading': 0,
  yielded: 1,
  capping: 2,
  residual: 3,
  failure: 4,
});

export function recoverPushoverStep(input = {}) {
  const { domain, evaluation, loadSet } = input;
  if (!domain?.constraint?.ok || !evaluation?.ok || !loadSet?.lateral) {
    throw resultError('PUSHOVER_STEP_RECOVERY_INPUT_INVALID', 'Domain, accepted evaluation, and load set are required.');
  }
  const direction = loadSet.lateral.directionVector;
  const lambda = Number(evaluation.lambda || 0);
  const control = input.control;
  const controlDisplacement = control?.reducedVector
    ? evaluatePhysicalControlCoordinate(control, evaluation.q)
    : Number(input.controlDisplacement || 0);
  const appliedBaseShear = lambda * Number(loadSet.referenceResultant || loadSet.lateral.referenceBaseShear || 0);
  const reactionDelta = subtractVectors(evaluation.reactionsFull, input.gravityBaselineReactions);
  const reactionProjection = projectNodeVector(reactionDelta, direction, domain.nodes.length);
  const reactionBaseShear = Math.abs(reactionProjection) <= Number.EPSILON ? 0 : -reactionProjection;
  const baseShearResidual = Math.abs(appliedBaseShear - reactionBaseShear);
  const baseShearScale = Math.max(1, Math.abs(appliedBaseShear), Math.abs(reactionBaseShear));
  const hinges = recoverHinges(evaluation);
  const members = recoverMembers(evaluation);
  const stories = recoverStoryResponse(domain, evaluation, loadSet, direction);
  const roofDisplacement = recoverRoofDisplacement(domain, evaluation.u, direction);
  const overturning = recoverOverturning(domain, loadSet.loadPattern.referenceFull, direction, lambda, loadSet.lateral.baseElevation);
  const core = {
    version: PRODUCTION_PUSHOVER_RESULT_VERSION,
    step: Number(input.step || 0),
    accepted: true,
    lambda,
    loadFactor: lambda,
    controlDisplacement,
    targetDisplacement: Number(input.targetDisplacement ?? controlDisplacement),
    roofDisplacement,
    baseShear: reactionBaseShear,
    appliedBaseShear,
    reactionBaseShear,
    baseShearResidual,
    baseShearRelativeResidual: baseShearResidual / baseShearScale,
    overturning,
    convergence: clone(input.convergence || null),
    audit: clone(evaluation.audit || null),
    forceResidualNorm: maxAbs(evaluation.residualReduced),
    energies: clone(evaluation.energies || {}),
    stories,
    members,
    hinges: hinges.rows,
    memberStates: hinges.memberStates,
    yieldedHingeCount: hinges.counts.yielded,
    cappingHingeCount: hinges.counts.capping,
    residualHingeCount: hinges.counts.residual,
    failedHingeCount: hinges.counts.failure,
    plasticHingeCount: hinges.rows.filter((row) => stateRank(row.state) >= 1).length,
    hingeEvents: clone(input.hingeEvents || []),
    responseHash: evaluation.responseHash || null,
  };
  return Object.freeze({ ...core, stepHash: stableHash(core).slice(0, 24) });
}

export function buildProductionPushoverResult(input = {}) {
  const rows = (input.steps || []).map((row) => clone(row));
  const acceptedRows = rows.filter((row) => row.accepted !== false);
  const events = classifyPushoverEvents(acceptedRows, input.options);
  const termination = classifyTermination(input.controlResult, events, input.options);
  const final = acceptedRows.at(-1) || null;
  const peak = events.find((event) => event.type === 'peak') || null;
  const firstYield = events.find((event) => event.type === 'first-yield') || null;
  const mechanism = events.find((event) => event.type === 'mechanism') || null;
  const warnings = [];
  if (!firstYield) warnings.push({ code: 'PUSHOVER_NO_YIELD', message: 'No hinge reached yield before termination.' });
  if (termination.category === 'nonconvergence' || termination.category === 'instability') {
    warnings.push({ code: termination.reason, message: termination.message });
  }
  const provenance = {
    version: PRODUCTION_PUSHOVER_RESULT_VERSION,
    engineId: input.engine?.id || null,
    engineVersion: input.engine?.version || null,
    domainHashes: clone(input.domain?.hashes || input.domain?.identity || null),
    gravityRunRecordId: input.gravity?.runRecord?.id || null,
    gravityCheckpointHash: input.gravity?.checkpoint?.integrityHash || null,
    gravityCombinationId: input.loadSet?.gravity?.id || null,
    loadSetHash: input.loadSet?.loadSetHash || null,
    lateralPatternHash: input.loadSet?.lateral?.patternHash || null,
    controlCoordinateHash: input.control?.coordinateHash || null,
    hingeRegistryHash: input.hingeResolution?.registryHash || null,
    hingeAssignmentHash: input.hingeResolution?.contentHash || null,
    solver: input.controlResult?.version || null,
    backend: input.backend?.id || input.controlResult?.acceptedSteps?.at(-1)?.backend || null,
    fallbackUsed: false,
  };
  const summary = {
    stepCount: acceptedRows.length,
    rejectedStepCount: input.controlResult?.rejectedStepCount || 0,
    maxBaseShear: Math.max(0, ...acceptedRows.map((row) => Math.abs(row.baseShear))),
    maxControlDisplacement: Math.max(0, ...acceptedRows.map((row) => Math.abs(row.controlDisplacement))),
    maxRoofDisplacement: Math.max(0, ...acceptedRows.map((row) => Math.abs(row.roofDisplacement))),
    peakStep: peak?.step ?? null,
    firstYieldStep: firstYield?.step ?? null,
    mechanismStep: mechanism?.step ?? null,
    plasticMemberCount: Object.values(final?.memberStates || {}).filter((row) => row.overall !== 'elastic').length,
    yieldedMemberCount: Object.values(final?.memberStates || {}).filter((row) => row.overall === 'yielded').length,
    ultimateMemberCount: Object.values(final?.memberStates || {}).filter((row) => ['capping', 'residual', 'failure'].includes(row.overall)).length,
    terminationReason: termination.reason,
  };
  const arcLengthHandoff = buildArcLengthHandoff(input, termination, final);
  const core = {
    version: PRODUCTION_PUSHOVER_RESULT_VERSION,
    ok: termination.success,
    status: termination.success ? 'ok' : termination.category,
    qualification: 'candidate',
    designBlocked: true,
    designBlockReason: 'P8-M5_COMPONENT_CANDIDATE_REQUIRES_LATER_QUALIFICATION',
    modelBound: true,
    engine: clone(input.engine || null),
    controlNodeId: input.control?.nodeId || null,
    direction: input.loadSet?.lateral?.direction || null,
    pattern: input.loadSet?.lateral?.type || null,
    referenceBaseShear: input.loadSet?.lateral?.referenceBaseShear || 0,
    gravity: {
      combinationId: input.loadSet?.gravity?.id || null,
      runRecord: clone(input.gravity?.runRecord || null),
      analysisState: clone(input.gravity?.analysisState || null),
      continuity: clone(input.gravity?.continuity || null),
    },
    summary,
    control: {
      version: input.controlResult?.version || null,
      status: input.controlResult?.status || null,
      reason: input.controlResult?.reason || null,
      targetDisplacement: input.controlResult?.targetDisplacement ?? null,
      finalDisplacement: input.controlResult?.finalDisplacement ?? null,
      finalLambda: input.controlResult?.finalLambda ?? null,
      acceptedStepCount: input.controlResult?.acceptedStepCount || 0,
      rejectedStepCount: input.controlResult?.rejectedStepCount || 0,
      rejectedSteps: clone(input.controlResult?.rejectedSteps || []),
    },
    termination,
    events,
    firstYield,
    peak,
    mechanism,
    capacityCurve: acceptedRows,
    curve: acceptedRows.map(legacyCurvePoint),
    steps: acceptedRows,
    memberStates: clone(final?.memberStates || {}),
    storyResponse: clone(final?.stories || []),
    memberResults: clone(final?.members || {}),
    hingeResults: clone(final?.hinges || []),
    arcLengthHandoff,
    provenance,
    warnings,
    limitations: [
      'P8-M5 qualifies gravity-preloaded displacement-control static response as a candidate component.',
      'Arc-length path continuation remains P8-M7 scope.',
      'Coupled PMM/fiber response remains P8-M6 scope.',
      'Independent commercial and pilot qualification remains P8-M11 scope.',
    ],
  };
  return Object.freeze({ ...core, resultHash: stableHash(core).slice(0, 24) });
}

export function classifyPushoverEvents(steps = [], options = {}) {
  const events = [];
  let yielded = false;
  let peak = null;
  for (const row of steps) {
    const shear = Math.abs(Number(row.baseShear || 0));
    if (!peak || shear > peak.baseShear) peak = { step: row.step, baseShear: shear, controlDisplacement: row.controlDisplacement };
    if (!yielded && row.hinges?.some((hinge) => stateRank(hinge.state) >= 1)) {
      yielded = true;
      events.push({
        type: 'first-yield',
        step: row.step,
        controlDisplacement: row.controlDisplacement,
        baseShear: row.baseShear,
        hingeIds: row.hinges.filter((hinge) => stateRank(hinge.state) >= 1).map((hinge) => hinge.id),
      });
    }
    const mechanismIds = Array.isArray(options.mechanismHingeIds) ? options.mechanismHingeIds : [];
    const plasticIds = new Set((row.hinges || []).filter((hinge) => stateRank(hinge.state) >= 1).map((hinge) => hinge.id));
    const countThreshold = Number(options.mechanismHingeCount);
    const mechanism = mechanismIds.length
      ? mechanismIds.every((id) => plasticIds.has(id))
      : Number.isFinite(countThreshold) && countThreshold > 0 && plasticIds.size >= countThreshold;
    if (mechanism && !events.some((event) => event.type === 'mechanism')) {
      events.push({ type: 'mechanism', step: row.step, controlDisplacement: row.controlDisplacement, baseShear: row.baseShear, hingeIds: [...plasticIds].sort() });
    }
  }
  if (peak) events.push({ type: 'peak', ...peak });
  const peakEvent = events.find((event) => event.type === 'peak');
  const threshold = bounded(options.postPeakRatio, 0.8, 0.05, 1);
  if (peakEvent) {
    const postPeak = steps.find((row) => row.step > peakEvent.step && Math.abs(Number(row.baseShear || 0)) <= peakEvent.baseShear * threshold);
    if (postPeak) events.push({
      type: 'post-peak-threshold',
      step: postPeak.step,
      controlDisplacement: postPeak.controlDisplacement,
      baseShear: postPeak.baseShear,
      threshold,
      peakBaseShear: peakEvent.baseShear,
    });
  }
  for (const row of steps) {
    for (const event of row.hingeEvents || []) {
      if (!['yield', 'capping', 'residual', 'failure'].includes(event.type)) continue;
      events.push({
        type: `hinge-${event.type}`,
        step: row.step,
        controlDisplacement: row.controlDisplacement,
        baseShear: row.baseShear,
        memberId: event.memberId,
        hingeId: event.hingeId,
        end: event.end,
        axis: event.axis,
      });
    }
  }
  return events.sort((a, b) => Number(a.step || 0) - Number(b.step || 0) || String(a.type).localeCompare(String(b.type)));
}

export function hingeSummary(evaluation) {
  return recoverHinges(evaluation);
}

function classifyTermination(controlResult = {}, events = [], options = {}) {
  const explicit = controlResult.termination?.reason || controlResult.reason || 'UNKNOWN';
  const mechanism = events.find((event) => event.type === 'mechanism');
  const postPeak = events.find((event) => event.type === 'post-peak-threshold');
  if (explicit === 'MECHANISM_DETECTED' || mechanism) return termination('MECHANISM_DETECTED', 'mechanism', true, 'Plastic mechanism criterion was reached.');
  if (explicit === 'POST_PEAK_THRESHOLD' || postPeak) return termination('POST_PEAK_THRESHOLD', 'post-peak', true, 'Post-peak strength threshold was reached.');
  if (explicit === 'TARGET_REACHED') return termination('TARGET_REACHED', 'target', true, 'Requested control displacement was reached.');
  if (explicit === 'ANALYSIS_CANCELLED') return termination(explicit, 'cancelled', false, 'Analysis was cancelled at a committed boundary.');
  if (/SINGULAR|INSTABILITY|NEGATIVE_PIVOT|MECHANISM/.test(explicit)) return termination(explicit, 'instability', false, 'The tangent path became unstable or singular.');
  if (/MINIMUM|MAX_ITERATIONS|LINE_SEARCH|ATTEMPT_LIMIT/.test(explicit)) return termination(explicit, 'nonconvergence', false, 'The displacement-control path did not converge within the configured limits.');
  if (options.acceptExplicitTermination === true && controlResult.ok) return termination(explicit, 'explicit', true, 'Analysis stopped by an accepted explicit rule.');
  return termination(explicit, controlResult.ok ? 'explicit' : 'failed', !!controlResult.ok, controlResult.ok ? 'Accepted explicit termination.' : 'Pushover analysis failed.');
}

function buildArcLengthHandoff(input, termination, final) {
  const eligible = ['post-peak', 'instability'].includes(termination.category)
    || input.options?.prepareArcLengthHandoff === true;
  const core = {
    version: PUSHOVER_ARC_LENGTH_HANDOFF_VERSION,
    eligible,
    status: eligible ? 'prepared' : 'not-required',
    sourceControl: 'augmented-displacement-control',
    sourceStateHash: input.controlResult?.stateStore?.committedHash || null,
    sourceCheckpointHash: input.handoffCheckpoint?.integrityHash || null,
    controlCoordinateHash: input.control?.coordinateHash || null,
    lastStepHash: final?.stepHash || null,
    lambda: final?.lambda ?? null,
    controlDisplacement: final?.controlDisplacement ?? null,
    reason: termination.reason,
    targetEngine: 'p8-m7-arc-length',
    checkpointRef: input.handoffCheckpoint?.integrityHash || null,
    committedState: input.handoffCheckpoint ? {
      committedHash: input.handoffCheckpoint.committedHash,
      q: clone(input.handoffCheckpoint.committed?.q || []),
      lambda: input.handoffCheckpoint.committed?.lambda ?? null,
      elementStates: clone(input.handoffCheckpoint.committed?.elementStates || {}),
      eventCursor: input.handoffCheckpoint.committed?.eventCursor ?? input.handoffCheckpoint.eventSequence ?? null,
    } : null,
  };
  return Object.freeze({ ...core, handoffHash: stableHash(core).slice(0, 24) });
}

function recoverHinges(evaluation) {
  const rows = [];
  const memberStates = {};
  const counts = { yielded: 0, capping: 0, residual: 0, failure: 0 };
  for (const [memberId, response] of Object.entries(evaluation.elementResponses || {})) {
    const hinges = response.localResponse?.hinges || [];
    const byEnd = { i: [], j: [] };
    for (const hinge of hinges) {
      const row = {
        id: hinge.id,
        memberId,
        propertyId: hinge.propertyId,
        end: hinge.end,
        axis: hinge.axis,
        rotation: Number(hinge.rotation || 0),
        moment: Number(hinge.moment || 0),
        tangent: Number(hinge.tangent || 0),
        state: hinge.state || 'elastic',
        point: hinge.point || null,
        branch: hinge.branch || null,
        events: clone(hinge.events || []),
        energies: clone(hinge.energies || {}),
        source: clone(hinge.source || null),
        qualification: hinge.qualification || null,
      };
      rows.push(row);
      byEnd[row.end]?.push(row);
      if (Object.hasOwn(counts, row.state)) counts[row.state] += 1;
    }
    const endState = (items) => items.sort((a, b) => stateRank(b.state) - stateRank(a.state))[0] || null;
    const i = endState(byEnd.i);
    const j = endState(byEnd.j);
    const overall = [i, j].filter(Boolean).sort((a, b) => stateRank(b.state) - stateRank(a.state))[0]?.state || 'elastic';
    memberStates[memberId] = {
      overall,
      i: { state: i?.state || 'elastic', ratio: legacyStateRatio(i?.state), hingeId: i?.id || null },
      j: { state: j?.state || 'elastic', ratio: legacyStateRatio(j?.state), hingeId: j?.id || null },
    };
  }
  rows.sort((a, b) => `${a.memberId}:${a.end}:${a.axis}`.localeCompare(`${b.memberId}:${b.end}:${b.axis}`));
  return { rows, memberStates, counts };
}

function recoverMembers(evaluation) {
  return Object.fromEntries(Object.entries(evaluation.elementResponses || {}).map(([memberId, response]) => [memberId, {
    memberId,
    global: clone(response.globalResponse || null),
    local: clone(response.localResponse || null),
    diagnostics: clone(response.diagnostics || null),
    energies: clone(response.energies || null),
  }]));
}

function recoverStoryResponse(domain, evaluation, loadSet, direction) {
  const levels = [...new Set(domain.nodes.map((node) => Number(node.z)))].sort((a, b) => a - b);
  if (levels.length < 2) return [];
  const displacementByLevel = new Map(levels.map((level) => {
    const indices = domain.nodes.flatMap((node, index) => Math.abs(Number(node.z) - level) <= 1e-9 ? [index] : []);
    const value = indices.reduce((sum, index) => sum + nodeProjection(evaluation.u, index, direction), 0) / Math.max(1, indices.length);
    return [level, value];
  }));
  return levels.slice(1).map((level, storyIndex) => {
    const below = levels[storyIndex];
    const nodesAbove = domain.nodes.flatMap((node, index) => Number(node.z) >= level - 1e-9 ? [{ node, index }] : []);
    const shear = nodesAbove.reduce((sum, row) => sum + nodeProjection(loadSet.loadPattern.referenceFull, row.index, direction) * Number(evaluation.lambda || 0), 0);
    const centroid = planCentroid(nodesAbove.map((row) => row.node));
    const torsion = nodesAbove.reduce((sum, row) => {
      const fx = Number(loadSet.loadPattern.referenceFull[row.index * 6] || 0) * Number(evaluation.lambda || 0);
      const fy = Number(loadSet.loadPattern.referenceFull[row.index * 6 + 1] || 0) * Number(evaluation.lambda || 0);
      const mz = Number(loadSet.loadPattern.referenceFull[row.index * 6 + 5] || 0) * Number(evaluation.lambda || 0);
      return sum + mz + (Number(row.node.x) - centroid.x) * fy - (Number(row.node.y) - centroid.y) * fx;
    }, 0);
    const displacement = displacementByLevel.get(level);
    const belowDisplacement = displacementByLevel.get(below);
    const height = level - below;
    return {
      story: storyIndex + 1,
      elevation: level,
      height,
      displacement,
      drift: displacement - belowDisplacement,
      driftRatio: height > 0 ? (displacement - belowDisplacement) / height : 0,
      shear,
      torsion,
      referencePoint: centroid,
      nodeIds: nodesAbove.filter((row) => Math.abs(Number(row.node.z) - level) <= 1e-9).map((row) => row.node.id).sort(),
    };
  });
}

function recoverRoofDisplacement(domain, fullDisplacement, direction) {
  const top = Math.max(...domain.nodes.map((node) => Number(node.z)));
  const indices = domain.nodes.flatMap((node, index) => Math.abs(Number(node.z) - top) <= 1e-9 ? [index] : []);
  return indices.reduce((sum, index) => sum + nodeProjection(fullDisplacement, index, direction), 0) / Math.max(1, indices.length);
}

function recoverOverturning(domain, referenceFull, direction, lambda, baseElevation) {
  let mx = 0;
  let my = 0;
  let mz = 0;
  domain.nodes.forEach((node, index) => {
    const r = [Number(node.x), Number(node.y), Number(node.z) - Number(baseElevation || 0)];
    const f = [0, 1, 2].map((axis) => Number(referenceFull[index * 6 + axis] || 0) * lambda);
    mx += r[1] * f[2] - r[2] * f[1];
    my += r[2] * f[0] - r[0] * f[2];
    mz += r[0] * f[1] - r[1] * f[0];
  });
  const horizontalMoment = Math.hypot(mx, my);
  return { mx, my, mz, magnitude: Math.hypot(mx, my, mz), lateralOverturning: horizontalMoment, direction: direction.slice() };
}

function projectNodeVector(full, direction, nodeCount) {
  let total = 0;
  for (let node = 0; node < nodeCount; node += 1) total += nodeProjection(full, node, direction);
  return total;
}

function nodeProjection(full, node, direction) {
  return [0, 1, 2].reduce((sum, axis) => sum + Number(full[node * 6 + axis] || 0) * Number(direction[axis]), 0);
}

function planCentroid(nodes) {
  if (!nodes.length) return { x: 0, y: 0 };
  return {
    x: nodes.reduce((sum, node) => sum + Number(node.x), 0) / nodes.length,
    y: nodes.reduce((sum, node) => sum + Number(node.y), 0) / nodes.length,
  };
}

function legacyCurvePoint(row) {
  return {
    step: row.step,
    loadFactor: row.lambda,
    baseShear: row.baseShear,
    controlDisplacement: row.controlDisplacement,
    plasticMemberCount: Object.values(row.memberStates || {}).filter((state) => state.overall !== 'elastic').length,
    yieldedMemberCount: Object.values(row.memberStates || {}).filter((state) => state.overall === 'yielded').length,
    ultimateMemberCount: Object.values(row.memberStates || {}).filter((state) => ['capping', 'residual', 'failure'].includes(state.overall)).length,
    ok: true,
  };
}

function termination(reason, category, success, message) {
  return { reason, category, success, message };
}

function stateRank(state) {
  return STATE_RANK[state] ?? 0;
}

function legacyStateRatio(state) {
  return ({ yielded: 1, capping: 1.25, residual: 1.5, failure: 2 })[state] || 0;
}

function maxAbs(values) {
  let maximum = 0;
  for (const value of values || []) maximum = Math.max(maximum, Math.abs(Number(value)));
  return maximum;
}

function bounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function subtractVectors(values, baseline) {
  if (baseline == null) return Float64Array.from(values || []);
  if (values?.length !== baseline.length) {
    throw resultError('PUSHOVER_REACTION_BASELINE_SIZE_MISMATCH', 'Gravity reaction baseline size does not match the accepted response.');
  }
  return Float64Array.from(values, (value, index) => Number(value) - Number(baseline[index]));
}

function resultError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
