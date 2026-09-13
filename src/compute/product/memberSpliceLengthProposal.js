import {classASpliceFaces} from '../../design/rc/classASpliceFaces.js';
import {jointSplicePlacement} from './jointSplicePlacement.js';
import {searchSplicePosition} from './splicePositionSearch.js';
import {spliceGeometry} from '../../design/rc/spliceGeometry.js';
import {parseVersionedId} from '../../materials/registry.js';
export function memberSpliceLengthProposal(model,commands,checks){
 const latest=new Map();for(const s of model.designDetails?.splices||[])if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);
 const trial={...model,designDetails:{...model.designDetails,splices:[...latest.values()]}};
 let spliceRepairs=[],unavailable=[];const jointTargets=[],basis=new Set(),positionBudget={remaining:64,used:0};let omittedCount=0;
 for(const splice of [...latest.values()].sort((a,b)=>a.start-b.start||(a.id<b.id?-1:a.id>b.id?1:0))){
  const ref=parseVersionedId(splice.reinforcementId),command=commands.find(c=>c.id===ref.id&&c.version===ref.version&&c.memberId===splice.memberId);
  if(!command||command.locked||splice.locked||!['tension-A','tension-B','compression-with-tension-envelope'].includes(splice.spliceType)||splice.spliceSystem!=='ordinary-no-seismic-detail')continue;
  const demands=[];
  for(const check of checks)if(check.entityId===splice.memberId&&check.checkId==='rc-splices'&&check.status==='NG')for(const row of check.checks||[])if(row.spliceId===splice.id&&row.spliceVersion===splice.version&&row.reinforcementId===splice.reinforcementId&&row.status==='NG'&&row.calculation?.status==='CALCULATED'&&(splice.spliceType!=='tension-A'||row.calculation.spliceClass==='A'&&row.classAProof?.status==='OK'&&row.classAProof.providedRequiredAreaRatio>=2&&row.classAProof.splicedFraction<=.5+1e-12)&&Number.isFinite(row.requiredLength)&&Number.isFinite(row.providedLength)&&row.requiredLength>row.providedLength+1e-10)demands.push({required:row.requiredLength,checkId:check.id});
  if(!demands.length)continue;
  const geometry=spliceGeometry(trial,splice);if(geometry.status!=='OK'){unavailable.push({id:splice.id,reason:geometry.reason});continue;}
  const length=Math.ceil((Math.max(...demands.map(r=>r.required))-1e-10)/.025)/40,half=length/(2*geometry.memberLength),centre=(splice.start+splice.end)/2;
  const span=2*half,lower=Math.max(command.start,splice.end-span),upper=Math.min(command.end-span,splice.start);
  if(![span,lower,upper].every(Number.isFinite)||lower>upper+1e-10){unavailable.push({id:splice.id,reason:'SPLICE_EXTENSION_OUTSIDE_REINFORCEMENT'});continue;}
  if(jointTargets.length<17)jointTargets.push({splice,command,span,lower,upper,centre,length,memberLength:geometry.memberLength,basisCheckIds:demands.map(d=>d.checkId).filter(id=>typeof id==='string')});
  const start=Math.max(lower,Math.min(upper,centre-half)),end=start+span;
  let centreShiftM=((start+end)/2-centre)*geometry.memberLength,positionStrategy=Math.abs(centreShiftM)>1e-9?'boundary-shift-preserving-overlap':'centre-preserved';
  let next={...splice,start:Math.max(command.start,start),end:Math.min(command.end,end)},fit=spliceGeometry(trial,next);
  if(fit.status!=='OK'){
   const alternative=searchSplicePosition(trial,splice,{span,lower,upper,centre,initialStart:next.start},positionBudget);
   if(!alternative.ok){unavailable.push({id:splice.id,reason:alternative.reason,geometryReason:alternative.lastReason||fit.reason});continue;}
   next=alternative.next;fit=alternative.fit;centreShiftM=((next.start+next.end)/2-centre)*geometry.memberLength;positionStrategy='neighbor-shift-preserving-overlap';
  }
  if(spliceRepairs.length>=16){omittedCount++;continue;}
  trial.designDetails.splices=trial.designDetails.splices.map(s=>s.id===splice.id?next:s);
  spliceRepairs.push({id:splice.id,version:splice.version,reinforcementId:splice.reinforcementId,start:next.start,end:next.end,requiredLength:length,positionStrategy,centreShiftM});for(const d of demands)if(typeof d.checkId==='string')basis.add(d.checkId);
 }
 let jointPlacement={attempted:false};
 if(jointTargets.length>spliceRepairs.length&&jointTargets.length>=2){
  const joint=jointSplicePlacement(model,jointTargets,positionBudget),{repairs,basisCheckIds,...metadata}=joint;jointPlacement=metadata;
  if(joint.ok){spliceRepairs=repairs;const repaired=new Set(repairs.map(r=>r.id));unavailable=unavailable.filter(r=>!repaired.has(r.id));for(const id of basisCheckIds)basis.add(id);}
 }
 // Extending a Class A lap also widens the area-fraction window. Recheck
 // all proposed intervals together before offering the existing A class.
 const proposed=trial.designDetails.splices.map(s=>{const r=spliceRepairs.find(r=>r.id===s.id);return r?{...s,start:r.start,end:r.end}:s;});
 const rejected=new Set();
 for(const r of spliceRepairs){
  const original=latest.get(r.id);if(original.spliceType!=='tension-A')continue;
  const ref=parseVersionedId(original.reinforcementId),detail=model.designDetails.reinforcement.find(d=>d.id===ref.id&&d.version===ref.version),geometry=spliceGeometry(model,original);
  const fraction=classASpliceFaces(detail,proposed.filter(s=>s.memberId===original.memberId),geometry.memberLength);
  if(fraction.status!=='OK'||fraction.splicedFraction>.5+1e-12){rejected.add(r.id);unavailable.push({id:r.id,reason:'CLASS_A_EXTENDED_WINDOW_NOT_QUALIFIED',fractionStatus:fraction.status,splicedFraction:fraction.splicedFraction??null});}
 }
 if(rejected.size){spliceRepairs=spliceRepairs.filter(r=>!rejected.has(r.id));jointPlacement={...jointPlacement,classAWindowRejectedIds:[...rejected]};}
 return {ok:spliceRepairs.length>0,version:'p25-member-splice-length-v5-proven-class-a',reason:spliceRepairs.length?null:unavailable[0]?.reason||'RECORDED_SPLICE_LENGTH_REQUIRED',spliceRepairs,jointPlacement,unavailable,omittedCount,truncated:omittedCount>0,basisCheckIds:[...basis],positionSearch:{additionalChecks:positionBudget.used,maximumAdditionalChecks:64,maximumPeers:128},roundingStepM:.025,requiresCandidateEvaluation:true,automaticApplicationAllowed:false,siteFitVerified:false,basis:'same-version proven A or full-yield B/compression-envelope lap demands; A area window rechecked after extension; preserve original overlap and bar selection; nearest feasible centre within the declared region; existing region and neighbor geometry checked; full reevaluation required'};
}
