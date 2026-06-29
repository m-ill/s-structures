import { vadd, vdot, vlen, vscale } from '../core/vector.js';
import {
  dirVec,
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
  for (const load of loads) {
    if (load.member !== memberId) continue;
    const direction = dirVec(load);
    const magnitude = load.type === 'udl' ? load.w : load.P;
    const q = [vdot(ax.x, direction) * magnitude, vdot(ax.y, direction) * magnitude, vdot(ax.z, direction) * magnitude];
    if (load.type === 'point') spanLoads.push({ type: 'point', a: load.t * ax.L, q });
    else spanLoads.push({ type: 'udl', q, shape: load.shape || 'uniform' });
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
    let mz = -endForces[5] + endForces[1] * x;
    let my = endForces[4] + endForces[2] * x;
    for (const load of spanLoads) {
      if (load.type === 'point' && load.a <= x) {
        n -= load.q[0];
        vy += load.q[1];
        vz += load.q[2];
        mz += load.q[1] * (x - load.a);
        my += load.q[2] * (x - load.a);
      } else if (load.type === 'udl') {
        const { fI, mI } = integratedUniformLoad(load.shape, x, L);
        n -= load.q[0] * fI;
        vy += load.q[1] * fI;
        vz += load.q[2] * fI;
        mz += load.q[1] * mI;
        my += load.q[2] * mI;
      }
    }
    N.push(n);
    Vy.push(-vy);
    Vz.push(-vz);
    Tq.push(-endForces[3]);
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
      } else {
        const c = fixedFixedPointDeflectionFunction(load.a, x, L);
        v += (load.q[1] * c) / EIz;
        w += (load.q[2] * c) / EIy;
      }
    }

    const global = vadd(vadd(vscale(ax.x, u), vscale(ax.y, v)), vscale(ax.z, w));
    shape.push(global);
    dmaxM = Math.max(dmaxM, vlen(global));
  }

  return { shape, dmaxM };
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
