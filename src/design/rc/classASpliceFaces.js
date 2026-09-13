import {RC_LAP_DESIGN_LIMITS} from '../../metadata/rcLapDesignCapabilities.js';
import {spliceWindowFraction} from './spliceWindowFraction.js';
import {parseVersionedId} from '../../materials/registry.js';
export function classASpliceFaces(detail,splices,length){
 const nc=reason=>({status:'NOT_CHECKED',reason});
 if(!detail.bars?.length||detail.bars.length>RC_LAP_DESIGN_LIMITS.maxBars||detail.bars.some(b=>![b.y,b.z,b.area,b.diameter].every(Number.isFinite)||b.area<=0||b.diameter<=0))return nc('CLASS_A_SINGLE_TENSION_LAYER_REQUIRED');
 if(!Array.isArray(splices)||splices.length>RC_LAP_DESIGN_LIMITS.maxSourceSplices)return nc('CLASS_A_SPLICE_WINDOW_INPUT_REQUIRED');
 const latest=new Map();for(const s of splices)if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);splices=[...latest.values()];
 const validated=spliceWindowFraction(detail,splices,length);if(validated.status!=='OK')return validated;
 const groups=[];
 for(const [index,bar] of detail.bars.entries()){
  let g=groups.find(g=>Math.abs(g.y-bar.y)<=1e-9);if(!g){g={y:bar.y,indices:[]};groups.push(g);}g.indices.push(index);
 }
 if(groups.length!==1){
  if(groups.length>RC_LAP_DESIGN_LIMITS.maxOriginalLayers||groups.length%2!==0||groups.some(g=>g.indices.length<2))return nc('CLASS_A_SINGLE_TENSION_LAYER_REQUIRED');
  const ordered=[...groups].sort((a,b)=>a.y-b.y),sorted=g=>g.indices.map(i=>detail.bars[i]).sort((a,b)=>a.z-b.z);
  for(let i=0;i<ordered.length/2;i++){
   const lower=ordered[i],upper=ordered.at(-1-i);
   if(Math.abs(lower.y+upper.y)>1e-9)return nc('CLASS_A_SINGLE_TENSION_LAYER_REQUIRED');
   const a=sorted(lower),b=sorted(upper);
   if(a.length!==b.length||a.some((v,i)=>Math.abs(v.z-b[i].z)>1e-9||Math.abs(v.area-b[i].area)>1e-12||Math.abs(v.diameter-b[i].diameter)>1e-12))return nc('CLASS_A_SYMMETRIC_FACE_LAYOUT_REQUIRED');
  }
 }
 const faces=[];
 for(const g of groups){
  const indices=new Map(g.indices.map((index,i)=>[index+1,i+1]));
  // Validate original selections before filtering so an out-of-range index
  // cannot disappear during per-face projection.
  for(const s of splices)if(parseVersionedId(s.reinforcementId).id===detail.id&&(s.barIndices||[]).some(i=>!Number.isInteger(Number(i))||Number(i)<1||Number(i)>detail.bars.length))return nc('CLASS_A_SPLICE_WINDOW_INPUT_REQUIRED');
  const projected=splices.filter(s=>parseVersionedId(s.reinforcementId).id===detail.id).map(s=>({...s,barIndices:(s.barIndices||[]).map(Number).filter(i=>indices.has(i)).map(i=>String(indices.get(i)))}));
  const relevant=projected.filter(s=>s.barIndices.length);
  if(!relevant.length){faces.push({status:'N_A',y:g.y,barIndices:g.indices.map(i=>i+1),splicedFraction:0});continue;}
  const proof=spliceWindowFraction({...detail,bars:g.indices.map(i=>detail.bars[i])},relevant,length,validated.windowLength);if(proof.status!=='OK')return proof;
  faces.push({...proof,y:g.y,barIndices:g.indices.map(i=>i+1),governingWindow:{...proof.governingWindow,barIndices:proof.governingWindow.barIndices.map(i=>g.indices[i-1]+1)}});
 }
 const governing=faces.filter(f=>f.status==='OK').reduce((a,b)=>!a||b.splicedFraction>a.splicedFraction?b:a,null);
 if(!governing)return nc('CLASS_A_SPLICE_WINDOW_INPUT_REQUIRED');
 return {...governing,faces,allMemberArea:detail.bars.reduce((n,b)=>n+b.area,0),basis:'per-layer union within the member-wide maximum-provided-length window; no other-layer denominator dilution; at most four symmetric layers per face; half-area whole-section strength separately required'};
}
