import { deriveStories } from '../../core/storyModel.js';
import { combineModalResponseValues } from '../../dynamics/modal.js';

export const RSA_STORY_RESPONSE_VERSION = 'p7-m9-rsa-story-response-v1';

const STORY_DIMENSIONS = Object.freeze({
  elevation: 'length',
  height: 'length',
  displacement: 'length',
  drift: 'length',
  driftRatio: 'dimensionless',
  floorForce: 'force',
  storyShear: 'force',
  torsion: 'moment',
  overturning: 'moment',
  scaleFactor: 'dimensionless',
});

export function buildRsaStoryResponse(model = {}, analysis = {}, options = {}) {
  const rsa = resolveRsa(analysis);
  const stories = deriveStories(model);
  const units = storyUnits(model, rsa);
  const analysisCaseId = options.analysisCaseId || rsa?.provenance?.analysisCaseId || null;
  const baseProvenance = {
    source: 'rsa-modal-nodal-response',
    analysisCaseId,
    analysisCaseKind: 'responseSpectrum',
    resultPath: rsa?.provenance?.resultPath || 'analysis.dynamics.rsa',
    staticCaseReferences: [],
  };
  if (!rsa) return unavailable('RSA_RESPONSE_UNAVAILABLE', stories, units, baseProvenance);
  if (!stories.length) return unavailable('STORY_LEVELS_UNAVAILABLE', stories, units, baseProvenance);

  const method = normalizedMethod(rsa.method);
  const dampingRatio = finite(rsa?.spectrum?.dampingRatio, 0.05);
  const nodeById = new Map((model.nodes || []).map((node) => [node.id, node]));
  const directionRows = [];
  const blockedDirections = [];

  for (const modalDirection of rsa.modal || []) {
    const direction = String(modalDirection?.direction || '').toLowerCase();
    const responses = modalDirection?.responses || [];
    if (!direction || !responses.length || !responses.every(hasNodalRecovery)) {
      if (direction) blockedDirections.push(direction);
      continue;
    }
    const scaleFactor = directionScaleFactor(direction, options, rsa);
    const responseMaps = responses.map((response) => ({
      response,
      displacement: rowsToMap(response.nodalDisplacements),
      force: rowsToMap(response.nodalInertiaForces?.length ? response.nodalInertiaForces : response.inertiaForces),
    }));
    const floorEffects = responseMaps.map((responseMap) => stories.map((story) => (
      modalFloorEffect(story, nodeById, responseMap)
    )));

    for (let storyIndex = 0; storyIndex < stories.length; storyIndex += 1) {
      const story = stories[storyIndex];
      const beforeDrift = combinedStoryDrift({
        story,
        model,
        nodeById,
        responseMaps,
        method,
        dampingRatio,
        scaleFactor: 1,
      });
      const beforeFloorForce = combineVectorQuantity(
        responses,
        (responseIndex, component) => floorEffects[responseIndex][storyIndex].force[component],
        method,
        dampingRatio,
      );
      const beforeCumulativeShear = combineVectorQuantity(
        responses,
        (responseIndex, component) => floorEffects[responseIndex]
          .slice(storyIndex)
          .reduce((sum, item) => sum + item.force[component], 0),
        method,
        dampingRatio,
      );
      const beforeFloorTorsionMz = combineQuantity(
        responses,
        (responseIndex) => floorEffects[responseIndex][storyIndex].torsionMz,
        method,
        dampingRatio,
      );
      const beforeStoryTorsionMz = combineQuantity(
        responses,
        (responseIndex) => modalStoryTorsion(floorEffects[responseIndex], storyIndex),
        method,
        dampingRatio,
      );
      const beforeOverturningX = combineQuantity(
        responses,
        (responseIndex) => modalOverturning(stories, floorEffects[responseIndex], storyIndex)[0],
        method,
        dampingRatio,
      );
      const beforeOverturningY = combineQuantity(
        responses,
        (responseIndex) => modalOverturning(stories, floorEffects[responseIndex], storyIndex)[1],
        method,
        dampingRatio,
      );
      const drift = scaleDrift(beforeDrift, scaleFactor);
      const floorForce = beforeFloorForce.map((value) => value * scaleFactor);
      const cumulativeShear = beforeCumulativeShear.map((value) => value * scaleFactor);
      const floorTorsionMz = beforeFloorTorsionMz * scaleFactor;
      const storyTorsionMz = beforeStoryTorsionMz * scaleFactor;
      const overturningX = beforeOverturningX * scaleFactor;
      const overturningY = beforeOverturningY * scaleFactor;
      const responseId = `${analysisCaseId || 'RSA'}:${direction.toUpperCase()}`;
      const beforeValue = {
        driftX: beforeDrift.driftX,
        driftY: beforeDrift.driftY,
        driftZ: beforeDrift.driftZ,
        drift: beforeDrift.drift,
        driftRatio: story.height > 0 ? beforeDrift.drift / story.height : 0,
        forceX: beforeFloorForce[0],
        forceY: beforeFloorForce[1],
        forceZ: beforeFloorForce[2],
        cumulativeShearX: beforeCumulativeShear[0],
        cumulativeShearY: beforeCumulativeShear[1],
        cumulativeShearZ: beforeCumulativeShear[2],
        floorTorsionMz: beforeFloorTorsionMz,
        storyTorsionMz: beforeStoryTorsionMz,
        overturningX: beforeOverturningX,
        overturningY: beforeOverturningY,
      };
      const scaled = scaleFactor !== 1;
      const provenance = {
        ...baseProvenance,
        direction,
        responseMethod: method,
        modalCombination: method,
        dampingRatio,
        modeIds: responses.map((response) => response.mode),
        scaling: {
          applied: scaled,
          factor: scaleFactor,
          scaled,
          scaleFactor,
          beforeValue,
          values: Object.fromEntries(Object.entries(beforeValue).map(([key, value]) => [key, {
            scaled,
            scaleFactor,
            beforeValue: value,
          }])),
          source: 'rsa-base-shear-scale-trace',
        },
        torsionReference: 'story-level geometric center',
        overturningReference: 'story-base elevation using lateral nodal inertia forces',
        staticCaseReferences: [],
      };
      directionRows.push({
        responseId,
        comboId: responseId,
        analysisCaseId,
        direction,
        responseMethod: method,
        story: story.index,
        storyId: story.id,
        storyName: story.name,
        lowerZ: story.baseZ,
        upperZ: story.topZ,
        z: story.topZ,
        height: story.height,
        scaleFactor,
        driftX: drift.driftX,
        driftY: drift.driftY,
        driftZ: drift.driftZ,
        drift: drift.drift,
        driftRatio: story.height > 0 ? drift.drift / story.height : 0,
        lowerNode: drift.lowerNode,
        upperNode: drift.upperNode,
        forceX: floorForce[0],
        forceY: floorForce[1],
        forceZ: floorForce[2],
        torsionCenter: floorEffects[0][storyIndex].center,
        floorTorsionMz,
        cumulativeShearX: cumulativeShear[0],
        cumulativeShearY: cumulativeShear[1],
        cumulativeShearZ: cumulativeShear[2],
        storyTorsionMz,
        torsionMz: storyTorsionMz,
        overturningX,
        overturningY,
        dimensions: STORY_DIMENSIONS,
        units,
        provenance,
      });
    }
  }

  if (!directionRows.length) {
    return unavailable(
      blockedDirections.length ? 'RSA_NODAL_RESPONSE_RECOVERY_UNAVAILABLE' : 'RSA_MODAL_DIRECTIONS_UNAVAILABLE',
      stories,
      units,
      baseProvenance,
      blockedDirections,
    );
  }
  const warnings = blockedDirections.map((direction) => `${direction.toUpperCase()}: RSA nodal response recovery unavailable.`);
  return {
    version: RSA_STORY_RESPONSE_VERSION,
    status: blockedDirections.length ? 'partial' : 'available',
    designBlocked: blockedDirections.length > 0,
    reason: blockedDirections.length ? 'ONE_OR_MORE_RSA_DIRECTIONS_LACK_NODAL_RECOVERY' : null,
    source: 'rsa-modal-nodal-response',
    responseMethod: method,
    dimensions: STORY_DIMENSIONS,
    units,
    rows: directionRows,
    warnings,
    blockedDirections,
    provenance: {
      ...baseProvenance,
      responseMethod: method,
      baseShearScaling: rsa?.baseShearScaling?.application || null,
      staticCaseReferences: [],
    },
    summary: {
      storyCount: stories.length,
      directionCount: new Set(directionRows.map((row) => row.direction)).size,
      rowCount: directionRows.length,
      staticReferenceCount: 0,
      status: blockedDirections.length ? 'partial' : 'available',
    },
  };
}

function combinedStoryDrift({
  story,
  model,
  nodeById,
  responseMaps,
  method,
  dampingRatio,
  scaleFactor,
}) {
  const pairs = verticalPairs(model, story, nodeById);
  const candidates = pairs.map((pair) => {
    const values = [0, 1, 2].map((component) => combineQuantity(
      responseMaps.map((item) => item.response),
      (responseIndex) => {
        const upper = responseMaps[responseIndex].displacement.get(pair.upper.id) || [0, 0, 0];
        const lower = responseMaps[responseIndex].displacement.get(pair.lower.id) || [0, 0, 0];
        return finite(upper[component]) - finite(lower[component]);
      },
      method,
      dampingRatio,
    ) * scaleFactor);
    return {
      lowerNode: pair.lower.id,
      upperNode: pair.upper.id,
      driftX: values[0],
      driftY: values[1],
      driftZ: values[2],
      drift: Math.hypot(values[0], values[1]),
    };
  });
  if (candidates.length) {
    return candidates.reduce((best, row) => (row.drift > best.drift ? row : best), candidates[0]);
  }

  const upperIds = story.nodeIds || [];
  const lowerIds = nodesAtElevation(model, story.baseZ).map((node) => node.id);
  const values = [0, 1, 2].map((component) => combineQuantity(
    responseMaps.map((item) => item.response),
    (responseIndex) => averageComponent(responseMaps[responseIndex].displacement, upperIds, component)
      - averageComponent(responseMaps[responseIndex].displacement, lowerIds, component),
    method,
    dampingRatio,
  ) * scaleFactor);
  return {
    lowerNode: null,
    upperNode: null,
    driftX: values[0],
    driftY: values[1],
    driftZ: values[2],
    drift: Math.hypot(values[0], values[1]),
  };
}

function modalFloorEffect(story, nodeById, responseMap) {
  const nodes = (story.nodeIds || []).map((id) => nodeById.get(id)).filter(Boolean);
  const center = geometricCenter(nodes);
  const force = [0, 0, 0];
  let torsionMz = 0;
  for (const node of nodes) {
    const value = responseMap.force.get(node.id) || [0, 0, 0];
    force[0] += finite(value[0]);
    force[1] += finite(value[1]);
    force[2] += finite(value[2]);
    torsionMz += (finite(node.x) - center.x) * finite(value[1])
      - (finite(node.y) - center.y) * finite(value[0]);
  }
  return { force, torsionMz, center };
}

function modalOverturning(stories, effects, storyIndex) {
  const baseZ = finite(stories[storyIndex]?.baseZ);
  let x = 0;
  let y = 0;
  for (let index = storyIndex; index < stories.length; index += 1) {
    const lever = finite(stories[index]?.topZ) - baseZ;
    x -= finite(effects[index]?.force?.[1]) * lever;
    y += finite(effects[index]?.force?.[0]) * lever;
  }
  return [x, y];
}

function modalStoryTorsion(effects, storyIndex) {
  const reference = effects[storyIndex]?.center || { x: 0, y: 0 };
  return effects.slice(storyIndex).reduce((sum, item) => (
    sum
    + finite(item.torsionMz)
    + (finite(item.center?.x) - finite(reference.x)) * finite(item.force?.[1])
    - (finite(item.center?.y) - finite(reference.y)) * finite(item.force?.[0])
  ), 0);
}

function combineVectorQuantity(responses, valueOf, method, dampingRatio) {
  return [0, 1, 2].map((component) => combineQuantity(
    responses,
    (responseIndex) => valueOf(responseIndex, component),
    method,
    dampingRatio,
  ));
}

function combineQuantity(responses, valueOf, method, dampingRatio) {
  return combineModalResponseValues(
    responses,
    (_response, responseIndex) => valueOf(responseIndex),
    method,
    dampingRatio,
  );
}

function hasNodalRecovery(response) {
  const forceRows = response?.nodalInertiaForces?.length ? response.nodalInertiaForces : response?.inertiaForces;
  return response?.recoveryStatus !== 'unsupported'
    && Array.isArray(response?.nodalDisplacements)
    && response.nodalDisplacements.length > 0
    && Array.isArray(forceRows)
    && forceRows.length > 0;
}

function rowsToMap(rows) {
  return new Map((rows || []).map((row) => [row.nodeId, vectorOf(row)]));
}

function vectorOf(row) {
  if (Array.isArray(row?.vector)) return row.vector.slice(0, 3).map((value) => finite(value));
  return [finite(row?.x), finite(row?.y), finite(row?.z)];
}

function verticalPairs(model, story, nodeById) {
  const lower = nodesAtElevation(model, story.baseZ);
  return (story.nodeIds || [])
    .map((id) => nodeById.get(id))
    .filter(Boolean)
    .map((upper) => ({
      upper,
      lower: lower.find((node) => samePlanLocation(node, upper)),
    }))
    .filter((pair) => pair.lower);
}

function nodesAtElevation(model, elevation) {
  return (model.nodes || []).filter((node) => Math.abs(finite(node.z) - finite(elevation)) <= 1e-6);
}

function samePlanLocation(a, b) {
  return Math.abs(finite(a.x) - finite(b.x)) <= 1e-6
    && Math.abs(finite(a.y) - finite(b.y)) <= 1e-6;
}

function geometricCenter(nodes) {
  if (!nodes.length) return { x: 0, y: 0 };
  return {
    x: nodes.reduce((sum, node) => sum + finite(node.x), 0) / nodes.length,
    y: nodes.reduce((sum, node) => sum + finite(node.y), 0) / nodes.length,
  };
}

function averageComponent(map, ids, component) {
  if (!ids.length) return 0;
  return ids.reduce((sum, id) => sum + finite(map.get(id)?.[component]), 0) / ids.length;
}

function directionScaleFactor(direction, options, rsa = null) {
  const direct = options.rsaScaleFactors?.[direction] ?? options.scaleFactors?.[direction];
  if (Number.isFinite(Number(direct)) && Number(direct) > 0) return Number(direct);
  const trace = options.baseShearScaling || rsa?.baseShearScaling;
  const row = trace?.rows?.find((item) => item.direction === direction);
  if (Number.isFinite(Number(row?.appliedScaleFactor)) && Number(row.appliedScaleFactor) > 0) {
    return Number(row.appliedScaleFactor);
  }
  if (trace?.application?.enabled === false) return 1;
  return Number.isFinite(Number(row?.scaleFactor)) && Number(row.scaleFactor) > 0 ? Number(row.scaleFactor) : 1;
}

function scaleDrift(drift, factor) {
  return {
    ...drift,
    driftX: drift.driftX * factor,
    driftY: drift.driftY * factor,
    driftZ: drift.driftZ * factor,
    drift: drift.drift * factor,
  };
}

function resolveRsa(analysis) {
  if (analysis?.dynamics?.rsa) return analysis.dynamics.rsa;
  if (analysis?.rsa?.modal && analysis?.rsa?.combined) return analysis.rsa;
  if (analysis?.modal && analysis?.combined && analysis?.method) return analysis;
  return null;
}

function normalizedMethod(value) {
  const method = String(value || 'SRSS').trim().toUpperCase().replace(/[\s_%\-]/g, '');
  if (method === 'CQC') return 'CQC';
  if (method === 'ABS' || method === 'ABSOLUTE') return 'ABS';
  if (['NRC', 'NRC10', '10PCT', '10PERCENT'].includes(method)) return 'NRC10';
  return 'SRSS';
}

function storyUnits(model, rsa) {
  const length = rsa?.units?.length || rsa?.units?.displacement || model?.units?.length || 'm';
  const force = rsa?.units?.force || rsa?.units?.baseShear || model?.units?.force || 'kN';
  return {
    elevation: length,
    height: length,
    displacement: length,
    drift: length,
    driftRatio: '1',
    floorForce: force,
    storyShear: force,
    torsion: model?.units?.moment || `${force}.${length}`,
    overturning: model?.units?.moment || `${force}.${length}`,
    scaleFactor: '1',
  };
}

function unavailable(reason, stories, units, provenance, blockedDirections = []) {
  return {
    version: RSA_STORY_RESPONSE_VERSION,
    status: 'unsupported',
    designBlocked: true,
    reason,
    source: 'rsa-modal-nodal-response',
    responseMethod: null,
    dimensions: STORY_DIMENSIONS,
    units,
    rows: [],
    warnings: [reason],
    blockedDirections,
    provenance: { ...provenance, staticCaseReferences: [] },
    summary: {
      storyCount: stories.length,
      directionCount: 0,
      rowCount: 0,
      staticReferenceCount: 0,
      status: 'unsupported',
    },
  };
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
