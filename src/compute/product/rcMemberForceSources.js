import {prepareRcSegmentForces} from './rcSegmentForceRecovery.js';
import {memberForceFromRecovery} from '../../solver/memberForceField.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function prepareRcMemberForceSources(segments){
 if(!Array.isArray(segments)||!segments.length||segments.length>20)fail('RC_MEMBER_SOURCE_INPUT_INVALID');
 const output=Object.create(null);
 for(const memberId of new Set(segments.map(s=>s.memberId))){
  const parts=segments.filter(s=>s.memberId===memberId).sort((a,b)=>a.startX-b.startX),L=parts.at(-1).endX;
  if(parts[0].startX!==0||parts.some((s,i)=>!(s.endX>s.startX)||i>0&&s.startX!==parts[i-1].endX))fail('RC_MEMBER_SOURCE_COVERAGE_INVALID');
  const memberLoads=parts.flatMap(s=>s.forceRecovery.forceRecoveryInput.spanLoads.map(l=>({...l,a:l.a+s.startX,...(l.b===undefined?{}:{b:l.b+s.startX})}))),end=[...parts[0].localEndForces.slice(0,6),...parts.at(-1).localEndForces.slice(6)];
  const piecewise=parts.some(p=>p.forceRecovery.forceRecoveryInput.version==='member-force-recovery-v2-geometric');
  const prepared=piecewise?{stations:[],forceRecoveryInput:{version:'member-force-recovery-v3-piecewise',L,endForces:end,spanLoads:memberLoads,pieces:parts.map(p=>({startX:p.startX,endX:p.endX,input:structuredClone(p.forceRecovery.forceRecoveryInput)}))}}:prepareRcSegmentForces({source:{memberId,startX:0,endX:L},localEndForces:end,memberLoads});
  const input=prepared.forceRecoveryInput,jumps=new Set(memberLoads.filter(l=>l.type==='point'||l.type==='moment').map(l=>l.a)),positions=new Map();
  if(piecewise)for(const p of parts.slice(0,-1))jumps.add(p.endX);
  if(piecewise){
   const loadOnly={version:'member-force-recovery-v1',L,endForces:Array(12).fill(0),spanLoads:memberLoads};
   for(const p of parts.slice(0,-1)){
    const x=p.endX,left=memberForceFromRecovery(input,x,'left'),right=memberForceFromRecovery(input,x,'right'),loadLeft=memberForceFromRecovery(loadOnly,x,'left'),loadRight=memberForceFromRecovery(loadOnly,x,'right');
    for(const key of Object.keys(left))if(Math.abs(right[key]-left[key]-(loadRight[key]-loadLeft[key]))>1e-8+1e-7*Math.max(Math.abs(left[key]),Math.abs(right[key])))fail('RC_MEMBER_PIECEWISE_BOUNDARY_IMBALANCE');
   }
  }
  const add=(x,side)=>positions.set(JSON.stringify([x,side]),{x,side});
  for(const s of prepared.stations)add(s.x,s.side);
  for(const part of parts)for(const station of part.forceRecovery.stations){
   let side=station.side;
   if(jumps.has(station.x)&&side==='point')side=station.x===part.endX&&part.endX<L?'left':'right';
   const value=memberForceFromRecovery(input,station.x,side);
   for(const key of ['N','Vy','Vz','Tq','My','Mz'])if(!Number.isFinite(station[key])||Math.abs(value[key]-station[key])>1e-9+1e-8*Math.max(Math.abs(value[key]),Math.abs(station[key])))fail('RC_MEMBER_SEGMENT_SOURCE_MISMATCH');
   add(station.x,side);
  }
  if(positions.size>600)fail('RC_MEMBER_SOURCE_STATION_LIMIT');
  const rows=[...positions.values()].sort((a,b)=>a.x-b.x||(a.side==='left'?-1:b.side==='left'?1:0)).map(s=>({...s,...memberForceFromRecovery(input,s.x,s.side)}));
  output[memberId]={forceRecoveryInput:input,xs:rows.map(s=>s.x),stationSides:rows.map(s=>s.side),...Object.fromEntries(['N','Vy','Vz','Tq','My','Mz'].map(k=>[k,rows.map(s=>s[k])])),T:rows.map(s=>s.Tq),end,structuralEnd:[...end],loadRecoveryIssues:[],signConvention:'solver-native',sourceSegments:parts.map(s=>({startX:s.startX,endX:s.endX,detailId:s.detailId,detailVersion:s.detailVersion})),sourceVerification:{status:'OK',basis:piecewise?'all prepared segment stations versus preserved piecewise geometric fields; not independent method qualification':'all prepared segment force stations versus whole-member equilibrium field; not independent method qualification'},designTransferAllowed:false};
 }
 return output;
}
