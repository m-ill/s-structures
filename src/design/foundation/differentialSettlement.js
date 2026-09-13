import {parseDifferentialPeers} from '../../metadata/differentialPeers.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
function component(check,basis){
 if(!['layered-constrained-modulus','layered-two-to-one-gross'].includes(check?.method)||!Array.isArray(check.layers)||!check.layers.length)return null;
 if(basis==='primary-ultimate'){
  const value=check.layers.reduce((sum,row)=>sum+row.displacement,0);
  return Number.isFinite(value)&&value>=0?{value,time:null}:null;
 }
 const time=check.consolidation?.elapsedDays,primary=check.consolidation?.displacementAtTime;
 if(check.consolidation?.status!=='CALCULATED'||!Number.isFinite(time)||!Number.isFinite(primary)||primary<0)return null;
 const secondary=check.secondaryCompression;
 if(secondary&&(secondary.status!=='CALCULATED'||secondary.elapsedDays!==time||!Number.isFinite(secondary.displacementAtTime)||secondary.displacementAtTime<0))return null;
 const value=primary+(secondary?.displacementAtTime||0);
 return Number.isFinite(value)?{value,time}:null;
}
export function evaluateDifferentialSettlement({current,peers}){
 const f=current.footing,basis=f.differentialSettlementBasis;
 const base={qualification:'provided-input-mechanics',incomplete:true,methodReviewRequired:true,designTransferAllowed:false,codeReferences:getKcscRuleSources(['115005']).map(r=>({...r,clause:'4.2.6'})),basis,scope:'difference between independent footing settlement predictions at support nodes; no foundation interaction or structural redistribution; allowable criteria and common time origin require review'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(!['primary-ultimate','at-evaluation-time'].includes(basis))return nc('DIFFERENTIAL_BASIS_REQUIRED');
 const inputFields=['differentialPeerIds','differentialSettlementLimit','differentialRotationLimit','differentialReference'];
 if(!Number.isFinite(f.differentialSettlementLimit)||f.differentialSettlementLimit<=0||!Number.isFinite(f.differentialRotationLimit)||f.differentialRotationLimit<=0||typeof f.differentialReference!=='string'||!f.differentialReference.trim())return {...nc('DIFFERENTIAL_CRITERIA_REQUIRED'),blockerKind:'input-required',requiredInputFields:inputFields,inputTargets:[{type:'foundation-record',id:f.id,version:f.version}]};
 let references;try{references=parseDifferentialPeers(f.differentialPeerIds,f.id);}catch(error){return {...nc(error.message),blockerKind:'input-required',requiredInputFields:['differentialPeerIds'],inputTargets:[{type:'foundation-record',id:f.id,version:f.version}]};}
 const own=component(current.settlement,basis),pairs=[];
 for(const reference of references){
  const peer=peers.get(reference.id),entry={peerId:reference.id,peerVersion:reference.version,sourceId:f.id,sourceVersion:f.version};
  const fail=reason=>pairs.push({...entry,status:'NOT_CHECKED',reason});
  if(!peer?.footing){fail('DIFFERENTIAL_PEER_NOT_EVALUATED');continue;}
  if(peer.footing.version!==reference.version){fail('DIFFERENTIAL_PEER_VERSION_CHANGED');continue;}
  if(!current.settlement?.comboId||current.settlement.comboId!==peer.settlement?.comboId){fail('DIFFERENTIAL_COMBINATION_MISMATCH');continue;}
  const other=component(peer.settlement,basis);
  if(!own||!other){fail('DIFFERENTIAL_SETTLEMENT_COMPONENT_REQUIRED');continue;}
  if(own.time!==other.time){fail('DIFFERENTIAL_EVALUATION_TIME_MISMATCH');continue;}
  if(![current.node?.x,current.node?.y,current.node?.z,peer.node?.x,peer.node?.y,peer.node?.z].every(Number.isFinite)){fail('DIFFERENTIAL_NODE_GEOMETRY_REQUIRED');continue;}
  if(Math.abs(current.node.z-peer.node.z)>1e-8){fail('DIFFERENTIAL_SUPPORT_ELEVATION_MISMATCH');continue;}
  const distance=Math.hypot(current.node.x-peer.node.x,current.node.y-peer.node.y);
  if(!Number.isFinite(distance)||distance<=0){fail('DIFFERENTIAL_SUPPORT_DISTANCE_REQUIRED');continue;}
  const difference=Math.abs(own.value-other.value),rotation=difference/distance,ratio=Math.max(difference/f.differentialSettlementLimit,rotation/f.differentialRotationLimit);
  if(!Number.isFinite(ratio)){fail('DIFFERENTIAL_NUMERIC_RANGE_UNSUPPORTED');continue;}
  pairs.push({...entry,status:ratio>1?'NG':'OK',comboId:current.settlement.comboId,evaluationDays:own.time,sourceSettlement:own.value,peerSettlement:other.value,difference,distance,rotation,ratio});
 }
 const failed=pairs.some(p=>p.status==='NG'),missing=pairs.some(p=>p.status==='NOT_CHECKED'),ratios=pairs.filter(p=>Number.isFinite(p.ratio)).map(p=>p.ratio);
 return {...base,status:failed?'NG':'NOT_CHECKED',mechanicsStatus:failed?'NG':missing?null:'OK',ratio:ratios.length?Math.max(...ratios):null,pairs,reference:f.differentialReference,settlementLimit:f.differentialSettlementLimit,rotationLimit:f.differentialRotationLimit,reason:failed?'DIFFERENTIAL_ALLOWABLE_EXCEEDED':missing?'DIFFERENTIAL_COMPARISON_INCOMPLETE':'DIFFERENTIAL_METHOD_REVIEW_PENDING',units:{settlement:'m',distance:'m',rotation:'m/m'}};
}
