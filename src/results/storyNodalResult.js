import { nodesAtStoryLevel } from '../core/storyLevels.js';
import { addStoryLoadEffect } from './storyLoadEffect.js';
import { factorFor } from './resultUtils.js';
import { storyCenter } from './storyCenter.js';

export function storyNodalResult(model, z, factors = {}) {
  const nodes = nodesAtStoryLevel(model, z);
  const ids = new Set(nodes.map((node) => node.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const center = storyCenter(nodes);
  const out = { fx: 0, fy: 0, fz: 0, torsionMz: 0, nodeCount: nodes.length };
  for (const load of model?.loads || []) {
    if (!ids.has(load.node) || load.P == null) continue;
    const factor = factorFor(factors, load.case || 'LC1');
    if (!factor) continue;
    const node = byId.get(load.node);
    addStoryLoadEffect(out, load, factor, node, load.derivation?.diaphragmCenter || center);
  }
  return out;
}
