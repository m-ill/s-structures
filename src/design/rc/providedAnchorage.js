import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {tensionDevelopment,compressionDevelopment,hookDevelopment,tensionLap} from './kdsAnchorage.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {buildBarFabrication} from './barGeometry.js';

function evaluateAnchorageRegion(model,member,details,barIndex=null) {
 const rows=[];
 const finish=issue=>{
  if(!rows.length)return issue;
  let result=null;
  for(const row of rows)result=mergeLocatedCheck(result,{...row,status:row.status??(row.ratio>1?'NG':'OK'),reason:row.reason??null,governing:row});
  if(issue)result=mergeLocatedCheck(result,issue);
  return {...result,qualification:'clause-scoped-not-whole-design',calculations:rows,...(issue?.status==='NOT_CHECKED'?{incompleteReasons:[issue.reason]}:{}),...(issue?.requiredInputFields?{requiredInputFields:issue.requiredInputFields,inputTargets:issue.inputTargets,blockerKind:'input-required'}:{})};
 };
 const nc=reason=>{
  const required={SPLICE_APPLICABILITY_REQUIRED:['lapRequired'],PROVIDED_LAP_LENGTH_REQUIRED:['lapLength'],PROVIDED_ANCHORAGE_LENGTH_REQUIRED:['anchorageLength']}[reason],detail=details[0];
  return finish({status:'NOT_CHECKED',ratio:null,reason,...(required?{blockerKind:'input-required',requiredInputFields:required,inputTargets:[{type:'reinforcement-record',id:detail.id,version:detail.version,memberId:member.id}]}:{})});
 };
 if(!details.length)return nc('MISSING_REINFORCEMENT');
 const section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId);
 if(!['RECT','SQUARE'].includes(section?.shape))return nc('ANCHORAGE_SECTION_UNSUPPORTED');
 const B=section.params.B,H=section.params.H||B;
 const ends=[member.n1,member.n2].map(id=>model.nodes?.find(n=>n.id===id));
 const memberLength=ends.every(Boolean)?Math.hypot(ends[0].x-ends[1].x,ends[0].y-ends[1].y,ends[0].z-ends[1].z):NaN;
 for(const detail of details) {
  const explicitSplices=(model.designDetails?.splices||[]).some(s=>s.reinforcementId===`${detail.id}@${detail.version}`);
  if(detail.anchorageStandard!=='KDS-142052-2024'||detail.reinforcementForm!=='single-deformed'||!['straight-tension','straight-compression','hook-tension'].includes(detail.anchorageMode)){
   const requiredInputFields=['anchorageStandard','reinforcementForm','anchorageMode'].filter(k=>detail[k]==null||detail[k]==='');
   return {...nc('ANCHORAGE_SCOPE_REQUIRED'),blockerKind:requiredInputFields.length?'input-required':'scope-review-required',requiredInputFields,inputTargets:[{type:'reinforcement-record',id:detail.id,version:detail.version,memberId:member.id}],automaticSelectionAllowed:false};
  }
  const steel=resolveMaterialRecord(model,detail.barMaterialId),lambda=detail.concreteWeight==='normal'?1:detail.concreteWeight==='lightweight'?detail.lightweightFactor:null;
  for(const [i,bar] of detail.bars.entries()) {
   if(barIndex!==null&&i!==barIndex)continue;
   const db=bar.diameter*1000,y=bar.y*1000,z=bar.z*1000;
   const centerCover=Math.min(H/2-Math.abs(y),B/2-Math.abs(z));
   const other=detail.bars.filter((_,j)=>j!==i);
   const centers=other.map(b=>Math.hypot(b.y*1000-y,b.z*1000-z));
   const clear=other.map((b,j)=>centers[j]-(db+b.diameter*1000)/2);
   const c=Math.min(centerCover,...centers.map(x=>x/2));
   const input={db,fy:steel?.strength?.steel?.Fy,fck:concrete?.strength?.concrete?.fck,lambda,c,Ktr:0,topBar:detail.barPosition==='top'?true:detail.barPosition==='other'?false:undefined,coating:detail.barCoating,clearCover:centerCover-db/2,clearSpacing:clear.length?Math.min(...clear):1e6,sizeFactor:db<=19.1+1e-6?0.8:1,hookAngle:detail.hookAngle};
   if(detail.anchorageStartCriticalX!==undefined||detail.anchorageEndCriticalX!==undefined){
    const length=memberLength*(detail.end-detail.start),start=detail.anchorageStartCriticalX,end=detail.anchorageEndCriticalX;
    if(![length,start,end].every(Number.isFinite)||start<0||start>length/2||end<length/2||end>length)return nc('BOTH_END_CRITICAL_SECTIONS_REQUIRED');
    if(detail.lapRequired!==false&&!explicitSplices)return nc('TWO_END_WITHOUT_SPLICE_SCOPE_REQUIRED');
    if(detail.anchorageMode==='straight-compression'&&[detail.startFabricationShape,detail.endFabricationShape].some(x=>x!=='straight'))return nc('COMPRESSION_REQUIRES_STRAIGHT_END_GEOMETRY');
    const geometry=buildBarFabrication(detail,bar,{length,H:H/1000});
    if(geometry.cutLength===null||!geometry.ends)return {...nc('BOTH_END_STANDARD_GEOMETRY_REQUIRED'),geometry};
    for(const [side,available] of [['start',start-detail.endSetbackStart+(detail.startExtension||0)],['end',length-detail.endSetbackEnd-end+(detail.endExtension||0)]]){
     const shape=geometry.ends[side].shape,hookAngle=shape==='L90'?90:shape==='J180'?180:null;
     const calc=detail.anchorageMode==='straight-compression'?compressionDevelopment(input):hookAngle?hookDevelopment({...input,hookAngle}):tensionDevelopment(input);
     if(calc.status!=='CALCULATED')return {...nc(calc.reason),calculation:calc};
     rows.push({detailId:detail.id,detailVersion:detail.version,bar:i,end:side,kind:'development',requiredMm:calc.requiredMm,providedMm:available*1000,ratio:available>0?calc.requiredMm/(available*1000):null,...(available<=0?{status:'NG',reason:'ANCHORAGE_END_DOES_NOT_REACH_CRITICAL_SECTION'}:{}),source:calc.source,shape,criticalSectionX:side==='start'?start:end,geometryBasis:geometry.ends[side],assumption:detail.anchorageMode==='straight-compression'?'full-yield-compression-at-supplied-critical-section':'full-yield-tension-at-supplied-critical-section'});
    }
    continue;
   }
   const calc=detail.anchorageMode==='straight-compression'?compressionDevelopment(input):detail.anchorageMode==='hook-tension'?hookDevelopment(input):tensionDevelopment(input);
   if(calc.status!=='CALCULATED')return {...nc(calc.reason),calculation:calc};
   if(calc.geometryCheckRequired)return {...nc('STANDARD_HOOK_GEOMETRY_REQUIRED'),calculation:calc};
   if(!(detail.anchorageLength>0))return {...nc('PROVIDED_ANCHORAGE_LENGTH_REQUIRED'),calculation:calc};
   rows.push({detailId:detail.id,detailVersion:detail.version,bar:i,kind:'development',requiredMm:calc.requiredMm,providedMm:detail.anchorageLength*1000,ratio:calc.requiredMm/(detail.anchorageLength*1000),source:calc.source});
   if(typeof detail.lapRequired!=='boolean')return nc('SPLICE_APPLICABILITY_REQUIRED');
   if(detail.lapRequired&&!explicitSplices) {
    if(detail.anchorageMode!=='straight-tension')return nc('SPLICE_MODE_UNSUPPORTED');
    const lap=tensionLap({...input,spliceClass:detail.spliceClass});
    if(lap.status!=='CALCULATED'||!(detail.lapLength>0))return {...nc(lap.reason||'PROVIDED_LAP_LENGTH_REQUIRED'),calculation:lap};
    rows.push({detailId:detail.id,detailVersion:detail.version,bar:i,kind:'lap',requiredMm:lap.requiredMm,providedMm:detail.lapLength*1000,ratio:lap.requiredMm/(detail.lapLength*1000),source:lap.source});
   }
  }
 }
 return rows.length?finish(null):nc('ANCHORAGE_CALCULATION_REQUIRED');
}

// Region input gaps must not erase an already calculated failure elsewhere.
export function evaluateProvidedAnchorage(model,member,details){
 if(!details.length)return evaluateAnchorageRegion(model,member,details);
 if(details.length===1&&(details[0].bars?.length??0)<=1)return evaluateAnchorageRegion(model,member,details);
 let result=null;const calculations=[],fields=new Set(),targets=new Map(),reasons=new Set();
 for(const detail of details)for(let barIndex=0;barIndex<Math.max(1,detail.bars?.length??0);barIndex++){
  const row={...evaluateAnchorageRegion(model,member,[detail],barIndex),detailId:detail.id,detailVersion:detail.version,bar:barIndex};
  result=mergeLocatedCheck(result,row);
  for(const calculation of row.calculations||[])calculations.push(calculation);
  for(const field of row.requiredInputFields||[])fields.add(field);
  for(const target of row.inputTargets||[])targets.set(JSON.stringify(target),target);
  if(row.status==='NOT_CHECKED'&&row.reason)reasons.add(row.reason);
  for(const reason of row.incompleteReasons||[])reasons.add(reason);
 }
 return {...result,calculations,...(fields.size?{blockerKind:'input-required',requiredInputFields:[...fields],inputTargets:[...targets.values()]}:{}),...(reasons.size?{incompleteReasons:[...reasons]}:{})};
}
