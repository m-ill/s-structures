// Days from a shared origin and cumulative fraction of the final load profile.
export function parseConsolidationStages(rows){
 if(rows===undefined)return [{day:0,cumulativeFraction:1,increment:1}];
 if(!Array.isArray(rows)||!rows.length||rows.length>50)throw Error('CONSOLIDATION_STAGES_INVALID');
 let lastDay=-1,lastFraction=0;
 const stages=rows.map(row=>{
  if(typeof row!=='string'||row.length>128)throw Error('CONSOLIDATION_STAGES_INVALID');
  const parts=row.split(':');
  if(parts.length!==2||parts.some(p=>!p.trim()))throw Error('CONSOLIDATION_STAGES_INVALID');
  const [day,cumulativeFraction]=parts.map(Number);
  if(!Number.isFinite(day)||day<0||day>1e6||day<=lastDay||!Number.isFinite(cumulativeFraction)||cumulativeFraction<=lastFraction||cumulativeFraction>1)throw Error('CONSOLIDATION_STAGES_INVALID');
  const increment=cumulativeFraction-lastFraction;lastDay=day;lastFraction=cumulativeFraction;
  return {day,cumulativeFraction,increment};
 });
 if(lastFraction!==1)throw Error('CONSOLIDATION_FINAL_LOAD_FRACTION_REQUIRED');
 return stages;
}
