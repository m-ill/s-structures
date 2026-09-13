import {memberForceFromRecovery} from '../memberForceField.js';
import {normalizedQuadraticRoots} from '../../core/normalizedQuadraticRoots.js';
const value=(c,s)=>c.reduceRight((v,a)=>v*s+a,0);
const derivativeRoots=c=>{
 const d=c.slice(1).map((v,i)=>v*(i+1));
 if(d.length<=3)return normalizedQuadraticRoots(d[2]??0,d[1]??0,d[0]??0).filter(s=>s>0&&s<1);
 return zeroes(d).filter(s=>s>0&&s<1);
};
function polynomial(samples){
 // Newton divided differences on normalized [0,1], degree at most five.
 const n=samples.length-1,d=[...samples],c=Array(n+1).fill(0);let basis=[1];
 for(let order=1;order<=n;order++)for(let i=n;i>=order;i--)d[i]=(d[i]-d[i-1])/(order/n);
 for(let i=0;i<=n;i++){
  for(let j=0;j<basis.length;j++)c[j]+=d[i]*basis[j];
  const next=Array(basis.length+1).fill(0);for(let j=0;j<basis.length;j++){next[j]-=i/n*basis[j];next[j+1]+=basis[j];}basis=next;
 }
 return c;
}
function supportedFoundation(l,L){
 const f=l.foundation,t=f?.timoshenko;
 return f?.active===true&&f.behavior==='linear-bilateral'&&f.length===L&&['localY','localZ'].every(k=>Number.isFinite(f.lineStiffness?.[k])&&f.lineStiffness[k]>=0)&&Array.isArray(l.localDisplacements)&&l.localDisplacements.length===12&&l.localDisplacements.every(Number.isFinite)&&(!t||t.enabled===false||t.enabled===true&&['phiY','phiZ'].every(k=>Number.isFinite(t[k])&&t[k]>=0));
}

function zeroes(c){
 const scale=Math.max(...c.map(Math.abs));if(!scale)return [];
 const p=c.map(v=>v/scale),bounds=[0,...derivativeRoots(p),1].sort((a,b)=>a-b),roots=[];
 for(const s of bounds)if(Math.abs(value(p,s))<=1e-13)roots.push(s);
 for(let i=1;i<bounds.length;i++){
  let lo=bounds[i-1],hi=bounds[i],flo=value(p,lo),fhi=value(p,hi);
  if(flo*fhi>=0)continue;
  for(let j=0;j<60;j++){const mid=(lo+hi)/2,f=value(p,mid);if(f===0){lo=hi=mid;break;}if((f<0)===(flo<0)){lo=mid;flo=f;}else hi=mid;}
  roots.push((lo+hi)/2);
 }
 return roots;
}
function supported(input){
 if(!['member-force-recovery-v1','member-force-recovery-v2-geometric'].includes(input?.version)||!Number.isFinite(input.L)||input.L<=0||!Array.isArray(input.endForces)||input.endForces.length!==12||!input.endForces.every(Number.isFinite)||!Array.isArray(input.spanLoads)||input.spanLoads.length>100)return false;
 if(input.version==='member-force-recovery-v2-geometric'&&(!Array.isArray(input.geometricEndForces)||input.geometricEndForces.length!==12||!input.geometricEndForces.every(Number.isFinite)))return false;
 const vector=q=>Array.isArray(q)&&q.length===3&&q.every(Number.isFinite);
 return input.spanLoads.every(l=>{
  if(l?.type==='foundation-distributed')return supportedFoundation(l,input.L);
  if(l?.type==='udl')return [undefined,'uniform','asc','desc'].includes(l.shape)&&vector(l.q);
  if(!Number.isFinite(l?.a)||l.a<0||l.a>input.L)return false;
  if(l.type==='point')return vector(l.q);
  if(l.type==='moment')return ['x','y','z'].includes(l.axis)&&Number.isFinite(l.M);
  return l.type==='distributed-linear'&&Number.isFinite(l.b)&&l.b>l.a&&l.b<=input.L&&vector(l.q1)&&vector(l.q2);
 });
}
function recoveryParts(input){
 if(supported(input))return [{startX:0,endX:input.L,input}];
 if(input?.version!=='member-force-recovery-v3-piecewise'||!Number.isFinite(input.L)||input.L<=0||!Array.isArray(input.pieces)||!input.pieces.length||input.pieces.length>20)return null;
 const parts=input.pieces;
 if(parts[0]?.startX!==0||parts.at(-1)?.endX!==input.L||parts.some((p,i)=>!p||!Number.isFinite(p.startX)||!Number.isFinite(p.endX)||p.endX<=p.startX||i>0&&p.startX!==parts[i-1].endX||!supported(p.input)||Math.abs(p.input.L-(p.endX-p.startX))>1e-12))return null;
 if(parts.reduce((n,p)=>n+p.input.spanLoads.length,0)>100)return null;
 return parts;
}
export function continuousMomentComparisonPoints(first,second,limit,relativeTolerance=1e-9){
 const nc=reason=>({status:'NOT_CHECKED',reason}),inputs=[first?.forceRecoveryInput,second?.forceRecoveryInput];
 const parts=inputs.map(recoveryParts);
 if(!Number.isFinite(limit)||limit<=0||!Number.isFinite(relativeTolerance)||relativeTolerance<0||relativeTolerance>=1||parts.some(p=>!p)||inputs[0].L!==inputs[1].L||first.loadRecoveryIssues?.length||second.loadRecoveryIssues?.length)return nc('CONTINUOUS_MOMENT_RECOVERY_SCOPE_REQUIRED');
 const costs=parts.map(ps=>ps.length+ps.reduce((n,p)=>n+p.input.spanLoads.reduce((a,l)=>a+(l.type==='foundation-distributed'?5:1),0),0));
 const L=inputs[0].L,loads=costs[0]+costs[1],boundaries=[...new Set([0,L,...parts.flatMap(ps=>ps.flatMap(p=>[p.startX,p.endX,...p.input.spanLoads.flatMap(l=>['udl','foundation-distributed'].includes(l.type)?[]:l.type==='distributed-linear'?[p.startX+l.a,p.startX+l.b]:[p.startX+l.a])]))])].sort((a,b)=>a-b);
 let work=0;
 const evaluate=(index,x,side)=>{work+=costs[index];if(work>200000)throw Error('CONTINUOUS_MOMENT_WORK_LIMIT');const f=memberForceFromRecovery(inputs[index],x,side);if(!['My','Mz'].every(k=>Number.isFinite(f[k])&&Math.abs(f[k])<Number.MAX_VALUE*1e-12))throw Error('CONTINUOUS_MOMENT_NUMERICAL_RANGE');return {My:f.My,Mz:f.Mz};};
 try{
  for(const [index,row] of [first,second].entries()){
   if(row.ax?.L!==undefined&&row.ax.L!==L)throw Error('CONTINUOUS_MOMENT_LENGTH_MISMATCH');
   if(row.stationSides!==undefined&&(!Array.isArray(row.stationSides)||row.stationSides.length!==row.xs?.length))throw Error('CONTINUOUS_MOMENT_STATIONS_REQUIRED');
   if(!row.xs?.length||row.xs.length>600||!['My','Mz'].every(k=>row[k]?.length===row.xs.length)||row.xs[0]!==0||row.xs.at(-1)!==L)throw Error('CONTINUOUS_MOMENT_STATIONS_REQUIRED');
   for(let i=0;i<row.xs.length;i++){
    const side=row.stationSides?.[i]??'point',x=row.xs[i];
    if(!Number.isFinite(x)||!['point','left','right'].includes(side)||i&&x<row.xs[i-1])throw Error('CONTINUOUS_MOMENT_STATIONS_REQUIRED');
    const recovered=evaluate(index,x,side);
    if(['My','Mz'].some(k=>!Number.isFinite(row[k][i])||Math.abs(recovered[k]-row[k][i])>1e-9+1e-8*Math.max(Math.abs(recovered[k]),Math.abs(row[k][i]))))throw Error('CONTINUOUS_MOMENT_SOURCE_MISMATCH');
   }
  }
  if(boundaries.length>202||(16*(boundaries.length-1)+first.xs.length+second.xs.length)*Math.max(1,loads)>200000)throw Error('CONTINUOUS_MOMENT_WORK_LIMIT');
  const points=[],seen=new Set();
  const add=(x,side)=>{const key=`${x}:${side}`;if(seen.has(key))return;if(points.length>=1200)throw Error('CONTINUOUS_MOMENT_POINT_LIMIT');seen.add(key);points.push({x,side,first:evaluate(0,x,side),second:evaluate(1,x,side)});};
  for(let i=1;i<boundaries.length;i++){
   const from=boundaries[i-1],to=boundaries[i],h=to-from;if(!(h>1e-12))throw Error('CONTINUOUS_MOMENT_INTERVAL_TOO_SHORT');
   const polys=inputs.map((_,index)=>{
    const degree=parts.some(ps=>ps.some(p=>p.input.spanLoads.some(l=>l.type==='foundation-distributed')))?5:3;
    const samples=Array.from({length:degree+1},(_,i)=>i/degree).map(s=>evaluate(index,s===1?to:from+h*s,s===1?'left':'right'));
    const result={};for(const k of ['My','Mz']){result[k]=polynomial(samples.map(r=>r[k]));if(!result[k].every(Number.isFinite))throw Error('CONTINUOUS_MOMENT_NUMERICAL_RANGE');}
    return result;
   });
   add(from,'right');add(to,'left');
   // On each fixed-sign interval |M2|-limit*|M1| is one of four polynomials (degree at most five).
   // Its maximum lies at an endpoint, a moment zero, or a derivative root.
   for(const k of ['My','Mz']){
    const roots=[...zeroes(polys[0][k]),...zeroes(polys[1][k])];
    // Positive excess implies |M2|>|M1|, so the relative tolerance uses |M2|.
    // Include critical points for both the raw excess and the tolerance-adjusted excess.
    for(const scale of [1,1-relativeTolerance])for(const a of [-1,1])for(const b of [-1,1])roots.push(...derivativeRoots(polys[1][k].map((v,j)=>scale*a*v-b*limit*polys[0][k][j])));
    for(const s of new Set(roots.filter(s=>Number.isFinite(s)&&s>0&&s<1)))add(from+h*s,'point');
   }
  }
  points.sort((a,b)=>a.x-b.x||({left:0,point:1,right:2}[a.side]-{left:0,point:1,right:2}[b.side]));
  return {status:'OK',points,intervalCount:boundaries.length-1,workUnits:work,basis:'verified piecewise-polynomial recovery (degree at most five); absolute-moment difference critical points and both boundary sides',intervalCoverageVerified:true};
 }catch(error){return nc(error.message);}
}
