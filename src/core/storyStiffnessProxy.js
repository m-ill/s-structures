import { columnProxy } from './storyColumnProxy.js';
import { weightedCenter } from './storyMassValues.js';

export function storyStiffnessProxy(model, story) {
  const nodes = Object.fromEntries((model?.nodes || []).map((node) => [node.id, node]));
  const proxies = (model?.members || [])
    .map((member) => columnProxy(model, member, nodes, story))
    .filter(Boolean);
  const center = weightedCenter(proxies, (item) => item.weight);
  return {
    source: 'column-proxy',
    count: proxies.length,
    x: center.x,
    y: center.y,
    weight: center.total,
  };
}
