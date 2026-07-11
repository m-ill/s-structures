export const INDEX_RESULT_VISUALS_VERSION = 'm13-index-result-visuals';

const AXIS = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

export function buildIndexResultVisuals(model, analysis, options = {}) {
  const nodes = model?.nodes || [];
  const members = model?.members || [];
  const resultChoice = pickResult(analysis, options.resultId);
  const result = resultChoice.result;
  const baseNodes = nodes.map((node) => ({
    id: node.id,
    x: number(node.x),
    y: number(node.y),
    z: number(node.z),
    support: node.support || null,
  }));
  const bounds = buildBounds(baseNodes);
  const disp = result?.disp || result?.nodeDisplacements || {};
  const maxDisplacement = maxVectorLength(Object.values(disp).map((value) => value?.slice?.(0, 3) || [0, 0, 0]));
  const deformScale = number(options.deformScale, autoDeformScale(bounds, maxDisplacement));
  const deformedNodes = baseNodes.map((node) => {
    const d = disp[node.id] || [0, 0, 0];
    return {
      id: node.id,
      x: node.x + number(d[0]) * deformScale,
      y: node.y + number(d[1]) * deformScale,
      z: node.z + number(d[2]) * deformScale,
      dx: number(d[0]),
      dy: number(d[1]),
      dz: number(d[2]),
    };
  });

  return {
    version: INDEX_RESULT_VISUALS_VERSION,
    resultId: resultChoice.id,
    ok: !!analysis?.ok,
    deformScale,
    maxDisplacement,
    bounds,
    nodes: baseNodes,
    deformedNodes,
    members: members.map((member) => memberVisual(member, result, analysis)),
    reactions: reactionVisuals(result),
    loads: loadVisuals(model),
    modal: modalVisuals(model, analysis, bounds, options),
    pDelta: pDeltaVisuals(analysis),
  };
}

export function summarizeIndexResultVisuals(visuals) {
  if (!visuals) {
    return {
      available: false,
      nodeCount: 0,
      memberCount: 0,
      reactionCount: 0,
      loadGlyphCount: 0,
      modalShapeCount: 0,
      pDeltaSeriesCount: 0,
    };
  }
  return {
    available: true,
    version: visuals.version,
    resultId: visuals.resultId,
    nodeCount: visuals.nodes.length,
    memberCount: visuals.members.length,
    reactionCount: visuals.reactions.length,
    loadGlyphCount: visuals.loads.length,
    modalShapeCount: visuals.modal.modes.length,
    pDeltaSeriesCount: visuals.pDelta.series.length,
    deformScale: visuals.deformScale,
    maxDisplacement: visuals.maxDisplacement,
  };
}

function pickResult(analysis, resultId) {
  if (!analysis) return { id: null, result: null };
  if (resultId === 'PDELTA_ENVELOPE') return { id: resultId, result: analysis.pDelta?.envelope || analysis.envelope || null };
  if (resultId?.startsWith?.('PDELTA:')) {
    const comboId = resultId.slice('PDELTA:'.length);
    return { id: resultId, result: analysis.pDelta?.byCombo?.[comboId]?.result || analysis.pDelta?.envelope || analysis.envelope || null };
  }
  if (resultId && resultId !== 'ENVELOPE') {
    return { id: resultId, result: analysis.byCombo?.[resultId] || analysis.envelope || null };
  }
  if (analysis.pDelta?.envelope) return { id: 'PDELTA_ENVELOPE', result: analysis.pDelta.envelope };
  if (analysis.envelope) return { id: 'ENVELOPE', result: analysis.envelope };
  const firstId = Object.keys(analysis.byCombo || {})[0] || null;
  return { id: firstId, result: firstId ? analysis.byCombo[firstId] : null };
}

function memberVisual(member, result, analysis) {
  const memberResult = result?.memberResults?.[member.id];
  const ratio = number(memberResult?.check?.ratio, designRatio(analysis, member.id));
  const status = utilizationStatus(ratio);
  return {
    id: member.id,
    n1: member.n1,
    n2: member.n2,
    role: member.design?.role || null,
    ratio,
    status,
    color: utilizationColor(status),
    maxForces: {
      n: number(memberResult?.Nmax),
      vy: number(memberResult?.Vymax),
      vz: number(memberResult?.Vzmax),
      my: number(memberResult?.Mymax),
      mz: number(memberResult?.Mzmax),
    },
  };
}

function designRatio(analysis, memberId) {
  const steel = analysis?.design?.steel?.memberResults?.[memberId]?.utilization;
  const concrete = analysis?.design?.concrete?.memberResults?.[memberId]?.utilization;
  return number(steel, number(concrete, 0));
}

function reactionVisuals(result) {
  return Object.entries(result?.reactions || {}).map(([nodeId, reaction]) => {
    const force = [number(reaction.rx), number(reaction.ry), number(reaction.rz)];
    const moment = [number(reaction.rmx), number(reaction.rmy), number(reaction.rmz)];
    return {
      nodeId,
      force,
      moment,
      forceMagnitude: vectorLength(force),
      momentMagnitude: vectorLength(moment),
    };
  });
}

function loadVisuals(model) {
  const nodeMap = new Map((model?.nodes || []).map((node) => [node.id, node]));
  const memberMap = new Map((model?.members || []).map((member) => [member.id, member]));
  return (model?.loads || []).map((load) => {
    const direction = load.direction || AXIS[load.dir] || [0, 0, 0];
    const magnitude = number(load.P, number(load.M, number(load.w, 0)));
    const node = load.node ? nodeMap.get(load.node) : null;
    const member = load.member ? memberMap.get(load.member) : null;
    return {
      id: load.id,
      type: load.type,
      case: load.case || null,
      nodeId: load.node || null,
      memberId: load.member || null,
      memberNodes: member ? [member.n1, member.n2] : [],
      at: node ? { x: number(node.x), y: number(node.y), z: number(node.z) } : null,
      direction: direction.slice(0, 3).map((item) => number(item)),
      magnitude,
      source: load.source || null,
    };
  });
}

function modalVisuals(model, analysis, bounds, options) {
  const modeScale = number(options.modeScale, Math.max(1, bounds.diagonal) * 0.08);
  return {
    modeScale,
    modes: (analysis?.dynamics?.modes || []).map((mode) => ({
      id: mode.id,
      index: mode.index,
      period: number(mode.period),
      frequencyHz: number(mode.frequencyHz),
      massX: number(mode.participation?.x?.massRatio),
      massY: number(mode.participation?.y?.massRatio),
      massZ: number(mode.participation?.z?.massRatio),
      shape: (model?.nodes || []).map((node) => {
        const d = mode.shape?.[node.id] || [0, 0, 0];
        return {
          nodeId: node.id,
          x: number(node.x) + number(d[0]) * modeScale,
          y: number(node.y) + number(d[1]) * modeScale,
          z: number(node.z) + number(d[2]) * modeScale,
          dx: number(d[0]),
          dy: number(d[1]),
          dz: number(d[2]),
        };
      }),
    })),
  };
}

function pDeltaVisuals(analysis) {
  return {
    enabled: !!analysis?.pDelta,
    series: Object.entries(analysis?.pDelta?.byCombo || {})
      .filter(([, item]) => item?.curve?.global?.points?.length)
      .map(([comboId, item]) => ({
        comboId,
        converged: !!item.converged,
        amplification: number(item.amplification, 1),
        kind: 'global-pdelta-response',
        points: item.curve.global.points.map((step, index) => ({
          index,
          loadFactor: number(step.loadFactor),
          amplification: number(step.amplification, 1),
          firstOrderRoofDisplacement: number(step.firstOrder?.roofDisplacement),
          secondOrderRoofDisplacement: number(step.secondOrder?.roofDisplacement),
          firstOrderBaseShear: number(step.firstOrder?.baseShear),
          secondOrderBaseShear: number(step.secondOrder?.baseShear),
          roofDriftRatio: number(step.secondOrder?.roofDriftRatio),
        })),
      })),
  };
}

function buildBounds(nodes) {
  if (!nodes.length) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
      diagonal: 0,
    };
  }
  const min = {
    x: Math.min(...nodes.map((node) => node.x)),
    y: Math.min(...nodes.map((node) => node.y)),
    z: Math.min(...nodes.map((node) => node.z)),
  };
  const max = {
    x: Math.max(...nodes.map((node) => node.x)),
    y: Math.max(...nodes.map((node) => node.y)),
    z: Math.max(...nodes.map((node) => node.z)),
  };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, diagonal: vectorLength([size.x, size.y, size.z]) };
}

function autoDeformScale(bounds, maxDisplacement) {
  if (!(maxDisplacement > 0)) return 1;
  return Math.max(1, bounds.diagonal) * 0.08 / maxDisplacement;
}

function utilizationStatus(ratio) {
  if (!(ratio > 0)) return 'none';
  if (ratio > 1) return 'ng';
  if (ratio >= 0.7) return 'warn';
  return 'ok';
}

function utilizationColor(status) {
  return {
    ok: '#1f8a58',
    warn: '#d98a1f',
    ng: '#c43c3c',
    none: '#7b8794',
  }[status] || '#7b8794';
}

function maxVectorLength(vectors) {
  return Math.max(0, ...vectors.map(vectorLength));
}

function vectorLength(vector) {
  return Math.hypot(number(vector[0]), number(vector[1]), number(vector[2]));
}

function number(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
