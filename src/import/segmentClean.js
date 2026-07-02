import { distance3, isFinitePoint, pointKey, toPoint3 } from './point.js';

export const IMPORT_GEOMETRY_VERSION = 'p3-import-geometry-core';

export function normalizeSegment(segment) {
  const from = toPoint3(segment.from ?? segment[0]);
  const to = toPoint3(segment.to ?? segment[1]);
  return {
    from,
    to,
    layer: segment.layer || null,
    kindHint: segment.kindHint || null,
    sectionHint: segment.sectionHint || null,
    materialHint: segment.materialHint || null,
  };
}

export function cleanSegments(segments, options = {}) {
  const tolerance = options.tolerance ?? 1e-3;
  const minLength = options.minLength ?? tolerance;
  const nodeByKey = new Map();
  const nodes = [];
  const members = [];
  const seen = new Set();
  let shortSegments = 0;
  let duplicateSegments = 0;
  let invalidSegments = 0;

  for (const raw of segments || []) {
    const segment = normalizeSegment(raw);
    if (!isFinitePoint(segment.from) || !isFinitePoint(segment.to)) { invalidSegments += 1; continue; }
    if (distance3(segment.from, segment.to) <= minLength) { shortSegments += 1; continue; }
    const from = nodeId(segment.from, nodeByKey, nodes, tolerance);
    const to = nodeId(segment.to, nodeByKey, nodes, tolerance);
    if (from === to) { shortSegments += 1; continue; }
    const key = [from, to].sort().join('|');
    if (seen.has(key)) { duplicateSegments += 1; continue; }
    seen.add(key);
    members.push({ from, to, layer: segment.layer, kindHint: segment.kindHint, sectionHint: segment.sectionHint, materialHint: segment.materialHint });
  }
  return { nodes, members, audit: { inputSegments: segments?.length || 0, shortSegments, duplicateSegments, invalidSegments } };
}

function nodeId(point, nodeByKey, nodes, tolerance) {
  const key = pointKey(point, tolerance);
  if (nodeByKey.has(key)) return nodeByKey.get(key);
  const id = `n${nodes.length + 1}`;
  nodeByKey.set(key, id);
  nodes.push({ id, ...toPoint3(point) });
  return id;
}
