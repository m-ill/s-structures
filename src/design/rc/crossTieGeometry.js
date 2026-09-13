import {crossTieAssembly} from './crossTieAssembly.js';
import {stirrupDistribution} from './stirrupDistribution.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';

// Each pair declares a plane and the side of its straight body. Left/right is
// relative to the directed pair in local (y,z). Arc length is analytic; points
// are a bounded display tessellation, never the source of the cutting length.
export function crossTieGeometry(detail,{B,H,length}) {
 const base={fabricationApproved:false,units:{length:'m'},assemblyStatus:'NOT_CHECKED',assemblyReason:'CROSS_TIE_CAGE_COLLISION_AND_SUPPORT_CONTACT_REQUIRED',codeReferences:getKcscRuleSources(['142050']).map(r=>({...r,clause:'4.1.1(2); 4.1.2(2)'}))};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,pieces:[]});
 const pairs=detail.crossTieBarPairs,sides=detail.crossTieHookSides,offsets=detail.crossTiePlaneOffsets,bars=detail.bars;
 if(!Array.isArray(pairs)||!pairs.length||pairs.length>20||!Array.isArray(bars)||bars.length>100)return nc('CROSS_TIE_PAIRS_REQUIRED');
 if(!Array.isArray(sides)||!Array.isArray(offsets)||sides.length!==pairs.length||offsets.length!==pairs.length||sides.some(s=>!['left','right'].includes(s))||offsets.some(s=>typeof s!=='string'||!s.trim()||!Number.isFinite(Number(s))||Math.abs(Number(s))>1))return nc('CROSS_TIE_ORIENTATION_AND_PLANE_REQUIRED');
 const db=detail.stirrups?.diameter,inside=detail.tieBendInsideRadius,tail=detail.tieHookTail,cover=detail.cover;
 if(detail.tieClosure!=='standard-135'||![db,inside,tail,B,H,cover].every(v=>Number.isFinite(v)&&v>0)||bars.some(b=>![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0))return nc('CROSS_TIE_HOOK_GEOMETRY_REQUIRED');
 if(db>.0254||db>.016&&db<.019)return nc('KDS_BAR_SIZE_CLASS_REQUIRED');
 const pieces=[],seen=new Set(),R=inside+db/2,angle=3*Math.PI/4,steps=18;
 for(const [index,pair] of pairs.entries()){
  if(typeof pair!=='string'||!/^\d+:\d+$/.test(pair))return nc('CROSS_TIE_PAIR_FORMAT_REQUIRED');
  const [a,b]=pair.split(':').map(v=>Number(v)-1),key=[a,b].sort((a,b)=>a-b).join(':');
  if(a===b||!bars[a]||!bars[b]||seen.has(key))return nc('CROSS_TIE_PAIR_INDICES_INVALID');seen.add(key);
  const A=bars[a],Z=bars[b],L=Math.hypot(Z.y-A.y,Z.z-A.z);
  if(L<=0)return nc('CROSS_TIE_ZERO_SPAN');
  const u=[(Z.y-A.y)/L,(Z.z-A.z)/L],sign=sides[index]==='left'?1:-1,n=[-u[1]*sign,u[0]*sign];
  const offsetA=inside-A.diameter/2,offsetZ=inside-Z.diameter/2,span=L-offsetA-offsetZ;
  if(span<=0)return nc('CROSS_TIE_BEND_CENTERS_OVERLAP');
  const origin=[A.y+u[0]*offsetA,A.z+u[1]*offsetA];
  const left=[],right=[];
  for(let i=0;i<=steps;i++){
   const t=Math.PI/2+angle*i/steps,q=Math.PI/2-angle*i/steps;
   left.push([R*Math.cos(t),R*Math.sin(t)]);right.push([span+R*Math.cos(q),R*Math.sin(q)]);
  }
  left.push([left.at(-1)[0]+tail/Math.SQRT2,left.at(-1)[1]-tail/Math.SQRT2]);
  right.push([right.at(-1)[0]-tail/Math.SQRT2,right.at(-1)[1]-tail/Math.SQRT2]);
  const points=[...left.reverse(),...right].map(([s,t])=>[origin[0]+u[0]*s+n[0]*t,origin[1]+u[1]*s+n[1]*t]);
  // Include analytic extrema of each rotated circular arc for the cover check.
  const bounds=[...points];
  for(const [offset,lo,hi] of [[0,Math.PI/2,5*Math.PI/4],[span,-Math.PI/4,Math.PI/2]])for(let axis=0;axis<2;axis++)for(let k=-2;k<=2;k++){
   const t=Math.atan2(n[axis],u[axis])+k*Math.PI;
   if(t>=lo&&t<=hi){const s=offset+R*Math.cos(t),v=R*Math.sin(t);bounds.push([origin[0]+u[0]*s+n[0]*v,origin[1]+u[1]*s+n[1]*v]);}
  }
  const requiredInsideRadius=(db<=.016?2:3)*db,requiredTail=6*db;
  const checks=[{kind:'inside-radius',status:inside>=requiredInsideRadius?'OK':'NG'},{kind:'hook-tail',status:tail>=requiredTail?'OK':'NG'},{kind:'end-bar-enclosure',status:inside>=Math.max(A.diameter,Z.diameter)/2?'OK':'NG'},{kind:'section-cover',status:bounds.every(([y,z])=>Math.abs(y)+db/2<=H/2-cover+1e-12&&Math.abs(z)+db/2<=B/2-cover+1e-12)?'OK':'NG'}];
  pieces.push({mark:`CT${index+1}`,bars:[a+1,b+1],diameter:db,hookSide:sides[index],planeOffset:Number(offsets[index]),bodyLength:span,centerlineRadius:R,insideRadius:inside,tail,requiredInsideRadius,requiredTail,hookAngle:135,cutLength:span+2*angle*R+2*tail,points,segmentErrors:Array.from({length:points.length-1},(_,i)=>i===0||i===steps+1||i===points.length-2?0:R*(1-Math.cos(angle/steps/2))),path:{u,n,lines:[[points[0],points[1]],[points[steps+1],points[steps+2]],[points.at(-2),points.at(-1)]],arcs:[{center:origin,radius:R,lo:Math.PI/2,hi:5*Math.PI/4},{center:[origin[0]+u[0]*span,origin[1]+u[1]*span],radius:R,lo:-Math.PI/4,hi:Math.PI/2}]},checks,status:checks.some(c=>c.status==='NG')?'NG':'OK',fabricationApproved:false});
 }
 for(const p of pieces){
  const ranges=[['start-tail',0,1],['start-hook',1,steps+1],['body',steps+1,steps+2],['end-hook',steps+2,p.points.length-2],['end-tail',p.points.length-2,p.points.length-1]];
  p.partRanges=ranges;
 }
 const assembly=crossTieAssembly({pieces,bars,distribution:stirrupDistribution(detail,length),length,hoopGeometry:{B,H,cover,diameter:db,insideRadius:inside}});
 return {...base,status:pieces.some(p=>p.status==='NG')||assembly.status==='NG'?'NG':'OK',pieces,assembly,assemblyStatus:assembly.status==='NG'?'NG':'NOT_CHECKED',assemblyReason:'OUTER_HOOP_CLOSURE_AND_END_GEOMETRY_REMAIN'};
}
