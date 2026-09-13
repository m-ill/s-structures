import {elasticLapBasis} from '../../core/elasticLapBasis.js';
export const ELASTIC_LAP_TRANSFER_VERSION='p25-elastic-lap-transfer-v5-rc-replacement';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function validateElasticLapInput(record){
 const fields=['transferStiffness','transferElasticSlipLimit','transferReference'];
 if(!fields.some(k=>record[k]!==undefined))return;
 if(![record.transferStiffness,record.transferElasticSlipLimit].every(x=>Number.isFinite(x)&&x>0)||typeof record.transferReference!=='string'||!record.transferReference.trim()||record.transferReference.length>256)fail('SPLICE_TRANSFER_INPUT_REQUIRED');
 if(!record.continuationSide||!['tension-A','tension-B'].includes(record.spliceType))fail('SPLICE_TRANSFER_TENSION_CONTINUATION_REQUIRED');
}

// Two elastic axial rods with an explicitly supplied equivalent interbar
// distributed spring. k is force/length/slip, not concrete bond stress/slip.
// N1'=k*(u1-u2), N2'=-N1', Ni=EAi*ui'. Free opposite bar ends:
// N1(0)=P, N2(0)=0, N1(L)=0, N2(L)=P. u1(0)=0 fixes translation.
// The concrete interface has been condensed into k by the input provider.
// No automatic calibration, yielding, splitting, or cyclic law is implied.
export function solveElasticLapTransfer({length:L,EA1,EA2,transferStiffness:k,force:P,samples=17}){
 if(![L,EA1,EA2,k].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(P)||P<0||!Number.isInteger(samples)||samples<2||samples>33)fail('ELASTIC_LAP_TRANSFER_INPUT_INVALID');
 const {sum,beta,sinhRatio,coshRatio}=elasticLapBasis({length:L,EA1,EA2,transferStiffness:k});
 const slipUnit=x=>-(coshRatio(beta*(L-x))/EA1+coshRatio(beta*x)/EA2)/beta;
 const d0=slipUnit(0),dL=slipUnit(L),compliance=L/sum-EA1/sum*dL-EA2/sum*d0;
 if(!Number.isFinite(compliance)||compliance<=0)fail('ELASTIC_LAP_TRANSFER_NUMERIC_RANGE');
 const stations=Array.from({length:samples},(_,i)=>{
  const x=L*i/(samples-1),delta=slipUnit(x),derivative=sinhRatio(beta*(L-x))/EA1-sinhRatio(beta*x)/EA2;
  const force1=P*EA1/sum*(1+EA2*derivative),force2=P-force1,w=P*(-EA2/sum*d0+x/sum),slip=P*delta;
  return {x,force1,force2,slip,transferPerLength:-k*slip,u1:w+EA2/sum*slip,u2:w-EA1/sum*slip};
 });
 const extension=P*compliance,strainEnergy=P*extension/2,maximumSlip=P*Math.max(Math.abs(d0),Math.abs(dL));
 if(![extension,strainEnergy,maximumSlip,...stations.flatMap(s=>Object.values(s))].every(Number.isFinite))fail('ELASTIC_LAP_TRANSFER_NUMERIC_RANGE');
 return {version:ELASTIC_LAP_TRANSFER_VERSION,status:'CALCULATED',length:L,EA1,EA2,transferStiffness:k,force:P,compliance,stiffness:1/compliance,extension,strainEnergy,maximumSlip,stations,units:{length:'m',force:'kN',EA:'kN',transferStiffness:'kN/m2',compliance:'m/kN',stiffness:'kN/m',transferPerLength:'kN/m',energy:'kN m'},method:'two-elastic-rods-equivalent-linear-distributed-interbar-spring',designTransferAllowed:false,globalRedistributionIncluded:false};
}
