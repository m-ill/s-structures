import { directionVector } from './loadDirection.js';
import { finite } from './resultUtils.js';

export function addStoryLoadEffect(out, load, factor, node, center) {
  const dir = directionVector(load.direction || load.dir);
  const force = finite(load.P) * factor;
  out.fx += dir[0] * force;
  out.fy += dir[1] * force;
  out.fz += dir[2] * force;
  out.torsionMz += (finite(node?.x) - finite(center.x)) * dir[1] * force
    - (finite(node?.y) - finite(center.y)) * dir[0] * force;
}
