import {subtractRcMemberServiceResponses} from './frameServiceResponse.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {evaluateRefinedDirectStability} from './refinedDirectStability.js';
export function evaluateFrameServiceability(model,member,details,set,allSets){
 const base={codeReferences:getKcscRuleSources(['142030']).map(r=>({...r,clause:'4.2.1; Table 4.2-2',relationship:'instantaneous live deflection limit; frame method qualification separate'})),designTransferAllowed:false,incomplete:true,qualification:'frame-method-qualification-pending'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 const rows=[...details].sort((a,b)=>a.start-b.start),d=rows[0];
 if(!d||rows.length>100||d.start!==0||rows.at(-1).end!==1||rows.some((r,i)=>!(r.end>r.start)||i&&r.start!==rows[i-1].end))return nc('SERVICE_REINFORCEMENT_COVERAGE_REQUIRED');
 const policy=['serviceabilityMode','serviceCrackingComboId','serviceBaselineComboId','serviceDeflectionAxis','serviceBoundary','serviceDeflectionLimit','nonstructuralDamageSensitive'];
 if(rows.some(r=>policy.some(k=>r[k]!==d[k])))return nc('SERVICE_REGION_POLICY_MISMATCH');
 if(d.nonstructuralDamageSensitive!==false)return nc('POST_ATTACHMENT_LONG_TERM_CHECK_REQUIRED');
 const totalId=d.serviceCrackingComboId,baselineId=d.serviceBaselineComboId;
 if(!totalId||!baselineId||totalId===baselineId)return nc('SERVICE_TOTAL_AND_BASELINE_REQUIRED');
 const total=allSets?.[totalId]||(set?.combo?.id===totalId?set:null),baseline=allSets?.[baselineId]||(set?.combo?.id===baselineId?set:null);
 const combos=[totalId,baselineId].map(id=>model.loadCombinations?.find(c=>c.id===id&&c.enabled!==false));
 if(combos.some(c=>c?.type!=='service'))return nc('SERVICE_COMBINATION_UNAVAILABLE');
 for(const combo of combos)for(const [id,factor] of Object.entries(combo.factors||{})){
  if(!Number.isFinite(factor))return nc('SERVICE_COMBINATION_FACTOR_INVALID');
  if(factor!==0&&!model.loadCases?.some(c=>c.id===id&&c.enabled!==false))return nc('SERVICE_COMBINATION_CASE_UNAVAILABLE');
 }
 const active=(model.loadCases||[]).filter(c=>c.enabled!==false),live=active.filter(c=>c.type==='live'),dead=active.filter(c=>c.type==='dead');
 if(!live.length||!dead.length||dead.some(c=>combos.some(combo=>combo.factors?.[c.id]!==1))||!live.some(c=>combos[0].factors?.[c.id]===1)||Object.entries(combos[0].factors||{}).some(([id,v])=>v!==0&&(v!==1||!active.some(c=>c.id===id&&['dead','live'].includes(c.type))))||Object.entries(combos[1].factors||{}).some(([id,v])=>v!==0&&(v!==1||!dead.some(c=>c.id===id))))return nc('UNFACTORED_TOTAL_AND_DEAD_BASELINE_REQUIRED');
 if(![total,baseline].every((s,i)=>s?.ok&&s.combo?.id===[totalId,baselineId][i])||total.method!==baseline.method)return nc('MATCHING_FRAME_SERVICE_SOURCES_REQUIRED');
 const refined=[total,baseline].every(s=>s.stiffnessProvenance?.stiffnessMode==='kds-elastic-second-order');
 if(refined){
  const proofs=[total,baseline].map(s=>evaluateRefinedDirectStability(model,member,rows,s));
  if(proofs.some(p=>p.incomplete))return {...nc('REFINED_FRAME_SERVICE_PROOF_REQUIRED'),blockingReasons:[...new Set(proofs.flatMap(p=>p.incompleteReasons))]};
 }else if(![total,baseline].every(s=>s.solverMethod==='rc-splice-frame'))return nc('MATCHING_FRAME_SERVICE_SOURCES_REQUIRED');
 base.frameDisplacementEvaluated=true;
 base.methodReviewRequired=true;
 base.frameSourceMethod=refined?'refined-direct-specified-inertia':'rc-splice-frame';
 base.spliceFrameDisplacementEvaluated=!refined;
 if(set?.combo?.id===baselineId)return {...base,status:'N_A',ratio:null,reason:'SERVICE_COMBINATION_SUPPLIES_DEFLECTION_REFERENCE',applicability:{requiredCompanion:{comboId:totalId,memberId:member.id,checkId:'rc-deflection'}}};
 if(set?.combo?.id!==totalId)return nc('SERVICE_TOTAL_COMBINATION_REQUIRED');
 const axis=d.serviceDeflectionAxis,boundary=d.serviceBoundary;
 if(!['v','w'].includes(axis))return nc('SERVICE_DEFLECTION_AXIS_REQUIRED');
 if(!['chord','cantilever-start','cantilever-end'].includes(boundary))return nc('SERVICE_BOUNDARY_REQUIRED');
 if(boundary!=='chord'&&model.nodes?.find(n=>n.id===(boundary==='cantilever-start'?member.n1:member.n2))?.support!=='fixed')return nc('CANTILEVER_FIXED_SUPPORT_REQUIRED');
 const divisor=d.serviceDeflectionLimit==='live-floor'?360:d.serviceDeflectionLimit==='live-roof'?180:null;
 if(!divisor)return nc('SERVICE_DEFLECTION_LIMIT_REQUIRED');
 let response;
 try{response=subtractRcMemberServiceResponses(total.memberServiceResponses?.[member.id],baseline.memberServiceResponses?.[member.id]);}catch(error){return nc(error.message);}
 const nodes=[member.n1,member.n2].map(id=>model.nodes?.find(n=>n.id===id));
 const length=nodes.every(Boolean)?Math.hypot(nodes[1].x-nodes[0].x,nodes[1].y-nodes[0].y,nodes[1].z-nodes[0].z):0;
 if(!(length>0)||Math.abs(response.length-length)>1e-8)return nc('FULL_MEMBER_SERVICE_STATIONS_REQUIRED');
 const demand=response[boundary][axis].maxAbs,capacity=length/divisor,ratio=demand/capacity;
 return {...base,status:ratio>1?'NG':'OK',ratio,demand,capacity,reason:'FRAME_SERVICE_METHOD_QUALIFICATION_PENDING',response:{...response[boundary][axis],axis,boundary,basis:response.basis},axialRelative:response.axialRelative,totalComboId:totalId,baselineComboId:baselineId,scope:'instantaneous-total-minus-dead-frame-response; no creep, shrinkage or loading-history qualification'};
}
