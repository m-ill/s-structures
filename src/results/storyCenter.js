import { finite } from './resultUtils.js';

export function storyCenter(nodes) {
  const count = Math.max(1, nodes.length);
  return {
    x: nodes.reduce((sum, node) => sum + finite(node.x), 0) / count,
    y: nodes.reduce((sum, node) => sum + finite(node.y), 0) / count,
  };
}
