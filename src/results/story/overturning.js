import { buildRsaStoryResponse } from './rsaResponse.js';

export const STORY_OVERTURNING_TRACE_VERSION = 'p6-m4-story-overturning-trace-v1';
export const STORY_OVERTURNING_RSA_VERSION = 'p7-m9-rsa-story-overturning-v1';

export function buildStoryOverturningTrace(model, analysis, options = {}) {
  const response = buildRsaStoryResponse(model, analysis, options);
  const rows = response.rows.map((row) => {
    const before = row.provenance?.scaling?.beforeValue || {};
    return {
    responseId: row.responseId,
    comboId: row.comboId,
    analysisCaseId: row.analysisCaseId,
    direction: row.direction,
    responseMethod: row.responseMethod,
    story: row.story,
    storyId: row.storyId,
    lowerZ: row.lowerZ,
    z: row.z,
    overturningX: row.overturningX,
    overturningY: row.overturningY,
    overturning: Math.hypot(row.overturningX || 0, row.overturningY || 0),
    scaleFactor: row.scaleFactor,
    dimensions: {
      lowerZ: 'length',
      z: 'length',
      overturningX: 'moment',
      overturningY: 'moment',
      overturning: 'moment',
      scaleFactor: 'dimensionless',
    },
    units: response.units,
    provenance: withDerivedScalingValues(row.provenance, {
      overturning: Math.hypot(before.overturningX || 0, before.overturningY || 0),
    }),
  };
  });
  return {
    version: STORY_OVERTURNING_TRACE_VERSION,
    recoveryVersion: STORY_OVERTURNING_RSA_VERSION,
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
      maxOverturning: Math.max(0, ...rows.map((row) => row.overturning)),
      comboIds: [...new Set(rows.map((row) => row.comboId))],
      responseIds: [...new Set(rows.map((row) => row.responseId))],
      staticReferenceCount: 0,
      status: response.status,
    },
  };
}

function withDerivedScalingValues(provenance, beforeValues) {
  const scaling = provenance?.scaling;
  if (!scaling) return provenance;
  return {
    ...provenance,
    scaling: {
      ...scaling,
      values: {
        ...(scaling.values || {}),
        ...Object.fromEntries(Object.entries(beforeValues).map(([key, beforeValue]) => [key, {
          scaled: scaling.scaled,
          scaleFactor: scaling.scaleFactor,
          beforeValue,
        }])),
      },
    },
  };
}
