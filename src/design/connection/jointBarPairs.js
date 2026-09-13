export function validJointBarPairs(value){
 if(!Array.isArray(value)||!value.length||value.length>20)return false;
 const seen=new Set();
 for(const s of value){
  if(typeof s!=='string'||s.length>7||!/^\d{1,3}:\d{1,3}$/.test(s))return false;
  const [a,b]=s.split(':').map(Number),key=[a,b].sort((x,y)=>x-y).join(':');
  if(a<1||b<1||a>100||b>100||a===b||seen.has(key))return false;seen.add(key);
 }
 return true;
}

export const validJointHookSides=value=>Array.isArray(value)&&value.length>0&&value.length<=20&&value.every(s=>s==='left'||s==='right');
