import {footingDistribution,footingBarLayout} from '../../design/foundation/footingBarLayout.js';
import {minimumFlexuralBarClearSpacing} from '../../design/rc/kdsSpacing.js';
export function foundationDistributionProposal(command,checks,model,geometry={}){
 const no=reason=>({ok:false,reason,edits:[],automaticApplicationAllowed:false});
 const footing=model?.designDetails?.foundations?.find(f=>f.id===command.id&&f.version===command.version);
 if(!footing)return no('CURRENT_FOUNDATION_REINFORCEMENT_REQUIRED');
 const changes=Object.fromEntries(['B','L','thickness'].filter(k=>geometry[k]!==undefined).map(k=>[k,geometry[k]]));
 if(Object.entries(changes).some(([k,v])=>!Number.isFinite(v)||v<footing[k]||v>100))return no('FOOTING_DISTRIBUTION_GEOMETRY_INVALID');
 const resized={...footing,...changes},geometryChanged=Object.entries(changes).some(([k,v])=>v!==footing[k]);
 const rows=checks.filter(c=>c.entityId===`foundation:${command.nodeId}`&&c.checkId==='foundation-distribution');
 if(!(geometryChanged?footingDistribution(resized).status==='NG':rows.some(c=>c.status==='NG'))||rows.some(c=>!['OK','NG'].includes(c.status)||c.incomplete)||footing.barDistribution==='kds-centered-band')return no('NO_FOOTING_DISTRIBUTION_PROPOSAL');
 const candidate={...resized,barDistribution:'kds-centered-band'},review=footingDistribution(candidate);
 if(review.status!=='OK')return no('FOOTING_CENTER_BAND_GEOMETRY_REQUIRES_REDESIGN');
 const aggregate=Number.isFinite(footing.aggregateMaxSize)&&footing.aggregateMaxSize>0?footing.aggregateMaxSize:0;
 for(const face of ['bottom','top'])for(const axis of ['B','L']){
  const bar=footing.reinforcement?.[`${face}${axis}`];if(!bar)continue;
  const layout=footingBarLayout(candidate,face,axis);
  if(layout.status!=='OK'||layout.count>1&&layout.minimumSpacing-bar.diameter<minimumFlexuralBarClearSpacing(bar.diameter,aggregate)-1e-10)return no('FOOTING_CENTER_BAND_CLEARANCE_REQUIRES_REDESIGN');
 }
 return {ok:true,version:'p25-foundation-distribution-proposal-v2-resized',geometryReevaluated:geometryChanged,geometry:changes,edits:[{barDistribution:'kds-centered-band'}],basisCheckIds:rows.map(c=>c.id),basis:'recorded distribution NG; existing centered-band layout and parallel-bar clearance owners',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
