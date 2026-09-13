import {collectMemberSpanLoads,memberForceAt,taperedForceDisplacement,interpolateLoad} from './memberForceField.js';
export {collectMemberSpanLoads,memberForceAt,taperedForceDisplacement} from './memberForceField.js';
import { vadd, vlen, vscale } from '../core/vector.js';
import {
  fixedFixedDeflectionFunction,
  fixedFixedPointDeflectionFunction,
  matVec,
  maxAbs,
  solveLinear,
} from './linear3dElement.js';
import {
  buildPartialFixityRecoveryTrace,
  recoverPartialFixityDisplacements,
} from './partialFixity.js';
import { buildMemberOffsetRecoveryTrace } from './memberOffsets.js';
import { taperedSectionAt } from './taperedMember.js';
import {
  buildFoundationEndActionContract,
  evaluateStationEndClosure,
  foundationSpanLoad,
  recoverWinklerLineResult,
} from './foundation/index.js';

export function recoverMemberResult(member, md, D, loads, stationCount) {
  const { ax, section, material } = md;
  const L = ax.L;
  const jointDl = matVec(md.T, md.dof.map((dof) => D[dof]));
  const recoveredPartial = recoverPartialFixityDisplacements(jointDl, md.partialFixityApplication);
  if (!recoveredPartial) {
    const error = new Error(`Partial-fixity displacement recovery failed for member ${member.id}.`);
    error.code = 'PARTIAL_FIXITY_RECOVERY_FAILED';
    throw error;
  }
  const dl = recoveredPartial;

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

  const structuralEnd = matVec(md.klStructural || md.kl, dl).map((value, i) => value + md.f0[i]);
  const endActionContract = buildFoundationEndActionContract({
    foundation: md.foundation,
    localDisplacements: dl,
    structuralEnd,
  });
  const partialFixity = buildPartialFixityRecoveryTrace(
    md.partialFixity,
    md.partialFixityApplication,
    jointDl,
    dl,
    structuralEnd,
  );
  const offset = buildMemberOffsetRecoveryTrace(md.offsetKinematics, structuralEnd);
  const spanLoads = collectMemberSpanLoads(member.id, loads, ax);
  if(md.taper)for(const row of md.fixedEndLoads||[])if(row.recovery?.initialStrain)spanLoads.push(row.recovery.initialStrain);
  const constitutiveStations = recoverMemberStations(structuralEnd, spanLoads, L, stationCount);
  const foundationLoad = foundationSpanLoad(md.foundation, dl);
  if (foundationLoad) spanLoads.push(foundationLoad);
  const equilibriumStations = recoverMemberStations(endActionContract.equilibriumEnd, spanLoads, L, stationCount);
  const { xs, N, Vy, Vz, Tq, My, Mz } = equilibriumStations;
  const constitutiveStationEndClosure = evaluateStationEndClosure(structuralEnd, constitutiveStations, {
    basis: 'structuralEnd',
  });
  const stationEndClosure = evaluateStationEndClosure(endActionContract.equilibriumEnd, equilibriumStations, {
    basis: 'equilibriumEnd',
  });
  const { shape, dmaxM, recoveryTrace } = recoverMemberShape(
    dl,
    spanLoads,
    ax,
    material,
    section,
    L,
    stationCount,
    endActionContract.equilibriumEnd,
    md.timoshenko,
    md.taper,
  );
  const foundation = recoverWinklerLineResult(md.foundation, dl, stationCount, ax);

  const memberResult = {
    // `end` remains the structural member action for legacy consumers.
    end: structuralEnd,
    structuralEnd: endActionContract.structuralEnd,
    foundationEnd: endActionContract.foundationEnd,
    equilibriumEnd: endActionContract.equilibriumEnd,
    forceRecoveryInput: {version:'member-force-recovery-v1',L,endForces:[...endActionContract.equilibriumEnd],spanLoads},
    endActionContract,
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
    timoshenko: md.timoshenko || null,
    taper: md.taper ? {
      ...md.taper,
      stationSections: xs.map((x) => ({ x, xi: L > 0 ? x / L : 0, ...taperedSectionAt(md.taper, L > 0 ? x / L : 0) })),
    } : null,
    partialFixity,
    offset,
    foundation,
    constitutiveStations,
    equilibriumStations,
    constitutiveStationEndClosure,
    stationEndClosure,
    matrixOwnership: {
      assembly: 'klTotal',
      releaseRecovery: 'klTotal',
      structuralEndForce: 'klStructural*d+f0External',
      foundationEndForce: foundation ? 'klFoundation*d' : 'zero',
      equilibriumEndForce: 'structuralEnd+foundationEnd',
      stationRecoveryStart: 'equilibriumEnd',
      foundationReaction: foundation ? '-k(x)*N(x)*d' : 'not-applicable',
    },
    deformationRecovery: recoveryTrace,
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



export function recoverMemberStations(endForces, spanLoads, L, stationCount) {
  const xset = new Set();
  // Clamp to L: (L * i) / (stationCount - 1) can round above L for some
  // lengths (e.g. L = 1.8288), which memberForceAt rejects as out of range.
  for (let i = 0; i < stationCount; i += 1) xset.add(Math.min(L, (L * i) / (stationCount - 1)));
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
    const force = memberForceAt(endForces, spanLoads, L, x);
    N.push(force.N);
    Vy.push(force.Vy);
    Vz.push(force.Vz);
    Tq.push(force.Tq);
    My.push(force.My);
    Mz.push(force.Mz);
  }

  return { xs, N, Vy, Vz, Tq, My, Mz };
}

export function recoverMemberShape(
  dl,
  spanLoads,
  ax,
  material,
  section,
  L,
  stationCount,
  endForces = null,
  timoshenko = null,
  taper = null,
) {
  if(taper?.ok&&Array.isArray(endForces))return recoverTaperedShape(dl,endForces,spanLoads,ax,material,L,stationCount,timoshenko,taper);
  if (timoshenko?.enabled === true && Array.isArray(endForces)) {
    return recoverTimoshenkoShape(dl, endForces, spanLoads, ax, material, section, L, stationCount, timoshenko);
  }
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

  return {
    shape,
    dmaxM,
    recoveryTrace: {
      formulation: 'euler-bernoulli',
      method: 'cubic-hermite-plus-fixed-end-bubble',
      shearStrainIncluded: false,
    },
  };
}

function recoverTimoshenkoShape(dl, endForces, spanLoads, ax, material, section, L, stationCount, timoshenko) {
  const EIz = material.E * section.Iz;
  const EIy = material.E * section.Iy;
  const GAy = material.G * section.Ay;
  const GAz = material.G * section.Az;
  const invGAy = GAy > 0 && Number.isFinite(GAy) ? 1 / GAy : 0;
  const invGAz = GAz > 0 && Number.isFinite(GAz) ? 1 / GAz : 0;
  const shape = [];
  let dmaxM = 0;

  for (let i = 0; i < stationCount; i += 1) {
    const xi = i / (stationCount - 1);
    const x = xi * L;
    const u = dl[0] * (1 - xi) + dl[6] * xi;
    let v = dl[1] + dl[5] * x;
    let w = dl[2] - dl[4] * x;
    forEachRecoveryInterval(spanLoads, x, (a, b) => {
      integrateGaussPhysical(a, b, (s, weight) => {
        const force = memberForceAt(endForces, spanLoads, L, s);
        v += (((x - s) * force.Mz) / EIz + force.Vy * invGAy) * weight;
        w += (((x - s) * force.My) / EIy + force.Vz * invGAz) * weight;
      });
    });
    const global = vadd(vadd(vscale(ax.x, u), vscale(ax.y, v)), vscale(ax.z, w));
    shape.push(global);
    dmaxM = Math.max(dmaxM, vlen(global));
  }

  return {
    shape,
    dmaxM,
    recoveryTrace: {
      formulation: 'timoshenko',
      method: 'moment-curvature-plus-shear-strain-force-integration',
      shearStrainIncluded: true,
      phiY: timoshenko.phiY,
      phiZ: timoshenko.phiZ,
      shearAreaY: timoshenko.shearAreaY,
      shearAreaZ: timoshenko.shearAreaZ,
    },
  };
}



function forEachRecoveryInterval(spanLoads, x, fn) {
  if (!(x > 0)) return;
  const points = new Set([0, x]);
  for (const load of spanLoads) {
    if ((load.type === 'point' || load.type === 'moment') && load.a > 0 && load.a < x) points.add(load.a);
    if (load.type === 'distributed-linear') {
      if (load.a > 0 && load.a < x) points.add(load.a);
      if (load.b > 0 && load.b < x) points.add(load.b);
    }
  }
  const sorted = [...points].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i += 1) fn(sorted[i], sorted[i + 1]);
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



function recoverTaperedShape(dl,endForces,spanLoads,ax,material,L,count,timoshenko,taper){
 const shape=[];let dmaxM=0,tip;
 for(let i=0;i<count;i++){
  const x=L*i/(count-1),d=taperedForceDisplacement(endForces,spanLoads,L,x,material,taper,timoshenko?.enabled===true);
  d[0]+=dl[0];d[1]+=dl[1]+dl[5]*x;d[2]+=dl[2]-dl[4]*x;
  for(let j=3;j<6;j++)d[j]+=dl[j];tip=d;
  const global=vadd(vadd(vscale(ax.x,d[0]),vscale(ax.y,d[1])),vscale(ax.z,d[2]));
  shape.push(global);dmaxM=Math.max(dmaxM,vlen(global));
 }
 return {shape,dmaxM,recoveryTrace:{formulation:timoshenko?.enabled?'timoshenko':'euler-bernoulli',method:'section-interval-force-integration',shearStrainIncluded:timoshenko?.enabled===true,endDisplacementResidual:Math.max(...tip.slice(0,3).map((v,i)=>Math.abs(v-dl[6+i]))),endRotationResidual:Math.max(...tip.slice(3).map((v,i)=>Math.abs(v-dl[9+i])))}};
}
