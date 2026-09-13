import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
import {parseVersionedId} from '../../materials/registry.js';
import {remapSpliceBars} from '../../design/rc/remapSpliceBars.js';
export function appendedSpliceCommands(model,originals,targets){
 const no=reason=>({ok:false,reason}),latest=new Map(),commands=[],originalCommands=[],changes=[];
 for(const s of model.designDetails?.splices||[])if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);
 for(const target of targets){
  const original=originals.find(c=>c.id===target.id);
  if(!original||!Array.isArray(original.bars)||!Array.isArray(target.bars)||!original.bars.length||target.bars.length>100||target.bars.some(b=>!Number.isFinite(b.y)||!Number.isFinite(b.z))||target.bars.length<=original.bars.length||original.bars.some((b,i)=>['y','z','diameter','nominalAreaMm2','designation'].some(k=>b[k]!==target.bars[i]?.[k])))return no('APPENDED_SPLICE_BAR_IDENTITY_REQUIRED');
  const related=[...latest.values()].filter(s=>parseVersionedId(s.reinforcementId).id===original.id).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(const splice of related){
   if(splice.locked)return no('DETAIL_LOCKED');
   if(splice.reinforcementId!==`${original.id}@${original.version}`||splice.memberId!==original.memberId)return no('CURRENT_SPLICE_REINFORCEMENT_REQUIRED');
  }
  if(commands.length+related.length>16)return no('JOINT_SPLICE_MAPPING_LIMIT');
  const selections=related.map(s=>(s.barIndices||[]).map(Number));
  if(selections.some(v=>!v.length||new Set(v).size!==v.length||v.some(i=>!Number.isInteger(i)||i<1||i>original.bars.length)))return no('JOINT_ADDITIONAL_BAR_SPLICE_MAPPING_REQUIRED');
  const full=selections.every(v=>v.length===original.bars.length),mapped=selections.map(v=>v.map(String));
  if(related.length&&!full){
   const coverage=selections.flat();
   if(coverage.length!==original.bars.length||new Set(coverage).size!==original.bars.length)return no('JOINT_ADDITIONAL_BAR_SPLICE_MAPPING_REQUIRED');
   if(target.bars.some(b=>['diameter','nominalAreaMm2','designation'].some(k=>b[k]!==original.bars[0][k])))return no('SPLICE_PARTITION_HOMOGENEOUS_PRODUCT_REQUIRED');
   for(let i=original.bars.length;i<target.bars.length;i++){
    const bar=target.bars[i],distance=g=>Math.min(...selections[g].map(j=>Math.hypot(original.bars[j-1].y-bar.y,original.bars[j-1].z-bar.z)));
    let chosen=0;
    for(let g=1;g<related.length;g++){
     const ratio=(mapped[g].length+1)/selections[g].length,best=(mapped[chosen].length+1)/selections[chosen].length;
     if(ratio<best-1e-12||Math.abs(ratio-best)<=1e-12&&distance(g)<distance(chosen)-1e-12)chosen=g;
    }
    mapped[chosen].push(String(i+1));
   }
  }
  for(const [index,splice] of related.entries()){
   let indices;try{indices=full?remapSpliceBars(original.bars,target.bars,splice.barIndices,{perimeterChange:true}):mapped[index];}catch{return no('JOINT_ADDITIONAL_BAR_SPLICE_MAPPING_REQUIRED');}
   const prior=practicalCommandFromRecord('splice-record',splice),next={...prior,version:prior.version+1,reinforcementId:`${target.id}@${target.version}`,barIndices:indices};
   originalCommands.push(prior);commands.push(next);changes.push({mappingStrategy:full?'all-bars':'balanced-existing-partition',detailId:splice.id,fromVersion:splice.version,toVersion:next.version,fromReinforcementId:splice.reinforcementId,toReinforcementId:next.reinforcementId,addedBarIndices:indices.map(Number).filter(i=>i>original.bars.length)});
  }
 }
 return {ok:true,commands,originalCommands,changes,requiresCandidateEvaluation:true,basis:'existing all-bar selections or complete disjoint bar partitions extended with balanced counts and geometric tie-break; supplied offsets, intervals and transfer law preserved; full reevaluation required'};
}
