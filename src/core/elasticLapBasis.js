export function elasticLapBasis({length:L,EA1,EA2,transferStiffness:k}){
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 if(![L,EA1,EA2,k].every(v=>Number.isFinite(v)&&v>0))fail('ELASTIC_LAP_TRANSFER_INPUT_INVALID');
 const sum=EA1+EA2,beta=Math.sqrt(k*(1/EA1+1/EA2)),t=beta*L,den=-Math.expm1(-2*t);
 if(![sum,beta,t,den].every(v=>Number.isFinite(v)&&v>0))fail('ELASTIC_LAP_TRANSFER_NUMERIC_RANGE');
 return {sum,beta,t,a:EA1/sum,b:EA2/sum,reducedEA:EA1*(EA2/sum),
  sinhRatio:a=>Math.exp(a-t)*(-Math.expm1(-2*a))/den,
  coshRatio:a=>Math.exp(a-t)*(1+Math.exp(-2*a))/den};
}
