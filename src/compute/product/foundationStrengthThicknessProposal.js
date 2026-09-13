// Bounded geometric alternatives, not a proportional-capacity calculation.
// Every thickness changes weight, depth and minimum steel and requires review.
export function foundationStrengthThicknessProposal(command,checks,minimumThickness=command.thickness){
 const no=reason=>({ok:false,reason,edits:[],automaticApplicationAllowed:false});
 if(command.locked)return no('DETAIL_LOCKED');
 if(![command.thickness,minimumThickness].every(v=>Number.isFinite(v)&&v>0))return no('FOOTING_STRENGTH_THICKNESS_REQUIRED');
 const rows=checks.filter(c=>c.entityId===`foundation:${command.nodeId}`&&['foundation-flexure','foundation-one-way-shear','foundation-punching'].includes(c.checkId)&&c.status==='NG'&&(c.detailVersion===undefined||c.detailVersion===command.version));
 const positive=v=>Number.isFinite(v)&&v>0;
 const basis=rows.filter(c=>{
  if(typeof c.id!=='string')return false;
  if(c.checkId==='foundation-punching')return [c,...(c.perimeterChecks||[])].some(r=>r.status==='NG'&&Number.isFinite(r.shearRatio)&&r.shearRatio>1&&[r.capacity,r.demand].every(positive));
  return (c.axisChecks||[]).some(r=>r.status==='NG'&&[r.capacity,r.demand,r.effectiveDepth].every(positive)&&(c.checkId==='foundation-flexure'?r.scope==='nonprestressed-rectangular-tied-section-strength-only':c.loadLedger?.ok&&positive(r.Vc)&&r.phi===.75&&r.qualification==='clause-scoped-not-whole-design'));
 });
 if(!basis.length)return no('NO_CALCULATED_FOOTING_STRENGTH_REPAIR_BASIS');
 const current=Math.max(command.thickness,minimumThickness),cap=Math.floor((Math.min(3,current*1.5)+1e-10)/.025)/40;
 const edits=[...new Set([.05,.1].map(increment=>Math.min(cap,Math.ceil((current+increment-1e-10)/.025)/40)))].filter(t=>t>current+1e-10).map(thickness=>({thickness}));
 if(!edits.length)return no('FOOTING_STRENGTH_THICKNESS_SEARCH_LIMIT');
 return {ok:true,version:'p25-foundation-strength-thickness-v2-shear',edits,diagnoses:[...new Set(basis.map(c=>c.checkId))],basisCheckIds:basis.map(c=>c.id),roundingStepM:.025,searchMultiplierLimit:1.5,thicknessLimitM:3,siteFitVerified:false,requiresCandidateEvaluation:true,automaticApplicationAllowed:false,basis:'bounded +50/+100 mm thickness alternatives within search cap for calculated flexure/one-way/punching shear NG; no inferred capacity or final design approval'};
}
