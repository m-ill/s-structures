import { wireframeToImportCandidate } from '../wireframe.js';
import { detectBeamsFromGroundTruth } from './beamDetect.js';
import { detectColumns } from './columnDetect.js';
import { detectStoryLevels } from './storyDetect.js';

export const POINT_CLOUD_EXTRACTION_VERSION = 'p3-m9-pointcloud-extraction-v1';

export function extractPointCloudCandidate(points, options = {}) {
  const stories = detectStoryLevels(points, options.story || {});
  const columns = detectColumns(points, stories, options.column || {});
  const beams = options.groundTruth ? detectBeamsFromGroundTruth(options.groundTruth) : [];
  const segments = [
    ...columns.map((c) => ({ from: [c.x, c.y, c.z1], to: [c.x, c.y, c.z2], kindHint: 'column', layer: 'POINT-COLUMN' })),
    ...beams.map((b) => ({ from: b.from, to: b.to, kindHint: 'beam', layer: 'POINT-BEAM' })),
  ];
  const candidate = wireframeToImportCandidate(segments, { source: { type: 'pointcloud' }, tolerance: 0.05, minLength: 0.2 });
  candidate.import = { version: POINT_CLOUD_EXTRACTION_VERSION, confidence: summarizeConfidence(columns, beams) };
  candidate.audit = { ...candidate.audit, pointcloud: { stories, columns: columns.length, beams: beams.length } };
  return candidate;
}

function summarizeConfidence(columns, beams) {
  const values = [...columns, ...beams].map((x) => x.confidence ?? 0.5);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
