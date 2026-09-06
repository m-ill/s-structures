import { stableHash } from '../../core/stableHash.js';
import { expandConstraintDisplacements } from '../../solver/domain/constraintSystem.js';
import { recoverDynamicInertia } from '../dynamics/massDomain.js';
import { buildNonlinearResultDependencies } from './governance.js';

export const NONLINEAR_INTEGRATED_RESULT_VERSION = 'p8-m9-integrated-result-v1';
export const NONLINEAR_RESULT_ADAPTER_VERSION = 'p8-m9-result-adapter-v1';

export const NONLINEAR_RESULT_DIMENSIONS = Object.freeze({
  displacement: 'length',
  rotation: 'radian',
  force: 'force',
  moment: 'force*length',
  stress: 'force/length^2',
  strain: 'dimensionless',
  energy: 'force*length',
  time: 'time',
  acceleration: 'length/time^2',
});

export function recoverIntegratedNonlinearState(input = {}) {
  const { domain, evaluation } = input;
  if (!domain?.constraint?.ok || !evaluation?.ok) {
    const error = new TypeError('Canonical domain and successful equilibrium evaluation are required.');
    error.code = 'NONLINEAR_RESULT_RECOVERY_INPUT_INVALID';
    throw error;
  }
  const displacement = evaluation.u || expandConstraintDisplacements(domain.constraint, evaluation.q || []);
  const originByMember = new Map((domain.originMap?.members || []).map((row) => [row.generatedId, row]));
  const nodes = recoverNodes(domain, evaluation, displacement);
  const members = recoverMembers(domain, evaluation, originByMember);
  const sources = recoverSources(members);
  const stories = recoverStories(domain, evaluation, displacement, input.massDomain, {
    analysisType: input.analysisType || 'nonlinear-static',
    groundAcceleration: input.groundAcceleration,
  });
  const closure = recoverClosureAudits(domain, evaluation, members, input.convergence);
  const provenance = {
    version: NONLINEAR_RESULT_ADAPTER_VERSION,
    analysisType: input.analysisType || 'nonlinear-static',
    caseId: input.analysisCase?.id || domain.analysisCase?.id || null,
    step: input.step ?? null,
    time: input.time ?? null,
    loadFactor: evaluation.lambda ?? null,
    domainIdentityHash: domain.identity.identityHash,
    responseHash: evaluation.responseHash || null,
    capabilityHash: input.capability?.capabilityHash || null,
  };
  const dependencies = buildNonlinearResultDependencies({
    model: input.model || domain.solverModel,
    analysisCase: input.analysisCase || domain.analysisCase,
    domain,
    massDomain: input.massDomain,
    loadSetHash: input.loadSetHash,
    step: input.step,
    time: input.time,
    resultDimensions: NONLINEAR_RESULT_DIMENSIONS,
  });
  const core = {
    version: NONLINEAR_INTEGRATED_RESULT_VERSION,
    adapterVersion: NONLINEAR_RESULT_ADAPTER_VERSION,
    ok: closure.ok,
    analysisType: provenance.analysisType,
    dimensions: NONLINEAR_RESULT_DIMENSIONS,
    unitSystem: clone(domain.metadata?.unitSystem || null),
    nodes,
    members,
    stories,
    sources,
    supportResponses: clone(evaluation.supportResponses || {}),
    audits: closure,
    provenance,
    dependencies,
    limitations: sourceLimitations(sources),
  };
  return deepFreeze({ ...core, integrationHash: stableHash(core).slice(0, 24) });
}

export function recoverNonlinearHistoryEnvelope(input = {}) {
  const { domain, history } = input;
  if (!domain?.constraint?.ok || !history) {
    const error = new TypeError('Canonical domain and dynamic history are required.');
    error.code = 'NONLINEAR_HISTORY_RECOVERY_INPUT_INVALID';
    throw error;
  }
  const nodeEnvelopes = new Map();
  const memberEnvelopes = new Map();
  const storyEnvelopes = new Map();
  const eventProvenance = [];
  let retainedOutputStepCount = 0;
  for (const chunk of history.retainedChunks || []) {
    for (const row of chunk.rows || []) {
      retainedOutputStepCount += 1;
      const full = row.q?.length === domain.constraint.reducedDofCount
        ? expandConstraintDisplacements(domain.constraint, row.q)
        : null;
      if (full) {
        domain.nodes.forEach((node, nodeIndex) => {
          const target = nodeEnvelopes.get(node.id) || createVectorEnvelope(6);
          updateVectorEnvelope(target, full.slice(nodeIndex * 6, nodeIndex * 6 + 6), row);
          nodeEnvelopes.set(node.id, target);
        });
        const storyRows = recoverStories(domain, {
          pExternalFull: new Float64Array(domain.constraint.fullDofCount),
          a: row.a,
        }, full, input.massDomain, {
          analysisType: 'nonlinear-time-history',
          groundAcceleration: row.groundAcceleration,
        });
        for (const story of storyRows) {
          const target = storyEnvelopes.get(story.storyId) || createStoryEnvelope(story);
          updateVectorEnvelope(target.displacement, story.displacement, row);
          updateVectorEnvelope(target.drift, story.drift, row);
          updateVectorEnvelope(target.driftRatio, story.driftRatio, row);
          updateVectorEnvelope(target.shear, story.shear, row);
          updateVectorEnvelope(target.torsion, [story.torsion], row);
          storyEnvelopes.set(story.storyId, target);
        }
      }
      for (const [memberId, member] of Object.entries(row.elements || {})) {
        const target = memberEnvelopes.get(memberId) || {
          localResistingForce: createVectorEnvelope(12),
          hinges: {},
          distributedFiber: {},
        };
        updateVectorEnvelope(target.localResistingForce, member.localResistingForce || [], row);
        for (const hinge of member.hinges || []) {
          const id = hinge.id || `${hinge.end || 'end'}:${hinge.axis || 'axis'}`;
          const current = target.hinges[id] || { state: 'elastic', stateRank: 0, maxAbsRotation: 0, maxAbsMoment: 0 };
          const rank = hingeStateRank(hinge.state);
          if (rank > current.stateRank) {
            current.state = hinge.state;
            current.stateRank = rank;
            current.stateTime = row.time;
            current.stateOutputStep = row.outputStep;
            eventProvenance.push({ memberId, hingeId: id, state: hinge.state, time: row.time, outputStep: row.outputStep });
          }
          if (Math.abs(Number(hinge.rotation || 0)) > current.maxAbsRotation) {
            current.maxAbsRotation = Math.abs(Number(hinge.rotation || 0));
            current.rotationTime = row.time;
          }
          if (Math.abs(Number(hinge.moment || 0)) > current.maxAbsMoment) {
            current.maxAbsMoment = Math.abs(Number(hinge.moment || 0));
            current.momentTime = row.time;
          }
          target.hinges[id] = current;
        }
        for (const point of member.distributedFiber?.points || []) {
          const id = point.id || `station:${point.station}`;
          const current = target.distributedFiber[id] || { maxYieldedFiberCount: 0, station: point.station };
          if (Number(point.yieldedFiberCount || 0) > current.maxYieldedFiberCount) {
            current.maxYieldedFiberCount = Number(point.yieldedFiberCount || 0);
            current.time = row.time;
            current.outputStep = row.outputStep;
          }
          target.distributedFiber[id] = current;
        }
        memberEnvelopes.set(memberId, target);
      }
    }
  }
  const originByMember = new Map((domain.originMap?.members || []).map((row) => [row.generatedId, row]));
  const complete = retainedOutputStepCount === Number(history.outputStepCount || 0);
  const core = {
    version: NONLINEAR_INTEGRATED_RESULT_VERSION,
    historyVersion: history.version || null,
    historyHash: history.manifestHash || null,
    outputStepCount: history.outputStepCount || 0,
    retainedOutputStepCount,
    complete,
    nodes: Object.fromEntries([...nodeEnvelopes].map(([id, row]) => [id, finalizeVectorEnvelope(row)])),
    members: Object.fromEntries([...memberEnvelopes].map(([id, row]) => [id, {
      memberId: id,
      origin: clone(originByMember.get(id) || { originType: 'member', originId: id }),
      localResistingForce: finalizeVectorEnvelope(row.localResistingForce),
      hinges: row.hinges,
      distributedFiber: row.distributedFiber,
    }])),
    stories: Object.fromEntries([...storyEnvelopes].map(([id, row]) => [id, finalizeStoryEnvelope(row)])),
    eventProvenance,
    sourceEnvelope: clone(history.envelopes || {}),
    limitations: complete ? [] : ['Structured node/member/story envelopes cover retained history chunks only.'],
  };
  return deepFreeze({ ...core, envelopeHash: stableHash(core).slice(0, 24) });
}

function recoverNodes(domain, evaluation, displacement) {
  return Object.fromEntries(domain.nodes.map((node, index) => [node.id, {
    nodeId: node.id,
    coordinates: [Number(node.x || 0), Number(node.y || 0), Number(node.z || 0)],
    displacement: namedVector(displacement, index, ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']),
    externalLoad: namedVector(evaluation.pExternalFull, index, ['fx', 'fy', 'fz', 'mx', 'my', 'mz']),
    reaction: namedVector(evaluation.reactionsFull, index, ['fx', 'fy', 'fz', 'mx', 'my', 'mz']),
    constraintReaction: namedVector(evaluation.constraintReactionsFull, index, ['fx', 'fy', 'fz', 'mx', 'my', 'mz']),
    supportReaction: namedVector(evaluation.supportReactionsFull, index, ['fx', 'fy', 'fz', 'mx', 'my', 'mz']),
    storyId: domain.metadata?.nodeStory?.[node.id] || null,
  }]));
}

function recoverMembers(domain, evaluation, originByMember) {
  const descriptorById = new Map((domain.elements || []).map((row) => [row.id, row]));
  return Object.fromEntries(Object.entries(evaluation.elementResponses || {}).sort(([a], [b]) => a.localeCompare(b)).map(([memberId, response]) => {
    const descriptor = descriptorById.get(memberId) || {};
    const local = response.localResponse || {};
    const origin = originByMember.get(memberId) || {
      generatedId: memberId,
      generated: descriptor.generated === true,
      originType: descriptor.origin?.type || 'member',
      originId: descriptor.origin?.id || memberId,
      formulation: descriptor.origin?.formulation || 'native-frame',
      qualification: descriptor.origin?.qualification || 'production-frame',
    };
    const endForces = Array.from(local.referenceResistingForce || local.resistingForce || [], Number);
    const currentEndForces = Array.from(local.resistingForce || [], Number);
    const stationRecovery = reconcileMemberStations(local.stations, endForces);
    const stationAudit = auditMemberStations(stationRecovery.stations, endForces);
    const releasedForceAudit = auditReleasedForces(descriptor.releases?.localDofs || [], endForces);
    return [memberId, {
      memberId,
      nodeIds: clone(descriptor.nodeIds || []),
      behavior: descriptor.behavior || descriptor.type || null,
      generated: origin.generated === true,
      origin: clone(origin),
      localAxes: clone(local.currentAxes || local.referenceAxes || descriptor.geometry?.axes || null),
      referenceAxes: clone(local.referenceAxes || descriptor.geometry?.axes || null),
      endForces,
      currentEndForces,
      stations: clone(stationRecovery.stations),
      stationRecovery: clone(stationRecovery.trace),
      releases: clone(descriptor.releases || null),
      hinges: clone(local.hinges || []),
      distributedFiber: clone(local.distributedFiber || null),
      energies: clone(response.energies || {}),
      audits: { stationClosure: stationAudit, releasedForces: releasedForceAudit },
    }];
  }));
}

function recoverSources(members) {
  const groups = new Map();
  for (const member of Object.values(members)) {
    const origin = member.origin || {};
    const key = `${origin.originType || 'member'}:${origin.originId || member.memberId}`;
    const group = groups.get(key) || {
      originType: origin.originType || 'member',
      originId: origin.originId || member.memberId,
      formulation: origin.formulation || 'native-frame',
      qualification: origin.qualification || 'production-frame',
      memberIds: [],
      shellStressAvailable: false,
      resultType: origin.originType === 'member' ? 'frame-member-forces' : 'equivalent-frame-forces',
    };
    group.memberIds.push(member.memberId);
    groups.set(key, group);
  }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => [key, {
    ...row,
    memberIds: row.memberIds.sort(),
  }]));
}

function recoverStories(domain, evaluation, displacement, massDomain, options = {}) {
  const stories = domain.metadata?.stories || [];
  const nodeIndex = new Map(domain.nodes.map((node, index) => [node.id, index]));
  const masses = nodalMassDiagonal(massDomain, domain.nodes.length);
  const dynamicInertia = options.analysisType === 'nonlinear-time-history'
    && massDomain?.ok
    && evaluation.a?.length === domain.constraint.reducedDofCount
    ? recoverDynamicInertia(massDomain, domain, evaluation.a, options.groundAcceleration || [0, 0, 0])
    : null;
  let previous = [0, 0, 0];
  return stories.map((story) => {
    const indices = story.nodeIds.map((id) => nodeIndex.get(id)).filter((index) => index != null);
    const average = averageTranslations(displacement, indices);
    const drift = average.map((value, axis) => value - previous[axis]);
    previous = average;
    const center = storyCenter(domain.nodes, indices, masses);
    const above = domain.nodes.flatMap((node, index) => Number(node.z || 0) >= Number(story.topZ) - 1e-9 ? [{ node, index }] : []);
    const force = [0, 0, 0];
    let torsion = 0;
    for (const row of above) {
      const base = row.index * 6;
      const f = [0, 1, 2].map((axis) => dynamicInertia
        ? -Number(dynamicInertia.inertiaFull?.[base + axis] || 0)
        : Number(evaluation.pExternalFull?.[base + axis] || 0));
      force.forEach((_value, axis) => { force[axis] += f[axis]; });
      const nodalTorsion = dynamicInertia
        ? -Number(dynamicInertia.inertiaFull?.[base + 5] || 0)
        : Number(evaluation.pExternalFull?.[base + 5] || 0);
      torsion += nodalTorsion
        + (Number(row.node.x || 0) - center.x) * f[1]
        - (Number(row.node.y || 0) - center.y) * f[0];
    }
    return {
      storyId: story.id,
      index: story.index,
      baseZ: story.baseZ,
      topZ: story.topZ,
      height: story.height,
      nodeIds: [...story.nodeIds],
      displacement: average,
      drift,
      driftRatio: drift.map((value) => Number(story.height) > 0 ? value / Number(story.height) : 0),
      shear: force,
      torsion,
      responseSource: dynamicInertia ? 'absolute-inertia-above-story' : 'external-loads-above-story',
      centerOfMass: center,
    };
  });
}

function createStoryEnvelope(story) {
  return {
    storyId: story.storyId,
    index: story.index,
    baseZ: story.baseZ,
    topZ: story.topZ,
    height: story.height,
    nodeIds: [...story.nodeIds],
    responseSource: story.responseSource,
    displacement: createVectorEnvelope(3),
    drift: createVectorEnvelope(3),
    driftRatio: createVectorEnvelope(3),
    shear: createVectorEnvelope(3),
    torsion: createVectorEnvelope(1),
  };
}

function finalizeStoryEnvelope(row) {
  return {
    storyId: row.storyId,
    index: row.index,
    baseZ: row.baseZ,
    topZ: row.topZ,
    height: row.height,
    nodeIds: [...row.nodeIds],
    responseSource: row.responseSource,
    displacement: finalizeVectorEnvelope(row.displacement),
    drift: finalizeVectorEnvelope(row.drift),
    driftRatio: finalizeVectorEnvelope(row.driftRatio),
    shear: finalizeVectorEnvelope(row.shear),
    torsion: finalizeVectorEnvelope(row.torsion)[0],
  };
}

function recoverClosureAudits(domain, evaluation, members, convergence = null) {
  const reconstructed = new Float64Array(domain.constraint.fullDofCount);
  for (const [memberId, response] of Object.entries(evaluation.elementResponses || {})) {
    const descriptor = domain.elements.find((row) => row.id === memberId);
    const force = response.globalResponse?.resistingForce || response.globalResponse?.generalizedResistingForce || [];
    if (!descriptor || force.length !== descriptor.fullDofs.length) continue;
    descriptor.fullDofs.forEach((dof, index) => { reconstructed[dof] += Number(force[index]); });
  }
  Array.from(evaluation.supportInternalFull || []).forEach((value, index) => { reconstructed[index] += Number(value); });
  const target = evaluation.pInternalFull || [];
  const closure = Array.from(reconstructed, (value, index) => value - Number(target[index] || 0));
  const scale = Math.max(1, maxAbs(target));
  const relative = maxAbs(closure) / scale;
  const stationRows = Object.values(members).map((member) => ({ memberId: member.memberId, ...member.audits.stationClosure }));
  const releaseRows = Object.values(members).map((member) => ({ memberId: member.memberId, ...member.audits.releasedForces }));
  const tolerance = 1e-7;
  const reducedMaximum = maxAbs(evaluation.residualReduced || []);
  const reducedScale = Math.max(
    1,
    maxAbs(evaluation.pExternalReduced || []),
    maxAbs(evaluation.pInternalReduced || []),
    maxAbs(evaluation.staticResidualReduced || []),
    maxAbs(evaluation.pGroundReduced || []),
    maxAbs(evaluation.massForceReduced || []),
    maxAbs(evaluation.dampingForceReduced || []),
  );
  const reducedRelative = reducedMaximum / reducedScale;
  const recordedForceRatio = Number(convergence?.ratios?.force);
  const hasRecordedConvergence = Number.isFinite(recordedForceRatio);
  const reducedOk = hasRecordedConvergence
    ? recordedForceRatio <= 1
    : reducedMaximum <= 1e-6 || reducedRelative <= tolerance;
  const core = {
    ok: evaluation.audit?.ok !== false
      && reducedOk
      && relative <= tolerance
      && stationRows.every((row) => row.ok)
      && releaseRows.every((row) => row.ok),
    globalEquilibrium: clone(evaluation.audit || null),
    reducedResidual: {
      ok: reducedOk,
      mode: evaluation.staticResidualReduced ? 'dynamic' : 'static',
      maximum: reducedMaximum,
      relative: reducedRelative,
      scale: reducedScale,
      absoluteTolerance: 1e-6,
      relativeTolerance: tolerance,
      acceptanceBasis: hasRecordedConvergence ? 'solver-recorded-force-and-moment-limits' : 'integration-default-limits',
      solverConvergence: clone(convergence),
      vector: Array.from(evaluation.residualReduced || [], Number),
    },
    elementNodeClosure: {
      ok: relative <= tolerance,
      maximum: maxAbs(closure),
      relative,
      tolerance,
    },
    stationClosure: stationRows,
    releasedForces: releaseRows,
  };
  return { ...core, auditHash: stableHash(core).slice(0, 24) };
}

function auditMemberStations(stations, endForces) {
  if (!stations?.xs?.length || endForces.length !== 12) return { ok: true, available: false, maximum: 0, tolerance: 1e-7 };
  const { first, last } = expectedStationEnds(endForces);
  const names = ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz'];
  const actualFirst = names.map((name) => Number(stations[name]?.[0] || 0));
  const actualLast = names.map((name) => Number(stations[name]?.at(-1) || 0));
  const errors = [...actualFirst.map((value, index) => value - first[index]), ...actualLast.map((value, index) => value - last[index])];
  const scale = Math.max(1, maxAbs(endForces), ...names.map((name) => maxAbs(stations[name] || [])));
  const relative = maxAbs(errors) / scale;
  const tolerance = 1e-7;
  return { ok: relative <= tolerance, available: true, maximum: maxAbs(errors), relative, tolerance };
}

function reconcileMemberStations(stations, endForces) {
  if (!stations?.xs?.length || endForces.length !== 12) {
    return { stations: clone(stations || null), trace: { available: false, method: null, maximumCorrection: 0 } };
  }
  const names = ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz'];
  const { first, last } = expectedStationEnds(endForces);
  const xs = Array.from(stations.xs, Number);
  const x0 = xs[0];
  const span = Math.max(Number.EPSILON, xs.at(-1) - x0);
  const corrected = { ...clone(stations), xs };
  const corrections = {};
  let maximumCorrection = 0;
  names.forEach((name, component) => {
    const source = Array.from(stations[name] || [], Number);
    if (source.length !== xs.length) return;
    const firstCorrection = first[component] - source[0];
    const lastCorrection = last[component] - source.at(-1);
    corrected[name] = source.map((value, index) => {
      const ratio = (xs[index] - x0) / span;
      const correction = firstCorrection * (1 - ratio) + lastCorrection * ratio;
      maximumCorrection = Math.max(maximumCorrection, Math.abs(correction));
      return value + correction;
    });
    corrections[name] = { first: firstCorrection, last: lastCorrection };
  });
  return {
    stations: corrected,
    trace: {
      available: true,
      method: 'reference-end-force-linear-geometric-closure-correction',
      maximumCorrection,
      corrections,
      rawClosure: auditMemberStations(stations, endForces),
    },
  };
}

function expectedStationEnds(endForces) {
  return {
    first: [
      -endForces[0],
      -endForces[1],
      -endForces[2],
      -endForces[3],
      endForces[4],
      -endForces[5],
    ],
    last: endForces.slice(6, 12),
  };
}

function auditReleasedForces(releases, endForces) {
  if (!releases.length || endForces.length !== 12) return { ok: true, available: false, maximum: 0, tolerance: 1e-7 };
  const maximum = Math.max(...releases.map((dof) => Math.abs(Number(endForces[dof] || 0))));
  const scale = Math.max(1, maxAbs(endForces));
  const relative = maximum / scale;
  const tolerance = 1e-7;
  return { ok: relative <= tolerance, available: true, localDofs: [...releases], maximum, relative, tolerance };
}

function nodalMassDiagonal(massDomain, nodeCount) {
  const rows = Array.from({ length: nodeCount }, () => [0, 0, 0]);
  const matrix = massDomain?.fullMatrix;
  if (!matrix?.colPtr) return rows;
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
      const row = matrix.rowIdx[pointer];
      if (row !== column || row % 6 >= 3) continue;
      rows[Math.floor(row / 6)][row % 6] += Number(matrix.values[pointer]);
    }
  }
  return rows;
}

function storyCenter(nodes, indices, masses) {
  const weights = indices.map((index) => Math.max(0, ...masses[index]));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const useMass = total > 0;
  const denominator = useMass ? total : Math.max(1, indices.length);
  return {
    x: indices.reduce((sum, index, position) => sum + Number(nodes[index].x || 0) * (useMass ? weights[position] : 1), 0) / denominator,
    y: indices.reduce((sum, index, position) => sum + Number(nodes[index].y || 0) * (useMass ? weights[position] : 1), 0) / denominator,
    mass: total,
    method: useMass ? 'translational-mass-matrix-diagonal' : 'geometric-centroid',
  };
}

function averageTranslations(full, indices) {
  if (!indices.length) return [0, 0, 0];
  return [0, 1, 2].map((axis) => indices.reduce((sum, index) => sum + Number(full[index * 6 + axis] || 0), 0) / indices.length);
}

function namedVector(values, nodeIndex, names) {
  const base = nodeIndex * 6;
  return Object.fromEntries(names.map((key, index) => [key, Number(values?.[base + index] || 0)]));
}

function sourceLimitations(sources) {
  const rows = Object.values(sources);
  const limitations = [];
  if (rows.some((row) => row.originType === 'shell')) limitations.push('Shell results are equivalent frame-link forces; shell stress and strain are not reported.');
  if (rows.some((row) => row.originType === 'wall')) limitations.push('Wall results are preliminary mid-pier equivalent-member forces.');
  if (rows.some((row) => row.originType === 'diaphragm')) limitations.push('Semi-rigid diaphragm results are equivalent brace-link forces.');
  return limitations;
}

function createVectorEnvelope(length) {
  return Array.from({ length }, () => ({ minimum: Infinity, maximum: -Infinity, absoluteMaximum: 0 }));
}

function updateVectorEnvelope(target, values, row) {
  Array.from(values).forEach((raw, index) => {
    if (!target[index]) target[index] = { minimum: Infinity, maximum: -Infinity, absoluteMaximum: 0 };
    const value = Number(raw);
    if (value < target[index].minimum) {
      target[index].minimum = value;
      target[index].minimumTime = row.time;
      target[index].minimumOutputStep = row.outputStep;
    }
    if (value > target[index].maximum) {
      target[index].maximum = value;
      target[index].maximumTime = row.time;
      target[index].maximumOutputStep = row.outputStep;
    }
    if (Math.abs(value) > target[index].absoluteMaximum) {
      target[index].absoluteMaximum = Math.abs(value);
      target[index].absoluteMaximumTime = row.time;
      target[index].absoluteMaximumOutputStep = row.outputStep;
    }
  });
}

function finalizeVectorEnvelope(target) {
  return target.map((row) => ({
    ...row,
    minimum: Number.isFinite(row.minimum) ? row.minimum : 0,
    maximum: Number.isFinite(row.maximum) ? row.maximum : 0,
  }));
}

function hingeStateRank(state) {
  return ({ elastic: 0, yielded: 1, capping: 2, residual: 3, failure: 4 })[state] || 0;
}

function maxAbs(values) {
  return Array.from(values || []).reduce((maximum, value) => Math.max(maximum, Math.abs(Number(value) || 0)), 0);
}

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
