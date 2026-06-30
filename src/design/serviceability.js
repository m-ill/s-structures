import { getStoryLevels, nodesAtStoryLevel } from '../core/storyLevels.js';

export const SERVICEABILITY_DRIFT_VERSION = 'm49-serviceability-drift';

export function buildServiceabilityDriftReport(model, analysis, options = {}) {
  const driftLimitRatio = finite(options.driftLimitRatio, 1 / 200);
  const warnRatio = finite(options.warnRatio, 0.8);
  const levels = getStoryLevels(model).levels;
  const resultEntries = Object.entries(analysis?.byCombo || {});
  if (!resultEntries.length && analysis?.envelope) resultEntries.push(['ENVELOPE', analysis.envelope]);

  const rows = [];
  for (const [comboId, result] of resultEntries) {
    for (let index = 1; index < levels.length; index += 1) {
      const lower = levels[index - 1];
      const upper = levels[index];
      const story = buildStoryDriftRow(model, result, comboId, index, lower, upper, driftLimitRatio, warnRatio);
      if (story) rows.push(story);
    }
  }

  const governing = rows.reduce((best, row) => (!best || row.driftRatio > best.driftRatio ? row : best), null);
  return {
    version: SERVICEABILITY_DRIFT_VERSION,
    criteria: {
      driftLimitRatio,
      warnRatio,
      limitText: `H/${Math.round(1 / driftLimitRatio)}`,
    },
    rows,
    summary: {
      storyCount: Math.max(0, levels.length - 1),
      comboCount: resultEntries.length,
      rowCount: rows.length,
      maxDrift: governing?.drift || 0,
      maxDriftRatio: governing?.driftRatio || 0,
      governing,
      status: governing ? statusForRatio(governing.driftRatio, driftLimitRatio, warnRatio) : 'NA',
    },
  };
}

function buildStoryDriftRow(model, result, comboId, storyIndex, lowerZ, upperZ, driftLimitRatio, warnRatio) {
  const height = upperZ - lowerZ;
  if (!(height > 1e-9)) return null;
  const pairs = verticalNodePairs(model, lowerZ, upperZ);
  if (!pairs.length) return null;

  let governing = null;
  for (const pair of pairs) {
    const lowerDisp = nodeDisp(result, pair.lower.id);
    const upperDisp = nodeDisp(result, pair.upper.id);
    const dx = upperDisp[0] - lowerDisp[0];
    const dy = upperDisp[1] - lowerDisp[1];
    const drift = Math.hypot(dx, dy);
    if (!governing || drift > governing.drift) {
      governing = {
        lowerNode: pair.lower.id,
        upperNode: pair.upper.id,
        dx,
        dy,
        drift,
      };
    }
  }
  if (!governing) return null;
  const driftRatio = governing.drift / height;
  return {
    comboId,
    story: storyIndex,
    lowerZ,
    upperZ,
    height,
    lowerNode: governing.lowerNode,
    upperNode: governing.upperNode,
    driftX: governing.dx,
    driftY: governing.dy,
    drift: governing.drift,
    driftRatio,
    limitRatio: driftLimitRatio,
    demandToLimit: driftLimitRatio > 0 ? driftRatio / driftLimitRatio : 0,
    status: statusForRatio(driftRatio, driftLimitRatio, warnRatio),
  };
}

function verticalNodePairs(model, lowerZ, upperZ) {
  const lower = nodesAtStoryLevel(model, lowerZ);
  const upper = nodesAtStoryLevel(model, upperZ);
  const pairs = [];
  for (const top of upper) {
    const bottom = lower.find((node) => samePlanLocation(node, top));
    if (bottom) pairs.push({ lower: bottom, upper: top });
  }
  return pairs;
}

function samePlanLocation(a, b) {
  return Math.abs(finite(a.x, 0) - finite(b.x, 0)) <= 1e-6
    && Math.abs(finite(a.y, 0) - finite(b.y, 0)) <= 1e-6;
}

function nodeDisp(result, nodeId) {
  const disp = result?.disp?.[nodeId] || result?.nodeDisplacements?.[nodeId] || [0, 0, 0];
  return [finite(disp[0], 0), finite(disp[1], 0), finite(disp[2], 0)];
}

function statusForRatio(driftRatio, limitRatio, warnRatio) {
  if (!(limitRatio > 0)) return 'NA';
  if (driftRatio > limitRatio) return 'NG';
  if (driftRatio > limitRatio * warnRatio) return 'WARN';
  return 'OK';
}

function finite(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
