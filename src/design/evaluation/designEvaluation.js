import {preparePracticalRcMemberResults,preparePracticalRcSummary,preparePracticalRcSchedules} from './practicalMemberSummary.js';
import {checkIncomplete} from '../../metadata/checkCompleteness.js';
import {materialOf,sectionOf} from '../../core/catalogs.js';
import {runSteelDesign} from '../steel.js';
import {runConcreteDesign} from '../concrete.js';
import {buildDesignDemandPackage} from '../designDemandPackage.js';
import {evaluatePracticalDesign} from './practicalEvaluation.js';
import {designCodeBasis} from '../../metadata/designCodeBasis.js';
const cached=(map,key,read)=>{if(!map.has(key))map.set(key,read());return map.get(key);};

export function evaluateLegacyDesign(model, analysis, options = {}) {
  const resultSet = options.resultSet;
  const demandPackage = options.demandPackage || buildDesignDemandPackage(model, analysis, { resultSet });
  const materialCache = new Map();
  const sectionCache = new Map();
  const getMaterial = (id) => cached(materialCache, id, () => materialOf(model, id));
  const getSection = (id) => cached(sectionCache, id, () => sectionOf(model, id));
  const steel = runSteelDesign(model, analysis, {
    ...(options.steel || {}),
    resultSet,
    demandPackage,
    materialOf: getMaterial,
    sectionOf: getSection,
  });
  const concrete = runConcreteDesign(model, analysis, {
    ...(options.concrete || {}),
    resultSet,
    demandPackage,
    materialOf: getMaterial,
    sectionOf: getSection,
  });
  for(const family of [steel,concrete])for(const member of Object.values(family.memberResults||{}))for(const check of member.checks||[])check.codeBasis=designCodeBasis(check.id,check);
  return {steel,concrete,demandPackage};
}
export function evaluateDesign(model,analysis,options={}) {
  const {steel,concrete,demandPackage}=evaluateLegacyDesign(model,analysis,options);
  const practical=evaluatePracticalDesign(model,analysis,{...options,resultSet:Object.hasOwn(options,'practicalResultSet')?options.practicalResultSet:options.resultSet});
  const practicalMemberResults=preparePracticalRcMemberResults(practical.checks);
  const summary=summarizeDesignEvaluation({steel,concrete,practical,practicalMemberResults,memberIds:(model.members||[]).map(m=>m.id)});
  return {practicalRcSchedules:preparePracticalRcSchedules(model,practicalMemberResults),practicalRcSummary:preparePracticalRcSummary(practicalMemberResults),practicalMemberResults,practical,ok:summary.ok,steel,concrete,demandPackage,summary,designTransferAllowed:false};
}
// Legacy concrete remains available as a diagnostic payload. It is not the
// authority for supplied reinforcement, nor a veto on its scoped summary.
export function summarizeDesignEvaluation({steel,concrete,practical,practicalMemberResults=preparePracticalRcMemberResults(practical.checks),memberIds}){
 const rcRows=Object.values(practicalMemberResults),rcCheckedMembers=rcRows.filter(r=>r.evaluatedCheckCount>0).length;
 const checkedMembers=steel.summary.checkedMembers+rcCheckedMembers;
 const practicalGoverning=practical.checks.filter(x=>Number.isFinite(x.ratio)).reduce((best,x)=>!best||x.ratio>best.ratio?x:best,null);
 const governing=[steel.summary.governing,practicalGoverning].filter(Boolean).reduce((best,x)=>!best||x.ratio>best.ratio?x:best,null);
 const steelIncomplete=Object.values(steel.memberResults||{}).reduce((sum,m)=>sum+(m.checks||[]).filter(checkIncomplete).length,0);
 const uncheckedCount=(practical.incompleteCheckCount??practical.checks.filter(checkIncomplete).length)+steelIncomplete;
 const ngCount=steel.summary.ngCount+practical.counts.NG;
 const designComplete=practical.complete===true&&steel.ok===true&&uncheckedCount===0&&ngCount===0;
 return {ok:designComplete,designComplete,maxUtilization:Math.max(steel.summary.maxUtilization,practicalGoverning?.ratio||0),practicalCheckCount:practical.checkCount,uncheckedCount,governing,
  checkedMembers,skippedMembers:memberIds?Math.max(0,new Set(memberIds).size-checkedMembers):steel.summary.skippedMembers+rcRows.length-rcCheckedMembers,rcCheckedMembers,rcUnreviewedMembers:rcRows.filter(r=>r.incomplete).length,
  ngCount,warnCount:steel.summary.warnCount+practical.counts.WARN,designTransferAllowed:false,rcSummaryBasis:'provided-practical-checks',legacyConcreteDiagnosticOnly:true};
}
