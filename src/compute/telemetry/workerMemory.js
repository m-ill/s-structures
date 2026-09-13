// Endpoint observations do not measure transient allocation peaks or prove
// collection. Node RSS covers the whole process, never this worker alone.
export function sampleWorkerMemory(target=globalThis){
 try{
  if(target.process?.versions?.node&&typeof target.process.memoryUsage==='function'){
   const m=target.process.memoryUsage();
   if(!['heapUsed','heapTotal','external','arrayBuffers','rss'].every(k=>Number.isFinite(m[k])&&m[k]>=0))return null;
   return {provider:'node-memoryUsage',heapScope:'worker-isolate',heapUsedBytes:m.heapUsed,heapTotalBytes:m.heapTotal,externalBytes:m.external,arrayBufferBytes:m.arrayBuffers,processRssBytes:m.rss,rssScope:'whole-process-shared-not-additive'};
  }
  const m=target.performance?.memory;
  if(m&&['usedJSHeapSize','totalJSHeapSize'].every(k=>Number.isFinite(m[k])&&m[k]>=0))return {provider:'performance-memory',heapScope:'browser-reported-estimate',heapUsedBytes:m.usedJSHeapSize,heapTotalBytes:m.totalJSHeapSize,externalBytes:null,arrayBufferBytes:null,processRssBytes:null,rssScope:'unavailable'};
 }catch{}
 return null;
}
export function summarizeWorkerMemory(before,after){
 const both=!!before&&!!after&&before.provider===after.provider;
 return {version:'p25-worker-memory-v1-endpoints',before,after,sampleCount:Number(!!before)+Number(!!after),measuredHeap:both,peakMeasured:false,
  heapDeltaBytes:both?after.heapUsedBytes-before.heapUsedBytes:null,
  observedMaxHeapBytes:both?Math.max(before.heapUsedBytes,after.heapUsedBytes):null,
  scope:'before and after solve; excludes pre-message input clone, result transfer and post-termination collection; not peak or leak qualification'};
}
