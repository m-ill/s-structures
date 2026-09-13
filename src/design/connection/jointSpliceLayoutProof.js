import {columnSpliceIntervalProof} from '../rc/columnSpliceIntervalProof.js';
export function jointSpliceLayoutProof(model,joint){
 const half=joint.jointPanelHeight/2;
 return columnSpliceIntervalProof(model,{nodeId:joint.nodeId,memberIds:joint.memberIds,scope:'column-layout-equivalence-over-entire-panel',interval:({at,length})=>Number.isFinite(half)&&half>0&&half<length?(at===0?{from:0,to:half}:{from:length-half,to:length}):null});
}
