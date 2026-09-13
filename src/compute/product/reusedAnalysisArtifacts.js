const designArtifacts=Object.freeze(['design','designDemandPackage','rcDetailing','connectionFoundation','designReport','report','practical','practicalMemberResults','practicalRcSummary','practicalRcSchedules','preparedDetails','designReview']);
// Operates only on the fresh reuse copy and known result containers, never on
// model inputs, force arrays or arbitrary nested geometry/solver records.
export function clearReusedDesignArtifacts(result){
 const pending=[result],seen=new Set(),cleared=new Set();let clearedFieldCount=0;
 const add=value=>{if(value&&typeof value==='object'&&!Array.isArray(value)&&!ArrayBuffer.isView(value))pending.push(value);};
 while(pending.length){
  const container=pending.pop();if(!container||seen.has(container))continue;seen.add(container);
  for(const key of designArtifacts)if(Object.hasOwn(container,key)){delete container[key];cleared.add(key);clearedFieldCount++;}
  container.designTransferAllowed=false;
  for(const key of ['payload','envelope','pDelta','result'])add(container[key]);
  for(const value of Object.values(container.byCombo||{}))add(value);
 }
 return {version:'p25-reuse-artifact-invalidation-v1',containersVisited:seen.size,clearedFieldCount,clearedFields:[...cleared].sort(),designReevaluationRequired:true};
}
