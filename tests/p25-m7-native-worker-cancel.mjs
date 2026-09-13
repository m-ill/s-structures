import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {runCandidateAnalysis} from '../src/compute/product/candidateAnalysisClient.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
const source=`import {parentPort} from 'node:worker_threads';parentPort.on('message',({settings})=>{const state=new Int32Array(settings.control);Atomics.store(state,0,1);while(true)Atomics.add(state,1,1);});`;
const samples=[];
for(const mode of ['cancel','timeout']){
 const control=new SharedArrayBuffer(8),state=new Int32Array(control),budget=createResourceBudget(),controller=new AbortController();
 let native,exitObserved=false;
 const start=performance.now();
 const pending=runCandidateAnalysis({model:{},settings:{control},timeoutMs:mode==='timeout'?500:3000,signal:controller.signal,budget,workerReservationBytes:4096,workerFactory:()=>{native=new Worker(new URL('data:text/javascript,'+encodeURIComponent(source)),{type:'module'});native.once('exit',()=>exitObserved=true);return native;}}).then(value=>({value}),error=>({error}));
 try{
  while(!Atomics.load(state,0)&&performance.now()-start<1500)await new Promise(r=>setTimeout(r,1));
  assert.equal(Atomics.load(state,0),1,'native worker received payload and entered synchronous CPU work');
  assert.ok(budget.snapshot().totalBytes>=4096);
  const requested=performance.now();if(mode==='cancel')controller.abort();
  const outcome=await pending;
  assert.equal(outcome.error?.code,mode==='cancel'?'CANCELLED':'CANDIDATE_TIMEOUT');
  assert.equal(exitObserved,true,'settlement follows actual native exit');
  assert.equal(native.threadId,-1);
  assert.equal(budget.snapshot().totalBytes,0);assert.equal(Object.keys(budget.snapshot().owners).length,0);
  const counter=Atomics.load(state,1);await new Promise(r=>setTimeout(r,10));assert.equal(Atomics.load(state,1),counter);
  const exitMs=performance.now()-requested;
  if(mode==='cancel')assert.ok(exitMs<1000,'native cancellation termination target');
  samples.push({mode,exitMs,totalMs:performance.now()-start,workerExited:true,managedBytes:0});
 }finally{controller.abort();if(native?.threadId!==-1)await native?.terminate();await pending;}
}
console.log(JSON.stringify({scope:'actual Node Worker executing synthetic synchronous CPU work; not browser UI latency or JS heap proof',samples},null,2));
