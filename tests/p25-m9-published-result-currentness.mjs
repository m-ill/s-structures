import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
let intercept=null;
class ControlledWorker extends Worker { postMessage(...args){if(intercept){const take=intercept;intercept=null;take(()=>super.postMessage(...args));}else super.postMessage(...args);} }
const previousWorker=globalThis.Worker;globalThis.Worker=ControlledWorker;
import {designContext} from './fixtures/p24/context.js';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
const document=createFakeIndexDocument();
for(const id of ['ssDesignInputStale','statusTxt']){const el=document.createElement('span');el.id=id;document.body.appendChild(el);}
let draws=0;const nativeCanvas={view:null,clearAnalysisView(){this.view=null;},publishAnalysisView(analysis,result,comboId){this.view={analysis,result,comboId};}};
const ctx=designContext({document,SStructuresNativeRuntime:nativeCanvas,activeResult:()=>({legacy:true}),draw:()=>{draws++;}}),m=ctx.model;
const popupStates=[];ctx.target.SStructuresElasticResultPopup={refresh(){popupStates.push(ctx.bridge.getAnalysisCases().map(c=>({id:c.id,status:c.status})));}};
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];
 m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loads=[{id:'P',type:'nodal',node:'B',P:1,dir:'-x',case:'D'}];
 m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];m.analysisCases=[];
 for(const method of ['off','direct']){
  const id='E-'+method;
  const preview=await ctx.call('preview_analysis_case',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:id,command:{type:'analysis-case',mode:'create',id,name:id,kind:'static',settings:{comboId:'U',pDeltaMethod:method}}});
  await ctx.call('apply_analysis_case',{handle:preview.handle,requestId:id+'-apply'});
  assert.equal(document.getElementById('ssDesignInputStale').hidden,false);
  assert.equal(nativeCanvas.view,null,'input edits clear cached native results');
  const before=draws;
  const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:[id]}),requestId:id+'-run'});
  assert.equal(run.ok,true,JSON.stringify(run));
  assert.equal(document.getElementById('ssDesignInputStale').hidden,true,'current Worker success clears stale notice');
  ctx.target.SStructuresResultSelection.set({activeCaseId:id,selectedComboId:'U'},'test');
  assert.ok(ctx.target.activeResult(),'current selected result must be displayable');
  assert.ok(nativeCanvas.view,'native cached drawing receives the current result');
  assert.equal(nativeCanvas.view.comboId,'U');
  assert.ok(nativeCanvas.view.result.nodeDisplacements.B);
  assert.equal(nativeCanvas.view.analysis.byCombo.U,nativeCanvas.view.result);
  assert.ok(draws>before,'published result redraws');
  assert.ok(popupStates.some(rows=>rows.some(c=>c.id===id&&c.status==='ok')),'popup refresh sees final case status');
  assert.ok(!document.getElementById('statusTxt').textContent.includes('재실행 필요'));
  assert.equal(ctx.bridge.listAnalysisRuns().length,method==='off'?1:2,'view does not rerun solver');
 }
 const cp=await ctx.call('preview_analysis_case',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'late-case',command:{type:'analysis-case',mode:'create',id:'LATE',name:'late result',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}});
 await ctx.call('apply_analysis_case',{handle:cp.handle,requestId:'late-case-apply'});
 let release;const captured=new Promise(resolve=>{intercept=send=>{release=send;resolve();};});
 const pending=ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['LATE']}),requestId:'late-run'});
 await captured;m.nodes[1].z=3.1;release();await pending;
 assert.equal(document.getElementById('ssDesignInputStale').hidden,false,'late result cannot clear stale notice');
 assert.equal(ctx.bridge.getLastResult(),null);
 ctx.target.SStructuresResultSelection.set({activeCaseId:'LATE',selectedComboId:'U'},'test');
 assert.equal(ctx.target.activeResult(),null,'late result cannot be displayed');
 assert.equal(nativeCanvas.view,null,'late source cannot reach the native cache');
}finally{await ctx.dispose();globalThis.Worker=previousWorker;}
console.log('PASS current CPU/Direct publication clears stale state and exposes selected results without extra solves');
