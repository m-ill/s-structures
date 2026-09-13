// Uses all evaluated locations when available, with legacy governing-check fallback.
// The existing candidate evaluator must recalculate every affected check.
export function shearSpacingProposal(commands,checks){
 const unavailable=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 const rows=checks.filter(c=>commands.some(d=>d.memberId===c.entityId)&&['rc-shear-y','rc-shear-z','rc-confinement'].includes(c.checkId));
 if(!rows.some(r=>r.status==='NG'||r.tieSpacingRequirements?.some(c=>c.needsRepair)))return unavailable('RECORDED_SHEAR_NG_REQUIRED');
 const regions=new Map(),needed=new Set(),masks=new Map(),tieRegions=new Set();
 for(const row of rows){
  const ties=row.checkId==='rc-confinement';
  if(row.torsionReinforcement||(!ties&&row.incomplete)||row.spacingRepairRegionsTruncated||row.tieSpacingRequirementsTruncated)return unavailable('SHEAR_SPACING_ONLY_REPAIR_UNAVAILABLE');
  // A calculated spacing subcheck can guide a proposal while geometry remains
  // incomplete. Full candidate evaluation still preserves those missing checks.
  const sources=ties?(row.tieSpacingRequirements??[]):row.spacingRepairRegions??(row.status==='NG'?[{detailId:row.detailId,detailVersion:row.detailVersion,maxSpacing:row.spacingRepair?.maxSpacing,feasibleSpacingMask:row.spacingRepair?.feasibleSpacingMask,needsRepair:true}]:[]);
  for(const source of sources){
  const command=commands.find(c=>c.id===source.detailId&&c.version===source.detailVersion);
  if(!command||source.blocked||!Number.isFinite(command.stirrupSpacing))return unavailable('SHEAR_SPACING_ONLY_REPAIR_UNAVAILABLE');
  if(source.needsRepair)needed.add(command.id);
  if(ties)tieRegions.add(command.id);
  if(source.feasibleSpacingMask!==undefined){
   if(!Number.isInteger(source.feasibleSpacingMask)||source.feasibleSpacingMask<0||source.feasibleSpacingMask>1048575)return unavailable('SHEAR_SPACING_ONLY_REPAIR_UNAVAILABLE');
   masks.set(command.id,(masks.get(command.id)??1048575)&source.feasibleSpacingMask);continue;
  }
  if(source.maxSpacing===null&&!source.needsRepair)continue;
  if(!Number.isFinite(source.maxSpacing)||source.maxSpacing<=0)return unavailable('SHEAR_SPACING_ONLY_REPAIR_UNAVAILABLE');
  const spacing=Math.floor(Math.min(source.maxSpacing,command.stirrupSpacing,500)/25)*25;
  if(spacing<=0)return unavailable('SHEAR_SPACING_BELOW_CANDIDATE_GRID');
  if(spacing>=command.stirrupSpacing)continue;
  regions.set(command.id,Math.min(regions.get(command.id)??Infinity,spacing));
  }
 }
 for(const [id,mask] of masks){
  if(!needed.has(id))continue;
  const current=commands.find(c=>c.id===id).stirrupSpacing,ceiling=Math.min(current,regions.get(id)??500);
  let chosen=0;for(let i=19;i>=0;i--)if((mask&(1<<i))&&(i+1)*25<=ceiling){chosen=(i+1)*25;break;}
  if(!chosen)return unavailable('SHEAR_SPACING_BELOW_CANDIDATE_GRID');
  if(chosen<current)regions.set(id,chosen);
 }
 for(const id of regions.keys())if(!needed.has(id))regions.delete(id);
 for(const id of needed)if(tieRegions.has(id)&&!regions.has(id)){
  const command=commands.find(c=>c.id===id);
  if([command.tieFirstStart,command.tieFirstEnd].some(v=>Number.isFinite(v)&&v>command.stirrupSpacing/2000))regions.set(id,command.stirrupSpacing);
 }
 if(!regions.size)return unavailable('NO_SHEAR_SPACING_CHANGE_REQUIRED');
 return {ok:true,version:'p25-shear-spacing-proposal-v4-confinement',regionConstraints:[...regions].map(([detailId,s])=>{
  const edit={detailId,spacings:[s]},command=commands.find(c=>c.id===detailId);
  if(tieRegions.has(detailId))for(const [field,key] of [['tieFirstStart','tieFirstStarts'],['tieFirstEnd','tieFirstEnds']])if(Number.isFinite(command[field])&&command[field]>s/2000)edit[key]=[s/2000];
  return edit;
 }),basisCheckIds:rows.map(c=>c.id),roundingStepMm:25,basis:'common shear grid and calculated confinement spacing limits; end offsets capped at half spacing; all affected checks require reevaluation',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
