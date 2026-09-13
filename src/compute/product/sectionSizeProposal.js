import {resolveSectionRecord} from '../../materials/registry.js';
export function sectionSizeProposal(commands,checks,model){
 const no=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 if(!commands?.length||commands.some(c=>c.locked))return no('DETAIL_LOCKED');
 const member=model?.members?.find(m=>m.id===commands[0].memberId);
 if(!member||member.type!=='frame'||commands.some(c=>c.memberId!==member.id||c.strengthStandard!=='KDS-142020-2022'))return no('RECTANGULAR_MEMBER_SECTION_REQUIRED');
 if(member.taper!=null)return no('PRISMATIC_SECTION_REPAIR_REQUIRED');
 const section=resolveSectionRecord(model,member.secId);
 if(!['RECT','SQUARE'].includes(section?.shape))return no('RECTANGULAR_MEMBER_SECTION_REQUIRED');
 const B=section.params.B,H=section.params.H||B;
 if(![B,H].every(v=>Number.isFinite(v)&&v>=50&&v<=3000))return no('SECTION_CANDIDATE_DIMENSIONS_INVALID');
 const rows=checks.filter(c=>c.entityId===member.id&&(['rc-section-strength','rc-deflection','rc-stability'].includes(c.checkId)||['rc-shear-y','rc-shear-z'].includes(c.checkId)&&c.spacingRepair?.reason==='SECTION_SHEAR_CAPACITY_EXCEEDED')&&c.status==='NG');
 if(!rows.length)return no('RECORDED_SECTION_STRENGTH_NG_REQUIRED');
 for(const row of rows){
  if(row.incomplete||row.strengthRepairRegionsTruncated)return no('SECTION_REPAIR_SOURCE_INCOMPLETE');
  if(['rc-shear-y','rc-shear-z'].includes(row.checkId)){
   if(row.torsionReinforcement||row.spacingRepairRegionsTruncated||![row.demand,row.Vc,row.VsUpperBound,row.phi].every(Number.isFinite)||row.Vc<0||row.VsUpperBound<=0||row.phi<=0||row.phi>1||row.demand<=row.phi*(row.Vc+row.VsUpperBound))return no('CALCULATED_SHEAR_SECTION_LIMIT_REQUIRED');
   const sources=row.spacingRepairRegions?.filter(r=>r.needsRepair)||[row];
   if(!sources.length||sources.some(r=>!commands.some(c=>c.id===r.detailId&&c.version===r.detailVersion&&c.shearStandard==='KDS-142022-2022')))return no('CURRENT_SECTION_REPAIR_DETAIL_REQUIRED');
   continue;
  }
  if(row.checkId==='rc-stability'){
   if(!['COLUMN_MAGNIFIER_DENOMINATOR_NONPOSITIVE','COLUMN_SECOND_ORDER_AMPLIFICATION_LIMIT_EXCEEDED'].includes(row.reason)||row.stiffnessBasis!=='0.2 Ec Ig; no reinforcement stiffness term'||!['My','Mz'].every(axis=>Number.isFinite(row.axes?.[axis]?.Pc)&&row.axes[axis].Pc>0))return no('CALCULATED_STABILITY_REPAIR_REQUIRED');
   const sources=row.detailSources||[{id:row.detailId,version:row.detailVersion}];
   if(sources.length!==commands.length||commands.some(c=>!sources.some(r=>r.id===c.id&&r.version===c.version)))return no('CURRENT_SECTION_REPAIR_DETAIL_REQUIRED');
   continue;
  }
  if(row.checkId==='rc-deflection'){
   if(![row.demand,row.capacity].every(v=>Number.isFinite(v)&&v>0)||row.demand<=row.capacity||typeof row.liveComboId!=='string'||!row.liveComboId||commands.some(c=>!['instant-live-curvature','long-term-curvature','instant-live-frame'].includes(c.serviceabilityMode)))return no('CALCULATED_DEFLECTION_REPAIR_REQUIRED');
   continue;
  }
  const sources=row.strengthRepairRegions?.filter(r=>r.needsRepair)||[row];
  if(!sources.length||sources.some(r=>!commands.some(c=>c.id===r.detailId&&c.version===r.detailVersion)))return no('CURRENT_SECTION_REPAIR_DETAIL_REQUIRED');
 }
 const next=v=>Math.ceil((v+50)/50)*50;
 const sectionCandidates=[{B:next(B),H},{B,H:next(H)},{B:next(B),H:next(H)}].filter(s=>s.B<=3000&&s.H<=3000);
 if(!sectionCandidates.length)return no('SECTION_CANDIDATE_DIMENSION_LIMIT');
 return {ok:true,version:'p25-section-size-proposal-v5-shear-limit',sectionChangeRequired:rows.some(r=>r.checkId==='rc-stability'||['rc-shear-y','rc-shear-z'].includes(r.checkId)),sectionCandidates,basisCheckIds:rows.map(r=>r.id),sourceSectionId:member.secId,sourceDimensions:{B,H},units:{length:'mm'},requiresReanalysis:true,requiresCandidateEvaluation:true,architecturalFitVerified:false,automaticApplicationAllowed:false,basis:'bounded 50 mm-grid width/depth enlargement for recorded strength, deflection, gross-section stability or shear upper-bound NG; no proportional capacity inference; whole candidate reanalysis and review required'};
}
