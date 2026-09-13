import {RC_LAP_DESIGN_LIMITS} from '../../metadata/rcLapDesignCapabilities.js';
import {proportionalBending} from './proportionalBending.js';
import {memberForceFromRecovery} from '../../solver/memberForceField.js';
import {verifyRecoverySource} from './recoverySourceVerification.js';
const vector=q=>Array.isArray(q)&&q.length===3&&q.every(Number.isFinite);
function supported(load,L){
 if(!load)return false;
 const position=Number.isFinite(load.a)&&load.a>=0&&load.a<=L;
 if(load.type==='udl')return [undefined,'uniform','asc','desc'].includes(load.shape)&&vector(load.q);
 if(load.type==='point')return position&&vector(load.q);
 if(load.type==='moment')return position&&['x','y','z'].includes(load.axis)&&Number.isFinite(load.M);
 return load.type==='distributed-linear'&&position&&Number.isFinite(load.b)&&load.b>load.a&&load.b<=L&&load.b-load.a>=1e-12&&vector(load.q1)&&vector(load.q2);
}
export function classAMomentEnvelope(input,tuples,length,loadIssues=[]){
 const nc=reason=>({status:'NOT_CHECKED',reason});
 const constantTension=rows=>{const axial=rows[0]?.N,tolerance=1e-9*Math.max(1,Math.abs(axial));return Number.isFinite(axial)&&axial>=-1e-9&&rows.every(r=>Number.isFinite(r.N)&&r.N>=-1e-9&&Math.abs(r.N-axial)<=tolerance);};
 if(input?.version==='member-force-recovery-v3-piecewise'){
  const verification=verifyRecoverySource(input,tuples,length,loadIssues);
  if(verification.status!=='OK')return {...nc(verification.reason),verification};
  const pieces=input.pieces,loadCount=pieces.reduce((n,p)=>n+p.input.spanLoads.length,0);
  if(loadCount>RC_LAP_DESIGN_LIMITS.maxSpanLoads||(tuples.length+16*loadCount+8*pieces.length)*Math.max(1,loadCount)>RC_LAP_DESIGN_LIMITS.maxEnvelopeWorkUnits)return nc('CLASS_A_ENVELOPE_WORK_LIMIT');
  const result=[],positions=[],polynomialSegments=[];
  for(const piece of pieces){
   const from=piece.startX,to=piece.endX,L=to-from;
   const local=tuples.filter(t=>t.x>from&&t.x<to).map(t=>({...t,x:t.x-from}));
   for(const [x,side] of [[0,'right'],[L,'left']]){const f=memberForceFromRecovery(piece.input,x,side);local.push({...tuples[0],...f,T:f.Tq,x,side});}
   const e=classAMomentEnvelope(piece.input,local,L);
   if(e.status!=='OK')return e;
   result.push(...e.tuples.map(t=>({...t,x:t.x+from})));
   positions.push(...e.positions.map(x=>x+from));
   polynomialSegments.push(...e.polynomialSegments.map(p=>({...p,from:p.from+from,to:p.to+from})));
   if(result.length>RC_LAP_DESIGN_LIMITS.maxStations)return nc('CLASS_A_ENVELOPE_STATION_LIMIT');
  }
  if(result.some(r=>!Number.isFinite(r.N)||r.N < -1e-9))return nc('CLASS_A_CONSTANT_TENSION_REQUIRED');
  const bending=proportionalBending(result);if(bending.status!=='OK')return bending;
  return {status:'OK',bending,tuples:result.sort((a,b)=>a.x-b.x).map((t,station)=>({...t,station})),positions:[...new Set(positions)].sort((a,b)=>a-b),polynomialSegments,verification,normalisedCoordinate:'s=(x-from)/(to-from)',basis:'verified piecewise recovery; local polynomial extrema and both piece boundary sides',independentSolverComparison:false};
 }

 if(!['member-force-recovery-v1','member-force-recovery-v2-geometric'].includes(input?.version)||!Array.isArray(input.spanLoads)||input.spanLoads.length>RC_LAP_DESIGN_LIMITS.maxSpanLoads||input.spanLoads.some(l=>!supported(l,length)))return nc('CLASS_A_POLYNOMIAL_RECOVERY_SCOPE_REQUIRED');
 const boundaries=[...new Set([0,length,...input.spanLoads.flatMap(l=>l.type==='distributed-linear'?[l.a,l.b]:['point','moment'].includes(l.type)?[l.a]:[])])].sort((a,b)=>a-b);
 // Bound source verification, four samples and at most two roots per interval together.
 if((tuples?.length+8*(boundaries.length-1))*Math.max(1,input.spanLoads.length)>RC_LAP_DESIGN_LIMITS.maxEnvelopeWorkUnits)return nc('CLASS_A_ENVELOPE_WORK_LIMIT');
 const verification=verifyRecoverySource(input,tuples,length,loadIssues);if(verification.status!=='OK')return {...nc(verification.reason),verification};
 const result=tuples.filter(t=>!boundaries.includes(t.x)),positions=[...boundaries],polynomialSegments=[];
 function append(x,side){
  const force=memberForceFromRecovery(input,x,side);
  result.push({...tuples[0],...force,T:force.Tq,x,side,demandInterpolated:false,recoveryBasis:'verified-piecewise-cubic-moment-extrema'});
 }
 for(let i=0;i<boundaries.length-1;i++){
 const from=boundaries[i],to=boundaries[i+1],width=to-from,samples=[];
 try{for(const s of [0,1/3,2/3,1])samples.push(memberForceFromRecovery(input,s===1?to:from+width*s,s===1?'left':'right'));}catch{return nc('CLASS_A_POLYNOMIAL_RECOVERY_REQUIRED');}
 if(samples.some(r=>Object.values(r).some(v=>!Number.isFinite(v))||Math.abs(r.Tq)>1e-9))return nc('CLASS_A_UNIAXIAL_FLEXURE_REQUIRED');
 const variablePureTension=!constantTension(samples)&&samples.every(r=>Math.hypot(r.My,r.Mz)<=1e-9);
 if(!constantTension(samples)&&!variablePureTension)return nc('CLASS_A_CONSTANT_TENSION_REQUIRED');
 const bending=proportionalBending(samples);if(bending.status!=='OK')return bending;
 const [f0,f1,f2,f3]=samples.map(r=>variablePureTension?r.N:r.My*bending.direction.My+r.Mz*bending.direction.Mz),d1=f1-f0,d2=f2-2*f1+f0,d3=f3-3*f2+3*f1-f0;
 const coefficients=[f0,3*(d1-d2/2+d3/3),9*(d2-d3)/2,27*d3/6];
 if(!coefficients.every(Number.isFinite))return nc('CLASS_A_POLYNOMIAL_RANGE_REQUIRED');
 const scale=Math.max(...coefficients.slice(1).map(Math.abs))||1,a=3*(coefficients[3]/scale),b=2*(coefficients[2]/scale),c=coefficients[1]/scale,roots=[];
 if(a===0){if(b!==0)roots.push(-c/b);}else{
  const discriminant=b*b-4*a*c,tolerance=1e-12*(b*b+Math.abs(4*a*c));
  if(discriminant>=-tolerance){const sqrt=Math.sqrt(Math.max(0,discriminant)),q=-.5*(b+(b>=0?sqrt:-sqrt));if(q===0)roots.push(-b/(2*a));else roots.push(q/a,c/q);}
 }

 polynomialSegments.push({from,to,coefficients,direction:bending.direction,component:variablePureTension?'axial-force':'signed-proportional-moment'});
 append(from,'right');append(to,'left');
 for(const s of new Set(roots.filter(s=>Number.isFinite(s)&&s>0&&s<1))){const x=from+s*width;positions.push(x);if(!result.some(t=>t.x===x))append(x,'point');}
 if(result.length>RC_LAP_DESIGN_LIMITS.maxStations)return nc('CLASS_A_ENVELOPE_STATION_LIMIT');
 }
 if(result.some(r=>!Number.isFinite(r.N)||r.N < -1e-9))return nc('CLASS_A_TENSION_ENVELOPE_REQUIRED');
 result.sort((a,b)=>a.x-b.x||(a.side==='left'?-1:b.side==='left'?1:0));
 const bending=proportionalBending(result);if(bending.status!=='OK')return bending;
 return {status:'OK',bending,tuples:result.map((t,station)=>({...t,station})),positions:[...new Set(positions)].sort((a,b)=>a-b),verification,polynomialSegments,normalisedCoordinate:'s=(x-from)/(to-from)',basis:'piecewise uniform/linear distributed and concentrated load equilibrium field; cubic derivative roots and both sides of internal boundaries',independentSolverComparison:false};
}
