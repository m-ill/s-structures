import { buildRsaStoryResponse } from './rsaResponse.js';

export const STORY_DRIFT_TRACE_VERSION = 'p6-m4-story-drift-trace-v1';
export const STORY_DRIFT_RSA_VERSION = 'p7-m9-rsa-story-drift-v1';

export function buildStoryDriftTrace(model, analysis, options = {}) {
  const response = buildRsaStoryResponse(model, analysis, options);
  const driftLimitRatio = positive(options.driftLimitRatio, 1 / 200);
  const warnRatio = positive(options.warnRatio, 0.8);
  const rows = response.rows.map((row) => {
    const demandToLimit = driftLimitRatio > 0 ? row.driftRatio / driftLimitRatio : 0;
    return {
      responseId: row.responseId,
      comboId: row.comboId,
      analysisCaseId: row.analysisCaseId,
      direction: row.direction,
      responseMethod: row.responseMethod,
      story: row.story,
      storyId: row.storyId,
      lowerZ: row.lowerZ,
      upperZ: row.upperZ,
      height: row.height,
      lowerNode: row.lowerNode,
      upperNode: row.upperNode,
      driftX: row.driftX,
      driftY: row.driftY,
      driftZ: row.driftZ,
      drift: row.drift,
      driftRatio: row.driftRatio,
      limitRatio: driftLimitRatio,
      demandToLimit,
      status: driftStatus(row.driftRatio, driftLimitRatio, warnRatio),
      scaleFactor: row.scaleFactor,
      dimensions: {
        lowerZ: 'length',
        upperZ: 'length',
        height: 'length',
        driftX: 'length',
        driftY: 'length',
        driftZ: 'length',
        drift: 'length',
        driftRatio: 'dimensionless',
        limitRatio: 'dimensionless',
        demandToLimit: 'dimensionless',
        scaleFactor: 'dimensionless',
      },
      units: response.units,
      provenance: row.provenance,
    };
  });
  const governing = rows.reduce((best, row) => (!best || row.driftRatio > best.driftRatio ? row : best), null);
  return {
    version: STORY_DRIFT_TRACE_VERSION,
    recoveryVersion: STORY_DRIFT_RSA_VERSION,
    sourceVersion: response.version,
    source: 'rsa-modal-nodal-displacement',
    status: response.status,
    resultStatus: response.status,
    designBlocked: response.designBlocked,
    reason: response.reason,
    responseMethod: response.responseMethod,
    criteria: {
      driftLimitRatio,
      warnRatio,
      limitText: `H/${Math.round(1 / driftLimitRatio)}`,
    },
    dimensions: response.dimensions,
    units: response.units,
    provenance: response.provenance,
    warnings: response.warnings,
    rows,
    summary: {
      storyCount: response.summary.storyCount,
      comboCount: response.summary.directionCount,
      directionCount: response.summary.directionCount,
      rowCount: rows.length,
      maxDrift: governing?.drift || 0,
      maxDriftRatio: governing?.driftRatio || 0,
      governing,
      staticReferenceCount: 0,
      status: governing ? driftStatus(governing.driftRatio, driftLimitRatio, warnRatio) : response.status,
    },
  };
}

function driftStatus(driftRatio, limitRatio, warnRatio) {
  if (!(limitRatio > 0)) return 'NA';
  if (driftRatio > limitRatio) return 'NG';
  if (driftRatio > limitRatio * warnRatio) return 'WARN';
  return 'OK';
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
