import {stableHash} from '../../core/stableHash.js';
import {checkIncomplete} from '../../metadata/checkCompleteness.js';

// Compare the full recorded evaluations, never the first UI page. Compact counts
// keep application receipts bounded; evaluation IDs identify the detailed reasons.
export function compareDesignChecks(before,after){
 const index=rows=>{
  const map=new Map();
  for(const row of rows){
   if(!['entityId','comboId','checkId'].every(k=>typeof row[k]==='string'&&row[k]))throw Error('COMPARISON_CHECK_IDENTITY_REQUIRED');
   const key=JSON.stringify([row.entityId,row.comboId,row.checkId]);
   if(map.has(key))throw Error('DUPLICATE_COMPARISON_CHECK');map.set(key,row);
  }
  return map;
 };
 const a=index(before),b=index(after),counts={matched:0,added:0,removed:0,resolvedNg:0,ngToIncomplete:0,remainingNg:0,newNg:0,noLongerApplicable:0,resolvedIncomplete:0,remainingIncomplete:0,newIncomplete:0,ratioImproved:0,ratioWorsened:0};
 for(const [key,old] of a){
  const next=b.get(key);if(!next){counts.removed++;continue;}counts.matched++;
  const oldIncomplete=checkIncomplete(old),newIncomplete=checkIncomplete(next);
  if(old.status==='NG'){
   if(next.status==='NG')counts.remainingNg++;
   else if(newIncomplete)counts.ngToIncomplete++;
   else if(next.status==='OK')counts.resolvedNg++;
  }else if(next.status==='NG')counts.newNg++;
  if(old.status!=='N_A'&&next.status==='N_A')counts.noLongerApplicable++;
  if(oldIncomplete&&newIncomplete)counts.remainingIncomplete++;
  else if(!oldIncomplete&&newIncomplete)counts.newIncomplete++;
  else if(oldIncomplete&&!newIncomplete)counts.resolvedIncomplete++;
  if(Number.isFinite(old.ratio)&&Number.isFinite(next.ratio)){
   const delta=next.ratio-old.ratio,tolerance=1e-9*Math.max(1,Math.abs(old.ratio),Math.abs(next.ratio));
   if(delta>tolerance)counts.ratioWorsened++;else if(delta<-tolerance)counts.ratioImproved++;
  }
 }
 for(const [key,next] of b)if(!a.has(key)){counts.added++;if(next.status==='NG')counts.newNg++;if(checkIncomplete(next))counts.newIncomplete++;}
 return {version:'p25-design-check-comparison-v1',basis:'all-recorded-checks-by-entity-combination-rule',beforeCheckCount:before.length,afterCheckCount:after.length,beforeChecksHash:stableHash(before),afterChecksHash:stableHash(after),counts,designTransferAllowed:false};
}
