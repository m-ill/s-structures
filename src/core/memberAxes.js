import { vadd, vcross, vlen, vnorm, vscale, vsub } from './vector.js';

export const MEMBER_AXES_VERSION = 'p14-member-axes-v1';

/** Geometry-only member coordinate system shared by modeling and solvers. */
export function memberAxes(a, b, localAxis) {
  const v = [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)];
  const L = vlen(v);
  const x = vnorm(v);
  let aux = localAxis?.refVector && Array.isArray(localAxis.refVector) && vlen(localAxis.refVector) > 1e-9
    ? vnorm(localAxis.refVector)
    : Math.abs(x[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
  let z = vcross(x, aux);
  if (vlen(z) < 1e-9) {
    aux = Math.abs(x[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
    z = vcross(x, aux);
  }
  z = vnorm(z);
  let y = vcross(z, x);

  const roll = Number(localAxis?.roll || 0);
  if (roll) {
    const t = (roll * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const y2 = vadd(vscale(y, c), vscale(z, s));
    const z2 = vsub(vscale(z, c), vscale(y, s));
    y = y2;
    z = z2;
  }

  return { L, x, y, z };
}
