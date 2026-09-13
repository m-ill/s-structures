import {evaluateOffsetRcChecks} from '../rc/offsetSectionChecks.js';
import {evaluateSegmentedRcChecks} from '../rc/segmentedStrength.js';
import {selectNativeSectionProfile} from '../../metadata/nativeSectionProfile.js';
import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {evaluateMaterialEvidenceUsage} from './materialEvidenceUsage.js';
import {evaluateFootingPlanClearance} from '../foundation/footingPlanClearance.js';
import {evaluateDifferentialSettlement} from '../foundation/differentialSettlement.js';
import {missingRcRuleResult,missingDetailInputDiagnostic} from '../../metadata/rcRuleInputDiagnostics.js';
import {checkIncomplete} from '../../metadata/checkCompleteness.js';
import {prepareDetailGeometry,requirePreparedDetailGeometry} from '../rc/preparedDetailGeometry.js';
import {supplementSpliceDemands} from '../../compute/product/spliceBoundaryDemands.js';
import {spliceIntervalCoverage} from '../rc/spliceIntervalCoverage.js';
import {mergeLocatedCheck} from './locationCoverage.js';
import {createSpliceLayoutResolver} from '../rc/spliceStationLayout.js';
import {evaluateMemberSplices} from '../rc/spliceGeometry.js';
import {evaluateProjectProfile} from './projectProfile.js';
import {prepareProvidedStability} from '../rc/kdsStability.js';
import {evaluateProvidedKdsCover} from '../rc/kdsCover.js';
import {evaluateProvidedKdsSpacing} from '../rc/kdsSpacing.js';
import {evaluateProvidedKdsConfinement} from '../rc/kdsConfinement.js';
import {evaluateProvidedCrackControl} from '../rc/kdsCrackControl.js';
import {evaluateProvidedTorsion} from '../rc/kdsTorsion.js';
import {evaluateProvidedKdsDetailing} from '../rc/kdsDetailing.js';
import {stableHash} from '../../core/stableHash.js';
import {designCodeBasis} from '../../metadata/designCodeBasis.js';
import {checkApplicability,aggregateCodeCompliance} from './checkApplicability.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {evaluateProvidedMember,validateMechanicsLaw} from '../rc/providedMember.js';
import {evaluateProvidedAnchorage} from '../rc/providedAnchorage.js';
import {evaluateProvidedDeflection} from '../rc/kdsServiceability.js';
import {evaluateProvidedKdsShear} from '../rc/kdsShear.js';
import {evaluateRcJoint} from '../connection/rcJoint.js';
export {evaluateRcJoint} from '../connection/rcJoint.js';
import {evaluateProvidedFooting} from '../foundation/providedFooting.js';
export {footingContact} from '../foundation/providedFooting.js';
export {sectionStressBlockResponse,sectionCapacityAtAxial} from '../rc/providedSection.js';

export const PRACTICAL_EVALUATION_VERSION='p25-practical-evaluation-v207-post-attachment-calculation';
export const REQUIRED_RC_CHECKS=['rc-section-strength','rc-stability','rc-shear-y','rc-shear-z','rc-spacing','rc-cover','rc-reinforcement-ratio','rc-confinement','rc-anchorage','rc-splices','rc-deflection','rc-serviceability','rc-torsion','rc-code-compliance'];
export const REQUIRED_JOINT_CHECKS=['joint-equilibrium','joint-probable-forces','joint-shear','joint-confinement','joint-hoop-detail','joint-bar-congestion','joint-member-strength-ratio','joint-anchorage','joint-stiffness'];
export const REQUIRED_FOUNDATION_CHECKS=['foundation-bearing','foundation-ground-review','foundation-sliding','foundation-overturning','foundation-flexure','foundation-one-way-shear','foundation-punching','foundation-reinforcement','foundation-spacing','foundation-depth','foundation-distribution','foundation-anchorage','foundation-column-transfer','foundation-settlement','foundation-code-compliance'];
export function latestDetails(model,channel) {
 const map=new Map();for(const row of model.designDetails?.[channel]||[])if(!map.has(row.id)||map.get(row.id).version<row.version)map.set(row.id,row);
 return [...map.values()];
}
export function concurrentMemberDemands(memberId,comboId,demand,{length}={}) {
 demand=demand?{...demand,T:demand.Tq??demand.T}:demand;
 const keys=['xs','N','Vy','Vz','T','My','Mz'];
 if(!keys.every(k=>(Array.isArray(demand?.[k])||ArrayBuffer.isView(demand?.[k]))&&demand[k].length===demand.xs.length&&demand[k].every(Number.isFinite))||!demand.xs.length)return [];
 if(length!==undefined&&(!Number.isFinite(length)||length<=0))return [];
 const sides=demand.stationSides;
 if(sides!==undefined&&(!Array.isArray(sides)||sides.length!==demand.xs.length||sides.some(s=>!['point','left','right'].includes(s))))return [];
 if(demand.xs.some((x,i)=>x<0||(length!==undefined&&x>length+1e-9*Math.max(1,length))||(i>0&&(x<demand.xs[i-1]||x===demand.xs[i-1]&&!(sides?.[i-1]==='left'&&sides[i]==='right')))))return [];
 return Array.from(demand.xs,(x,i)=>({memberId,comboId,station:i,x,side:sides?.[i]||'point',N:demand.N[i],Vy:demand.Vy[i],Vz:demand.Vz[i],T:demand.T[i],My:demand.My[i],Mz:demand.Mz[i],axes:'member-local',signConvention:'solver-native',units:{length:'m',force:'kN',moment:'kN.m'}}));
}
export function practicalCheck(entityId,comboId,checkId,result={}) {
 result=missingDetailInputDiagnostic(entityId,result);
 if(['OK','NG'].includes(result.status)&&(result.reason==null||result.reason==='RULE_UNAVAILABLE'))result={...result,reason:result.status==='NG'?'CHECK_CRITERION_NOT_SATISFIED':null};
 return {id:stableHash({entityId,comboId,checkId,version:PRACTICAL_EVALUATION_VERSION}),entityId,memberId:entityId,comboId,checkId,category:checkId.startsWith('foundation-')?'foundation':checkId.startsWith('joint-')?'connection':'concrete',status:'NOT_CHECKED',ratio:null,reason:'RULE_UNAVAILABLE',...result,codeBasis:designCodeBasis(checkId,result)};
}
export function summarizePracticalChecks(checks,combinationCoverage) {
 const counts=Object.fromEntries(['OK','NG','WARN','NOT_CHECKED','N_A','FAILED'].map(s=>[s,checks.filter(x=>x.status===s).length]));
 const closureDiagnosticCounts=Object.fromEntries(['OK','NG','NOT_CHECKED','N_A'].map(status=>[status,checks.reduce((n,c)=>n+(c.outerHoop?.closureGeometry?.diagnosticCounts?.[status]||0),0)]));
 const scopeComplete=checks.length>0&&checks.every(x=>(x.status==='OK'||x.status==='N_A')&&!checkIncomplete(x));
 return {...(combinationCoverage?{scopeComplete,combinationCoverage}:{}),counts,closureDiagnosticCounts,incompleteCheckCount:checks.filter(checkIncomplete).length,checkCount:checks.length,failedEntityCount:new Set(checks.filter(x=>x.status==='NG').map(x=>x.entityId)).size,uncheckedEntityCount:new Set(checks.filter(checkIncomplete).map(x=>x.entityId)).size,complete:scopeComplete&&(!combinationCoverage||(!combinationCoverage.missingIds.length&&!(combinationCoverage.missingEvaluationIds?.length)&&!combinationCoverage.missingPurposes.length&&combinationCoverage.projectProfile?.status==='OK'))};
}
export function evaluatePracticalDesign(model,analysis,options={}) {
 if(options.mechanicsLaw)validateMechanicsLaw(options.mechanicsLaw);
 const checks=[],demands=[];
 const materialEvidence=evaluateMaterialEvidenceUsage(model);
 const hasDetails=['reinforcement','foundations','splices','connections'].some(key=>model.designDetails?.[key]?.length);
 const preparedDetails=options.preparedDetails?requirePreparedDetailGeometry(model,options.preparedDetails):hasDetails?prepareDetailGeometry(model):null;
 const pathMembers=new Set(latestDetails(model,'splices').filter(s=>s.continuationSide).map(s=>s.memberId));
 const pendingPath=referenceLayoutResult=>{const collision=referenceLayoutResult.geometry?.actualPathAssembly?.status==='NG',reason=collision?'ACTUAL_LONGITUDINAL_PATH_COLLISION':'SPLICE_PIECE_STATION_LAYOUT_REVIEW_REQUIRED';return {...referenceLayoutResult,status:collision||referenceLayoutResult.status==='NG'?'NG':'NOT_CHECKED',ratio:referenceLayoutResult.ratio??null,reason,incomplete:true,incompleteReasons:[...new Set([...(referenceLayoutResult.incompleteReasons||[]),reason])],referenceLayoutResult,methodReviewRequired:true};};
 const selected=options.resultSet;
 const sourceSets=analysis.pDelta?.method==='direct'?Object.fromEntries(Object.entries(analysis.pDelta.byCombo||{}).map(([id,run])=>[id,analysis.pDelta.ok&&run.ok&&run.converged?run.result:null])):analysis.byCombo||{};
 const sets=selected?.combo?.id?{[selected.combo.id]:selected}:selected&&!selected.memberResults?{}:sourceSets;
 const combinations=Object.keys(sets).length?Object.entries(sets):[['unavailable',null]];
 for(const [comboId,rawSet] of combinations) {
  const set=rawSet?.ok===false?null:rawSet;
  for(const {entityId,result} of materialEvidence)checks.push(practicalCheck(entityId,comboId,'material-test-evidence',{...result,category:'materials'}));
  const purpose=model.loadCombinations?.find(x=>x.id===comboId)?.type;
  const push=(entity,checkId,result)=>checks.push(practicalCheck(entity,comboId,checkId,checkApplicability(checkId,purpose)||result));
  for(const member of model.members||[]) {
   const ends=[member.n1,member.n2].map(id=>model.nodes?.find(n=>n.id===id));
   const length=ends.every(Boolean)?Math.hypot(ends[0].x-ends[1].x,ends[0].y-ends[1].y,ends[0].z-ends[1].z):NaN;
   const material=resolveMaterialRecord(model,member.matId),rawTuples=concurrentMemberDemands(member.id,comboId,set?.memberResults?.[member.id],{length});
   const details=latestDetails(model,'reinforcement').filter(x=>x.memberId===member.id);
   const forceSource=set?.memberResults?.[member.id],sourceLength=forceSource?.ax?.L;
   const mappingReason=material?.kind==='concrete'?(member.taper!=null?'NONPRISMATIC_RC_SECTION_MAPPING_REQUIRED':requiresOffsetAwareDesign(member)?'OFFSET_MEMBER_DESIGN_STATION_MAPPING_REQUIRED':Number.isFinite(sourceLength)&&Number.isFinite(length)&&Math.abs(sourceLength-length)>1e-9*Math.max(1,length)?'MEMBER_FORCE_STATION_LENGTH_MISMATCH':null):null;
   const stationMapping=mappingReason?{status:'NOT_CHECKED',reason:mappingReason,sourceLength:Number.isFinite(sourceLength)?sourceLength:null,grossLength:Number.isFinite(length)?length:null,sourceStationCount:rawTuples.length,...(member.taper!=null&&(forceSource?.sectionProfile||forceSource?.taper)?{sectionProfile:selectNativeSectionProfile(forceSource)}:{}),sectionProfileRequired:member.taper!=null,designStationMapped:false,units:{length:'m'}}:null;
   const boundary=stationMapping?{status:'NOT_CHECKED',reason:mappingReason,tuples:[]}:supplementSpliceDemands(model,member,details,forceSource,rawTuples),tuples=boundary.tuples;


   const segmentedChecks=stationMapping&&member.taper?.profile==='segments'?evaluateSegmentedRcChecks(model,member,details,forceSource,rawTuples):null;
   const offsetChecks=stationMapping&&member.taper==null&&requiresOffsetAwareDesign(member)?evaluateOffsetRcChecks(model,member,details,forceSource,rawTuples):null;
   demands.push(...(offsetChecks?.mapping.designStationMapped?offsetChecks.mappedDemands:stationMapping?rawTuples.map(t=>({...t,designStationMapped:false})):tuples));
   const layoutResolver=material?.kind==='concrete'?createSpliceLayoutResolver(model,member,details):null;
   const stability=material?.kind==='concrete'&&tuples.length?prepareProvidedStability(model,member,details,tuples,options.analysisMethods?.[comboId]??options.analysisMethod??analysis.pDelta?.method,set):null;
   const provided=material?.kind==='concrete'&&details.length&&tuples.length?evaluateProvidedMember(model,member,details,stability?.strengthTuples||tuples,options.mechanicsLaw,layoutResolver):{};
   if(stability)provided['rc-stability']=stability.check;
   if(material?.kind==='concrete')provided['rc-splices']=evaluateMemberSplices(model,member,stability?.strengthTuples||tuples,set?.memberResults?.[member.id]);
   if(material?.kind==='concrete'&&details.length&&tuples.length)provided['rc-anchorage']=evaluateProvidedAnchorage(model,member,details);
   if(material?.kind==='concrete'&&details.length&&tuples.length)Object.assign(provided,evaluateProvidedKdsShear(model,member,details,tuples,layoutResolver));
   if(material?.kind==='concrete'&&details.length&&tuples.length)Object.assign(provided,evaluateProvidedKdsDetailing(model,member,details,tuples,layoutResolver));
   if(material?.kind==='concrete'&&details.length&&tuples.length)Object.assign(provided,evaluateProvidedKdsCover(model,member,details,tuples,layoutResolver));
   if(material?.kind==='concrete'&&details.length&&tuples.length)Object.assign(provided,evaluateProvidedKdsSpacing(model,member,details,tuples,layoutResolver));
   if(material?.kind==='concrete'&&details.length&&tuples.length)Object.assign(provided,evaluateProvidedKdsConfinement(model,member,details,tuples,{preparedDetails}));
   if(material?.kind==='concrete'&&details.length&&tuples.length)Object.assign(provided,evaluateProvidedCrackControl(model,member,details,tuples,layoutResolver,sourceSets));
   if(material?.kind==='concrete'&&details.length&&tuples.length)Object.assign(provided,evaluateProvidedTorsion(model,member,details,tuples,{preparedDetails}));
   if(material?.kind==='concrete'&&details.length&&tuples.length)provided['rc-deflection']=evaluateProvidedDeflection(model,member,details,set,sourceSets);
   if(material?.kind==='concrete'&&pathMembers.has(member.id)){
    const sampling=spliceIntervalCoverage(model,member.id,details,length,tuples);
    for(const [key,result] of Object.entries(provided))if(result.spliceLayoutEvaluated){
     let updated=result;
     if(boundary.status==='NOT_CHECKED')updated=mergeLocatedCheck(updated,{status:'NOT_CHECKED',ratio:null,reason:boundary.reason,spliceLayoutEvaluated:true});
     for(const missing of sampling.unvisited)updated=mergeLocatedCheck(updated,{status:'NOT_CHECKED',ratio:null,reason:missing.reason,detailId:missing.spliceId,detailVersion:missing.version,spliceLayoutEvaluated:true,demandInterpolated:false});
     provided[key]={...updated,spliceSamplingCoverage:sampling,boundaryRecovery:Object.fromEntries(Object.entries(boundary).filter(([key])=>key!=='tuples')),coverageUnit:'located-check-or-unvisited-splice-interval'};
    }
   }
   if(material?.kind==='concrete'&&pathMembers.has(member.id)){
    for(const [key,referenceLayoutResult] of Object.entries(provided)){
     const actualLayout=['rc-section-strength','rc-shear-y','rc-shear-z','rc-cover','rc-spacing','rc-serviceability','rc-reinforcement-ratio','rc-splices'].includes(key)&&referenceLayoutResult.spliceLayoutEvaluated;
     const independentStability=key==='rc-stability'&&referenceLayoutResult.spliceLayoutIndependent;
     const actualFrameDeflection=key==='rc-deflection'&&(referenceLayoutResult.frameDisplacementEvaluated===true||referenceLayoutResult.spliceFrameDisplacementEvaluated===true);
     if(!actualLayout&&!independentStability&&!actualFrameDeflection)provided[key]=pendingPath(referenceLayoutResult);
    }
   }
   if(material?.kind==='concrete'){
    const first=checks.length;
    for(const checkId of REQUIRED_RC_CHECKS.filter(x=>x!=='rc-code-compliance')){
     let result;
     if(stationMapping){
      if(offsetChecks?.checks[checkId])result={...offsetChecks.checks[checkId],stationMapping:{...stationMapping,...offsetChecks.mapping}};
      else if(segmentedChecks?.[checkId])result={...segmentedChecks[checkId],stationMapping:segmentedChecks[checkId].sectionProfileEvaluation?{...stationMapping,status:checkId==='rc-section-strength'?'MAPPED_FOR_SECTION_STRENGTH':'MAPPED_FOR_SECTION_SHEAR',reason:null,designStationMapped:true}:stationMapping};
      else result={status:'NOT_CHECKED',reason:mappingReason,stationMapping,...(offsetChecks?{offsetMappingDiagnostic:offsetChecks.mapping}:{})};
     }else result={...(!tuples.length?{reason:'CONCURRENT_DEMAND_REQUIRED'}:provided[checkId]?{}:missingRcRuleResult(checkId,details)),...provided[checkId]};
     push(member.id,checkId,result);
    }
    push(member.id,'rc-code-compliance',aggregateCodeCompliance(checks.slice(first)));
   }
   else if(material?.kind!=='steel')checks.push(practicalCheck(member.id,comboId,'material-design',{reason:'MATERIAL_DESIGN_UNSUPPORTED'}));
  }
  const joints=latestDetails(model,'connections');
  const foundationContexts=new Map(),footingsByNode=new Map(),planContexts=new Map(),nodeById=new Map((model.nodes||[]).map(n=>[n.id,n])),comparisonBudget={remaining:100000};
  for(const footing of latestDetails(model,'foundations')){planContexts.set(footing.id,{footing,node:nodeById.get(footing.nodeId)});const rows=footingsByNode.get(footing.nodeId)||[];rows.push(footing);footingsByNode.set(footing.nodeId,rows);}
  for(const node of model.nodes||[]) {
   const incident=(model.members||[]).filter(m=>(m.n1===node.id||m.n2===node.id)&&resolveMaterialRecord(model,m.matId)?.kind==='concrete');
   const matchingJoints=joints.filter(x=>x.nodeId===node.id),joint=matchingJoints.length===1?matchingJoints[0]:null,jointChecks=joint&&set?evaluateRcJoint(model,joint,set,{preparedJoint:preparedDetails?.connections?.[`${joint.id}@${joint.version}`]}):{};
   if(incident.some(m=>pathMembers.has(m.id)))for(const key of Object.keys(jointChecks))if(!(['joint-confinement','joint-hoop-detail'].includes(key)&&jointChecks[key].spliceLayoutProof?.status==='OK'))jointChecks[key]=pendingPath(jointChecks[key]);
   if(incident.length>1)for(const checkId of REQUIRED_JOINT_CHECKS)push(`joint:${node.id}`,checkId,{reason:matchingJoints.length>1?'AMBIGUOUS_CONNECTION_DETAILS':joint?'RULE_UNAVAILABLE':'MISSING_CONNECTION_DETAILS',...jointChecks[checkId]});
   const matchingFootings=footingsByNode.get(node.id)||[],footing=matchingFootings.length===1?matchingFootings[0]:null,footingChecks=footing&&set?evaluateProvidedFooting(model,footing,set,options.mechanicsLaw,{preparedFoundation:preparedDetails?.foundations?.[`${footing.id}@${footing.version}`]}):{};
   if(incident.some(m=>pathMembers.has(m.id)))for(const key of Object.keys(footingChecks))if(!['foundation-footprint-fit','foundation-depth','foundation-spacing','foundation-distribution','foundation-anchorage'].includes(key)&&!(key==='foundation-column-transfer'&&footingChecks[key].spliceLayoutProof?.status==='OK'))footingChecks[key]=pendingPath(footingChecks[key]);
   if(node.support&&node.support!=='free'){
    const first=checks.length;
    for(const checkId of [...REQUIRED_FOUNDATION_CHECKS.filter(x=>x!=='foundation-code-compliance'),...(footingChecks['foundation-footprint-fit']?['foundation-footprint-fit']:[])])push(`foundation:${node.id}`,checkId,{reason:matchingFootings.length>1?'AMBIGUOUS_FOUNDATION_DETAILS':footing?'RULE_UNAVAILABLE':'MISSING_FOUNDATION_GEOMETRY',...footingChecks[checkId]});
    const aggregateIndex=checks.length;
    push(`foundation:${node.id}`,'foundation-code-compliance',aggregateCodeCompliance(checks.slice(first)));
    if(footing)foundationContexts.set(footing.id,{footing,node,settlement:footingChecks['foundation-settlement'],first,aggregateIndex});
   }
  }
  for(const current of foundationContexts.values()){
   const additional=[];
   if(current.footing.differentialSettlementBasis!==undefined){push(`foundation:${current.node.id}`,'foundation-differential-settlement',evaluateDifferentialSettlement({current,peers:foundationContexts}));additional.push(checks.at(-1));}
   if(current.footing.footprintClearance!==undefined||current.footing.footprintClearanceReference!==undefined){push(`foundation:${current.node.id}`,'foundation-plan-clearance',evaluateFootingPlanClearance({current,peers:planContexts,comparisonBudget}));additional.push(checks.at(-1));}
   if(additional.length){const constituent=[...checks.slice(current.first,current.aggregateIndex),...additional];checks[current.aggregateIndex]=practicalCheck(`foundation:${current.node.id}`,comboId,'foundation-code-compliance',aggregateCodeCompliance(constituent));}
  }
 }
 const combinationCoverage=designCombinationCoverage(model,sourceSets,Object.keys(sets));
 const summary=summarizePracticalChecks(checks,combinationCoverage);
 return {version:PRACTICAL_EVALUATION_VERSION,checks,demands,...summary,designTransferAllowed:false};
}
export function designCombinationCoverage(model,sourceSets,evaluatedComboIds=Object.keys(sourceSets)) {
 const expected=(model.loadCombinations||[]).filter(x=>x.enabled!==false).map(x=>x.id);
 const missingIds=expected.filter(id=>!sourceSets[id]?.ok),purposes=new Set((model.loadCombinations||[]).filter(x=>sourceSets[x.id]?.ok).map(x=>x.type));
 return {projectProfile:evaluateProjectProfile(model),basis:'all-active-declared-combinations; code-generation-and-load-family-qualification-separate',expectedIds:expected,missingIds,evaluatedComboIds,missingEvaluationIds:expected.filter(id=>!evaluatedComboIds.includes(id)),missingPurposes:['strength','service'].filter(x=>!purposes.has(x)),codeQualified:false};
}
