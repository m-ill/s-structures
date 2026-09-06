import { resolveCriterion } from '../core/analysisCriteria.js';

export const SLAB_LOAD_GENERATION_VERSION = 'p10-m10-slab-load-generation-v1';
export const DEFAULT_LOAD_GENERATION_EQUIL_TOL = 1e-10;

export function generateSlabPanelLoads(model = {}, options = {}) {
  const panels = options.panels || model.slabPanels || (model.slabs || []).filter((row) => row?.type === 'load-panel');
  const nodeById = new Map((model.nodes || []).map((node) => [String(node.id), node]));
  const memberByEdge = buildMemberEdgeMap(model.members || []);
  const generatedLoads = [];
  const panelsTrace = [];
  const warnings = [];
  const equilTol = finite(options.equilTol, resolveCriterion(model, 'loadgen.equilTol', DEFAULT_LOAD_GENERATION_EQUIL_TOL));

  for (const [panelIndex, panel] of panels.entries()) {
    const id = text(panel.id) || `SLAB-PANEL-${panelIndex + 1}`;
    const nodeIds = panel.nodeIds || panel.nodes || [];
    if (nodeIds.length !== 4) throw loadGenerationError('SLAB_PANEL_QUAD_REQUIRED', `${id} requires four ordered nodes.`);
    const nodes = nodeIds.map((nodeId) => nodeById.get(String(nodeId)));
    if (nodes.some((node) => !node)) throw loadGenerationError('SLAB_PANEL_NODE_NOT_FOUND', `${id} references a missing node.`);
    const geometry = panelGeometry(nodes);
    const intensity = Math.abs(finite(panel.load ?? panel.pressure ?? panel.intensity, NaN));
    if (!Number.isFinite(intensity)) throw loadGenerationError('SLAB_PANEL_LOAD_REQUIRED', `${id} requires a finite area load.`);
    const distribution = text(panel.distribution || 'two-way').toLowerCase();
    if (!['one-way', 'two-way'].includes(distribution)) throw loadGenerationError('SLAB_PANEL_DISTRIBUTION_INVALID', `${id} distribution must be one-way or two-way.`);
    const caseId = text(panel.case || panel.caseId) || 'D';
    const direction = text(panel.direction) || '-z';
    const edgePlans = distribution === 'one-way'
      ? oneWayEdgePlans(geometry, panel.directionAxis || panel.spanDirection || panel.oneWayDirection || 'x')
      : twoWayEdgePlans(geometry);
    const edgeTrace = [];
    let transferredLoad = 0;

    for (const plan of edgePlans) {
      const edge = geometry.edges[plan.edgeIndex];
      const member = memberByEdge.get(edgeKey(edge.a.id, edge.b.id));
      const segments = plan.segments(intensity);
      const edgeLoad = segments.reduce((sum, segment) => sum + segmentResultant(segment, edge.length), 0);
      transferredLoad += edgeLoad;
      if (member) {
        segments.forEach((segment, segmentIndex) => generatedLoads.push(memberLoad({
          panelId: id,
          edgeIndex: plan.edgeIndex,
          segmentIndex,
          memberId: member.id,
          segment,
          caseId,
          direction,
          sourceKind: panel.sourceKind || 'slab-area-load',
        })));
        edgeTrace.push(traceEdge(edge, plan, member.id, 'beam', edgeLoad, segments));
      } else {
        const recipientType = resolveFallbackRecipient(model, edge);
        generatedLoads.push(...fallbackNodalLoads({ id, edge, edgeIndex: plan.edgeIndex, edgeLoad, caseId, direction, recipientType, sourceKind: panel.sourceKind || 'slab-area-load' }));
        edgeTrace.push(traceEdge(edge, plan, null, recipientType, edgeLoad, segments));
        warnings.push({ code: 'SLAB_EDGE_BEAM_MISSING', panelId: id, edgeIndex: plan.edgeIndex, recipientType });
      }
    }
    const totalLoad = intensity * geometry.area;
    const equilibriumError = Math.abs(transferredLoad - totalLoad) / Math.max(totalLoad, 1);
    if (equilibriumError > equilTol) throw loadGenerationError('SLAB_LOAD_EQUILIBRIUM_FAILED', `${id} transfer equilibrium error ${equilibriumError} exceeds ${equilTol}.`);
    panelsTrace.push({
      panelId: id,
      distribution,
      direction,
      caseId,
      area: geometry.area,
      intensity,
      totalLoad,
      transferredLoad,
      equilibriumError,
      edgeTrace,
    });
  }

  const totalPanelLoad = panelsTrace.reduce((sum, row) => sum + row.totalLoad, 0);
  const totalTransferredLoad = panelsTrace.reduce((sum, row) => sum + row.transferredLoad, 0);
  return {
    version: SLAB_LOAD_GENERATION_VERSION,
    loads: generatedLoads,
    trace: {
      version: SLAB_LOAD_GENERATION_VERSION,
      panels: panelsTrace,
      warnings,
      summary: {
        panelCount: panelsTrace.length,
        generatedLoadCount: generatedLoads.length,
        totalPanelLoad,
        totalTransferredLoad,
        equilibriumError: Math.abs(totalTransferredLoad - totalPanelLoad) / Math.max(totalPanelLoad, 1),
        equilibriumTolerance: equilTol,
      },
    },
  };
}

export function deriveWindStoryTransfers(model = {}, options = {}) {
  const nodes = model.nodes || [];
  const stories = model.stories?.length ? model.stories : inferStoryElevations(nodes);
  const direction = text(options.direction || 'x').toLowerCase();
  if (!['x', 'y'].includes(direction)) throw loadGenerationError('WIND_DIRECTION_INVALID', 'Wind direction must be x or y.');
  const pressure = finite(options.pressure, 0);
  const leewardRatio = Math.max(0, finite(options.leewardRatio, 0));
  const planWidth = direction === 'x' ? coordinateRange(nodes, 'y') : coordinateRange(nodes, 'x');
  const rows = stories.map((story, index) => {
    const elevation = finite(story.z ?? story.elevation, 0);
    const previous = index ? finite(stories[index - 1].z ?? stories[index - 1].elevation, 0) : finite(options.baseElevation, 0);
    const storyHeight = Math.max(0, finite(story.height, elevation - previous));
    const tributaryWidth = positive(story.tributaryWidth) || positive(story.windTributaryWidth) || planWidth;
    const area = tributaryWidth * storyHeight;
    const windward = pressure * area;
    const leeward = -pressure * leewardRatio * area;
    return {
      story: story.id || `S${index + 1}`,
      direction,
      elevation,
      storyHeight,
      tributaryWidth,
      tributaryWidthSource: positive(story.tributaryWidth) || positive(story.windTributaryWidth) ? 'story-input' : 'model-geometry',
      area,
      windward,
      leeward,
      netForce: windward + leeward,
      signConvention: { windward: '+', leeward: '-' },
      formula: 'Atrib=planWidth*storyHeight; Fwindward=+p*Atrib; Fleeward=-p*leewardRatio*Atrib',
    };
  });
  return {
    version: 'p10-m10-wind-story-transfer-v1',
    direction,
    planWidth,
    rows,
    totalNetForce: rows.reduce((sum, row) => sum + row.netForce, 0),
  };
}

function oneWayEdgePlans(geometry, direction) {
  const axis = String(direction).toLowerCase().endsWith('y') ? 'y' : 'x';
  const candidates = geometry.edges.map((edge, edgeIndex) => ({ edge, edgeIndex, alignment: Math.abs((edge.b[axis] || 0) - (edge.a[axis] || 0)) / edge.length }));
  const supportEdges = candidates.sort((a, b) => a.alignment - b.alignment).slice(0, 2);
  const supportLength = supportEdges.reduce((sum, row) => sum + row.edge.length, 0) / 2;
  const span = geometry.area / Math.max(supportLength, 1e-12);
  return supportEdges.sort((a, b) => a.edgeIndex - b.edgeIndex).map(({ edgeIndex }) => ({
    edgeIndex,
    shape: 'uniform',
    segments: (q) => [{ from: 0, to: 1, w1: q * span / 2, w2: q * span / 2 }],
  }));
}

function twoWayEdgePlans(geometry) {
  const lengths = geometry.edges.map((edge) => edge.length);
  const shortLength = Math.min(...lengths);
  return geometry.edges.map((edge, edgeIndex) => {
    const isLongEdge = edge.length > shortLength * (1 + 1e-10);
    if (!isLongEdge) {
      return { edgeIndex, shape: 'triangular', segments: (q) => triangularSegments(q * shortLength / 2) };
    }
    return { edgeIndex, shape: 'trapezoidal', segments: (q) => trapezoidalSegments(q * shortLength / 2, shortLength / (2 * edge.length)) };
  });
}

function triangularSegments(peak) {
  return [
    { from: 0, to: 0.5, w1: 0, w2: peak },
    { from: 0.5, to: 1, w1: peak, w2: 0 },
  ];
}

function trapezoidalSegments(peak, rampRatio) {
  const r = Math.min(0.5, Math.max(0, rampRatio));
  if (Math.abs(r - 0.5) < 1e-12) return triangularSegments(peak);
  return [
    { from: 0, to: r, w1: 0, w2: peak },
    { from: r, to: 1 - r, w1: peak, w2: peak },
    { from: 1 - r, to: 1, w1: peak, w2: 0 },
  ];
}

function memberLoad({ panelId, edgeIndex, segmentIndex, memberId, segment, caseId, direction, sourceKind }) {
  const generatedKey = `p10-m10:${panelId}:edge-${edgeIndex}:segment-${segmentIndex}`;
  if (Math.abs(segment.w1 - segment.w2) < 1e-14 && segment.from === 0 && segment.to === 1) {
    return { id: generatedKey, generatedKey, type: 'udl', member: memberId, w: segment.w1, case: caseId, dir: direction, sourceKind, sourcePanelId: panelId };
  }
  return { id: generatedKey, generatedKey, type: 'trapezoid', member: memberId, w1: segment.w1, w2: segment.w2, from: segment.from, to: segment.to, case: caseId, dir: direction, sourceKind, sourcePanelId: panelId };
}

function fallbackNodalLoads({ id, edge, edgeIndex, edgeLoad, caseId, direction, recipientType, sourceKind }) {
  return [edge.a.id, edge.b.id].map((nodeId, endpoint) => {
    const generatedKey = `p10-m10:${id}:edge-${edgeIndex}:fallback-${endpoint}`;
    return { id: generatedKey, generatedKey, type: 'nodal', node: nodeId, P: edgeLoad / 2, case: caseId, dir: direction, sourceKind, sourcePanelId: id, transferRecipient: recipientType };
  });
}

function traceEdge(edge, plan, memberId, recipientType, resultant, segments) {
  return { edgeIndex: plan.edgeIndex, nodeIds: [edge.a.id, edge.b.id], memberId, recipientType, shape: plan.shape, length: edge.length, resultant, segments };
}

function resolveFallbackRecipient(model, edge) {
  const edgeNodes = new Set([String(edge.a.id), String(edge.b.id)]);
  const wall = [...(model.walls || []), ...(model.shells || []).filter((row) => row?.role === 'wall')]
    .find((row) => (row.nodeIds || row.nodes || []).filter((id) => edgeNodes.has(String(id))).length === 2);
  return wall ? 'wall' : 'direct-column';
}

function panelGeometry(nodes) {
  const edges = nodes.map((a, index) => {
    const b = nodes[(index + 1) % nodes.length];
    return { a, b, length: distance(a, b) };
  });
  if (edges.some((edge) => !(edge.length > 0))) throw loadGenerationError('SLAB_PANEL_ZERO_EDGE', 'Slab panel edges must have positive length.');
  const areaVector = [0, 0, 0];
  nodes.forEach((a, index) => {
    const b = nodes[(index + 1) % nodes.length];
    areaVector[0] += (a.y || 0) * (b.z || 0) - (a.z || 0) * (b.y || 0);
    areaVector[1] += (a.z || 0) * (b.x || 0) - (a.x || 0) * (b.z || 0);
    areaVector[2] += (a.x || 0) * (b.y || 0) - (a.y || 0) * (b.x || 0);
  });
  const area = Math.hypot(...areaVector) / 2;
  if (!(area > 0)) throw loadGenerationError('SLAB_PANEL_ZERO_AREA', 'Slab panel area must be positive.');
  return { area, edges };
}

function buildMemberEdgeMap(members) {
  const map = new Map();
  for (const member of members) map.set(edgeKey(member.n1, member.n2), member);
  return map;
}

function edgeKey(a, b) { return [String(a), String(b)].sort().join('::'); }
function distance(a, b) { return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0)); }
function segmentResultant(segment, length) { return (segment.w1 + segment.w2) * 0.5 * (segment.to - segment.from) * length; }
function coordinateRange(nodes, key) { const values = nodes.map((node) => finite(node[key], 0)); return values.length ? Math.max(...values) - Math.min(...values) : 0; }
function inferStoryElevations(nodes) { return [...new Set(nodes.map((node) => finite(node.z, 0)).filter((z) => z > 0))].sort((a, b) => a - b).map((z, i) => ({ id: `S${i + 1}`, z })); }
function positive(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; }
function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function text(value) { return String(value || '').trim(); }
function loadGenerationError(code, message) { return Object.assign(new Error(message), { code }); }
