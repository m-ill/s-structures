import { buildRsaStoryResponse } from './rsaResponse.js';

export const STORY_SHEAR_TRACE_VERSION = 'p6-m4-story-shear-trace-v1';
export const STORY_SHEAR_RSA_VERSION = 'p7-m9-rsa-story-shear-v1';

export function buildStoryShearTrace(model, analysis, options = {}) {
  const response = buildRsaStoryResponse(model, analysis, options);
  const rows = response.rows.map((row) => ({
    responseId: row.responseId,
    comboId: row.comboId,
    analysisCaseId: row.analysisCaseId,
    direction: row.direction,
    responseMethod: row.responseMethod,
    story: row.story,
    storyId: row.storyId,
    z: row.z,
    height: row.height,
    forceX: row.forceX,
    forceY: row.forceY,
    forceZ: row.forceZ,
    torsionCenter: row.torsionCenter,
    floorTorsionMz: row.floorTorsionMz,
    storyShearX: row.cumulativeShearX,
    storyShearY: row.cumulativeShearY,
    storyShearZ: row.cumulativeShearZ,
    storyShear: Math.hypot(row.cumulativeShearX || 0, row.cumulativeShearY || 0),
    storyTorsionMz: row.storyTorsionMz,
    torsionMz: row.storyTorsionMz,
    scaleFactor: row.scaleFactor,
    dimensions: {
      z: 'length',
      height: 'length',
      forceX: 'force',
      forceY: 'force',
      forceZ: 'force',
      torsionCenter: 'length',
      floorTorsionMz: 'moment',
      storyShearX: 'force',
      storyShearY: 'force',
      storyShearZ: 'force',
      storyShear: 'force',
      storyTorsionMz: 'moment',
      scaleFactor: 'dimensionless',
    },
    units: response.units,
    provenance: row.provenance,
  }));
  return {
    version: STORY_SHEAR_TRACE_VERSION,
    recoveryVersion: STORY_SHEAR_RSA_VERSION,
    sourceVersion: response.version,
    source: 'rsa-modal-nodal-inertia-force',
    status: response.status,
    designBlocked: response.designBlocked,
    reason: response.reason,
    responseMethod: response.responseMethod,
    dimensions: response.dimensions,
    units: response.units,
    provenance: response.provenance,
    warnings: response.warnings,
    rows,
    summary: {
      rowCount: rows.length,
      storyCount: response.summary.storyCount,
      directionCount: response.summary.directionCount,
      maxStoryShear: Math.max(0, ...rows.map((row) => row.storyShear)),
      maxStoryTorsion: Math.max(0, ...rows.map((row) => Math.abs(row.storyTorsionMz))),
      comboIds: [...new Set(rows.map((row) => row.comboId))],
      responseIds: [...new Set(rows.map((row) => row.responseId))],
      staticReferenceCount: 0,
      status: response.status,
    },
  };
}
