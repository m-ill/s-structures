import { dxfEntitiesToGeometry } from './entities.js';
import { parseDxf } from './parser.js';

export const DXF_PLAN_RECOGNITION_VERSION = 'p3-m7-dxf-plan-recognition';

export function recognizePlanDxf(text, options = {}) {
  const parsed = parseDxf(text);
  const geometry = dxfEntitiesToGeometry(parsed);
  const layerRules = normalizeLayerRules(options.layerMap || {});
  const elevation = Number(options.elevation ?? options.z ?? 0);
  const columns = [
    ...geometry.circles.map((circle, index) => columnCandidate(circle.center, circle.layer, index, 'circle', layerRules, elevation)),
    ...geometry.points.map((point, index) => columnCandidate(point.point, point.layer, index, 'point', layerRules, elevation)),
  ].filter(Boolean);
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
