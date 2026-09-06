import { forceAxis, round6, signedDir, signedForce } from './forceDirection.js';

export function distributePlanForce(nodes, centers, force, dir = '+x') {
  const axis = forceAxis(dir);
  const total = signedForce(force, dir);
  const base = nodes.length ? total / nodes.length : 0;
  const c = centers?.diaphragm || centers?.mass || { x: 0, y: 0 };
  const m = centers?.mass || c;
  const key = axis === 'x' ? 'y' : 'x';
  const e = centers?.eccentricity?.[key] ?? Number(m[key] || 0) - Number(c[key] || 0);
  const den = nodes.reduce((sum, node) => sum + (Number(node[key] || 0) - Number(c[key] || 0)) ** 2, 0);
  const alpha = den > 1e-12 ? e * total / den : 0;
  return nodes.map((node) => {
    const d = Number(node[key] || 0) - Number(c[key] || 0);
    return { nodeId: node.id, P: round6(base + alpha * d), dir: axis === 'x' ? signedDir(total, 'x') : signedDir(total, 'y') };
  });
}
