import {buildFixedEndLoad} from '../../loads/fixedEnd/index.js';
import {addConsistentDistributed} from '../../loads/fixedEnd/common.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function partitionRcMemberLoad({load,axes,segments,factor}){
 if(!['udl','udl-partial','trapezoid','point','mmoment'].includes(load?.type)||!Number.isFinite(factor)||!Array.isArray(segments)||!segments.length||segments.length>20)fail('RC_MEMBER_LOAD_PARTITION_INPUT_INVALID');
 if(load.type==='udl'&&load.shape!=null&&!['uniform','asc','desc'].includes(load.shape))fail('RC_MEMBER_LOAD_SHAPE_INVALID');
 const contract=buildFixedEndLoad(load,axes,{timoshenko:{enabled:false,phiY:0,phiZ:0}});
 if(!contract?.ok)fail(contract?.reason||'RC_MEMBER_LOAD_INVALID');const r=contract.recovery;
 for(const [i,s] of segments.entries())if(![s.startX,s.endX].every(Number.isFinite)||s.endX<=s.startX||s.startX!==(i?segments[i-1].endX:0)||s.endX>axes.L)fail('RC_MEMBER_LOAD_SEGMENT_INVALID');
 if(segments.at(-1).endX!==axes.L)fail('RC_MEMBER_LOAD_SEGMENT_INVALID');
 if(['point','mmoment'].includes(load.type)){
  const ratio=Number(load.type==='point'?(load.t??load.at??.5):(load.at??load.t??.5)),x=ratio*axes.L;
  // A boundary point belongs to the right element; the member endpoint to
  // the last element. Never apply the same concentrated load to both.
  const segmentIndex=segments.findIndex((s,i)=>x>=s.startX&&(x<s.endX||i===segments.length-1&&x===s.endX));
  if(segmentIndex<0)fail('RC_MEMBER_LOAD_SEGMENT_INVALID');
  const s=segments[segmentIndex],L=s.endX-s.startX,t=(x-s.startX)/L;
  const input={...load,t,at:t,[load.type==='point'?'P':'M']:Number(load.type==='point'?load.P:load.M)*factor};
  const local=buildFixedEndLoad(input,{...axes,L},{timoshenko:{enabled:false,phiY:0,phiZ:0}});if(!local?.ok)fail(local?.reason||'RC_MEMBER_LOAD_INVALID');
  return [{segmentIndex,localEquivalentLoads:local.fe,span:local.recovery,source:{loadId:load.id,caseId:load.case,memberId:load.member,type:load.type,factor,contractVersion:contract.contractVersion,originalPosition:x,clippedRange:[x,x],boundaryOwnership:'right-element; final endpoint uses last-element'}}];
 }
 if(r?.type!=='distributed-linear'||![r.a,r.b,...r.q1,...r.q2].every(Number.isFinite)||r.b<=r.a)fail('RC_MEMBER_LOAD_RECOVERY_INVALID');
 const pieces=[];
 for(const [segmentIndex,s] of segments.entries()){
  if(![s.startX,s.endX].every(Number.isFinite)||s.startX<0||s.endX>axes.L||s.endX<=s.startX)fail('RC_MEMBER_LOAD_SEGMENT_INVALID');
  const a=Math.max(r.a,s.startX),b=Math.min(r.b,s.endX);if(b<=a)continue;
  const L=s.endX-s.startX,fe=Array(12).fill(0),q=x=>r.q1.map((v,i)=>(v+(r.q2[i]-v)*(x-r.a)/(r.b-r.a))*factor);
  addConsistentDistributed(fe,L,(a-s.startX)/L,(b-s.startX)/L,t=>q(s.startX+t*L),{phiY:0,phiZ:0});
  if(!fe.every(Number.isFinite))fail('RC_MEMBER_LOAD_NONFINITE');
  pieces.push({segmentIndex,localEquivalentLoads:fe,span:{type:'distributed-linear',a:a-s.startX,b:b-s.startX,q1:q(a),q2:q(b)},source:{loadId:load.id,caseId:load.case,memberId:load.member,type:load.type,factor,contractVersion:contract.contractVersion,originalRange:[r.a,r.b],clippedRange:[a,b]}});
 }
 return pieces;
}
