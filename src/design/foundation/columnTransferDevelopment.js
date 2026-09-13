import {compressionDevelopment,tensionDevelopment} from '../rc/kdsAnchorage.js';
export function columnTransferDevelopment({detail:d,footing:f,B,H,axes,fc,columnFc,fy,tensionAt,tensionMode='tension-for-interface'}){
 return d.bars.map((bar,index)=>{
  if(!(Array.isArray(tensionAt)?tensionAt[index]:tensionAt))return {diameter:bar.diameter,below:compressionDevelopment({db:bar.diameter*1000,fy,fck:fc,lambda:1}),above:compressionDevelopment({db:bar.diameter*1000,fy,fck:columnFc,lambda:1}),mode:'compression'};
  const halfSpacing=d.bars.reduce((best,other,j)=>j===index?best:Math.min(best,Math.hypot(bar.y-other.y,bar.z-other.z)/2),Infinity);
  const x=(f.columnOffsetX??0)+bar.y*axes.y[0]+bar.z*axes.z[0],y=(f.columnOffsetY??0)+bar.y*axes.y[1]+bar.z*axes.z[1];
  const cAbove=Math.min(H/2-Math.abs(bar.y),B/2-Math.abs(bar.z),halfSpacing),cBelow=Math.min(f.B/2-Math.abs(x),f.L/2-Math.abs(y),halfSpacing);
  const calculate=(strength,c)=>c<=bar.diameter/2?{status:'NOT_CHECKED',reason:'COLUMN_BAR_TRANSFER_GEOMETRY_REQUIRED',requiredMm:null}:tensionDevelopment({db:bar.diameter*1000,fy,fck:strength,lambda:1,c:c*1000,Ktr:0,topBar:false,coating:'uncoated',sizeFactor:bar.diameter*1000<=19.1?.8:1});
  return {diameter:bar.diameter,below:calculate(fc,cBelow),above:calculate(columnFc,cAbove),mode:tensionMode,cAbove,cBelow};
 });
}
