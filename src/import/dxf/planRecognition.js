import { dxfEntitiesToGeometry } from './entities.js';
import { parseDxf } from './parser.js';

export const DXF_PLAN_RECOGNITION_VERSION = 'p3-m7-dxf-plan-recognition';

export function recognizePlanDxf(text, options = {}) {
  const parsed = parseDxf(text);
  const geometry = dxfEntitiesToGeometry(parsed);
  const layerRules = normalizeLayerRules(options.layerMap || {});
  const elevation = Number(options.elevation ?? options.z ?? 0);
  const rawColumns = [
    ...geometry.circles.map((circle, index) => columnCandidate(circle.center, circle.layer, index, 'circle', layerRules, elevation)),
    ...geometry.points.map((point, index) => columnCandidate(point.point, point.layer, index, 'point', layerRules, elevation)),
    ...closedPolylineColumns(geometry.segments, layerRules, elevation, options),
  ].filter(Boolean);
  const columns = dedupeColumns(rawColumns, options.columnMergeTolerance || 1e-6)
    .map((column, index) => ({ ...column, id: `C${index + 1}` }));
  const beams = geometry.segments
    .map((segment, index) => beamCandidate(segment, index, layerRules, elevation))
    .filter(Boolean);
  const recognitionQuality = buildRecognitionQuality(columns, beams, options.expected || {});
  const labelEvidence = buildLabelEvidence(geometry.texts, options.storyId || `ST${elevation}`);
  const layerUsage = buildPlanLayerUsage(geometry.audit.layerUsage, columns, beams);
  return {
    version: DXF_PLAN_RECOGNITION_VERSION,
    storyId: options.storyId || `ST${elevation}`,
    elevation,
    columns,
    beams,
    texts: geometry.texts,
    audit: {
      counts: {
        columns: columns.length,
        beams: beams.length,
        texts: geometry.texts.length,
        circles: geometry.circles.length,
        points: geometry.points.length,
        segments: geometry.segments.length,
        closedPolylineColumns: columns.filter((column) => column.source === 'closed-polyline').length,
      },
      ignored: geometry.audit.ignored,
      layers: layerUsage.layers,
      recognizedLayers: layerUsage.recognizedLayers,
      unusedLayers: layerUsage.unusedLayers,
      layerUsage: layerUsage.rows,
      labelEvidence,
      recognitionQuality,
    },
  };
}

function columnCandidate(point, layer, index, source, rules, elevation) {
  const rule = rules.get(layer) || inferLayer(layer);
  if (rule.kind && rule.kind !== 'column') return null;
  return {
    id: `C${index + 1}`,
    x: point.x,
    y: point.y,
    z: elevation,
    layer,
    source,
    sectionHint: rule.section || null,
    materialHint: rule.material || null,
    confidence: rule.kind === 'column' ? 0.95 : 0.65,
  };
}

function closedPolylineColumns(segments = [], rules, elevation, options = {}) {
  const candidates = [];
  const byLayer = new Map();
  for (const segment of segments) {
    const rule = rules.get(segment.layer) || inferLayer(segment.layer);
    if (rule.kind !== 'column') continue;
    const key = segment.layer || '0';
    byLayer.set(key, byLayer.get(key) || []);
    byLayer.get(key).push(segment);
  }
  for (const [layer, rows] of byLayer.entries()) {
    for (const loop of findClosedLoops(rows, options.loopTolerance || 1e-6)) {
      const bbox = bboxOfLoop(loop);
      const maxSize = Number(options.maxColumnPolylineSize || 1.5);
      if (Math.max(bbox.size.x, bbox.size.y) > maxSize) continue;
      const rule = rules.get(layer) || inferLayer(layer);
      candidates.push({
        id: `CP${candidates.length + 1}`,
        x: bbox.center.x,
        y: bbox.center.y,
        z: elevation,
        layer,
        source: 'closed-polyline',
        sectionHint: rule.section || null,
        materialHint: rule.material || null,
        confidence: rule.kind === 'column' ? 0.88 : 0.62,
        evidence: {
          segmentCount: loop.length,
          bbox,
        },
      });
    }
  }
  return candidates;
}

function findClosedLoops(segments, tolerance) {
  const unused = [...segments];
  const loops = [];
  while (unused.length) {
    const seed = unused.shift();
    const loop = [seed];
    let end = seed.to;
    let advanced = true;
    while (advanced) {
      advanced = false;
      for (let i = 0; i < unused.length; i += 1) {
        const row = unused[i];
        if (pointsNear(end, row.from, tolerance)) {
          loop.push(row);
          end = row.to;
          unused.splice(i, 1);
          advanced = true;
          break;
        }
        if (pointsNear(end, row.to, tolerance)) {
          loop.push({ ...row, from: row.to, to: row.from });
          end = row.from;
          unused.splice(i, 1);
          advanced = true;
          break;
        }
      }
    }
    if (loop.length >= 3 && pointsNear(loop[0].from, end, tolerance)) loops.push(loop);
  }
  return loops;
}

function bboxOfLoop(loop) {
  const points = loop.flatMap((segment) => [segment.from, segment.to]);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const min = { x: Math.min(...xs), y: Math.min(...ys) };
  const max = { x: Math.max(...xs), y: Math.max(...ys) };
  return {
    min,
    max,
    size: { x: max.x - min.x, y: max.y - min.y },
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 },
  };
}

function dedupeColumns(columns, tolerance) {
  const out = [];
  for (const column of columns) {
    if (!out.some((existing) => distance2d(existing, column) <= tolerance)) out.push(column);
  }
  return out;
}

function pointsNear(a, b, tolerance) {
  return distance2d(a, b) <= tolerance;
}

function distance2d(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function beamCandidate(segment, index, rules, elevation) {
  const rule = rules.get(segment.layer) || inferLayer(segment.layer);
  if (rule.kind && !['beam', 'girder', 'brace'].includes(rule.kind)) return null;
  return {
    id: `B${index + 1}`,
    from: { x: segment.from.x, y: segment.from.y, z: elevation },
    to: { x: segment.to.x, y: segment.to.y, z: elevation },
    layer: segment.layer,
    kind: rule.kind === 'brace' ? 'brace' : 'beam',
    sectionHint: rule.section || null,
    materialHint: rule.material || null,
    confidence: rule.kind ? 0.9 : 0.6,
  };
}

function normalizeLayerRules(map) {
  const out = new Map();
  for (const [key, value] of Object.entries(map || {})) {
    out.set(key, value || {});
    out.set(String(key).toUpperCase(), value || {});
  }
  return out;
}

function inferLayer(layer = '') {
  const text = String(layer).toUpperCase();
  if (/(COL|COLUMN|C-)/.test(text)) return { kind: 'column' };
  if (/(BRC|BRACE)/.test(text)) return { kind: 'brace' };
  if (/(BEAM|GIR|B-)/.test(text)) return { kind: 'beam' };
  return {};
}

function buildRecognitionQuality(columns, beams, expected = {}) {
  const expectedColumns = Number(expected.columns || 0);
  const expectedBeams = Number(expected.beams || 0);
  const columnRecall = expectedColumns > 0 ? Math.min(1, columns.length / expectedColumns) : null;
  const beamRecall = expectedBeams > 0 ? Math.min(1, beams.length / expectedBeams) : null;
  const targets = { columnRecall: 0.9, beamRecall: 0.8 };
  return {
    expected: {
      columns: expectedColumns || null,
      beams: expectedBeams || null,
    },
    actual: {
      columns: columns.length,
      beams: beams.length,
    },
    recall: {
      columns: columnRecall,
      beams: beamRecall,
    },
    targets,
    ok: (columnRecall == null || columnRecall >= targets.columnRecall) &&
      (beamRecall == null || beamRecall >= targets.beamRecall),
  };
}

function buildLabelEvidence(texts, storyId) {
  const labels = (texts || []).map((item) => ({
    text: item.text,
    layer: item.layer,
    point: item.point,
  }));
  return {
    storyId,
    labels,
    labelCount: labels.length,
    primaryLabel: labels[0]?.text || null,
    agentDecision: labels.length ? 'use-labels-for-human-review' : 'review-story-labels-manually',
  };
}

function buildPlanLayerUsage(rows = [], columns = [], beams = []) {
  const recognizedLayers = [...new Set([
    ...columns.map((item) => item.layer),
    ...beams.map((item) => item.layer),
  ].filter(Boolean))].sort();
  const recognized = new Set(recognizedLayers);
  const layers = [...new Set(rows.map((row) => row.layer || '0'))].sort();
  return {
    layers,
    recognizedLayers,
    unusedLayers: layers.filter((layer) => !recognized.has(layer)),
    rows: rows.map((row) => ({
      ...row,
      recognized: recognized.has(row.layer),
    })),
  };
}
