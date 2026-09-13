// Exact layer average of N / ((B+z)(L+z)), with a stable square limit.
export function twoToOneLayerStress({footing,ledger,contact,layers}){
 const B=footing?.B,L=footing?.L,N=ledger?.totalN;
 const nc=reason=>({ok:false,reason});
 if(![B,L,N].every(Number.isFinite)||B<=0||L<=0||N<=0||ledger?.ok!==true)return nc('SETTLEMENT_FOOTING_LOAD_REQUIRED');
 if(contact?.ok!==true||contact.contact!=='full'||![contact.qmin,contact.qmax].every(Number.isFinite)||contact.qmin<=0||Math.abs(contact.qmax-contact.qmin)>1e-10*contact.qmax)return nc('SETTLEMENT_UNIFORM_FULL_CONTACT_REQUIRED');
 const q=N/(B*L);
 if(!Number.isFinite(q)||Math.abs(q-contact.qmax)>1e-9*Math.max(q,contact.qmax))return nc('SETTLEMENT_CONTACT_LOAD_MISMATCH');
 if(!Array.isArray(layers)||!layers.length||layers.length>50)return nc('SETTLEMENT_LAYERS_INVALID');
 const delta=L-B,result=[];
 for(const layer of layers){
  const {top:a,bottom:b,thickness:H}=layer;
  if(![a,b,H].every(Number.isFinite)||a<0||b<=a||H<=0||Math.abs((b-a)-H)>1e-10*Math.max(H,b))return nc('SETTLEMENT_LAYERS_INVALID');
  const denominator=(B+a)*(L+b),argument=H*delta/denominator;
  const integral=delta===0?H/denominator:Math.log1p(argument)/delta;
  const stressIncrement=N*integral/H;
  if(!Number.isFinite(stressIncrement)||stressIncrement<=0)return nc('SETTLEMENT_NUMERIC_RANGE_UNSUPPORTED');
  result.push({...layer,stressIncrement,stressFactor:stressIncrement/q,stressTop:N/((B+a)*(L+a)),stressBottom:N/((B+b)*(L+b))});
 }
 return {ok:true,layers:result,stressDistribution:'two-vertical-to-one-horizontal',stressReferencePressure:q};
}
