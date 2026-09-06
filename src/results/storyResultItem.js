import { comboFactors, finite } from './resultUtils.js';
import { storyNodalResult } from './storyNodalResult.js';
import { storyWeight } from './storyWeight.js';

export function storyResultItem(model, result, comboId, index, levels, z, driftRows) {
  const story = index + 1;
  const factors = comboFactors(result);
  const forces = storyNodalResult(model, z, factors);
  const drift = driftRows.find((row) => row.comboId === comboId && row.story === story);
  return {
    comboId,
    story,
    z,
    height: finite(z) - finite(levels[index]),
    weight: storyWeight(model, story, factors),
    forceX: forces.fx,
    forceY: forces.fy,
    forceZ: forces.fz,
    torsionMz: forces.torsionMz,
    drift: drift?.drift || 0,
    driftRatio: drift?.driftRatio || 0,
    driftStatus: drift?.status || 'NA',
  };
}
