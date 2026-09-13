import {checkIncomplete} from '../../metadata/checkCompleteness.js';
import {preparePracticalResult} from '../../design/evaluation/practicalResultPreparation.js';
import {designCodeBasis} from '../../metadata/designCodeBasis.js';
import { evaluateLegacyDesign as runDesignChecks } from '../../design/evaluation/designEvaluation.js';
import { buildDesignDemandPackage } from '../../design/designDemandPackage.js';
import { buildServiceabilityDriftReport } from '../../design/serviceability.js';
import { buildConnectionFoundationReport } from '../../design/connectionFoundation.js';
import {stableHash} from '../../core/stableHash.js';
import {ELASTIC_REVIEW_VERSION} from '../../metadata/elasticReviewVersion.js';
const clone=value=>structuredClone(value);
const reject=code=>{throw Object.assign(new Error(code),{code});};
function status(value) {return value==='OK'||value==='PASS'?'OK':value==='NG'||value==='FAIL'?'NG':value==='WARN'?'WARN':'NOT_CHECKED';}
function number(value) {return typeof value==='number'&&Number.isFinite(value)?value:null;}

export function calculateReview(model, rows, prepared=null) {
  const checks=[],diagnostics=[],messages=[],sources=[],demandPackages=[];
  const selectedCombinations=Object.fromEntries(rows.map(({source,set})=>[source.comboId,set]));
  const preparedPractical=prepared||preparePracticalResult(model,rows,{includeGeometry:false});
  for(const {source,set,method,row} of rows) {
    const analysis={ok:true,byCombo:{[source.comboId]:set},envelope:set};
    const demandPackage=buildDesignDemandPackage(model,analysis), design=runDesignChecks(model,{...analysis,byCombo:selectedCombinations},{resultSet:set,demandPackage,analysisMethod:method});
    const before=checks.length;
    checks.push(...preparedPractical.checks.filter(item=>item.comboId===source.comboId).map(item=>({...source,...item})));
    const serviceCombo=model.loadCombinations.find(x=>x.id===source.comboId)?.type==='service';
    const completeDisplacements=(model.nodes||[]).every(node=>{const d=set.disp?.[node.id]||set.nodeDisplacements?.[node.id];return d&&[0,1,2].every(i=>number(d[i])!==null);});
    const serviceability=serviceCombo&&completeDisplacements?buildServiceabilityDriftReport(model,analysis):{rows:[],criteria:{driftLimitRatio:1/200}};
    const connectionFoundation=buildConnectionFoundationReport(model,analysis,{resultSet:set,demandPackage,analysisMethod:method});
    for(const member of model.members||[]) {
      const found=design.steel.memberResults[member.id]||design.concrete.memberResults[member.id];
      if(!found) checks.push({...source,memberId:member.id,category:'member',checkId:'unsupported-or-missing',status:'NOT_CHECKED',ratio:null,expression:'No supported member design result'});
      for(const item of found?.checks||[]) {
        const interaction=item.id.includes('interaction'),applicable=item.id!=='rc-column-interaction'||found.role==='column';
        const unit=interaction||item.id.includes('slenderness')?'-':item.id.includes('deflection')?'m':item.id.includes('flexure')||item.id.includes('ltb')?'kN.m':'kN';
        (found.type==='concrete'?diagnostics:checks).push({...source,memberId:member.id,category:found.type,checkId:item.id,
          status:!applicable||item.status==='N_A'?'N_A':number(item.ratio)===null?'NOT_CHECKED':status(item.status),ratio:applicable?number(item.ratio):null,
          reason:item.reason||(!applicable?'Column interaction does not apply to beams':null), calculationVersion:found.calculationVersion||null, reinforcementBasis:found.reinforcementBasis||null,
          demand:interaction?number(item.ratio):number(item.demand),capacity:interaction?1:number(item.capacity),unit,
          expression:item.expression||'',x:number(item.x),method:found.method});
      }
      for(const message of found?.messages||[]) messages.push({...source,memberId:member.id,category:found.type,...message});
    }
    for(const item of serviceability.rows) checks.push({...source,memberId:`story-${item.storyIndex||item.story||''}`,category:'serviceability',checkId:'story-drift',status:status(item.status),ratio:number(item.driftRatio/serviceability.criteria.driftLimitRatio),demand:number(item.driftRatio),capacity:serviceability.criteria.driftLimitRatio,expression:'story drift / drift limit'});
    if(!serviceability.rows.length) checks.push({...source,memberId:null,category:'serviceability',checkId:'story-drift',status:serviceCombo?'NOT_CHECKED':'N_A',ratio:null,reason:serviceCombo?'Complete story drift inputs required':'Serviceability drift does not apply to this strength combination',expression:'story drift applicability'});
    for(const item of connectionFoundation.connectionRows) diagnostics.push({...source,memberId:item.memberId,category:'connection',checkId:'preliminary-force-screen',status:status(item.status),ratio:number(item.utilization),demand:number(item.equivalentDemand),capacity:connectionFoundation.assumptions.nominalConnectionCapacity,expression:'equivalent force / assumed nominal connection capacity'});
    for(const item of connectionFoundation.foundationRows) {
      diagnostics.push({...source,memberId:item.nodeId,category:'foundation',checkId:'required-bearing-area',status:'NOT_CHECKED',ratio:null,demand:number(item.requiredArea),capacity:null,expression:'required area = vertical reaction / assumed allowable bearing; actual footing area not checked'});
      const unavailable=item.reaction.vertical<=0;
      diagnostics.push({...source,memberId:item.nodeId,category:'foundation',checkId:'slidingRatio',status:item.uplift?'NG':unavailable?'NOT_CHECKED':status(item.status),ratio:unavailable?null:number(item.slidingRatio),expression:'horizontal reaction / (vertical reaction × assumed friction); uplift retains NG'});
    }
    for(const item of checks.slice(before)) item.unit ||= item.category==='serviceability'||item.checkId==='slidingRatio'?'-':item.checkId==='required-bearing-area'?'m2':item.category==='connection'?'kN':'-';
    const own=checks.slice(before), governing=own.filter(x=>x.ratio!==null).sort((a,b)=>b.ratio-a.ratio)[0]||null;
    sources.push({...source,caseId:row.caseId,method,maxDisplacement:number(set.dmax),maxUtilization:governing?.ratio??null,governing,qualification:row.qualification,equilibriumResidual:number(set.summary?.equilibriumResidual),equilibriumStatus:set.summary?.equilibriumStatus||'NOT_AVAILABLE',recoveryQualified:set.recoveryQualification?.qualified??null,inputHash:row.identity.inputHash,resultHash:row.resultHash});
    demandPackages.push({...source,package:demandPackage});
  }
  for (const item of [...checks,...diagnostics]) item.codeBasis ||= designCodeBasis(item.checkId,item);
  for (const item of checks) item.checkKey = stableHash([item.analysisRunId,item.comboId,item.memberId,item.category,item.checkId]);
  if (new Set(checks.map(item=>item.checkKey)).size !== checks.length) reject('DUPLICATE_CANONICAL_CHECK');
  const counts=Object.fromEntries(['OK','WARN','NG','NOT_CHECKED','N_A','FAILED'].map(key=>[key,checks.filter(x=>x.status===key).length]));
  const incompleteCheckCount=checks.filter(checkIncomplete).length,hiddenIncomplete=checks.some(x=>x.incomplete===true||x.locationCoverage?.complete===false);
  const governing=checks.filter(x=>x.ratio!==null).sort((a,b)=>b.ratio-a.ratio)[0]||null;
  return {version:ELASTIC_REVIEW_VERSION,units:clone(model.units),axes:'member-local',signConvention:'solver-native',checks,diagnostics:diagnostics.map(x=>({...x,governing:false,qualification:'legacy-assumed-input-screen'})),messages,sources,demandPackages,
    summary:{practical:preparedPractical.summary,incompleteCheckCount,uncheckedEntityCount:new Set(checks.filter(checkIncomplete).map(x=>x.memberId).filter(Boolean)).size,status:counts.FAILED?'FAILED':counts.NG?'NG':counts.NOT_CHECKED||hiddenIncomplete?'NOT_CHECKED':counts.WARN||messages.length?'WARN':'OK',counts,maxUtilization:governing?.ratio??null,governing,checkCount:checks.length,messageCount:messages.length,failedMemberCount:new Set(checks.filter(x=>x.status==='NG'&&(model.members||[]).some(m=>m.id===x.memberId)).map(x=>x.memberId)).size,failedEntityCount:new Set(checks.filter(x=>x.status==='NG'&&x.memberId).map(x=>x.memberId)).size},
    ruleSources:[{module:'src/design/steel.js',method:'steel_allowable_preliminary + elastic LTB',status:'preliminary'},{module:'src/design/concrete.js',method:'rc_preliminary_strength',status:'preliminary'},{module:'src/design/serviceability.js',method:'story drift H/200 default',status:'project criterion required'},{module:'src/design/connectionFoundation.js',method:'force / bearing / sliding screening',status:'assumed capacities; preliminary'}],
    limitations:['Final design transfer is blocked; computed OK is not engineering approval.','Only explicitly bound completed first-order/Direct P–Delta combinations are mapped. Legacy P–Delta is comparison-only and blocked. Modal, RSA, buckling, THA and nonlinear results are not mapped to member design demand.','Steel checks are preliminary allowable-stress screens, not a complete strength-code implementation. Legacy RC diagnostics use assumed reinforcement; practical checks use provided details and only explicitly selected scoped KDS rules.','LTB, missing members, warnings and unchecked items retain their own status.','Joint confinement/end anchorage, eccentric punching and soil qualification remain incomplete. Centered punching and special-frame joint shear are available only with their explicit required inputs.','Selected combinations only; required code combination coverage is not certified.']};
}
