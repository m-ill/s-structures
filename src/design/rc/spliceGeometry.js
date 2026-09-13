import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {spliceBarPath} from './spliceBarPath.js';
import {classASpliceProof} from './classASpliceProof.js';
import {resolveMaterialRecord,resolveSectionRecord,parseVersionedId} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {tensionLap,compressionLap} from './kdsAnchorage.js';
const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason});
function latest(rows=[]){const m=new Map();for(const r of rows)if(!m.has(r.id)||r.version>m.get(r.id).version)m.set(r.id,r);return [...m.values()];}
export function spliceGeometry(model,record,{allowHistorical=false}={}){
 const member=model.members?.find(x=>x.id===record.memberId),section=resolveSectionRecord(model,member?.secId),ref=parseVersionedId(record.reinforcementId),current=latest(model.designDetails?.reinforcement).find(d=>d.id===ref.id),detail=allowHistorical?model.designDetails?.reinforcement?.find(d=>d.id===ref.id&&d.version===ref.version):current;
 if(!detail||!ref.version||detail.memberId!==record.memberId)return nc('SPLICE_REINFORCEMENT_REFERENCE_REQUIRED');
 if(detail.version!==ref.version)return nc('SPLICE_REINFORCEMENT_VERSION_STALE');
 if(!['RECT','SQUARE'].includes(section?.shape))return nc('SPLICE_RECTANGULAR_SECTION_REQUIRED');
 const nodes=[member.n1,member.n2].map(id=>model.nodes?.find(n=>n.id===id));if(!nodes.every(Boolean))return nc('SPLICE_MEMBER_GEOMETRY_REQUIRED');
 const memberLength=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z),length=memberLength*(record.end-record.start),B=section.params.B/1000,H=(section.params.H||section.params.B)/1000;
 if(![memberLength,length,record.start,record.end,record.offsetY,record.offsetZ].every(Number.isFinite)||length<=0||record.start<detail.start||record.end>detail.end)return nc('SPLICE_INTERVAL_OUTSIDE_REINFORCEMENT');
 const indices=record.barIndices?.map(x=>Number(x)-1);
 if(!indices?.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=detail.bars.length))return nc('SPLICE_BAR_INDICES_INVALID');
 if(!allowHistorical)for(const other of latest(model.designDetails?.splices))if(other.id!==record.id&&other.memberId===record.memberId&&parseVersionedId(other.reinforcementId).id===ref.id&&record.start<other.end&&other.start<record.end&&other.barIndices?.some(i=>record.barIndices.includes(i)))return nc('OVERLAPPING_SPLICE_OBJECTS');
 const bars=indices.map(i=>({...detail.bars[i],originalIndex:i,y:detail.bars[i].y+record.offsetY,z:detail.bars[i].z+record.offsetZ})),cover=detail.cover+(detail.stirrups?.diameter||0);
 const neighborBars=[];
 for(const other of allowHistorical?[]:latest(model.designDetails?.splices)){
  if(other.id===record.id||other.memberId!==record.memberId||record.start>=other.end||other.start>=record.end)continue;
  const otherRef=parseVersionedId(other.reinforcementId),host=model.designDetails?.reinforcement?.find(d=>d.id===otherRef.id&&d.version===otherRef.version);
  if(!host||![other.offsetY,other.offsetZ].every(Number.isFinite))return nc('SPLICE_NEIGHBOR_GEOMETRY_REQUIRED');
  for(const index of other.barIndices||[]){
   if(neighborBars.length>=100)return nc('SPLICE_NEIGHBOR_BAR_LIMIT');
   const bar=host.bars[Number(index)-1];if(!bar)return nc('SPLICE_NEIGHBOR_GEOMETRY_REQUIRED');
   neighborBars.push({...bar,y:bar.y+other.offsetY,z:bar.z+other.offsetZ,spliceId:other.id});
  }
 }
 if(bars.some(b=>Math.abs(b.y)+b.diameter/2+cover>H/2+1e-10||Math.abs(b.z)+b.diameter/2+cover>B/2+1e-10))return nc('SPLICE_BAR_OUTSIDE_SECTION');
 for(const bar of bars)for(const other of [...detail.bars,...bars,...neighborBars]){
  if(bar===other)continue;
  if(Math.hypot(bar.y-other.y,bar.z-other.z)<(bar.diameter+other.diameter)/2-1e-10)return nc('SPLICE_BAR_OVERLAP');
 }
 return {status:'OK',memberId:member.id,detailId:detail.id,detailVersion:detail.version,memberLength,length,startX:record.start*memberLength,endX:record.end*memberLength,B,H,bars,neighborBars,additionalVolume:bars.reduce((n,b)=>n+b.area*length,0),strengthCredit:false};
}
function evaluateSplice(model,member,tuples,target,classAProofs,source){
 const details=latest(model.designDetails?.reinforcement).filter(d=>d.memberId===member.id),splices=latest(model.designDetails?.splices).filter(s=>s.memberId===member.id);
 if(!splices.length)return details.length&&details.every(d=>d.lapRequired===false)?{status:'N_A',ratio:null,reason:'EXPLICIT_NO_LAP_DECLARATION',applicability:{basis:'all-member-regions-declare-no-lap; no-splice-records'}}:nc('EXPLICIT_SPLICE_OBJECT_REQUIRED');
 const rows=[];
 for(const splice of splices.filter(s=>s.id===target)){
  const g=spliceGeometry(model,splice);if(g.status!=='OK')return g;
  const detail=details.find(d=>d.id===g.detailId),steel=resolveMaterialRecord(model,detail.barMaterialId),concrete=resolveMaterialRecord(model,member.matId);
  if(detail.lapRequired!==true)return nc('SPLICE_APPLICABILITY_CONFLICT');
  if(!['tension-A','tension-B','compression-with-tension-envelope'].includes(splice.spliceType)||splice.spliceSystem!=='ordinary-no-seismic-detail'||detail.reinforcementForm!=='single-deformed'||detail.concreteWeight!=='normal')return nc('ORDINARY_SINGLE_BAR_TENSION_B_SPLICE_SCOPE_REQUIRED');
  const profiles=latest(model.designDetails?.profiles);if(profiles.some(p=>p.structuralSystem!=='ordinary-rc-frame'))return nc('SEISMIC_SPLICE_RULE_REQUIRED');
  if(splice.spliceType==='tension-A'&&!classAProofs.has(detail))classAProofs.set(detail,classASpliceProof(model,member,detail,splices,tuples,source));
  const classA=splice.spliceType==='tension-A'?classAProofs.get(detail):null;
  if(classA&&classA.status!=='OK')return {...nc(classA.reason),classAProof:classA};
  if(!(detail.aggregateMaxSize>0))return nc('SPLICE_AGGREGATE_SIZE_REQUIRED');
  const evaluateBar=bar=>{
   if(bar.diameter>.0349+1e-10)return nc('LAP_SIZE_ABOVE_D35_UNSUPPORTED');
   const others=[...detail.bars,...g.bars.filter(b=>b!==bar),...g.neighborBars],centerCover=Math.min(g.H/2-Math.abs(bar.y),g.B/2-Math.abs(bar.z));
   const centers=others.map(b=>Math.hypot(bar.y-b.y,bar.z-b.z)),clear=others.map((b,i)=>centers[i]-(bar.diameter+b.diameter)/2),c=Math.min(centerCover,...centers.map(x=>x/2));
   // Contact partners are allowed, but no beneficial group-spacing adjustment
   // is taken in development: the closest centre remains the conservative c.
   let spacingRatio=0;for(const [i,other] of others.entries()){
    const partner=other===detail.bars[bar.originalIndex];
    if(partner&&Math.abs(clear[i])<1e-9)continue;
    const minimum=Math.max(.025,bar.diameter,other.diameter,4*detail.aggregateMaxSize/3);
    spacingRatio=Math.max(spacingRatio,clear[i]>0?minimum/clear[i]:Infinity);
   }
   if(!Number.isFinite(spacingRatio))return {status:'NG',ratio:null,reason:'SPLICE_CLEAR_SPACING_ZERO',codeReferences:getKcscRuleSources(['142050']).map(r=>({...r,clause:'4.2.2'}))};
   let calc=tensionLap({db:bar.diameter*1000,fy:steel?.strength?.steel?.Fy,fck:concrete?.strength?.concrete?.fck,lambda:1,c:c*1000,Ktr:0,topBar:detail.barPosition==='top'?true:detail.barPosition==='other'?false:undefined,coating:detail.barCoating,clearCover:(centerCover-bar.diameter/2)*1000,clearSpacing:Math.min(...clear)*1000,sizeFactor:bar.diameter<=.0191?.8:1,spliceClass:classA?'A':'B',...(classA?{providedRequiredAreaRatio:classA.providedRequiredAreaRatio,splicedFraction:classA.splicedFraction}:{})});
   if(calc.status!=='CALCULATED')return {...nc(calc.reason),calculation:calc};
   if(splice.spliceType==='compression-with-tension-envelope'){const compression=compressionLap({db:bar.diameter*1000,fy:steel?.strength?.steel?.Fy,fck:concrete?.strength?.concrete?.fck,lambda:1});if(compression.status!=='CALCULATED')return {...nc(compression.reason),calculation:compression};calc={...calc,requiredMm:Math.max(calc.requiredMm,compression.requiredMm),compression,reversalEnvelope:'full-yield-tension-B-and-compression'};}
   const separation=Math.hypot(splice.offsetY,splice.offsetZ),limit=Math.min(calc.requiredMm/5000,.15),ratio=Math.max(calc.requiredMm/(g.length*1000),separation/limit,spacingRatio);
   return {...(classA?{classAProof:classA}:{}),spliceId:splice.id,barIndex:bar.originalIndex+1,status:ratio<=1+1e-10?'OK':'NG',ratio,requiredLength:calc.requiredMm/1000,providedLength:g.length,spacingRatio,separation,maximumSeparation:limit,calculation:calc,geometry:{startX:g.startX,endX:g.endX,y:bar.y,z:bar.z},units:{length:'m'}};
  };
  for(const bar of g.bars)rows.push({spliceId:splice.id,barIndex:bar.originalIndex+1,...evaluateBar(bar)});
 }
 const worst=rows.reduce((a,b)=>mergeLocatedCheck(a,b),null);
 return {...worst,checks:rows,qualification:'clause-scoped-not-whole-design',strengthCredit:false,codeReferences:getKcscRuleSources(['142052','142050','142001']).map(r=>({...r,clause:r.id==='142052'?'4.5.1(2); 4.5.2(1),(2); 4.5.3(1)':r.id==='142050'?'4.2.2':'3.1.1(2)'}))};
}

export function evaluateMemberSplices(model,member,tuples,source){
 const details=latest(model.designDetails?.reinforcement).filter(d=>d.memberId===member.id),splices=latest(model.designDetails?.splices).filter(s=>s.memberId===member.id);
 if(!splices.length)return details.length&&details.every(d=>d.lapRequired===false)?{status:'N_A',ratio:null,reason:'EXPLICIT_NO_LAP_DECLARATION',applicability:{basis:'all-member-regions-declare-no-lap; no-splice-records'}}:nc('EXPLICIT_SPLICE_OBJECT_REQUIRED');
 let aggregate=null;const checks=[],classAProofs=new Map();
 for(const splice of splices){
  const result=evaluateSplice(model,member,tuples,splice.id,classAProofs,source),{locationCoverage:barCoverage,...row}=result;
  for(const check of result.checks||[{...row,spliceId:splice.id}]){
   const {checks:omitted,...annotated}={...row,...check,detailId:splice.id,detailVersion:splice.version};
   aggregate=mergeLocatedCheck(aggregate,annotated);checks.push({...check,spliceId:splice.id,spliceVersion:splice.version,reinforcementId:splice.reinforcementId});
  }
 }
 for(const detail of details)if(detail.lapRequired===true&&!splices.some(s=>parseVersionedId(s.reinforcementId).id===detail.id)){
  const missing={...nc('EXPLICIT_SPLICE_OBJECT_REQUIRED'),detailId:detail.id,detailVersion:detail.version};aggregate=mergeLocatedCheck(aggregate,missing);checks.push(missing);
 }
 let continuity;
 if(splices.some(s=>s.continuationSide)){
  const rows=[];
  for(const detail of details){
   const selected=splices.filter(s=>s.reinforcementId===`${detail.id}@${detail.version}`);if(!selected.some(s=>s.continuationSide))continue;
   const geometry=new Map(selected.map(s=>[s.id,spliceGeometry(model,s)]));
   for(const [index,bar] of detail.bars.entries()){
    const related=selected.filter(s=>s.barIndices?.some(i=>Number(i)===index+1));if(!related.length)continue;
    let result;
    if(related.some(s=>geometry.get(s.id).status!=='OK'))result=nc('SPLICE_CONTINUITY_GEOMETRY_REQUIRED');
    else {const g=geometry.get(related[0].id);result=spliceBarPath({detail,bar,memberLength:g.memberLength,H:g.H,splices:related.map(s=>({...s,startX:geometry.get(s.id).startX,endX:geometry.get(s.id).endX}))});}
    rows.push({detailId:detail.id,detailVersion:detail.version,barIndex:index+1,status:result.status,reason:result.status==='OK'?null:result.reason,pieceCount:result.pieces?.length??null});
   }
  }
  continuity={status:rows.length&&rows.every(r=>r.status==='OK')?'OK':'NOT_CHECKED',checks:rows,basis:'explicit incoming/outgoing piece continuity; lap force capacity evaluated separately'};
  for(const row of rows.filter(r=>r.status!=='OK')){aggregate=mergeLocatedCheck(aggregate,row);checks.push(row);}
 }
 return {...aggregate,checks,...(continuity?{continuity,spliceLayoutEvaluated:true,transferBasis:'KDS full-yield lap length and congestion; no extra longitudinal strength credit'}:{}),coverageUnit:'splice-bar-or-unchecked-object-or-missing-region'};
}
