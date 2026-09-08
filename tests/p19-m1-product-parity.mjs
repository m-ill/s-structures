import assert from 'node:assert/strict';
import { createModel } from '../src/core/model.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { createWebMcpTools } from '../src/ui/webmcp/tools.js';
import { COMPUTED_RESULT_VIEWS } from '../src/ui/resultViewCache.js';
import { workflowResultProjection } from '../src/core/workflowResultProjection.js';

const model=createModel();
model.nodes=[{id:'N1',x:0,y:0,z:0,support:'fixed'},{id:'N2',x:0,y:0,z:3}];
model.members=[{id:'M1',type:'frame',n1:'N1',n2:'N2',matId:'steel',secId:'h300'}];
model.loadCases=[{id:'D',type:'dead'}];
model.loadCombinations=[{id:'D1',name:'Dead',type:'service',factors:{D:1}}];
model.loads=[{id:'P1',type:'nodal',node:'N2',P:10,dir:'-z',case:'D'}];
model.analysisCases=[{id:'AC1',kind:'static',settings:{comboId:'D1',pDeltaMethod:'off'}}];
const target={model:()=>model,location:{search:''}};
const bridge=installIndexEngineBridge(target),agent=target.SStructuresAgent;
const tools=createWebMcpTools({agent,bridge});
const call=(name,args={})=>tools.find(x=>x.name===name).execute(args);
const before=JSON.stringify(model);
for(const surface of [bridge,agent]) for(const name of COMPUTED_RESULT_VIEWS) if(surface[name]) assert.equal(surface[name]().code,'RESULT_REQUIRED',name);
agent.getSnapshot();
assert.equal(bridge.listAnalysisRuns().length,0);
assert.equal(JSON.stringify(model),before);
const context=await call('get_project_context');
assert.deepEqual(context.inputIdentity,bridge.getWorkflowInputIdentity());
assert.deepEqual(agent.getWorkflowInputIdentity(),context.inputIdentity);
const job=await call('start_analysis',{caseId:'AC1',modelHash:context.modelHash,requestId:'parity',computeTarget:'cpu'});
await bridge.getProductAnalysisService().wait(job.jobId);
const published=bridge.getAnalysisCaseResult('AC1');
const workflow=agent.getWorkflowAnalysisResult(published.runRecordId);
assert.equal(workflow.ok,true);
assert.equal(workflow.stale,false);
assert.equal(workflow.executionStatus,'completed');
assert.deepEqual(workflow,bridge.getWorkflowAnalysisResult(published.runRecordId));
for (const surface of ['ui','agent']) {
  const fresh=JSON.parse(before);
  const localTarget={model:()=>fresh,location:{search:''}};
  const local=installIndexEngineBridge(localTarget);
  const input={caseId:'AC1',computeTarget:'cpu'};
  const run=surface==='ui' ? local.startAnalysisRun(input) : localTarget.SStructuresAgent.startAnalysisRun(input);
  // Both public surfaces reach the same product service; separate targets prove
  // parity across fresh executions rather than comparing one cached object.
  const executed=run;
  await local.getProductAnalysisService().wait(executed.id);
  const row=local.getAnalysisCaseResult('AC1');
  assert.deepEqual(row.summary,published.summary);
  assert.deepEqual(workflowResultProjection(row.payload),workflowResultProjection(published.payload));
}
bridge.analyzeModel(model); // Explicit legacy snapshot run for compatibility views.
bridge.prepareResultView('getSteelDetailingReport');
assert.deepEqual(agent.getSteelDetailingReport(),bridge.getSteelDetailingReport());
const view=agent.getSteelDetailingReport();
assert.ok(view);
bridge.analyzeModel(model);
assert.equal(agent.getSteelDetailingReport().code,'STALE_INPUT','a new run invalidates a prepared view even with identical inputs');
bridge.prepareResultView('getSteelDetailingReport');
const queued = bridge.startAnalysisRun({caseId:'AC1',computeTarget:'cpu'});
model.loads[0].P=20;
await bridge.getProductAnalysisService().wait(queued.id);
const changedDuringRun = bridge.getAnalysisCaseResult('AC1');
assert.deepEqual(changedDuringRun.summary, published.summary, 'queued execution uses its captured input');
assert.equal(agent.getWorkflowAnalysisResult(changedDuringRun.runRecordId).stale,true);
assert.equal(model.analysisCases[0].status,'stale');
assert.equal(agent.getWorkflowAnalysisResult(published.runRecordId).stale,true);
assert.equal(agent.getSteelDetailingReport().code,'STALE_INPUT');
assert.equal(bridge.getLastResult(),null);
assert.throws(()=>bridge.prepareResultView('getSteelDetailingReport'),{code:'STALE_INPUT'});
console.log(JSON.stringify({ok:true,threeSurfaceIdentityParity:true,actualProductRun:true,immutableDesignView:true,noImplicitQueryExecution:true}));
