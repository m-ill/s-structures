import {rcSpatialRelativeChange} from '../../metadata/rcSplicePolicy.js';
import {rcFrameDisplacementsAt,prepareRcSegmentDisplacements} from './rcSegmentDisplacementRecovery.js';
// Compare exact piecewise cubic fields on the union mesh, not only original nodes.
export function compareRcFrameMeshes(previous,current){
 const metrics={u:0,v:0,w:0,rx:0,ry:0,rz:0,maximumSteelStress:0,maximumRelativeSlip:0};
 const ids=[...new Set(previous.segments.map(s=>s.memberId))];
 if(ids.length!==new Set(current.segments.map(s=>s.memberId)).size)throw Error('RC_FRAME_COMPARISON_SOURCE_MISMATCH');
 for(const id of ids){
  const a=previous.segments.filter(s=>s.memberId===id),b=current.segments.filter(s=>s.memberId===id);
  const valid=rows=>rows.length&&rows.every((s,i)=>s.endX>s.startX&&(i===0||s.startX===rows[i-1].endX));
  if(!valid(a)||!valid(b)||a[0].startX!==b[0].startX||a.at(-1).endX!==b.at(-1).endX)throw Error('RC_FRAME_COMPARISON_SOURCE_MISMATCH');
  const bounds=[...new Set([...a,...b].flatMap(s=>[s.startX,s.endX]))].sort((x,y)=>x-y),scale={},difference={};
  for(const key of ['u','v','w','rx','ry','rz']){
   scale[key]=Math.max(1e-12,...[...a,...b].map(s=>Math.abs(s.displacementRecovery.envelope[key].maximumAbsolute.value)));difference[key]=0;
  }
  for(let i=1;i<bounds.length;i++){
   const startX=bounds[i-1],endX=bounds[i],mid=(startX+endX)/2,find=rows=>rows.find(s=>s.startX<=mid&&s.endX>=mid);
   const first=find(a),second=find(b);
   const at=(s,x)=>rcFrameDisplacementsAt(s.localDisplacements,s.endX-s.startX,Math.max(0,Math.min(s.endX-s.startX,x-s.startX)));
   const a0=at(first,startX),a1=at(first,endX),b0=at(second,startX),b1=at(second,endX);
   const delta=[...b0.map((v,j)=>v-a0[j]),...b1.map((v,j)=>v-a1[j])];
   const field=prepareRcSegmentDisplacements({source:{memberId:id,startX,endX},localDisplacements:delta,samples:2});
   for(const key of Object.keys(scale))difference[key]=Math.max(difference[key],Math.abs(field.envelope[key].maximumAbsolute.value));
  }
  for(const key of Object.keys(scale))metrics[key]=Math.max(metrics[key],difference[key]/scale[key]);
  for(const key of ['maximumSteelStress','maximumRelativeSlip']){
   const p=Math.max(...a.map(s=>s[key])),q=Math.max(...b.map(s=>s[key]));
   if(!Number.isFinite(p)||!Number.isFinite(q))throw Error('RC_FRAME_COMPARISON_NONFINITE');
   metrics[key]=Math.max(metrics[key],rcSpatialRelativeChange(p,q,key==='maximumSteelStress'?'stressMPa':'slipM'));
  }
 }
 const change=Math.max(...Object.values(metrics));
 if(!Number.isFinite(change))throw Error('RC_FRAME_COMPARISON_NONFINITE');
 return {change,metrics,basis:'exact piecewise cubic component difference extrema; member maximum steel stress and relative slip'};
}
