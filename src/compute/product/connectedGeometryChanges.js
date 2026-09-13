import {practicalCommandFromRecord,practicalInputFields} from '../../modeling/practicalInputContract.js';
// Record actual applied public inputs; no candidate proposal or derived geometry
// is substituted for the post-application model.
export function connectedGeometryChanges(beforeModel,afterModel,commands){
 const records=[];
 for(const [type,channel] of [['foundation-record','foundations'],['connection-record','connections']]){
  const selected=new Set(commands.filter(c=>c.type===type).map(c=>c.id));
  if(!selected.size)continue;
  const latest=model=>{const out=new Map();for(const r of model.designDetails?.[channel]||[])if(selected.has(r.id)&&(!out.has(r.id)||out.get(r.id).version<r.version))out.set(r.id,r);return out;};
  const a=latest(beforeModel),b=latest(afterModel),dimensions=practicalInputFields(type).filter(f=>['m','mm'].includes(f.unit));
  for(const id of selected){
   const old=a.get(id),next=b.get(id),before=old?practicalCommandFromRecord(type,old):{},after=next?practicalCommandFromRecord(type,next):{};
   const fields=dimensions.filter(f=>before[f.key]!==after[f.key]).map(f=>({key:f.key,before:before[f.key]??null,after:after[f.key]??null,unit:f.unit}));
   if(fields.length)records.push({id,type,beforeVersion:old?.version??null,afterVersion:next?.version??null,fields});
  }
 }
 return {version:'p25-connected-geometry-changes-v1',recordCount:records.length,fieldCount:records.reduce((n,r)=>n+r.fields.length,0),records,truncated:false,basis:'actual before and after public dimension inputs; design acceptance is separate'};
}
