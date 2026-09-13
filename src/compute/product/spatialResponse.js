import {stableHash} from '../../core/stableHash.js';
// Compact response only: no previous complete analysis/model retained by mesh refinement.
export function captureSpatialResponse(set){
 const groups=[],topology=[];
 const add=(key,values,floor)=>{if(!values.length||!values.every(Number.isFinite))throw Error('SPATIAL_RESPONSE_NONFINITE');groups.push({key,values,floor});};
 for(const id of Object.keys(set.disp||{}).sort()){
  const d=Array.from(set.disp[id]);add(`node/${id}/translation`,d.slice(0,3),1e-12);add(`node/${id}/rotation`,d.slice(3,6),1e-12);
 }
 for(const id of Object.keys(set.reactions||{}).sort()){
  const r=set.reactions[id];add(`reaction/${id}/force`,['rx','ry','rz'].map(k=>r[k]),1e-9);add(`reaction/${id}/moment`,['rmx','rmy','rmz'].map(k=>r[k]),1e-9);
 }
 for(const id of Object.keys(set.memberResults||{}).sort()){
  const r=set.memberResults[id];topology.push([id,Array.from(r.xs||[])]);
  add(`member/${id}/force`,[0,1,2,6,7,8].map(i=>r.end?.[i]),1e-9);
  add(`member/${id}/moment`,[3,4,5,9,10,11].map(i=>r.end?.[i]),1e-9);
  add(`member/${id}/shape`,(r.shape||[]).flatMap(p=>Array.from(p)),1e-12);
 }
 if(!groups.length)throw Error('SPATIAL_RESPONSE_REQUIRED');
 return {groups,topologyHash:stableHash(topology)};
}
export function compareSpatialResponse(a,b){
 if(a.topologyHash!==b.topologyHash||a.groups.length!==b.groups.length||a.groups.some((g,i)=>g.key!==b.groups[i].key||g.values.length!==b.groups[i].values.length))return {compatible:false,residual:null};
 let residual=0,controlling=null;
 for(let i=0;i<a.groups.length;i++){
  const left=a.groups[i],right=b.groups[i];let scale=left.floor,difference=0;
  for(let j=0;j<left.values.length;j++){scale=Math.max(scale,Math.abs(left.values[j]),Math.abs(right.values[j]));difference=Math.max(difference,Math.abs(left.values[j]-right.values[j]));}
  const value=difference/scale;if(value>residual){residual=value;controlling=left.key;}
 }
 return {compatible:true,residual,controlling};
}
