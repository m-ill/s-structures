// Missing measurements must never be reported as zero memory.
export function createBrowserMemoryDiagnostics(target,getManaged) {
  let pending=null;
  return async function read({includeAggregate=false}={}) {
    const memory=target.performance?.memory;
    const result={managed:getManaged(),rendererHeap:memory?{usedBytes:memory.usedJSHeapSize,totalBytes:memory.totalJSHeapSize,limitBytes:memory.jsHeapSizeLimit}:null,aggregate:{status:'not-requested',bytes:null},scope:'managed estimates versus optional browser measurements; not an OS RSS cap or leak qualification'};
    if(!includeAggregate)return result;
    const measure=target.performance?.measureUserAgentSpecificMemory;
    if(!target.crossOriginIsolated||typeof measure!=='function'){result.aggregate.status='unavailable';result.aggregate.reason='Requires cross-origin isolation and measureUserAgentSpecificMemory support';return result;}
    if(pending){result.aggregate.status='busy';return result;}
    let timer;
    pending=Promise.resolve().then(()=>measure.call(target.performance)).then(value=>Number.isFinite(value?.bytes)&&value.bytes>=0?{status:'measured',bytes:value.bytes,scope:'user-agent-specific memory estimate including attributable workers'}:{status:'unavailable',bytes:null,reason:'INVALID_MEASUREMENT'},error=>({status:'unavailable',bytes:null,reason:String(error?.name||'MEASUREMENT_FAILED')}));
    const current=pending;current.finally(()=>{if(pending===current)pending=null;});
    try{result.aggregate=await Promise.race([current,new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout',bytes:null}),2000);})]);return result;}finally{clearTimeout(timer);}
  };
}
