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
  const segments = geometry.segments.map((segment) => applyLayerMap(scaleSegment(segment, unit), layerMap));
  const layerAudit = buildLayerAudit(segments, layerMap);
  const candidate = wireframeToImportCandidate(segments, {
    ...options,
    source: {
      type: 'dxf',
      fileId: options.fileId || null,
      units: unit.units,
      transform: { origin: [0, 0, 0], up: 'z' },
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
      dxfPairs: parsed.pairs.length,
      dxfSegments: geometry.segments.length,
      dxfPoints: geometry.points.length,
      dxfTexts: geometry.texts.length,
      ignored: geometry.audit.ignored,
      ignoredDetails: geometry.audit.ignoredDetails,
    },
    units: unit,
    layers: layerAudit,
    mapping: layerAudit,
    merge: buildMergeAudit(geometry.segments, candidate),
    orphans: buildOrphanAudit(candidate),
    bbox: candidate.audit.bbox || bboxOfPoints(candidate.candidates.nodes),
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

function buildLayerAudit(segments, layerMap) {
  const layers = [...new Set(segments.map((segment) => segment.layer || '0'))].sort();
  const mapped = layers.filter((layer) => layerMap[layer] || layerMap[String(layer).toUpperCase()]);
  return {
    layers,
    mappedLayers: mapped,
    unmappedEntityCount: segments.filter((segment) => !mapped.includes(segment.layer || '0')).length,
  };
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
