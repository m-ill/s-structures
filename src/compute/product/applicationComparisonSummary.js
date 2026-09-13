import {retainedBytes} from '../../core/resourceBudget.js';
import {stableHash} from '../../core/stableHash.js';

// Receipts survive evaluation release. Keep a bounded, self-contained summary;
// the evaluation owns the complete comparison and its paged detail endpoint.
export function applicationComparisonSummary(comparison){
 const summary=structuredClone(comparison);
 // These descriptive labels remain in the hash-bound detail, not each receipt.
 for(const value of [summary.completionBlockers,summary.completionBlockers?.inputActions,summary.repairOutcome,summary.proposalProvenance])if(value){delete value.scope;delete value.basis;delete value.version;}
 delete summary.detailQuery; // Replaced below by the complete comparison query.
 delete summary.basis;
 if(summary.repairOutcome)delete summary.repairOutcome.detailTool;
 summary.detailHash=stableHash(comparison);
 summary.comparisonDetailQuery={tool:'get_practical_design_check',evaluationId:comparison.afterEvaluationId,checkId:summary.detailHash};
 summary.detailsTruncated=false;
 return compactApplicationComparisonSummary(summary,10000);
}
export function compactApplicationComparisonSummary(value,maxBytes){
 const summary=structuredClone(value);
 if(!Number.isFinite(maxBytes)||maxBytes<=0)throw Object.assign(new Error('APPLICATION_COMPARISON_SUMMARY_LIMIT'),{code:'APPLICATION_COMPARISON_SUMMARY_LIMIT'});
 const mark=()=>{summary.detailsTruncated=true;for(const key of ['completionBlockers','repairOutcome','proposalProvenance','connectedGeometryChanges'])if(summary[key])summary[key].truncated=true;if(summary.completionBlockers?.inputActions)summary.completionBlockers.inputActions.truncated=true;};
 const arrays=[];
 const visit=value=>{if(!value||typeof value!=='object')return;for(const item of Object.values(value)){if(Array.isArray(item))arrays.push(item);else visit(item);}};
 visit(summary);
 while(retainedBytes(summary)>maxBytes){
  const eligible=arrays.filter(a=>a.length&&a!==summary.repairOutcome?.changedDetails&&a!==summary.proposalProvenance?.basisCheckIds);
  const largest=(eligible.length?eligible:arrays.filter(a=>a.length)).sort((a,b)=>retainedBytes(b)-retainedBytes(a))[0];
  if(!largest)return minimalApplicationComparisonSummary(summary,maxBytes);
  largest.pop();mark();
 }
 if(summary.detailsTruncated){
  for(const key of ['completionBlockers','repairOutcome','proposalProvenance','connectedGeometryChanges'])if(summary[key])summary[key].truncated=true;
  if(summary.completionBlockers?.inputActions)summary.completionBlockers.inputActions.truncated=true;
 }
 return summary;
}

// Emptying every list is not always enough. A receipt exists to stay inside its
// budget and to point at the complete record, so it degrades to the identifying
// fields rather than failing the application that produced it. The full
// comparison is still reachable through comparisonDetailQuery.
function minimalApplicationComparisonSummary(summary,maxBytes){
 const keep=['version','beforeEvaluationId','afterEvaluationId','detailHash','comparisonDetailQuery','affectedScope'];
 const minimal={...Object.fromEntries(keep.flatMap(key=>key in summary?[[key,summary[key]]]:[])),detailsTruncated:true,minimized:true};
 if(retainedBytes(minimal)>maxBytes)throw Object.assign(new Error('APPLICATION_COMPARISON_SUMMARY_LIMIT'),{code:'APPLICATION_COMPARISON_SUMMARY_LIMIT'});
 return minimal;
}
