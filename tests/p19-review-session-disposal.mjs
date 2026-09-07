import assert from 'node:assert/strict';
import {createWebMcpTools,webmcpModelHash} from '../src/ui/webmcp/tools.js';
import {registerDefinitions} from '../src/ui/webmcp/register.js';
const model={units:{length:'m',force:'kN'},analysisCases:[{id:'A',kind:'static'}]};
let count=0;const cancelled=[];
const agent={getModel:()=>model,validateAnalysisRun:()=>({ok:true}),startAnalysisRun:()=>({id:`J${++count}`}),
  getAnalysisRunStatus:({jobId})=>({id:jobId,status:jobId==='J1'?'completed':'running'}),
  cancelAnalysisRun:({jobId})=>{cancelled.push(jobId);if(jobId==='J1')throw Object.assign(new Error('Expired job'),{code:'JOB_NOT_FOUND'});}};
const definitions=createWebMcpTools({agent,bridge:{}});
const call=(name,args)=>definitions.find(t=>t.name===name).execute(args);
const input={caseId:'A',modelHash:webmcpModelHash(model)};
await call('start_analysis',{...input,requestId:'first'});
await call('start_analysis',{...input,requestId:'second'});
const state={};registerDefinitions({document:{}},definitions,state);state.dispose();
assert.deepEqual(cancelled,['J1','J2'],'One expired job cannot prevent cancelling the active job');
assert.equal(state.errors[0].code,'JOB_NOT_FOUND');
assert.equal(state.status,'disposed');
await assert.rejects(call('start_analysis',{...input,requestId:'first'}),{code:'SESSION_DISPOSED'});
await assert.rejects(call('get_analysis_status',{jobId:'J2'}),{code:'SESSION_DISPOSED'});
state.dispose();assert.equal(cancelled.length,2,'Disposal is idempotent');
console.log('PASS retained references revoked; all cancellations attempted; errors retained; idempotent disposal');
