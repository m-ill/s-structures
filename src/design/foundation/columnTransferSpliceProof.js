import {columnSpliceIntervalProof} from '../rc/columnSpliceIntervalProof.js';
export function columnTransferSpliceProof(model,footing){
 const above=footing.columnDevelopmentAbove,below=footing.columnEmbedmentLength;
 return columnSpliceIntervalProof(model,{nodeId:footing.nodeId,memberIds:[footing.columnMemberId],scope:'column-layout-equivalence-over-specified-foundation-development',interval:({at,length})=>[above,below].every(v=>Number.isFinite(v)&&v>0)&&above<=length?(at===0?{from:-below,to:above}:{from:length-above,to:length+below}):null});
}
