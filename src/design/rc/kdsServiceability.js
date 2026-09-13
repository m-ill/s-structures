import {evaluateFrameServiceability} from './frameServiceability.js';
import {crackedRectangularStiffness} from './crackedSectionStiffness.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {integrateCurvatureSegments} from './curvatureIntegration.js';
import {evaluateRegionalDeflection} from './regionalServiceability.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
export function effectiveInertia({Ig,Icr,Mcr,Ma}) {
 if(![Ig,Icr,Mcr,Ma].every(Number.isFinite)||Ig<=0||Icr<=0||Mcr<0||Ma<0)throw new Error('SERVICE_INERTIA_INPUT_INVALID');
 const f=Ma<=Mcr?1:(Mcr/Ma)**3;return Math.min(Ig,f*Ig+(1-f)*Icr);
}
export function longTermMultiplier(months,compressionRatio) {
 if(!Number.isFinite(months)||months<=0)throw new Error('SUSTAINED_LOAD_DURATION_REQUIRED');
 const xi=months>=60?2:({3:1,6:1.2,12:1.4})[months];
 if(!Number.isFinite(xi)||!Number.isFinite(compressionRatio)||compressionRatio<0)throw new Error('SUSTAINED_LOAD_DURATION_REQUIRED');
 return xi/(1+50*compressionRatio);
}
export function integrateCurvature(xs,curvature,boundary) {
 if(!['chord','cantilever-start','cantilever-end'].includes(boundary)||xs.length<2||xs.length!==curvature.length||xs.some((x,i)=>!Number.isFinite(x)||(i&&x<=xs[i-1]))||curvature.some(x=>!Number.isFinite(x)))throw new Error('CURVATURE_INPUT_INVALID');
 const segments=Array.from({length:xs.length-1},(_,i)=>({x0:xs[i],x1:xs[i+1],k0:curvature[i],k1:curvature[i+1]}));
 const {displacements,slopes,extrema,maxAbs}=integrateCurvatureSegments(segments,boundary);
 return {displacements,slopes,extrema,maxAbs,sampling:'piecewise-linear-curvature-exact-interval-extrema'};
}
function evaluateInstantDeflection(model,member,details,set,allSets) {
 const codeReferences=getKcscRuleSources(['142030']).map(x=>({...x,clause:'4.2.1(2),(3),(6); Eq.4.2-1..3; Table 4.2-2'}));
 const base={codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(details.length!==1||details[0].serviceabilityMode!=='instant-live-curvature')return nc('SERVICEABILITY_SCOPE_REQUIRED');
 const detail=details[0],combo=model.loadCombinations?.find(x=>x.id===set?.combo?.id);
 if(detail.nonstructuralDamageSensitive!==false)return nc('POST_ATTACHMENT_LONG_TERM_CHECK_REQUIRED');
 const factors=Object.entries(combo?.factors||{}).filter(([,v])=>v!==0);
 if(combo?.type!=='service'||!factors.length||!factors.every(([id,v])=>v===1&&model.loadCases.some(x=>x.id===id&&x.type==='live')))return nc('UNFACTORED_LIVE_ONLY_COMBINATION_REQUIRED');
 const total=allSets?.[detail.serviceCrackingComboId],totalCombo=model.loadCombinations?.find(x=>x.id===detail.serviceCrackingComboId);
 if(!total?.ok||totalCombo?.type!=='service'||!factors.every(([id,v])=>totalCombo.factors?.[id]>=v))return nc('TOTAL_SERVICE_CRACKING_RESULT_REQUIRED');
 const deadCases=(model.loadCases||[]).filter(x=>x.enabled!==false&&x.type==='dead');
 if(deadCases.some(x=>totalCombo.factors?.[x.id]!==1))return nc('TOTAL_SERVICE_DEAD_LOAD_REQUIRED');
 if(Object.values(totalCombo.factors||{}).some(v=>!Number.isFinite(v)||v<0||v>1))return nc('UNFACTORED_TOTAL_SERVICE_REQUIRED');
 const section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,detail.barMaterialId);
 if(section?.shape!=='RECT'||detail.start!==0||detail.end!==1||detail.concreteWeight!=='normal')return nc('FULL_REGION_NORMAL_RECTANGULAR_BEAM_REQUIRED');
 const B=section.params.B/1000,H=section.params.H/1000,Ec=concrete?.elastic?.E,Es=steel?.elastic?.E,fc=concrete?.strength?.concrete?.fck;
 const r=set.memberResults?.[member.id],rt=total.memberResults?.[member.id];
 if(!r||!rt||!r.xs||r.xs.length<3||!r.Mz||!rt.Mz||![Ec,Es,fc].every(x=>Number.isFinite(x)&&x>0)||Es<=Ec)return nc('SERVICE_SECTION_AND_STATIONS_REQUIRED');
 if(![r,rt].every(x=>x.Mz.length===x.xs?.length&&x.Mz.every(Number.isFinite)&&x.xs.every((v,i)=>Number.isFinite(v)&&(!i||v>x.xs[i-1]))))return nc('SERVICE_STATION_GRID_INVALID');
 const ends=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 const actualLength=ends.every(Boolean)?Math.hypot(ends[1].x-ends[0].x,ends[1].y-ends[0].y,ends[1].z-ends[0].z):0;
 if(!actualLength||[r,rt].some(x=>Math.abs(x.xs[0])>1e-8||Math.abs(x.xs.at(-1)-actualLength)>1e-8))return nc('FULL_MEMBER_SERVICE_STATIONS_REQUIRED');
 if(![r,rt].every(x=>['N','My'].every(k=>x[k]?.every(v=>Number.isFinite(v)&&Math.abs(v)<1e-8))))return nc('UNIAXIAL_FLEXURE_WITHOUT_AXIAL_FORCE_REQUIRED');
 const Ig=B*H**3/12,fr=0.63*Math.sqrt(fc),Mcr=fr*Ig/(H/2)*1000,Ma=Math.max(...rt.Mz.map(Math.abs));
 const sectionStiffness=crackedRectangularStiffness({B,H,bars:detail.bars,Ec,Es});
 const Icr=sectionStiffness.z.faces.map(face=>face.Icr);
 const Ie=Math.min(...Icr.map(Icr=>effectiveInertia({Ig,Icr,Mcr,Ma})));
 const L=r.xs.at(-1)-r.xs[0],divisor=detail.serviceDeflectionLimit==='live-floor'?360:detail.serviceDeflectionLimit==='live-roof'?180:null;
 if(!divisor)return nc('SERVICE_DEFLECTION_LIMIT_REQUIRED');
 if(!['chord','cantilever-start','cantilever-end'].includes(detail.serviceBoundary))return nc('SERVICE_BOUNDARY_REQUIRED');
 if(detail.serviceBoundary==='cantilever-start'&&model.nodes.find(x=>x.id===member.n1)?.support!=='fixed')return nc('CANTILEVER_FIXED_START_REQUIRED');
 if(detail.serviceBoundary==='cantilever-end'&&model.nodes.find(x=>x.id===member.n2)?.support!=='fixed')return nc('CANTILEVER_FIXED_END_REQUIRED');
 const response=integrateCurvature(Array.from(r.xs),Array.from(r.Mz,x=>x/(Ec*1000*Ie)),detail.serviceBoundary);
 const limit=L/divisor,ratio=response.maxAbs/limit;
 return {...base,status:ratio>1?'NG':'OK',ratio,demand:response.maxAbs,capacity:limit,sectionStiffness,Ig,Icr,Ie,Mcr,Ma,response,liveComboId:combo.id,crackingComboId:totalCombo.id,reason:null,scope:'instantaneous-relative-deflection-only; crack and sustained/post-attachment checks separate'};
}

export function evaluateProvidedDeflection(model,member,details,set,allSets) {
 if(details.some(d=>d.serviceabilityMode==='instant-live-frame'))return evaluateFrameServiceability(model,member,details,set,allSets);
 const selectedId=set?.combo?.id;
 if(details.some(d=>['instant-live-curvature','long-term-curvature'].includes(d.serviceabilityMode))){
  const ids=new Set([selectedId,...details.flatMap(d=>[d.serviceCrackingComboId,...(d.serviceabilityMode==='long-term-curvature'?[d.serviceSustainedComboId]:[])])]);
  for(const id of ids){
   if(id===undefined||id===null)continue; // Existing mode owners diagnose missing selectors.
   const combo=model.loadCombinations?.find(c=>c.id===id&&c.enabled!==false);
   const reject=reason=>({status:'NOT_CHECKED',ratio:null,reason,sourceComboId:id,designTransferAllowed:false});
   if(!combo)return reject('SERVICE_COMBINATION_UNAVAILABLE');
   const source=id===selectedId?set:allSets?.[id];
   if(source?.ok&&source.combo?.id!==id)return reject('SERVICE_SOURCE_COMBINATION_MISMATCH');
   for(const [caseId,factor] of Object.entries(combo.factors||{})){
    if(!Number.isFinite(factor))return {...reject('SERVICE_COMBINATION_FACTOR_INVALID'),caseId};
    if(factor!==0&&!model.loadCases?.some(c=>c.id===caseId&&c.enabled!==false))return {...reject('SERVICE_COMBINATION_CASE_UNAVAILABLE'),caseId};
   }
  }
 }
 const liveCombinations=(model.loadCombinations||[]).filter(c=>c.enabled!==false&&c.type==='service'&&Object.entries(c.factors||{}).some(([,v])=>v!==0)&&Object.entries(c.factors||{}).every(([id,v])=>v===0||v===1&&model.loadCases?.some(l=>l.id===id&&l.type==='live')));
 if(typeof selectedId==='string'&&liveCombinations.length===1&&allSets?.[liveCombinations[0].id]?.ok&&selectedId!==liveCombinations[0].id&&details.length&&details.every(d=>['instant-live-curvature','long-term-curvature'].includes(d.serviceabilityMode)&&[d.serviceCrackingComboId,...(d.serviceabilityMode==='long-term-curvature'?[d.serviceSustainedComboId]:[])].includes(selectedId)))return {
  status:'N_A',ratio:null,reason:'SERVICE_COMBINATION_SUPPLIES_DEFLECTION_REFERENCE',
  applicability:{basis:'declared-cracking-or-sustained-reference; unique-unfactored-live-combination-owns-deflection-limit',requiredCompanion:{comboId:liveCombinations[0].id,memberId:member.id,checkId:'rc-deflection'}},
 };
 if(!details.length)return evaluateSingleRegionDeflection(model,member,details,set,allSets);
 let result=evaluateRegionalDeflection(model,member,details,set,allSets,evaluateSingleRegionDeflection);
 if(result.status==='NOT_CHECKED'&&details.every(d=>d.serviceabilityMode==='long-term-curvature'))result={...result,requestedServiceabilityMode:'long-term-curvature',prerequisiteStage:result.prerequisiteStage||'regional-source-applicability',codeReferences:getKcscRuleSources(['142030']).map(x=>({...x,clause:'4.2.1(2),(3),(5),(6); Eq.4.2-1..4; Table 4.2-2'}))};
 // Preserve the single-region scalar contract; source sampling has one owner.
 return details.length===1&&result.regions?.length===1?{...result.regions[0],...result}:result;
}
function evaluateSingleRegionDeflection(model,member,details,set,allSets,compressionReference){
 if(details.length===1&&details[0].serviceabilityMode==='long-term-curvature')return evaluateLongTermDeflection(model,member,details[0],set,allSets,compressionReference);
 return evaluateInstantDeflection(model,member,details,set,allSets);
}
function evaluateLongTermDeflection(model,member,detail,set,allSets,compressionReference){
 const refs=getKcscRuleSources(['142030']).map(x=>({...x,clause:'4.2.1(2),(3),(5),(6); Eq.4.2-1..4; Table 4.2-2'}));
 const base={codeReferences:refs,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(typeof detail.nonstructuralDamageSensitive!=='boolean'||detail.serviceLoadSequence!=='sustained-before-attachment')return nc('SERVICE_LOAD_SEQUENCE_REQUIRED');
 const instant=evaluateInstantDeflection(model,member,[{...detail,serviceabilityMode:'instant-live-curvature',nonstructuralDamageSensitive:false}],set,allSets);
 if(!['OK','NG'].includes(instant.status))return {...instant,codeReferences:refs,requestedServiceabilityMode:'long-term-curvature',prerequisiteStage:'instant-live-curvature'};
 const sustained=allSets?.[detail.serviceSustainedComboId],combo=model.loadCombinations?.find(x=>x.id===detail.serviceSustainedComboId);
 if(!sustained?.ok||combo?.type!=='service')return nc('SUSTAINED_SERVICE_RESULT_REQUIRED');
 const dead=(model.loadCases||[]).filter(x=>x.enabled!==false&&x.type==='dead');if(dead.some(x=>combo.factors?.[x.id]!==1))return nc('SUSTAINED_DEAD_LOAD_REQUIRED');
 if(Object.entries(combo.factors||{}).some(([id,v])=>!Number.isFinite(v)||v<0||v>1||v!==0&&!model.loadCases.some(c=>c.id===id&&['dead','live'].includes(c.type))))return nc('SUSTAINED_GRAVITY_FACTORS_REQUIRED');
 const liveCombo=model.loadCombinations.find(x=>x.id===set.combo.id),fractions=Object.keys(liveCombo.factors).filter(id=>liveCombo.factors[id]!==0).map(id=>combo.factors?.[id]||0);
 if(new Set(fractions).size!==1||Object.entries(combo.factors).some(([id,v])=>v>0&&model.loadCases.find(x=>x.id===id)?.type==='live'&&liveCombo.factors[id]!==1))return nc('COMMON_SUSTAINED_LIVE_FRACTION_REQUIRED');
 const r=set.memberResults[member.id],rs=sustained.memberResults?.[member.id];
 if(!rs||!['xs','Mz','N','My'].every(k=>rs[k]?.length===r.xs.length&&rs[k].every(Number.isFinite))||rs.xs.some((x,i)=>x!==r.xs[i])||rs.N.some(x=>Math.abs(x)>1e-8)||rs.My.some(x=>Math.abs(x)>1e-8))return nc('SUSTAINED_MATCHING_UNIAXIAL_STATIONS_REQUIRED');
 const sec=resolveSectionRecord(model,member.secId),B=sec.params.B/1000,H=sec.params.H/1000;
 const referenceBars=compressionReference?.detail?.bars||detail.bars;
 const ratios=[-1,1].map(sign=>{const c=referenceBars.filter(b=>b.y*sign>0),t=referenceBars.filter(b=>b.y*sign<0);if(!c.length||!t.length)return 0;const Ac=c.reduce((s,b)=>s+b.area,0),At=t.reduce((s,b)=>s+b.area,0),yt=t.reduce((s,b)=>s+b.y*b.area,0)/At,d=H/2-sign*yt;return Ac/(B*d);});
 const reference={detailId:compressionReference?.detail?.id??detail.id,detailVersion:compressionReference?.detail?.version??detail.version,positionFraction:compressionReference?.positionFraction,position:compressionReference?.position,positionUnit:'m',basis:compressionReference?.basis,faceRatios:ratios,faceSelection:'minimum-of-two-faces-conservative',clause:'KDS 14 20 30 4.2.1(5)'};
 const compressionRatio=Math.min(...ratios);let multiplier;
 try{multiplier=longTermMultiplier(detail.serviceDurationMonths,compressionRatio);}catch{return nc('SUSTAINED_LOAD_DURATION_REQUIRED');}
 const before=detail.servicePreAttachmentMultiplier||0;
 if(before<0||before>multiplier)return nc('PRE_ATTACHMENT_MULTIPLIER_RANGE');
 if(before>0&&!detail.servicePreAttachmentReference?.trim())return nc('PRE_ATTACHMENT_TECHNICAL_REFERENCE_REQUIRED');
 const Ma=Math.max(instant.Ma,...rs.Mz.map(Math.abs),...r.Mz.map(Math.abs)),Ie=Math.min(...instant.Icr.map(Icr=>effectiveInertia({Ig:instant.Ig,Icr,Mcr:instant.Mcr,Ma})));
 const Ec=resolveMaterialRecord(model,member.matId).elastic.E,denominator=Ec*1000*Ie,additionalLiveFraction=1-fractions[0];
 const curvature=r.xs.map((_,i)=>((multiplier-before)*rs.Mz[i]+additionalLiveFraction*r.Mz[i])/denominator);
 const response=integrateCurvature(Array.from(r.xs),Array.from(curvature),detail.serviceBoundary),L=r.xs.at(-1)-r.xs[0],capacity=L/(detail.nonstructuralDamageSensitive?480:240),ratio=response.maxAbs/capacity;
 return {...base,status:ratio>1?'NG':'OK',ratio,reason:null,demand:response.maxAbs,capacity,response,sectionStiffness:instant.sectionStiffness,Ig:instant.Ig,Icr:instant.Icr,Ie,Mcr:instant.Mcr,Ma,compressionRatio,compressionRatioBasis:'reference-section-minimum-of-two-faces-conservative',compressionReference:reference,multiplier,preAttachmentMultiplier:before,preAttachmentReference:detail.servicePreAttachmentReference||null,additionalLiveFraction,liveComboId:set.combo.id,sustainedComboId:combo.id,crackingComboId:detail.serviceCrackingComboId,scope:'full-region-normal-rectangular-uniaxial-relative-post-attachment-deflection; sustained loads applied before attachment'};
}
