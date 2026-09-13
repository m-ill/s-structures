export const FOOTPRINT_LIMIT_FIELDS=['footprintLimitB','footprintLimitL','footprintLimitReference'];
export function hasFootprintLimits(record){return FOOTPRINT_LIMIT_FIELDS.some(k=>record?.[k]!==undefined);}
export function readFootprintLimits(record){
 if(!hasFootprintLimits(record))return null;
 if(![record.footprintLimitB,record.footprintLimitL].every(v=>Number.isFinite(v)&&v>0)||typeof record.footprintLimitReference!=='string'||!record.footprintLimitReference.trim())throw Error('FOOTPRINT_LIMIT_INPUT_REQUIRED');
 return {B:record.footprintLimitB,L:record.footprintLimitL,reference:record.footprintLimitReference};
}
