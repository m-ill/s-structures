// Top-to-bottom layers: thickness (m), constrained modulus (kPa),
// prescribed layer-average effective stress increment / current gross qmax.
export function parseSettlementLayers(rows,{automaticStress=false}={}){
 if(!Array.isArray(rows)||!rows.length||rows.length>50)throw Error('SETTLEMENT_LAYERS_INVALID');
 let depth=0;
 return rows.map((row,index)=>{
  if(typeof row!=='string'||row.length>128)throw Error('SETTLEMENT_LAYERS_INVALID');
  const parts=row.split(':');
  if(parts.length!==(automaticStress?2:3)||parts.some(x=>!x.trim()))throw Error('SETTLEMENT_LAYERS_INVALID');
  const [thickness,constrainedModulus,stressFactor=0]=parts.map(Number);
  if(![thickness,constrainedModulus,stressFactor].every(Number.isFinite)||thickness<=0||thickness>1000||constrainedModulus<=0||constrainedModulus>1e9||stressFactor<0||stressFactor>1)throw Error('SETTLEMENT_LAYERS_INVALID');
  const top=depth;depth+=thickness;
  if(depth>10000||depth<=top)throw Error('SETTLEMENT_LAYERS_INVALID');
  return {index:index+1,top,bottom:depth,thickness,constrainedModulus,...(automaticStress?{}:{stressFactor})};
 });
}
