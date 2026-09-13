export const practicalCheckFilterSchema={type:'object',additionalProperties:false,properties:{
 status:{type:'string',enum:['OK','NG','NOT_CHECKED','N_A','FAILED']},
 ...Object.fromEntries(['entityId','comboId','checkId','reason'].map(key=>[key,{type:'string',minLength:1,maxLength:200}]))
}};
export function filterPracticalChecks(checks,filter){
 if(filter===undefined)return checks;
 const fail=()=>{throw Object.assign(new Error('CHECK_FILTER_INVALID'),{code:'CHECK_FILTER_INVALID'});};
 if(!filter||typeof filter!=='object'||Array.isArray(filter))fail();
 const entries=Object.entries(filter);
 for(const [key,value] of entries){const schema=practicalCheckFilterSchema.properties[key];if(!schema||typeof value!=='string'||!value.length||value.length>200||schema.enum&&!schema.enum.includes(value))fail();}
 return entries.length?checks.filter(check=>entries.every(([key,value])=>check[key]===value)):checks;
}
