import { wireframeToImportCandidate } from '../wireframe.js';
import { detectBeamsFromGroundTruth } from './beamDetect.js';
import { detectColumns } from './columnDetect.js';
import { detectStoryLevels } from './storyDetect.js';
import { buildWallExtractionReview, detectWallsFromGroundTruth, detectWallsFromOptions } from './wallDetect.js';
import { buildPointCloudExtractionReview, normalizeRealScanValidation } from './review.js';

export const POINT_CLOUD_EXTRACTION_VERSION = 'p3-m9-pointcloud-extraction-v1';
export const POINT_CLOUD_EXTRACTION_SUMMARY_VERSION = 'p3-m9-pointcloud-extraction-summary-v1';

export function extractPointCloudCandidate(points, options = {}) {
  const stories = detectStoryLevels(points, options.story || {});
  const columns = detectColumns(points, stories, options.column || {});
  const beams = options.groundTruth ? detectBeamsFromGroundTruth(options.groundTruth) : [];
  const walls = [
    ...(options.groundTruth ? detectWallsFromGroundTruth(options.groundTruth) : []),
    ...detectWallsFromOptions(options.wall || {}),
  ];
  const segments = [
    ...columns.map((c) => ({ from: [c.x, c.y, c.z1], to: [c.x, c.y, c.z2], kindHint: 'column', layer: 'POINT-COLUMN' })),
    ...beams.map((b) => ({ from: b.from, to: b.to, kindHint: 'beam', layer: 'POINT-BEAM' })),
  ];
  const candidate = wireframeToImportCandidate(segments, { source: { type: 'pointcloud' }, tolerance: 0.05, minLength: 0.2 });
  const summary = buildPointCloudExtractionSummary({ stories, columns, beams, walls, usedGroundTruth: !!options.groundTruth, realScanValidation: options.realScanValidation });
  candidate.import = { version: POINT_CLOUD_EXTRACTION_VERSION, confidence: summary.confidence.mean };
  candidate.audit = { ...candidate.audit, pointcloud: summary };
  return candidate;
}

export function buildPointCloudExtractionSummary(input = {}) {
  const stories = input.stories || [];
  const columns = input.columns || [];
  const beams = input.beams || [];
  const walls = input.walls || [];
  const usedGroundTruth = input.usedGroundTruth === true;
  const realScanValidation = normalizeRealScanValidation(input.realScanValidation);
  const review = buildPointCloudExtractionReview({ realScanValidation });
  const wallExtraction = buildWallExtractionReview(walls, { realScanValidation });
  return {
    version: POINT_CLOUD_EXTRACTION_SUMMARY_VERSION,
    contract: {
      milestone: 'P3-M9',
      tickets: ['P3-T41', 'P3-T42', 'P3-T43', 'P3-T44', 'P3-T45'],
      source: usedGroundTruth ? 'synthetic-benchmark' : 'scan-only-preliminary',
      output: 'ImportCandidate',
    },
    counts: { stories: stories.length, columns: columns.length, beams: beams.length, walls: walls.length },
    confidence: {
      mean: summarizeConfidence(columns, beams, walls),
      storyMin: minConfidence(stories),
      columnMin: minConfidence(columns),
      beamMin: minConfidence(beams),
      wallMin: minConfidence(walls),
    },
    evidence: {
      extractionStatus: {
        stories: stories.length > 0 ? 'available' : 'not-detected',
        columns: columns.length > 0 ? 'available' : 'not-detected',
        beams: beams.length > 0 ? (usedGroundTruth ? 'synthetic-assisted' : 'available') : 'not-detected',
        walls: walls.length > 0 ? 'review-candidates-available' : 'preliminary-no-wall-candidate',
        importCandidate: 'generated',
      },
      storyLevels: stories.map((s) => ({ id: s.id, z: s.z, confidence: s.confidence ?? null })),
      candidates: buildCandidateEvidence(stories, columns, beams, walls, usedGroundTruth),
      confidenceBands: {
        high: '>=0.8',
        review: '0.5-0.8',
        auditOnly: '<0.5',
      },
      beamSource: usedGroundTruth ? 'synthetic-ground-truth-assisted' : 'not-detected',
      realScanValidation,
      review,
      wallExtraction,
    },
    limitations: [
      ...(usedGroundTruth ? ['beam-detection-uses-synthetic-ground-truth'] : ['beam-detection-not-available-without-ground-truth']),
      ...(walls.length ? ['wall-candidates-require-human-review'] : ['wall-extraction-pending-real-scan-validation']),
      'real-field-pointcloud-validation-pending',
    ],
  };
}

function buildCandidateEvidence(stories, columns, beams, walls, usedGroundTruth) {
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
    walls: walls.map((wall) => ({
      id: wall.id,
      from: wall.from,
      to: wall.to,
      z1: wall.z1,
      z2: wall.z2,
      thickness: wall.thickness,
      confidence: wall.confidence ?? null,
      band: confidenceBand(wall.confidence),
      evidence: wall.evidence || ['review-required'],
    })),
  };
}

function confidenceBand(value) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'review';
  return 'audit-only';
}

function summarizeConfidence(columns, beams, walls) {
  const values = [...columns, ...beams, ...walls].map((x) => x.confidence ?? 0.5);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function minConfidence(items) {
  const values = (items || []).map((item) => item.confidence).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}
