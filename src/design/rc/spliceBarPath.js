import {spliceLaneSegments} from './spliceLaneSegments.js';
import {buildBarFabrication} from './barGeometry.js';

export function spliceBarPath({detail,bar,memberLength,H,splices}){
 const base={fabricationApproved:false,mechanicalLayoutReviewRequired:true,units:{length:'m'},pieces:null,totalCutLength:null};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 if(!Array.isArray(splices)||!splices.length||splices.length>100||![memberLength,H].every(x=>Number.isFinite(x)&&x>0))return nc('SPLICE_PIECE_INPUT_REQUIRED');
 const ordered=[...splices].sort((a,b)=>a.startX-b.startX),from=detail.start*memberLength,to=detail.end*memberLength;
 if(![from,to].every(Number.isFinite)||from<0||to>memberLength||from>=to)return nc('SPLICE_PIECE_REGION_REQUIRED');
 const lanes=spliceLaneSegments({startX:from,endX:to,splices:ordered});if(lanes.status!=='OK')return nc(lanes.reason);
 const segments=lanes.segments;
 const pieces=[];
 for(const [i,segment] of segments.entries()){
  const first=i===0,last=i===segments.length-1,pieceBar={...bar,y:bar.y+segment.offset[0],z:bar.z+segment.offset[1]};
  const input={...detail,startFabricationShape:first?(detail.startFabricationShape||detail.fabricationShape):'straight',endFabricationShape:last?(detail.endFabricationShape||detail.fabricationShape):'straight',endSetbackStart:first?detail.endSetbackStart:0,endSetbackEnd:last?detail.endSetbackEnd:0,startExtension:first?detail.startExtension:0,endExtension:last?detail.endExtension:0};
  const geometry=buildBarFabrication(input,pieceBar,{length:segment.endX-segment.startX,H,interiorStart:!first,interiorEnd:!last});
  if(geometry.cutLength===null)return nc('SPLICE_PIECE_END_GEOMETRY_REQUIRED');
  const shift=segment.startX-from;
  pieces.push({...segment,bodyStartX:segment.startX+geometry.ends.start.bendPoints[0][0],bodyEndX:segment.startX+geometry.ends.end.bendPoints[0][0],y:pieceBar.y,z:pieceBar.z,mark:`P${i+1}`,count:1,cutLength:geometry.cutLength,shape:geometry.shape,points:geometry.points.map(([x,y])=>[x+shift,y]),segmentErrors:geometry.segmentErrors,codeReferences:geometry.codeReferences,fabricationApproved:false});
 }
 return {...base,status:'OK',reason:'PIECE_GEOMETRY_ONLY; STATION_LAYOUT_AND_LAP_TRANSFER_REVIEW_REQUIRED',pieces,totalCutLength:pieces.reduce((sum,p)=>sum+p.cutLength,0),additionalLapLength:ordered.reduce((sum,s)=>sum+s.endX-s.startX,0)};
}
