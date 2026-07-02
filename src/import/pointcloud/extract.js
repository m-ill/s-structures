import { wireframeToImportCandidate } from '../wireframe.js';
import { detectBeamsFromGroundTruth } from './beamDetect.js';
import { detectColumns } from './columnDetect.js';
import { detectStoryLevels } from './storyDetect.js';

export const POINT_CLOUD_EXTRACTION_VERSION = 'p3-m9-pointcloud-extraction-v1';
export const POINT_CLOUD_EXTRACTION_SUMMARY_VERSION = 'p3-m9-pointcloud-extraction-summary-v1';

export function extractPointCloudCandidate(points, options = {}) {
  const stories = detectStoryLevels(points, options.story || {});
  const columns = detectColumns(points, stories, options.column || {});
  const beams = options.groundTruth ? detectBeamsFromGroundTruth(options.groundTruth) : [];
  const segments = [
    ...columns.map((c) => ({ from: [c.x, c.y, c.z1], to: [c.x, c.y, c.z2], kindHint: 'column', layer: 'POINT-COLUMN' })),
    ...beams.map((b) => ({ from: b.from, to: b.to, kindHint: 'beam', layer: 'POINT-BEAM' })),
  ];
  const candidate = wireframeToImportCandidate(segments, { source: { type: 'pointcloud' }, tolerance: 0.05, minLength: 0.2 });
  const summary = buildPointCloudExtractionSummary({ stories, columns, beams, usedGroundTruth: !!options.groundTruth });
  candidate.import = { version: POINT_CLOUD_EXTRACTION_VERSION, confidence: summary.confidence.mean };
  candidate.audit = { ...candidate.audit, pointcloud: summary };
  return candidate;
}

export function buildPointCloudExtractionSummary(input = {}) {
  const stories = input.stories || [];
  const columns = input.columns || [];
  const beams = input.beams || [];
  const usedGroundTruth = input.usedGroundTruth === true;
  return {
    version: POINT_CLOUD_EXTRACTION_SUMMARY_VERSION,
    counts: { stories: stories.length, columns: columns.length, beams: beams.length, walls: 0 },
    confidence: {
      mean: summarizeConfidence(columns, beams),
      storyMin: minConfidence(stories),
      columnMin: minConfidence(columns),
      beamMin: minConfidence(beams),
    },
    evidence: {
      storyLevels: stories.map((s) => ({ id: s.id, z: s.z, confidence: s.confidence ?? null })),
      candidates: buildCandidateEvidence(stories, columns, beams, usedGroundTruth),
      confidenceBands: {
        high: '>=0.8',
        review: '0.5-0.8',
        auditOnly: '<0.5',
      },
      beamSource: usedGroundTruth ? 'synthetic-ground-truth-assisted' : 'not-detected',
      realScanValidation: 'pending-owner-file',
      wallExtraction: {
        status: 'not-v1-production',
        reason: 'plane-extraction-and-panel-grouping-require-real-scan-validation',
        candidateCount: 0,
      },
    },
    limitations: [
      ...(usedGroundTruth ? ['beam-detection-uses-synthetic-ground-truth'] : ['beam-detection-not-available-without-ground-truth']),
      'wall-extraction-pending-real-scan-validation',
      'real-field-pointcloud-validation-pending',
    ],
  };
}

function buildCandidateEvidence(stories, columns, beams, usedGroundTruth) {
  return {
    stories: stories.map((story) => ({
      id: story.id,
      z: story.z,
      confidence: story.confidence ?? null,
      band: confidenceBand(story.confidence),
      evidence: ['z-histogram-cluster'],
    })),
    columns: columns.map((column, index) => ({
      id: `C${index + 1}`,
      x: column.x,
      y: column.y,
      z1: column.z1,
      z2: column.z2,
      confidence: column.confidence ?? null,
      band: confidenceBand(column.confidence),
      evidence: ['vertical-continuity', 'xy-cluster', 'story-span-support'],
    })),
    beams: beams.map((beam, index) => ({
      id: `B${index + 1}`,
      from: beam.from,
      to: beam.to,
      confidence: beam.confidence ?? null,
      band: confidenceBand(beam.confidence),
      evidence: usedGroundTruth ? ['synthetic-ground-truth-assisted'] : ['not-detected'],
    })),
    walls: [],
  };
}

function confidenceBand(value) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'review';
  return 'audit-only';
}

function summarizeConfidence(columns, beams) {
  const values = [...columns, ...beams].map((x) => x.confidence ?? 0.5);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function minConfidence(items) {
  const values = (items || []).map((item) => item.confidence).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}
