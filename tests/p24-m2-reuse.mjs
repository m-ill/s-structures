import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {createWorkflowInputIdentity} from '../src/core/workflowIdentity.js';
import {createWorkflowResultStore} from '../src/compute/product/workflowResults.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
const model=createModel();
model.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];
model.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
const analysisCase={id:'CASE',kind:'static',settings:{comboId:'C',pDeltaMethod:'off'}};
const identity=m=>createWorkflowInputIdentity({model:m,analysisCase,build:{id:'test-p24-numeric'},rulePack:{id:'test-only'},library:{materials:[],sections:[]}});
const store=createWorkflowResultStore();
const record={id:'RUN',caseId:'CASE',kind:'static',runStatus:'ok',qualification:'preliminary',designTransferAllowed:false,provenance:{units:model.units,analysisCase,combination:{id:'C'}},result:{ok:true,payload:{ok:true,byCombo:{C:{ok:true,anyOk:true,memberResults:{},disp:{}}},design:{obsolete:true},envelope:{ok:true,design:{obsolete:true},memberResults:{AB:{N:[1,2]}}},pDelta:{byCombo:{C:{ok:true,result:{ok:true,practical:{obsolete:true},rcDetailing:{obsolete:true},memberResults:{AB:{N:[2,3]}}}}}}}}};
try {
  store.recordAnalysis(record,identity(model),{model});
  const next=structuredClone(model);
  stagePracticalDesignInput(next,{type:'reinforcement-record',id:'R',name:'bars',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[{y:-0.2,z:0,diameter:16}],sourceNote:'synthetic'},[]);
  assert.equal(store.getAnalysis('RUN',identity(next)).stale,true);
  assert.equal(typeof store.reuseAnalysis,'function','explicit proof-bound reuse must be available');
  const reused=store.reuseAnalysis('RUN',identity(next),next);
  assert.equal(reused.ok,true);assert.equal(reused.stale,false);assert.notEqual(reused.analysisRunId,'RUN');
  assert.equal(reused.designTransferAllowed,false);assert.equal(reused.result.payload.design,undefined);
  assert.equal(reused.result.payload.envelope.design,undefined);assert.equal(reused.result.payload.pDelta.byCombo.C.result.practical,undefined);assert.equal(reused.result.payload.pDelta.byCombo.C.result.rcDetailing,undefined);assert.deepEqual(reused.result.payload.envelope.memberResults.AB.N,[1,2]);assert.deepEqual(reused.result.payload.pDelta.byCombo.C.result.memberResults.AB.N,[2,3]);assert.equal(store.getAnalysis('RUN',identity(model)).result.payload.envelope.design.obsolete,true);
  assert.equal(reused.derivation.artifactInvalidation.designReevaluationRequired,true);assert.ok(reused.derivation.artifactInvalidation.clearedFields.includes('practical'));
  assert.equal(reused.derivation.sourceAnalysisRunId,'RUN');
  assert.equal(store.reuseAnalysis('RUN',identity(next),next).analysisRunId,reused.analysisRunId);
  assert.equal(store.getAnalysis('RUN',identity(next)).stale,true,'historical identity remains unchanged');
  for(const mutate of [m=>m.nodes[1].x=4,m=>m.analysisSettings.extraUnknownCoupling=true,m=>m.members[0].secId='rc4080']) {
    const bad=structuredClone(next);mutate(bad);
    assert.equal(store.reuseAnalysis('RUN',identity(bad),bad).code,'REANALYSIS_REQUIRED');
  }
  const restored=createWorkflowResultStore();
  try {restored.restoreState(store.exportState());assert.equal(restored.reuseAnalysis('RUN',identity(next),next).ok,true);}finally{restored.dispose();}
  const oldProofState=store.exportState();oldProofState.analyses.find(r=>r.analysisRunId==='RUN').dependencyIdentity.version='p25-moment-bound-dependencies-v3';const oldProofStore=createWorkflowResultStore();try{oldProofStore.restoreState(oldProofState);assert.equal(oldProofStore.reuseAnalysis('RUN',identity(next),next).code,'REUSE_PROOF_REQUIRED');}finally{oldProofStore.dispose();}
  store.recordAnalysis({...record,id:'OLD'},identity(model));
  assert.equal(store.reuseAnalysis('OLD',identity(next),next).code,'REUSE_PROOF_REQUIRED');
  console.log('PASS T04 explicit rebar-only reuse, stale original, changed mechanics rejection, restore and old-proof rejection');
} finally {store.dispose();}

const {clearReusedDesignArtifacts}=await import('../src/compute/product/reusedAnalysisArtifacts.js');
const shared={design:{obsolete:true},memberResults:{AB:{N:new Float64Array([1,2]),check:{ratio:.2}}}},graph={payload:{model:{report:'user input'},envelope:shared,byCombo:{C:shared}}};
const invalidation=clearReusedDesignArtifacts(graph);assert.equal(invalidation.containersVisited,3);assert.equal(shared.design,undefined);assert.deepEqual([...shared.memberResults.AB.N],[1,2]);assert.equal(shared.memberResults.AB.check.ratio,.2);assert.equal(graph.payload.model.report,'user input');assert.equal(clearReusedDesignArtifacts(graph).clearedFieldCount,0);
console.log('PASS reuse artifact invalidation preserves numerical arrays/model inputs and processes shared result containers once');
