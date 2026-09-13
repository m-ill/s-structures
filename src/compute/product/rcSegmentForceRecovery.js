import {rcForceCriticalPositions} from './rcForceCriticalPositions.js';
import {memberForceFromRecovery} from '../../solver/memberForceField.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function prepareRcSegmentForces({source,localEndForces,geometricEndForces=null,memberLoads=[],samples=5}){
 const L=source?.endX-source?.startX;
 if(!Number.isFinite(source?.startX)||source.startX<0||!Number.isFinite(L)||L<=0||!Array.isArray(localEndForces)||localEndForces.length!==12||!localEndForces.every(Number.isFinite)||!Array.isArray(memberLoads)||memberLoads.length>128||!Number.isInteger(samples)||samples<2||samples>17)fail('RC_SEGMENT_FORCE_INPUT_INVALID');
 if(geometricEndForces!==null&&(!Array.isArray(geometricEndForces)||geometricEndForces.length!==12||!geometricEndForces.every(Number.isFinite)))fail('RC_SEGMENT_GEOMETRIC_FORCE_INVALID');
 const spanLoads=[];
 for(const input of memberLoads){
  const rows=input.type==='directional-moment'?input.components:[input];
  if(!Array.isArray(rows)||rows.length>3)fail('RC_SEGMENT_LOAD_RECOVERY_UNSUPPORTED');
  for(const r of rows){
   const at=Number.isFinite(r.a)&&r.a>=0&&r.a<=L,vector=q=>Array.isArray(q)&&q.length===3&&q.every(Number.isFinite);
   if(r.type==='point'&&at&&vector(r.q))spanLoads.push({type:r.type,a:r.a,q:[...r.q]});
   else if(r.type==='moment'&&at&&['x','y','z'].includes(r.axis)&&Number.isFinite(r.M))spanLoads.push({type:r.type,a:r.a,axis:r.axis,M:r.M});
   else if(r.type==='distributed-linear'&&at&&Number.isFinite(r.b)&&r.b>r.a&&r.b<=L&&vector(r.q1)&&vector(r.q2))spanLoads.push({type:r.type,a:r.a,b:r.b,q1:[...r.q1],q2:[...r.q2]});
   else fail('RC_SEGMENT_LOAD_RECOVERY_UNSUPPORTED');
  }
 }
 if(spanLoads.length>128)fail('RC_SEGMENT_FORCE_STATION_LIMIT');
 const forceRecoveryInput={version:geometricEndForces?'member-force-recovery-v2-geometric':'member-force-recovery-v1',L,endForces:localEndForces.map((v,i)=>v-(geometricEndForces?.[i]??0)),spanLoads,...(geometricEndForces?{geometricEndForces:[...geometricEndForces]}:{})};
 const recovered=memberForceFromRecovery(forceRecoveryInput,L,'right'),expected={N:localEndForces[6],Vy:localEndForces[7],Vz:localEndForces[8],Tq:localEndForces[9],My:-localEndForces[10],Mz:localEndForces[11]};
 const equilibriumResidual=Math.max(...Object.keys(expected).map(k=>Math.abs(recovered[k]-expected[k])/Math.max(1,Math.abs(recovered[k]),Math.abs(expected[k]))));
 if(!Number.isFinite(equilibriumResidual)||equilibriumResidual>1e-6)fail('RC_SEGMENT_FORCE_EQUILIBRIUM_FAILED');
 const positions=[...new Set([...rcForceCriticalPositions(forceRecoveryInput),...Array.from({length:samples},(_,i)=>L*i/(samples-1)),...spanLoads.flatMap(r=>r.b===undefined?[r.a]:[r.a,r.b])])].sort((a,b)=>a-b);
 if(positions.length>64)fail('RC_SEGMENT_FORCE_STATION_LIMIT');
 const jumps=new Set(spanLoads.filter(r=>r.type==='point'||r.type==='moment').map(r=>r.a)),stations=[];
 for(const x of positions)for(const side of jumps.has(x)?['left','right']:['point']){
  const values=memberForceFromRecovery(forceRecoveryInput,x,side);if(!Object.values(values).every(Number.isFinite))fail('RC_SEGMENT_FORCE_NONFINITE');
  stations.push({memberId:source.memberId,detailId:source.detailId,detailVersion:source.detailVersion,x:source.startX+x,localX:x,side,...values,signConvention:'solver-native'});
 }
 const envelope=Object.fromEntries(['N','Vy','Vz','Tq','My','Mz'].map(key=>{
  const minimum=stations.reduce((a,b)=>b[key]<a[key]?b:a),maximum=stations.reduce((a,b)=>b[key]>a[key]?b:a),at=s=>({value:s[key],x:s.x,localX:s.localX,side:s.side});
  return [key,{minimum:at(minimum),maximum:at(maximum),maximumAbsolute:at(Math.abs(minimum[key])>Math.abs(maximum[key])?minimum:maximum)}];
 }));
 return {version:'p25-rc-segment-force-recovery-v3-geometric-extrema',envelope,envelopeBasis:'component-wise polynomial extrema and jump sides; not combined design-ratio envelope',forceRecoveryInput,stations,equilibriumResidual,signConvention:'solver-native',displacementRecoveryIncluded:false,extremaEnvelopeIncluded:true,standardDesignTransferAllowed:false};
}
