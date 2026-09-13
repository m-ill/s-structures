// Diameter inputs are mm; offsets and preserved surface separation are m.
export function resizeSpliceOffset(offsetY,offsetZ,priorDiameter,nextDiameter){
 const distance=Math.hypot(offsetY,offsetZ),gap=distance-priorDiameter/1000;
 if(![offsetY,offsetZ,priorDiameter,nextDiameter].every(Number.isFinite)||priorDiameter<=0||nextDiameter<=0||!Number.isFinite(distance)||distance<=0||gap < -1e-9)throw Object.assign(Error('SPLICE_OFFSET_STRATEGY_REQUIRED'),{code:'SPLICE_OFFSET_STRATEGY_REQUIRED'});
 const separation=Math.max(0,gap)+nextDiameter/1000,scale=separation/distance;
 return {offsetY:offsetY*scale,offsetZ:offsetZ*scale,clearDistance:Math.max(0,gap),strategy:'preserve-partner-clear-distance-and-direction',requiresGeometryReview:true};
}
