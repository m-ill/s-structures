import {evaluateFootingPlanClearance} from '../../design/foundation/footingPlanClearance.js';
import {readFootprintLimits} from '../../metadata/footprintLimits.js';
// Search estimates only: every suggested footprint must be re-evaluated with
// current self-weight, contact, reinforcement and all differential comparisons.
export function foundationFootprintProposal(command,checks,model){
 const no=reason=>({ok:false,reason,edits:[],automaticApplicationAllowed:false});
 if(![command.B,command.L].every(v=>Number.isFinite(v)&&v>0&&v<=100))return no('FOOTPRINT_SEARCH_DIMENSIONS_REQUIRED');
 let limits;try{limits=readFootprintLimits(command);}catch{return no('FOOTPRINT_LIMIT_INPUT_REQUIRED');}
 if(limits&&(command.B>limits.B||command.L>limits.L))return no('CURRENT_FOOTPRINT_EXCEEDS_DECLARED_LIMIT');
 const requestedSpans={B:command.B,L:command.L};
 let areaRatio=1;const basis=new Set(),reasons=new Set();
 const propose=(ratio,check,reason)=>{if(Number.isFinite(ratio)&&ratio>1&&typeof check.id==='string'){areaRatio=Math.max(areaRatio,ratio);basis.add(check.id);reasons.add(reason);}};
 for(const c of checks){
  if(c.status!=='NG')continue;
  if(c.entityId===`foundation:${command.nodeId}`&&(c.detailVersion===undefined||c.detailVersion===command.version)&&typeof c.id==='string'&&['foundation-anchorage','foundation-punching'].includes(c.checkId)){
   const groups=c.checkId==='foundation-anchorage'?[c.checks||[]]:[c.extensions||[],...(c.perimeterChecks||[]).map(p=>p.extensions||[])];
   for(const group of groups)for(const row of group){if(!['B','L'].includes(row.axis)||![row.available,row.required].every(Number.isFinite)||row.required<=0||row.required<=row.available)continue;const span=command[row.axis]+2*(row.required-row.available);if(!Number.isFinite(span))continue;requestedSpans[row.axis]=Math.max(requestedSpans[row.axis],span);basis.add(c.id);reasons.add(c.checkId==='foundation-anchorage'?'recorded-straight-bar-development':'recorded-punching-bar-extension');}
  }
  if(c.entityId===`foundation:${command.nodeId}`&&c.detailVersion===command.version&&c.loadLedger?.ok&&c.contact?.ok){
   if(c.checkId==='foundation-bearing'&&Number.isFinite(c.capacity)&&c.capacity>0)propose(c.demand/c.capacity,c,'recorded-bearing-pressure');
   if(c.checkId==='foundation-settlement'&&['layered-constrained-modulus','layered-two-to-one-gross'].includes(c.method)&&Array.isArray(c.layers)){
    if(c.secondaryCompression&&c.secondaryCompression.status!=='CALCULATED')continue;
    const primary=c.layers.reduce((sum,row)=>sum+row.displacement,0),remaining=c.capacity-(c.secondaryCompression?.displacementAtTime||0);
    if(remaining>0)propose(primary/remaining,c,'recorded-primary-settlement');
   }
  }
  if(c.checkId!=='foundation-differential-settlement')continue;
  for(const pair of c.pairs||[]){
   if(pair.status!=='NG')continue;
   const source=pair.sourceId===command.id&&pair.sourceVersion===command.version,peer=pair.peerId===command.id&&pair.peerVersion===command.version;
   if(!source&&!peer)continue;
   const value=source?pair.sourceSettlement:pair.peerSettlement,other=source?pair.peerSettlement:pair.sourceSettlement;
   const allowance=Math.min(c.settlementLimit,c.rotationLimit*pair.distance),target=other+allowance;
   if([value,other,allowance,target].every(Number.isFinite)&&allowance>0&&target>0&&value>other)propose(value/target,c,'recorded-higher-side-differential-settlement');
  }
 }
 if(!basis.size)return no('NO_FOOTPRINT_REPAIR_BASIS');
 const nodes=new Map((model?.nodes||[]).map(n=>[n.id,n])),contexts=new Map();
 for(const footing of model?.designDetails?.foundations||[]){const previous=contexts.get(footing.id);if(!previous||previous.footing.version<footing.version)contexts.set(footing.id,{footing,node:nodes.get(footing.nodeId)});}
 const selected=f=>f.footprintClearance!==undefined||f.footprintClearanceReference!==undefined;
 const budget={remaining:100000},screening={status:model?'NOT_SELECTED':'NOT_CHECKED',rejectedCount:0,incompleteCount:0,comparisonLimit:100000};
 const accept=edit=>{
  const candidate={footing:{...command,...edit},node:nodes.get(command.nodeId)};let failed=false,incomplete=false,checked=false;
  const record=result=>{checked=true;failed ||= result.status==='NG';incomplete ||= result.incomplete===true;};
  if(selected(command))record(evaluateFootingPlanClearance({current:candidate,peers:contexts,comparisonBudget:budget}));
  for(const [id,context] of contexts){if(id!==command.id&&selected(context.footing))record(evaluateFootingPlanClearance({current:context,peers:new Map([[command.id,candidate]]),comparisonBudget:budget}));}
  if(incomplete)screening.incompleteCount++;
  if(checked)screening.status=screening.incompleteCount?'NOT_CHECKED':'OK';
  if(failed)screening.rejectedCount++;
  return !failed;
 };
 const desired=Math.max(1.05,Math.sqrt(areaRatio)*1.02),factors=[Math.min(1.5,desired),Math.min(1.5,Math.max(1.25,desired)),1.5],edits=[],seen=new Set();
 const round=v=>Math.ceil((v-1e-10)/.05)/20;
 const cap=axis=>{const hardLimit=Math.min(100,command[axis]*1.5,limits?.[axis]??Infinity);return Math.max(command[axis],Math.min(hardLimit,Math.floor(hardLimit/.05+1e-9)/20));};
 const add=(B,L)=>{const key=`${B}:${L}`;if(B<command.B||L<command.L||B===command.B&&L===command.L||seen.has(key))return;seen.add(key);if(edits.length<3&&accept({B,L}))edits.push({B,L});};
 if(requestedSpans.B>command.B||requestedSpans.L>command.L)add(Math.min(cap('B'),round(requestedSpans.B)),Math.min(cap('L'),round(requestedSpans.L)));
 for(const mode of ['balanced','L','B'])for(const factor of mode==='balanced'?factors:[1.05,1.25,1.5]){
  if(mode!=='balanced'&&!screening.rejectedCount)continue;
  const maxB=cap('B'),maxL=cap('L'),targetArea=command.B*command.L*factor*factor;
  let B=Math.min(maxB,round(command.B*factor)),L=Math.min(maxL,round(command.L*factor));
  if(B*L<targetArea){L=Math.min(maxL,round(targetArea/B));B=Math.min(maxB,round(targetArea/L));}
  if(mode==='L'){L=maxL;B=Math.min(maxB,Math.max(command.B,round(targetArea/L)));}
  if(mode==='B'){B=maxB;L=Math.min(maxL,Math.max(command.L,round(targetArea/B)));}
  B=Math.max(B,Math.min(maxB,round(requestedSpans.B)));L=Math.max(L,Math.min(maxL,round(requestedSpans.L)));add(B,L);
 }
 if(!edits.length)return {...no(screening.rejectedCount?'FOOTPRINT_CLEARANCE_SEARCH_EXHAUSTED':'FOOTPRINT_SEARCH_LIMIT'),planClearanceScreening:screening};
 return {ok:true,version:'p25-foundation-footprint-proposal-v4-development',requestedSpans,edits,planClearanceScreening:screening,basisCheckIds:[...basis],diagnoses:[...reasons],estimatedAreaRatio:areaRatio,searchMultiplierLimit:1.5,dimensionLimitM:100,roundingStepM:.05,siteFitVerified:false,declaredFootprintLimits:limits,declaredLimitsRespected:!!limits,reinforcementReevaluationRequired:true,requiresCandidateEvaluation:true,automaticApplicationAllowed:false,basis:'bounded footprint alternatives from recorded pressure/settlement or straight development/extension deficits; length targets assume unchanged column offset, depth and bars until mandatory whole-candidate review; inverse-area scaling is only a search estimate'};
}
