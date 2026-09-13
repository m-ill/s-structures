// Recognize recorded minimum-steel deficiencies; never infer required area
// from a utilization ratio or treat maximum-steel excess as an increase target.
export function minimumReinforcementRepairSupported(row){
 const flexural=[row.requiredCapacity,row.capacity].every(x=>Number.isFinite(x)&&x>0)&&row.requiredCapacity>row.capacity;
 const compression=[row.providedRatio,row.minRatio,row.maxRatio].every(x=>Number.isFinite(x)&&x>0)&&row.minRatio<=row.maxRatio&&row.providedRatio<=row.maxRatio&&(row.providedRatio<row.minRatio||Number.isInteger(row.barCount)&&Number.isInteger(row.minBarCount)&&row.barCount<row.minBarCount);
 return flexural||compression;
}
