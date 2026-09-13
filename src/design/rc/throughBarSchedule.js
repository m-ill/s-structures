import {jointThroughBars} from '../connection/jointThroughBars.js';
import {stableHash} from '../../core/stableHash.js';
export function prepareThroughBarLinks(model){
 const latest=new Map();for(const r of model.designDetails?.connections||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const parent=new Map(),refs=new Map(),ends=new Map(),edges=[];
 const key=r=>JSON.stringify([r.detailId,r.detailVersion,r.barIndex]);
 const root=k=>{let r=k;while(parent.get(r)!==r)r=parent.get(r);return r;};
 for(const joint of latest.values()){
  if(!['special-frame-beam-through-bars','special-frame-beam-mixed'].includes(joint.jointAnchorageMode))continue;
  const result=jointThroughBars(model,joint);if(!result.continuityVerified)continue;
  for(const pair of result.pairs){
   const keys=[pair.a,pair.b].map(r=>{const k=key(r);if(!parent.has(k)){parent.set(k,k);refs.set(k,r);}const member=model.members.find(m=>m.id===r.memberId),id=`${r.detailId}@${r.detailVersion}`,flags=ends.get(id)||{};flags[member.n1===joint.nodeId?'interiorStart':'interiorEnd']=true;ends.set(id,flags);return k;});
   const [a,b]=keys;if(root(a)!==root(b))parent.set(root(b),root(a));edges.push({keys,connectionId:joint.id});
  }
 }
 const groups=new Map();for(const [k,r] of refs){const id=root(k);if(!groups.has(id))groups.set(id,[]);groups.get(id).push({...r,key:k});}
 return {ends,groups:[...groups.values()].map(parts=>{parts.sort((a,b)=>a.key.localeCompare(b.key));const ids=new Set(parts.map(p=>p.key));return {id:`CB-${stableHash(parts.map(p=>p.key)).slice(0,16)}`,parts,connectionIds:[...new Set(edges.filter(e=>e.keys.some(k=>ids.has(k))).map(e=>e.connectionId))].sort()};}).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function finishThroughBarSchedule(links,reinforcement){
 const records=links.groups.map(group=>{
  const sourceFragments=group.parts.map(r=>{const p=reinforcement[`${r.detailId}@${r.detailVersion}`],geometry=p?.bars?.[r.barIndex-1];if(geometry)geometry.physicalBarId=group.id;return {detailId:r.detailId,version:r.detailVersion,memberId:r.memberId,barIndex:r.barIndex,mark:`B${r.barIndex}`,cutLength:geometry?.cutLength??null,volume:p?.longitudinalQuantity?.rows?.[r.barIndex-1]?.volume??null};});
  const valid=sourceFragments.every(p=>Number.isFinite(p.cutLength)&&p.cutLength>0&&Number.isFinite(p.volume)&&p.volume>0);
  return {id:group.id,status:valid?'OK':'NOT_CHECKED',count:valid?1:null,cutLength:valid?sourceFragments.reduce((s,r)=>s+r.cutLength,0):null,volume:valid?sourceFragments.reduce((s,r)=>s+r.volume,0):null,sourceFragments,connectionIds:group.connectionIds,fabricationApproved:false,reason:valid?'CONTINUOUS_GEOMETRIC_BAR; FABRICATION_REVIEW_SEPARATE':'CONTINUOUS_BAR_FRAGMENT_GEOMETRY_REQUIRED'};
 });
 return {version:'p25-through-bar-schedule-v2-canonical',records,physicalBarCount:records.every(r=>r.status==='OK')?records.length:null,sourceFragmentCount:records.reduce((n,r)=>n+r.sourceFragments.length,0),fabricationApproved:false};
}
