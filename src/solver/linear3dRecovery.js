import { vadd, vlen, vscale } from '../core/vector.js';
import { resolveLoadComponents } from '../loads/fixedEnd/common.js';
import {
  fixedFixedDeflectionFunction,
  fixedFixedPointDeflectionFunction,
  integratedUniformLoad,
  matVec,
  maxAbs,
  solveLinear,
} from './linear3dElement.js';

export function recoverMemberResult(member, md, D, loads, stationCount) {
  const { ax, section, material } = md;
  const L = ax.L;
  const dl = matVec(md.T, md.dof.map((dof) => D[dof]));

  if (md.rel.length) {
    const retained = [...Array(12).keys()].filter((i) => !md.rel.includes(i));
    const kcc = md.rel.map((i) => md.rel.map((j) => md.kl[i][j]));
    const rhs = md.rel.map((i) => {
      let sum = md.f0[i];
      for (const j of retained) sum += md.kl[i][j] * dl[j];
      return -sum;
    });
    const dc = solveLinear(kcc.map((row) => row.slice()), rhs);
    if (dc) md.rel.forEach((releaseDof, k) => {
      dl[releaseDof] = dc[k];
    });
  }

  const endForces = matVec(md.kl, dl).map((value, i) => value + md.f0[i]);
  const spanLoads = collectMemberSpanLoads(member.id, loads, ax);
  const { xs, N, Vy, Vz, Tq, My, Mz } = recoverMemberStations(endForces, spanLoads, L, stationCount);
  const { shape, dmaxM } = recoverMemberShape(dl, spanLoads, ax, material, section, L, stationCount);

  const memberResult = {
    end: endForces,
    dl,
    ax,
    xs,
    N,
    Vy,
    Vz,
    Tq,
    My,
    Mz,
    L,
    fixedEndLoads: md.fixedEndLoads || [],
    loadRecoveryIssues: spanLoads.issues || [],
    shape,
    dmaxM,
    Nmax: maxAbs(N),
    Vymax: maxAbs(Vy),
    Vzmax: maxAbs(Vz),
    Tmax: maxAbs(Tq),
    Mymax: maxAbs(My),
    Mzmax: maxAbs(Mz),
  };
  memberResult.check = sectionCheck(section, material, memberResult, L);
  return memberResult;
}

export function collectMemberSpanLoads(memberId, loads, ax) {
  const spanLoads = [];
  spanLoads.issues = [];
  for (const load of loads) {
    if (load.member !== memberId) continue;
    if (load.type === 'temperature' || load.type === 'tgradient') continue;
    if (load.type === 'mmoment') {
      const M = Number(load.M);
      const axis = load.axis || 'z';
      if (!Number.isFinite(M)) {
        spanLoads.issues.push(loadIssue(load, 'NONFINITE_LOAD_COMPONENT', 'M', load.M));
        continue;
      }
      if (!['x', 'y', 'z'].includes(axis)) {
        spanLoads.issues.push(loadIssue(load, 'UNSUPPORTED_MEMBER_MOMENT_AXIS', 'axis', axis));
        continue;
      }
      spanLoads.push({ type: 'moment', a: clamp01(load.at ?? load.t, 0.5) * ax.L, axis, M });
      continue;
    }
    if (load.type === 'point') {
      const resolved = resolveLoadComponents(load, ax, load.P, 'P');
      if (!resolved.ok) {
        spanLoads.issues.push(resolved.issue);
        continue;
      }
      spanLoads.push({ type: 'point', a: clamp01(load.t ?? load.at, 0.5) * ax.L, q: resolved.localComponents, sourceRange: load.sourceRange || null });
    } else if (load.type === 'udl') {
      const resolved = resolveLoadComponents(load, ax, load.w, 'w');
      if (!resolved.ok) {
        spanLoads.issues.push(resolved.issue);
        continue;
      }
      spanLoads.push({ type: 'udl', q: resolved.localComponents, shape: load.shape || 'uniform' });
    } else if (load.type === 'udl-partial') {
      const resolved = resolveLoadComponents(load, ax, load.w, 'w');
      if (!resolved.ok) {
        spanLoads.issues.push(resolved.issue);
        continue;
      }
      const from = clamp01(load.from, 0);
      const to = clamp01(load.to, 1);
      spanLoads.push({ type: 'distributed-linear', a: from * ax.L, b: to * ax.L, q1: resolved.localComponents, q2: resolved.localComponents, sourceRange: { from, to } });
    } else if (load.type === 'trapezoid') {
      const start = resolveLoadComponents(load, ax, load.w1, 'w1');
      const end = resolveLoadComponents(load, ax, load.w2, 'w2');
      if (!start.ok || !end.ok) {
        spanLoads.issues.push(...[start.issue, end.issue].filter(Boolean));
        continue;
      }
      const from = clamp01(load.from, 0);
      const to = clamp01(load.to, 1);
      spanLoads.push({ type: 'distributed-linear', a: from * ax.L, b: to * ax.L, q1: start.localComponents, q2: end.localComponents, sourceRange: { from, to } });
    }
  }
  return spanLoads;
}

export function recoverMemberStations(endForces, spanLoads, L, stationCount) {
  const xset = new Set();
  for (let i = 0; i < stationCount; i += 1) xset.add((L * i) / (stationCount - 1));
  spanLoads.forEach((load) => {
    if (load.type === 'point') {
      xset.add(Math.max(0, load.a - 1e-9));
      xset.add(Math.min(L, load.a + 1e-9));
      if (load.sourceRange) {
        xset.add(Math.max(0, load.sourceRange.from * L - 1e-9));
        xset.add(Math.min(L, load.sourceRange.from * L + 1e-9));
        xset.add(Math.max(0, load.sourceRange.to * L - 1e-9));
        xset.add(Math.min(L, load.sourceRange.to * L + 1e-9));
      }
    } else if (load.type === 'moment') {
      xset.add(Math.max(0, load.a - 1e-9));
      xset.add(Math.min(L, load.a + 1e-9));
    } else if (load.type === 'distributed-linear') {
      xset.add(Math.max(0, load.a - 1e-9));
      xset.add(Math.min(L, load.a + 1e-9));
      xset.add(Math.max(0, load.b - 1e-9));
      xset.add(Math.min(L, load.b + 1e-9));
    }
  });

  const xs = [...xset].sort((p, q) => p - q);
  const N = [];
  const Vy = [];
  const Vz = [];
  const Tq = [];
  const My = [];
  const Mz = [];

  for (const x of xs) {
    let n = -endForces[0];
    let vy = endForces[1];
    let vz = endForces[2];
    let tq = -endForces[3];
    let mz = -endForces[5] + endForces[1] * x;
    let my = endForces[4] + endForces[2] * x;
    for (const load of spanLoads) {
      if (load.type === 'point' && load.a <= x) {
        n -= load.q[0];
        vy += load.q[1];
        vz += load.q[2];
        mz += load.q[1] * (x - load.a);
        my += load.q[2] * (x - load.a);
      } else if (load.type === 'moment' && load.a <= x) {
        if (load.axis === 'x') tq -= load.M;
        else if (load.axis === 'y') my += load.M;
        else if (load.axis === 'z') mz -= load.M;
      } else if (load.type === 'udl') {
        const { fI, mI } = integratedUniformLoad(load.shape, x, L);
        n -= load.q[0] * fI;
        vy += load.q[1] * fI;
        vz += load.q[2] * fI;
        mz += load.q[1] * mI;
        my += load.q[2] * mI;
      } else if (load.type === 'distributed-linear') {
        const { f, m } = integrateDistributedLinearTo(load, x);
        n -= f[0];
        vy += f[1];
        vz += f[2];
        mz += m[1];
        my += m[2];
      }
    }
    N.push(n);
    Vy.push(-vy);
    Vz.push(-vz);
    Tq.push(tq);
    My.push(my);
    Mz.push(mz);
  }

  return { xs, N, Vy, Vz, Tq, My, Mz };
}

export function recoverMemberShape(dl, spanLoads, ax, material, section, L, stationCount) {
  const EIz = material.E * section.Iz;
  const EIy = material.E * section.Iy;
  const shape = [];
  let dmaxM = 0;

  for (let i = 0; i < stationCount; i += 1) {
    const xi = i / (stationCount - 1);
    const x = xi * L;
    const u = dl[0] * (1 - xi) + dl[6] * xi;
    const H1 = 1 - 3 * xi * xi + 2 * xi ** 3;
    const H2 = L * xi * (1 - xi) * (1 - xi);
    const H3 = 3 * xi * xi - 2 * xi ** 3;
    const H4 = L * xi * xi * (xi - 1);
    let v = H1 * dl[1] + H2 * dl[5] + H3 * dl[7] + H4 * dl[11];
    let w = H1 * dl[2] + H2 * -dl[4] + H3 * dl[8] + H4 * -dl[10];

    for (const load of spanLoads) {
      if (load.type === 'udl') {
        const f = fixedFixedDeflectionFunction(load.shape, x, L);
        v += (load.q[1] * f) / EIz;
        w += (load.q[2] * f) / EIy;
      } else if (load.type === 'point') {
        const c = fixedFixedPointDeflectionFunction(load.a, x, L);
        v += (load.q[1] * c) / EIz;
        w += (load.q[2] * c) / EIy;
      } else if (load.type === 'distributed-linear') {
        const c = integrateDistributedLinearDeflection(load, x, L);
        v += c[1] / EIz;
        w += c[2] / EIy;
      } else if (load.type === 'moment') {
        const c = fixedFixedPointMomentDeflectionFunction(load.a, x, L);
        if (load.axis === 'z') v += (load.M * c) / EIz;
        else if (load.axis === 'y') w -= (load.M * c) / EIy;
      }
    }

    const global = vadd(vadd(vscale(ax.x, u), vscale(ax.y, v)), vscale(ax.z, w));
    shape.push(global);
    dmaxM = Math.max(dmaxM, vlen(global));
  }

  return { shape, dmaxM };
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function loadIssue(load, code, component, value) {
  return { code, entityType: 'load', entityId: load.id || null, memberId: load.member || null, component, value };
}

function integrateDistributedLinearTo(load, x) {
  const lo = Math.max(0, Number(load.a) || 0);
  const hi = Math.min(Number(x) || 0, Number(load.b) || 0);
  const f = [0, 0, 0];
  const m = [0, 0, 0];
  if (!(hi > lo)) return { f, m };
  integrateGaussPhysical(lo, hi, (s, weight) => {
    const q = interpolateLoad(load, s);
    const arm = x - s;
    for (let i = 0; i < 3; i += 1) {
      f[i] += q[i] * weight;
      m[i] += q[i] * arm * weight;
    }
  });
  return { f, m };
}

function integrateDistributedLinearDeflection(load, x, L) {
  const lo = Math.max(0, Number(load.a) || 0);
  const hi = Math.min(Number(load.b) || 0, L);
  const out = [0, 0, 0];
  if (!(hi > lo)) return out;
  integrateGaussPhysical(lo, hi, (s, weight) => {
    const q = interpolateLoad(load, s);
    const c = fixedFixedPointDeflectionFunction(s, x, L);
    out[1] += q[1] * c * weight;
    out[2] += q[2] * c * weight;
  });
  return out;
}

function fixedFixedPointMomentDeflectionFunction(a, x, L) {
  if (!(L > 0)) return 0;
  const position = Math.max(0, Math.min(L, Number(a) || 0));
  if (x <= position) {
    const b = L - position;
    const h = 3 * position * L - (L + 2 * position) * x;
    return (x ** 2 * (-2 * b * h + b ** 2 * (3 * L - 2 * x))) / (6 * L ** 3);
  }
  const x2 = L - x;
  const h = 3 * (L - position) * L - (3 * L - 2 * position) * x2;
  return (x2 ** 2 * (2 * position * h + position ** 2 * (-3 * L + 2 * x2))) / (6 * L ** 3);
}

function interpolateLoad(load, s) {
  const a = Number(load.a) || 0;
  const b = Number(load.b) || a;
  const eta = Math.max(0, Math.min(1, (s - a) / Math.max(1e-12, b - a)));
  return [0, 1, 2].map((i) => (Number(load.q1?.[i]) || 0) + ((Number(load.q2?.[i]) || 0) - (Number(load.q1?.[i]) || 0)) * eta);
}

function integrateGaussPhysical(a, b, fn) {
  const points = [
    [-0.906179845938664, 0.236926885056189],
    [-0.538469310105683, 0.478628670499366],
    [0, 0.568888888888889],
    [0.538469310105683, 0.478628670499366],
    [0.906179845938664, 0.236926885056189],
  ];
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  for (const [point, weight] of points) fn(mid + half * point, half * weight);
}

export function sectionCheck(section, material, memberResult, L) {
  const Fa = material.fa || material.fb;
  const Fb = material.fb;
  const Fv = material.fs;
  const rN = memberResult.Nmax / (section.A * Fa);
  const rM = memberResult.Mzmax / (section.Zz * Fb) + memberResult.Mymax / (section.Zy * Fb);
  const rV = (1.5 * Math.max(memberResult.Vymax, memberResult.Vzmax)) / (section.A * Fv);
  const ratio = Math.max(rN + rM, rV);
  return {
    formula: 'elastic_stress_interaction',
    expression: '|N|/(A*Fa) + |Mz|/(Zz*Fb) + |My|/(Zy*Fb) <= 1, shear 1.5V/(A*Fv) <= 1',
    inputs: {
      N: memberResult.Nmax,
      Mz: memberResult.Mzmax,
      My: memberResult.Mymax,
      Vmax: Math.max(memberResult.Vymax, memberResult.Vzmax),
      A: section.A,
      Zz: section.Zz,
      Zy: section.Zy,
      Fa,
      Fb,
      Fv,
      KLry: section.ry ? Number((L / section.ry).toFixed(1)) : null,
      KLrz: section.rz ? Number((L / section.rz).toFixed(1)) : null,
    },
    rN,
    rM,
    rV,
    ratio,
    limit: 1,
    ok: ratio <= 1,
    status: ratio <= 1 ? 'OK' : 'NG',
    governing: rN + rM >= rV ? 'axial+bending' : 'shear',
  };
}
