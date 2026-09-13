import {resolveLoadComponents} from '../loads/fixedEnd/common.js';
import {resolveMomentDirection} from '../loads/momentDirection.js';
import {integrateGaussPhysical} from './frame/beamInterpolation.js';
import {integrateFoundationReactionTo} from './foundation/foundationRecovery.js';
import {forEachTaperedQuadrature} from './taperedMember.js';
// Shared force field: fixed-end compatibility and result recovery use one owner.
export function geometricForceAt(end,L,x){
 if(!Array.isArray(end)||end.length!==12||!end.every(Number.isFinite)||!(Number.isFinite(L)&&L>0)||!Number.isFinite(x)||x<0||x>L)throw Error('GEOMETRIC_FORCE_SOURCE_INVALID');
 const s=x/L,pairs={N:[-end[0],end[6]],Vy:[-end[1],end[7]],Vz:[-end[2],end[8]],Tq:[-end[3],end[9]],My:[end[4],-end[10]],Mz:[-end[5],end[11]]};
 return Object.fromEntries(Object.entries(pairs).map(([key,[a,b]])=>[key,a*(1-s)+b*s]));
}
export function memberForceFromRecovery(input,x,side='point'){
 if(input?.version==='member-force-recovery-v3-piecewise'){
  const pieces=input.pieces;
  if(!Number.isFinite(input.L)||input.L<=0||!Number.isFinite(x)||x<0||x>input.L||!['point','left','right'].includes(side)||!Array.isArray(pieces)||!pieces.length||pieces.length>20||pieces[0].startX!==0||pieces.at(-1).endX!==input.L)throw Error('MEMBER_PIECEWISE_SOURCE_INVALID');
  for(let i=0;i<pieces.length;i++){
   const p=pieces[i];if(!Number.isFinite(p.startX)||!Number.isFinite(p.endX)||p.endX<=p.startX||i>0&&p.startX!==pieces[i-1].endX||!['member-force-recovery-v1','member-force-recovery-v2-geometric'].includes(p.input?.version)||Math.abs(p.input.L-(p.endX-p.startX))>1e-12)throw Error('MEMBER_PIECEWISE_SOURCE_INVALID');
  }
  const part=pieces.find(p=>x>=p.startX&&(x<p.endX||x===p.endX&&(side==='left'||x===input.L)));
  // Preserve exact recorded local boundaries after a floating-point origin shift.
  // This is an equality-based mapping, not tolerance snapping of nearby samples.
  let localX=x===part.startX?0:x===part.endX?part.input.L:x-part.startX;
  for(const load of part.input.spanLoads||[])for(const key of ['a','b'])if(Number.isFinite(load[key])&&x===part.startX+load[key])localX=load[key];
  return memberForceFromRecovery(part.input,localX,side);
 }

 if(input?.version!==undefined&&!['member-force-recovery-v1','member-force-recovery-v2-geometric'].includes(input.version))throw Error('MEMBER_FORCE_SOURCE_VERSION_UNSUPPORTED');
 const force=memberForceAt(input.endForces,input.spanLoads,input.L,x,side);
 if(input.version==='member-force-recovery-v2-geometric'){
  const extra=geometricForceAt(input.geometricEndForces,input.L,x);
  for(const key of Object.keys(force))force[key]+=extra[key];
 }
 return force;
}
export function collectMemberSpanLoads(memberId, loads, ax) {
  const spanLoads = [];
  spanLoads.issues = [];
  for (const load of loads) {
    if (load.member !== memberId) continue;
    if (load.type === 'temperature' || load.type === 'tgradient') continue;
    if (load.type === 'mmoment') {
      const M = Number(load.M);
      const direction=resolveMomentDirection(load,ax);
      if (!Number.isFinite(M)) {
        spanLoads.issues.push(loadIssue(load, 'NONFINITE_LOAD_COMPONENT', 'M', load.M));
        continue;
      }
      if (!direction.ok) {
        spanLoads.issues.push(loadIssue(load, direction.reason, 'axis', load.axis??load.dir));
        continue;
      }
      direction.local.forEach((value,k)=>{if(Math.abs(value)>1e-14)spanLoads.push({type:'moment',a:clamp01(load.at??load.t,.5)*ax.L,axis:['x','y','z'][k],M:M*value});});
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

export function memberForceAt(endForces, spanLoads, L, x, side='point') {
  if(!Number.isFinite(x)||!Number.isFinite(L)||L<=0||x<0||x>L||!['point','left','right'].includes(side))throw Error('MEMBER_FORCE_POSITION_INVALID');
  let n = -endForces[0];
  let vy = endForces[1];
  let vz = endForces[2];
  let tq = -endForces[3];
  let mz = -endForces[5] + endForces[1] * x;
  let my = endForces[4] + endForces[2] * x;
  for (const load of spanLoads) {
    if (load.type === 'point' && (load.a < x || load.a === x && side !== 'left')) {
      n -= load.q[0];
      vy += load.q[1];
      vz += load.q[2];
      mz += load.q[1] * (x - load.a);
      my += load.q[2] * (x - load.a);
    } else if (load.type === 'moment' && (load.a < x || load.a === x && side !== 'left')) {
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
    } else if (load.type === 'foundation-distributed') {
      const integrated = integrateFoundationReactionTo(load.foundation, load.localDisplacements, x);
      vy += integrated.force.localY;
      vz += integrated.force.localZ;
      mz += integrated.moment.localY;
      my += integrated.moment.localZ;
    }
  }
  return { N: n, Vy: -vy, Vz: -vz, Tq: tq, My: my, Mz: mz };
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

export function interpolateLoad(load, s) {
  const a = Number(load.a) || 0;
  const b = Number(load.b) || a;
  const eta = Math.max(0, Math.min(1, (s - a) / Math.max(1e-12, b - a)));
  return [0, 1, 2].map((i) => (Number(load.q1?.[i]) || 0) + ((Number(load.q2?.[i]) || 0) - (Number(load.q1?.[i]) || 0)) * eta);
}

export function taperedForceDisplacement(endForces,spanLoads,L,x,material,taper,shear=false){
 const out=[0,0,0,0,0,0],breaks=spanLoads.flatMap(load=>[load.a,load.b]).filter(Number.isFinite);
 forEachTaperedQuadrature(taper,L,x,breaks,(s,weight,section)=>{
  const f=memberForceAt(endForces,spanLoads,L,s);
  let axial=0,kThermal=0;
  for(const load of spanLoads)if(load.type==='initial-strain'){
   axial+=load.axial||0;
   if(load.alphaDeltaT!==undefined){
    const depth=load.explicitDepth??section.H;
    if(!(Number.isFinite(depth)&&depth>0))throw Error('TAPER_THERMAL_DEPTH_REQUIRED');
    kThermal-=load.alphaDeltaT/depth;
   }else kThermal+=load.curvatureZ||0;
  }
  const c=section.axialBendingFlexibility;
  const strain=c?c.map(row=>row[0]*f.N+row[1]*f.My+row[2]*f.Mz):[f.N/(material.E*section.A),f.My/(material.E*section.Iy),f.Mz/(material.E*section.Iz)];
  const initial=section.initialGeneralizedStrain??[0,0,0];
  const kz=strain[2]+initial[2]+kThermal,ky=strain[1]+initial[1];
  out[0]+=weight*(strain[0]+initial[0]+axial);
  out[1]+=weight*((x-s)*kz+(shear?f.Vy/(material.G*section.Ay):0));
  out[2]+=weight*((x-s)*ky+(shear?f.Vz/(material.G*section.Az):0));
  out[3]+=weight*f.Tq/(material.G*section.J);
  out[4]-=weight*ky;out[5]+=weight*kz;
 });
 return out;
}

export function integratedUniformLoad(shape, x, L) {
  if (shape === 'asc') return { fI: x ** 2 / (2 * L), mI: x ** 3 / (6 * L) };
  if (shape === 'desc') return { fI: x - x ** 2 / (2 * L), mI: x ** 2 / 2 - x ** 3 / (6 * L) };
  return { fI: x, mI: x ** 2 / 2 };
}
