import {repeatedTieDistance} from './repeatedTieDistance.js';
// Residue classes of the original station indices; preserve its shortened last
// interval exactly and never create a position array.
export function splitRepeatedDistribution(source,stride=2){
 const nc=reason=>({status:'NOT_CHECKED',reason,groups:[]});
 if(repeatedTieDistance(source,0,0).status!=='OK'||!Number.isInteger(stride)||stride<1||stride>8)return nc('REPEATED_DISTRIBUTION_SPLIT_REQUIRED');
 const spacing=source.spacing*stride;if(!Number.isFinite(spacing))return nc('REPEATED_DISTRIBUTION_SPLIT_RANGE');
 const at=i=>i===source.count-1?source.last:source.first+i*source.spacing,groups=[];
 for(let offset=0;offset<Math.min(stride,source.count);offset++){
  const count=Math.floor((source.count-1-offset)/stride)+1,lastIndex=offset+(count-1)*stride;
  const distribution={status:'OK',explicitEnds:true,count,first:at(offset),last:at(lastIndex),spacing};
  if(repeatedTieDistance(distribution,0,0).status!=='OK')return nc('REPEATED_DISTRIBUTION_SPLIT_RANGE');
  groups.push({sourceIndexOffset:offset,sourceIndexStride:stride,distribution});
 }
 return {status:'OK',groups,sourceCount:source.count};
}
