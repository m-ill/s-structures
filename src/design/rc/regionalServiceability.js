import {resolveMaterialRecord} from '../../materials/registry.js';
import {integrateCurvatureSegments} from './curvatureIntegration.js';
// Constitutive/code checks are supplied by the existing single-region owner.
// The regional layer owns coverage, source interpolation and continuous integration.
export function evaluateRegionalDeflection(model,member,details,set,allSets,evaluateSingle){
 const nc=(reason,extra={})=>({status:'NOT_CHECKED',ratio:null,reason,...extra});
 const ordered=details.slice().sort((a,b)=>a.start-b.start);
 if(ordered.length>100||ordered[0]?.start!==0||ordered.at(-1)?.end!==1||ordered.some((d,i)=>!Number.isFinite(d.start)||!Number.isFinite(d.end)||d.start>=d.end||i>0&&d.start!==ordered[i-1].end))return nc('SERVICE_REINFORCEMENT_COVERAGE_REQUIRED');
 const first=ordered[0],policy=['serviceabilityMode','serviceBoundary','serviceDeflectionLimit','serviceCrackingComboId','serviceSustainedComboId','serviceDurationMonths','serviceLoadSequence','nonstructuralDamageSensitive','servicePreAttachmentMultiplier','servicePreAttachmentReference'];
 if(ordered.some(d=>policy.some(k=>d[k]!==first[k])))return nc('SERVICE_REGION_POLICY_MISMATCH');
 if(!['instant-live-curvature','long-term-curvature'].includes(first.serviceabilityMode))return nc('SERVICEABILITY_SCOPE_REQUIRED');
 const nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!nodes.every(Boolean))return nc('FULL_MEMBER_SERVICE_STATIONS_REQUIRED');
 const L=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z);
 const ids=[...new Set([set?.combo?.id,first.serviceCrackingComboId,...(first.serviceabilityMode==='long-term-curvature'?[first.serviceSustainedComboId]:[])])];
 const raw=new Map();
 for(const id of ids){
  const source=id===set?.combo?.id?set:allSets?.[id],r=source?.memberResults?.[member.id];
  if(!source?.ok||!r)return nc('REGIONAL_SERVICE_SOURCE_REQUIRED',{sourceComboId:id});
  if(!r.xs||r.xs.length<2||r.xs.length>600||!['xs','N','My','Mz'].every(k=>r[k]?.length===r.xs.length&&r[k].every(Number.isFinite)))return nc('SERVICE_STATION_GRID_INVALID');
  if(r.stationSides!==undefined&&(!Array.isArray(r.stationSides)||r.stationSides.length!==r.xs.length||r.stationSides.some(side=>!['point','left','right'].includes(side))))return nc('SERVICE_STATION_GRID_INVALID');
  if(!(L>0)||Math.abs(r.xs[0])>1e-8||Math.abs(r.xs.at(-1)-L)>1e-8)return nc('FULL_MEMBER_SERVICE_STATIONS_REQUIRED');
  for(let i=1;i<r.xs.length;i++)if(r.xs[i]<r.xs[i-1]||r.xs[i]===r.xs[i-1]&&!(r.stationSides?.[i-1]==='left'&&r.stationSides[i]==='right'))return nc('SERVICE_STATION_GRID_INVALID');
  if(r.N.some(v=>Math.abs(v)>1e-8)||r.My.some(v=>Math.abs(v)>1e-8))return nc('UNIAXIAL_FLEXURE_WITHOUT_AXIAL_FORCE_REQUIRED');
  const normalizedXs=Array.from(r.xs);normalizedXs[0]=0;normalizedXs[normalizedXs.length-1]=L;
  if(normalizedXs.some((x,i)=>i&&x<normalizedXs[i-1]))return nc('SERVICE_STATION_GRID_INVALID');
  raw.set(id,{source,row:{...r,xs:normalizedXs}});
 }
 const grid=[...new Set([0,L,...ordered.flatMap(d=>[d.start*L,d.end*L]),...[...raw.values()].flatMap(x=>Array.from(x.row.xs))])].sort((a,b)=>a-b);
 // A two-end linear source needs an interior probe for the existing section owner.
 if(grid.length===2)grid.splice(1,0,L/2);
 if(grid.length>1201)return nc('SERVICE_INTERVAL_LIMIT');
 // Interpolate only inside a source span. At jumps the left/right limits stay distinct.
 const at=(r,x,side)=>{
  const exact=[];for(let i=0;i<r.xs.length;i++)if(r.xs[i]===x)exact.push(i);
  if(exact.length)return r.Mz[side==='left'?exact[0]:exact.at(-1)];
  let i=0;while(i+1<r.xs.length&&r.xs[i+1]<x)i++;
  const h=r.xs[i+1]-r.xs[i];if(!(h>0)||x<r.xs[i]||x>r.xs[i+1])throw Error('SERVICE_INTERPOLATION_RANGE');
  return r.Mz[i]+(r.Mz[i+1]-r.Mz[i])*(x-r.xs[i])/h;
 };
 // Homogeneous probes reuse all existing source/constitutive checks. At an
 // interface use the larger absolute moment solely for the cracking envelope.
 const probes=Object.fromEntries([...raw].map(([id,{source,row:r}])=>[id,{...source,memberResults:{[member.id]:{...r,xs:grid,Mz:grid.map(x=>{const left=at(r,x,'left'),right=at(r,x,'right');return Math.abs(left)>Math.abs(right)?left:right;}),N:grid.map(()=>0),My:grid.map(()=>0)}}}]));
 const regions=[],Ec=resolveMaterialRecord(model,member.matId)?.elastic?.E;
 // KDS 14 20 30 4.2.1(5): rho' is taken at midspan, or at the
 // support for a cantilever. Regional stiffness does not relocate that section.
 const positionFraction=first.serviceBoundary==='cantilever-start'?0:first.serviceBoundary==='cantilever-end'?1:.5;
 const referenceDetail=ordered.find(d=>positionFraction>=d.start&&(positionFraction<d.end||positionFraction===1&&d.end===1));
 const compressionReference={detail:referenceDetail,positionFraction,position:positionFraction*L,basis:positionFraction===.5?'span-midpoint':'cantilever-support'};
 for(const detail of ordered){
  const r=evaluateSingle(model,member,[{...detail,start:0,end:1}],probes[set.combo.id],probes,compressionReference);
  if(!['OK','NG'].includes(r.status))return nc(r.reason,{detailId:detail.id,codeReferences:r.codeReferences});
  regions.push({detailId:detail.id,detailVersion:detail.version,start:detail.start,end:detail.end,Ec,sectionStiffness:r.sectionStiffness,Ig:r.Ig,Icr:r.Icr,Ie:r.Ie,Mcr:r.Mcr,Ma:r.Ma,multiplier:r.multiplier,preAttachmentMultiplier:r.preAttachmentMultiplier,preAttachmentReference:r.preAttachmentReference,compressionRatioBasis:r.compressionRatioBasis,compressionReference:r.compressionReference,additionalLiveFraction:r.additionalLiveFraction,compressionRatio:r.compressionRatio,codeReferences:r.codeReferences});
 }
 const live=raw.get(set.combo.id).row,sustained=raw.get(first.serviceSustainedComboId)?.row,segments=[];
 for(let i=1;i<grid.length;i++){
  const x0=grid[i-1],x1=grid[i],mid=(x0+x1)/(2*L),region=regions.find(d=>mid>=d.start&&mid<d.end);
  if(!region)return nc('SERVICE_REINFORCEMENT_COVERAGE_REQUIRED');
  const curvature=(x,side)=>{
   const M=at(live,x,side),numerator=sustained?(region.multiplier-region.preAttachmentMultiplier)*at(sustained,x,side)+region.additionalLiveFraction*M:M;
   return numerator/(Ec*1000*region.Ie);
  };
  segments.push({x0,x1,k0:curvature(x0,'right'),k1:curvature(x1,'left'),detailId:region.detailId,detailVersion:region.detailVersion});
 }
 const response=integrateCurvatureSegments(segments,first.serviceBoundary);
 const divisor=sustained?(first.nonstructuralDamageSensitive?480:240):first.serviceDeflectionLimit==='live-floor'?360:180,capacity=L/divisor,ratio=response.maxAbs/capacity;
 const postAttachmentCalculation=sustained?{
  kind:'rc-post-attachment-calculation-v1',durationMonths:first.serviceDurationMonths,loadSequence:first.serviceLoadSequence,
  sources:{live:set.combo.id,sustained:first.serviceSustainedComboId,cracking:first.serviceCrackingComboId},
  boundary:first.serviceBoundary,length:L,damageSensitive:first.nonstructuralDamageSensitive,limitDivisor:divisor,
  equation:'kappa(x) = ((lambda - lambda_before) * M_sustained(x) + remainingLiveFraction * M_live(x)) / (Ec * 1000 * Ie(x))',
  integration:response.sampling??'piecewise-linear-curvature-exact-interval-extrema',
  units:{length:'m',displacement:'m',moment:'kN*m',Ec:'MPa',Ie:'m^4',curvature:'1/m'},
  regions:regions.map(r=>({detailId:r.detailId,detailVersion:r.detailVersion,start:r.start,end:r.end,Ec:r.Ec,Ie:r.Ie,compressionRatio:r.compressionRatio,multiplier:r.multiplier,preAttachmentMultiplier:r.preAttachmentMultiplier,remainingMultiplier:r.multiplier-r.preAttachmentMultiplier,preAttachmentReference:r.preAttachmentReference,remainingLiveFraction:r.additionalLiveFraction})),
  result:{demand:response.maxAbs,capacity,ratio,status:ratio>1?'NG':'OK'},codeReferences:regions[0].codeReferences,
  globalCreepRedistributionIncluded:false,designTransferAllowed:false,
 }:null;
 return {status:ratio>1?'NG':'OK',ratio,demand:response.maxAbs,capacity,reason:ratio>1?'REGIONAL_DEFLECTION_LIMIT_EXCEEDED':null,regions,response,liveComboId:set.combo.id,crackingComboId:first.serviceCrackingComboId,...(sustained?{sustainedComboId:first.serviceSustainedComboId,postAttachmentCalculation}:{}),codeReferences:regions[0].codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false,stiffnessBasis:'regional-effective-inertia; member-wide-maximum-service-moment; minimum-of-two-faces',scope:'regional-normal-rectangular-uniaxial-relative-deflection; no global cracked-frame redistribution'};
}
