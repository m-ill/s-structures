import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {DIRECT_MOMENT_COMPARISON_VERSION} from '../../metadata/directMomentComparisonPolicy.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveSectionRecord,resolveMaterialRecord} from '../../materials/registry.js';
import {evaluateRefinedDirectStability} from './refinedDirectStability.js';

// m, MPa, kN, kN.m. Conservative non-sway option: k=Cm=beta_dns=1.
export function kdsBracedColumnMagnification({B,H,E,L,N,My,Mz}) {
 const base={spliceLayoutIndependent:true,stiffnessBasis:'0.2 Ec Ig; no reinforcement stiffness term',codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.4.2(2); 4.4.6; Eq.4.4-4; Eq.4.4-5; Eq.4.4-6; Eq.4.4-8; Eq.4.4-11'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![B,H,E,L].every(x=>Number.isFinite(x)&&x>0)||![N,My,Mz].every(Number.isFinite))return {...base,status:'NOT_CHECKED',ratio:null,reason:'STABILITY_GEOMETRY_MATERIAL_DEMAND_REQUIRED'};
 if(N>=0)return {...base,status:'N_A',ratio:null,reason:'NO_COMPRESSION_DEMAND',demand:{N,My,Mz}};
 const Pu=-N,axes={};
 for(const [axis,I,h,M] of [['My',H*B**3/12,B,My],['Mz',B*H**3/12,H,Mz]]){
  const EI=.2*E*1000*I,Pc=Math.PI**2*EI/L**2,utilization=Pu/(.75*Pc),minimumMoment=Pu*(.015+.03*h);
  axes[axis]={EI,Pc,utilization,minimumMoment,delta:utilization<1?Math.max(1,1/(1-utilization)):null,inputMoment:M,k:1,Cm:1,betaDns:1};
 }
 const axialStabilityRatio=Math.max(axes.My.utilization,axes.Mz.utilization);
 if(axialStabilityRatio>=1)return {...base,status:'NG',ratio:axialStabilityRatio,axialStabilityRatio,reason:'COLUMN_MAGNIFIER_DENOMINATOR_NONPOSITIVE',axes};
 const amplificationLimit=1.4,amplificationRatio=Math.max(axes.My.delta,axes.Mz.delta)/amplificationLimit;
 const amplification={axialStabilityRatio,amplificationLimit,amplificationRatio,amplificationBasis:'local magnifier on minimum-eccentricity-adjusted first-order moment; full-frame moment comparison separate'};
 const ratio=Math.max(axialStabilityRatio,amplificationRatio);
 // A magnifier exceeding 1.4 necessarily exceeds the allowed increase, even
 // before any minimum-eccentricity adjustment. Do not pass it merely because Pc is positive.
 if(amplificationRatio>1+1e-12)return {...base,...amplification,status:'NG',ratio,reason:'COLUMN_SECOND_ORDER_AMPLIFICATION_LIMIT_EXCEEDED',axes};
 const demand={N,My:(My<0?-1:1)*Math.max(Math.abs(My),axes.My.minimumMoment)*axes.My.delta,Mz:(Mz<0?-1:1)*Math.max(Math.abs(Mz),axes.Mz.minimumMoment)*axes.Mz.delta};
 return {...base,...amplification,status:'OK',ratio,axes,demand,scope:'explicitly-braced-prismatic-column-first-order; full-node-length; conservative-Cm-beta',units:{length:'m',E:'MPa',Pc:'kN',moment:'kN.m'}};
}

export function prepareProvidedStability(model,member,details,tuples,method,set) {
 const comparison=method==='direct'&&set?.firstOrderMomentComparison?.version===DIRECT_MOMENT_COMPARISON_VERSION?set.firstOrderMomentComparison.members?.[member.id]:null;
 const observedMomentExcess=!!comparison&&['EXCEEDS_AT_RECORDED_STATIONS','EXCEEDS_IN_RECOVERY_INTERVALS'].includes(comparison.status);
 const nc=reason=>({check:{status:'NOT_CHECKED',ratio:null,reason,...(comparison?{momentComparison:comparison,observedMomentExcess,codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.4.2(2)',governsCalculation:false,relationship:'retained numerical moment comparison; stability applicability and method remain incomplete'}))}:{})},strengthTuples:tuples});
 if(!Array.isArray(tuples)||!tuples.length||tuples.some(t=>!t||![t.N,t.My,t.Mz].every(Number.isFinite)))return nc('STABILITY_CONCURRENT_DEMAND_REQUIRED');
 if(!tuples.some(t=>t.N<0))return {check:{status:'N_A',ratio:null,reason:'NO_COMPRESSION_DEMAND',spliceLayoutIndependent:true},strengthTuples:tuples};
 if(member.taper!=null)return nc('PRISMATIC_COLUMN_STABILITY_REQUIRED');
 if(requiresOffsetAwareDesign(member))return nc('OFFSET_COLUMN_STABILITY_REQUIRED');
 // The existing 0.2 Ec Ig option is independent of bar layout. Require a
 // complete non-overlapping partition, not a single reinforcement record.
 const regions=[...details].sort((a,b)=>a.start-b.start);
 if(!regions.length||regions.length>100||regions[0].start!==0||regions.at(-1).end!==1||regions.some((d,i)=>![d.start,d.end].every(Number.isFinite)||d.end<=d.start||i>0&&d.start!==regions[i-1].end))return nc('STABILITY_PRISMATIC_FULL_LENGTH_DETAIL_REQUIRED');
 if(method==='direct'&&set?.stiffnessProvenance?.stiffnessMode==='kds-elastic-second-order')return {check:evaluateRefinedDirectStability(model,member,regions,set),strengthTuples:tuples};
 if(tuples.some(t=>Math.abs(t.N-tuples[0].N)>1e-8*Math.max(1,Math.abs(tuples[0].N))))return nc('VARIABLE_AXIAL_COLUMN_STABILITY_REQUIRED');
 const d=regions[0];
 if(regions.some(d=>d.stabilityStandard!=='KDS-142020-2022'||d.stabilitySystem!=='braced-column'||!d.stabilityClassificationReference?.trim()))return nc('BRACED_COLUMN_CLASSIFICATION_AND_REFERENCE_REQUIRED');
 if(method!=='off'){
  const pending=nc(method==='direct'?'DIRECT_LOCAL_STABILITY_SEPARATION_REQUIRED':'FIRST_ORDER_ANALYSIS_PROVENANCE_REQUIRED');
  if(comparison){
   pending.check.momentComparison=comparison;
   if(['EXCEEDS_AT_RECORDED_STATIONS','EXCEEDS_IN_RECOVERY_INTERVALS'].includes(comparison.status)){
    const axes=Object.values(comparison.axes);
    pending.check={...pending.check,status:'NG',reason:'DIRECT_MOMENT_AMPLIFICATION_LIMIT_EXCEEDED',ratio:axes.some(a=>a.zeroReferenceExceedance)?null:Math.max(...axes.map(a=>a.maximumFiniteRatio)),incomplete:true,methodReviewRequired:true,incompleteReasons:['DIRECT_LOCAL_STABILITY_SEPARATION_REQUIRED',...(comparison.intervalCoverageVerified?[]:['FULL_MEMBER_MOMENT_COMPARISON_REQUIRED'])],codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.4.2(2)',relationship:'observed recovery-interval or matched-station second-order moment excess; whole-method qualification separate'}))};
   }
  }
  return pending;
 }
 const s=resolveSectionRecord(model,member.secId),m=resolveMaterialRecord(model,member.matId),ends=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!['RECT','SQUARE'].includes(s?.shape)||!ends.every(Boolean))return nc('STABILITY_RECTANGULAR_GEOMETRY_REQUIRED');
 const L=Math.hypot(ends[0].x-ends[1].x,ends[0].y-ends[1].y,ends[0].z-ends[1].z),B=s.params.B/1000,H=(s.params.H||s.params.B)/1000;
 const strengthTuples=[],results=[];
 for(const t of tuples){
  const r=kdsBracedColumnMagnification({B,H,E:m?.elastic?.E,L,...t});results.push({...r,concurrentDemand:t});
  if(r.status==='NG'||r.status==='NOT_CHECKED')continue;
  if(r.status==='N_A'){strengthTuples.push(t);continue;}
  // Where minimum eccentricity governs, check both signs rather than silently
  // selecting the stronger face of asymmetric provided reinforcement.
  const signs=axis=>Math.abs(t[axis])<r.axes[axis].minimumMoment?[-1,1]:[Math.sign(t[axis])];
  for(const sy of signs('My'))for(const sz of signs('Mz'))strengthTuples.push({...t,My:sy*Math.abs(r.demand.My),Mz:sz*Math.abs(r.demand.Mz),stability:{rawDemand:{N:t.N,My:t.My,Mz:t.Mz},axes:r.axes}});
 }
 const rank={N_A:0,OK:1,NG:2,NOT_CHECKED:3};
 const worst=results.reduce((a,b)=>!a||rank[b.status]>rank[a.status]||rank[b.status]===rank[a.status]&&(b.ratio||0)>(a.ratio||0)?b:a,null);
 return {check:{...worst,classificationReference:d.stabilityClassificationReference,detailId:regions.length===1?d.id:null,detailVersion:regions.length===1?d.version:null,detailSources:regions.map(r=>({id:r.id,version:r.version,start:r.start,end:r.end,classificationReference:r.stabilityClassificationReference})),strengthDemandPrepared:strengthTuples.length>0,globalStabilityQualified:false},strengthTuples};
}
