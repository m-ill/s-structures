import assert from 'node:assert/strict';
import {runWithBoundedWorkerCancellation as run} from '../src/compute/product/boundedWorkerCancellation.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// An acknowledgement alone must not suppress forced termination of busy work.
{
 const controller=new AbortController();let kills=0,closed=false;
 const task=run({signal:controller.signal,graceMs:10,run:()=>new Promise(()=>{}),cancel:()=>Promise.resolve({ack:true}),dispose:async()=>{kills++;await delay(5);closed=true;}});
 await delay(1);controller.abort();
 await assert.rejects(task,{code:'CANCELLED',forcedTermination:true});assert.equal(kills,1);assert.equal(closed,true);
}
// Cooperative settlement must preserve the reusable worker and clear its timer.
{
 const controller=new AbortController();let rejectWork,kills=0;
 const task=run({signal:controller.signal,graceMs:10,run:()=>new Promise((_,reject)=>{rejectWork=reject;}),cancel:()=>rejectWork(Object.assign(new Error('cancel'),{code:'CANCELLED'})),dispose:()=>kills++});
 await delay(1);controller.abort();await assert.rejects(task,{code:'CANCELLED'});await delay(20);assert.equal(kills,0);
}
// Late completion after deadline is contained; no false successful result escapes.
{
 const controller=new AbortController();let resolveWork;
 const task=run({signal:controller.signal,graceMs:5,run:()=>new Promise(resolve=>{resolveWork=resolve;}),cancel:()=>{throw Error('transport unavailable');},dispose:()=>{}});
 await delay(1);controller.abort();await assert.rejects(task,{code:'CANCELLED'});resolveWork('late');
}
{
 const controller=new AbortController();controller.abort();let started=false;
 await assert.rejects(run({signal:controller.signal,run:()=>{started=true;},cancel:()=>{},dispose:()=>{}}),{code:'CANCELLED'});assert.equal(started,false);
}
console.log('PASS bounded Worker cancellation, cooperative reuse, late-result containment, pre-abort');
