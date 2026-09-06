import { bboxOfPoints } from '../point.js';
import { wireframeToImportCandidate } from '../wireframe.js';
import { dxfEntitiesToGeometry } from './entities.js';
import { parseDxf } from './parser.js';

export const DXF_IMPORT_VERSION = 'p3-m6-dxf-import-v1';

export function importDxfToCandidate(text, options = {}) {
  const parsed = parseDxf(text);
  const geometry = dxfEntitiesToGeometry(parsed);
  const unit = resolveUnits(parsed.header, geometry.segments, options);
  const layerMap = options.layerMap || {};
  const scaledSegments = geometry.segments.map((segment) => scaleSegment(segment, unit));
  const normalization = resolveOriginNormalization(scaledSegments, options);
  const segments = scaledSegments
    .map((segment) => normalizeSegmentOrigin(segment, normalization.origin))
    .map((segment) => applyLayerMap(segment, layerMap));
  const layerAudit = buildLayerAudit(segments, layerMap, geometry);
  const candidate = wireframeToImportCandidate(segments, {
    ...options,
    source: {
      type: 'dxf',
      fileId: options.fileId || null,
      units: unit.units,
      transform: { origin: normalization.origin, up: 'z' },
    },
  });
  candidate.import = {
    version: DXF_IMPORT_VERSION,
    parserVersion: parsed.version,
    entityVersion: geometry.version,
  };
  candidate.audit = {
    ...candidate.audit,
    counts: {
      ...candidate.audit.counts,
      lines: geometry.audit.counts.LINE || 0,
      polylines: (geometry.audit.counts.LWPOLYLINE || 0) + (geometry.audit.counts.POLYLINE || 0),
      inserts: geometry.audit.counts.INSERT || 0,
      texts: (geometry.audit.counts.TEXT || 0) + (geometry.audit.counts.MTEXT || 0),
      points: geometry.audit.counts.POINT || 0,
      circles: geometry.audit.counts.CIRCLE || 0,
      dxfPairs: parsed.pairs.length,
      dxfSegments: geometry.segments.length,
      dxfPoints: geometry.points.length,
      dxfCircles: geometry.circles.length,
      dxfTexts: geometry.texts.length,
      ignored: geometry.audit.ignored,
      ignoredDetails: geometry.audit.ignoredDetails,
      supportedEntityCount: supportedEntityCount(geometry.audit.counts),
      unsupportedEntityCount: Object.values(geometry.audit.ignored || {}).reduce((sum, count) => sum + count, 0),
    },
    units: unit,
    normalization,
    layers: layerAudit,
    mapping: layerAudit,
    merge: buildMergeAudit(geometry.segments, candidate),
    orphans: buildOrphanAudit(candidate),
    bbox: buildBboxAudit(candidate.audit.bbox || bboxOfPoints(candidate.candidates.nodes)),
  };
  return candidate;
}

function applyLayerMap(segment, layerMap) {
  const mapped = layerMap[segment.layer] || layerMap[String(segment.layer || '').toUpperCase()] || {};
  return {
    ...segment,
    sectionHint: mapped.section || segment.sectionHint || null,
    materialHint: mapped.material || segment.materialHint || null,
    kindHint: mapped.kind || null,
  };
}

function scaleSegment(segment, unit) {
  const scalePoint = (point) => [point.x * unit.scale, point.y * unit.scale, point.z * unit.scale];
  return { ...segment, from: scalePoint(segment.from), to: scalePoint(segment.to) };
}

function normalizeSegmentOrigin(segment, origin) {
  const move = (point) => [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  return { ...segment, from: move(segment.from), to: move(segment.to) };
}

function resolveOriginNormalization(segments, options) {
  const bbox = buildBboxAudit(bboxOfPoints(segments.flatMap((segment) => [segment.from, segment.to]).map(arrayPointToObject)));
  const mode = options.normalizeOrigin === true ? 'bbox-min' : options.normalizeOrigin || 'none';
  const origin = mode === 'bbox-min' && bbox
    ? [bbox.min.x, bbox.min.y, bbox.min.z]
    : [0, 0, 0];
  return {
    mode,
    origin,
    sourceBbox: bbox,
  };
}

function arrayPointToObject(point) {
  return { x: point[0], y: point[1], z: point[2] };
}

function resolveUnits(header, segments, options) {
  const declared = Number(header?.$INSUNITS ?? options.insunits ?? 0);
  const scale = ({ 4: 1e-3, 5: 1e-2, 6: 1, 1: 0.0254 }[declared]) || Number(options.unitScale || 1);
  const units = ({ 4: 'mm', 5: 'cm', 6: 'm', 1: 'inch' }[declared]) || options.units || 'm';
  const maxCoord = Math.max(0, ...segments.flatMap((segment) => [
    Math.abs(segment.from.x), Math.abs(segment.from.y), Math.abs(segment.from.z),
    Math.abs(segment.to.x), Math.abs(segment.to.y), Math.abs(segment.to.z),
  ]));
  return {
    declared,
    units,
    scale,
    suspicion: declared ? null : maxCoord > 100 ? 'missing-units-large-coordinates' : null,
  };
}

function buildLayerAudit(segments, layerMap, geometry) {
  const segmentLayers = segments.map((segment) => segment.layer || '0');
  const entityLayers = (geometry.audit.layerUsage || []).map((row) => row.layer || '0');
  const ignoredLayers = (geometry.audit.ignoredDetails || []).map((row) => row.layer || '0');
  const layers = [...new Set([...segmentLayers, ...entityLayers, ...ignoredLayers])].sort();
  const mapped = layers.filter((layer) => layerMap[layer] || layerMap[String(layer).toUpperCase()]);
  const mappedSet = new Set(mapped);
  const layerUsage = (geometry.audit.layerUsage || []).map((row) => ({
    ...row,
    mapped: mappedSet.has(row.layer),
  }));
  return {
    layers,
    mappedLayers: mapped,
    unmappedEntityCount: layerUsage.filter((row) => !row.mapped).reduce((sum, row) => sum + row.total, 0),
    unmappedSegmentCount: segments.filter((segment) => !mappedSet.has(segment.layer || '0')).length,
    layerUsage,
    ignoredLayers: [...new Set(ignoredLayers)].sort(),
  };
}

function supportedEntityCount(counts = {}) {
  return [
    'LINE',
    'LWPOLYLINE',
    'POLYLINE',
    'POINT',
    'CIRCLE',
    'INSERT',
    'TEXT',
    'MTEXT',
  ].reduce((sum, key) => sum + (counts[key] || 0), 0);
}

function buildMergeAudit(rawSegments, candidate) {
  const counts = candidate.audit?.counts || {};
  return {
    nodesBefore: (rawSegments || []).length * 2,
    nodesAfter: candidate.candidates?.nodes?.length || 0,
    shortSegmentsDropped: counts.shortSegments || 0,
    duplicatesDropped: counts.duplicateSegments || 0,
  };
}

function buildOrphanAudit(candidate) {
  const nodeIds = new Set((candidate.candidates?.nodes || []).map((node) => node.id));
  const usedIds = new Set((candidate.candidates?.members || []).flatMap((member) => [member.from, member.to]));
  return {
    nodes: [...nodeIds].filter((id) => !usedIds.has(id)),
    unknownKindMembers: (candidate.candidates?.members || []).filter((member) => member.kind === 'unknown').map((member) => member.id),
  };
}

function buildBboxAudit(bbox) {
  if (!bbox) return null;
  return {
    min: bbox.min,
    max: bbox.max,
    sizeM: {
      x: bbox.max.x - bbox.min.x,
      y: bbox.max.y - bbox.min.y,
      z: bbox.max.z - bbox.min.z,
    },
  };
}
