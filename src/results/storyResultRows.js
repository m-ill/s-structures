import { getStoryLevels } from '../core/storyLevels.js';
import { buildServiceabilityDriftReport } from '../design/serviceability.js';
import { finite, resultEntries } from './resultUtils.js';
import { storyResultItem } from './storyResultItem.js';
import { storyShearRows } from './storyShearRows.js';

export function buildStoryResultRows(model, analysis, options = {}) {
  const levels = getStoryLevels(model).levels;
  const drift = buildServiceabilityDriftReport(model, analysis, options.serviceability || {});
  const rows = [];
  for (const [comboId, result] of resultEntries(analysis)) {
    const baseZ = finite(levels[0]);
    const items = levels.slice(1)
      .map((z, index) => storyResultItem(model, result, comboId, index, levels, z, drift.rows));
    rows.push(...storyShearRows(items, baseZ));
  }
  return rows.sort((a, b) => a.comboId.localeCompare(b.comboId) || a.story - b.story);
}
