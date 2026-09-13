const fail=()=>{throw Object.assign(new Error('SPLICE_BAR_MAPPING_STRATEGY_REQUIRED'),{code:'SPLICE_BAR_MAPPING_STRATEGY_REQUIRED'});};
function rows(bars){
 if(!Array.isArray(bars)||!bars.length||bars.length>100||bars.some(b=>!Number.isFinite(b.y)||!Number.isFinite(b.z)||b.y===0))fail();
 const result=new Map();
 for(const sign of [-1,1]){
  const levels=[...new Set(bars.filter(b=>Math.sign(b.y)===sign).map(b=>b.y))].sort((a,b)=>Math.abs(b)-Math.abs(a));
  for(const [layer,y] of levels.entries()){
   const row=bars.flatMap((b,i)=>b.y===y?[{index:i+1,z:b.z}]:[]).sort((a,b)=>a.z-b.z);
   if(row.some((b,i)=>i&&b.z===row[i-1].z))fail();
   result.set(`${sign}:${layer}`,row);
  }
 }
 return result;
}
export function remapSpliceBars(original,target,indices,{perimeterChange=false}={}){
 if(!Array.isArray(original)||!original.length||original.length>100||!Array.isArray(target)||!target.length||target.length>100||!Array.isArray(indices)||!indices.length)fail();
 const selected=new Set(indices.map(Number));
 if(selected.size!==indices.length||[...selected].some(i=>!Number.isInteger(i)||i<1||i>original.length))fail();
 if(perimeterChange){
  if(selected.size!==original.length)fail();
  return target.map((_,i)=>String(i+1));
 }
 const before=rows(original),after=rows(target),mapped=[];
 for(const [key,row] of before){
  const chosen=row.filter(b=>selected.has(b.index));if(!chosen.length)continue;
  const next=after.get(key);if(!next)fail();
  if(chosen.length===row.length){mapped.push(...next.map(b=>String(b.index)));continue;}
  for(const bar of chosen){
   const rank=row.indexOf(bar)*(next.length-1)/(row.length-1),integer=Math.round(rank);
   if(Math.abs(rank-integer)>1e-9||!next[integer])fail();
   mapped.push(String(next[integer].index));
  }
 }
 if(!mapped.length||new Set(mapped).size!==mapped.length)fail();
 return mapped;
}

// A complete disjoint partition supplies an explicit group for every old bar.
// Match normalized row positions; the actual splice lengths and strength are
// reevaluated after mapping, never inferred from group membership.
export function remapSplicePartition(original,target,splices){
 if(!Array.isArray(splices)||!splices.length||splices.length>100)return null;
 const owner=new Map(),mapped=new Map();
 for(const s of splices){
  if(typeof s.id!=='string'||mapped.has(s.id)||!Array.isArray(s.barIndices)||!s.barIndices.length)return null;
  mapped.set(s.id,[]);
  for(const raw of s.barIndices){const i=Number(raw);if(!Number.isInteger(i)||i<1||i>original.length||owner.has(i))return null;owner.set(i,s.id);}
 }
 if(owner.size!==original.length)return null;
 const before=rows(original),after=rows(target);
 if(before.size!==after.size)fail();
 for(const [key,row] of before){
  const next=after.get(key);if(!next||next.length<row.length)fail();
  for(let i=0;i<next.length;i++){
   const rank=next.length===1?0:i*(row.length-1)/(next.length-1),source=row[Math.round(rank)];
   mapped.get(owner.get(source.index)).push(String(next[i].index));
  }
 }
 if([...mapped.values()].some(indices=>!indices.length))fail();
 return mapped;
}
