import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createElasticAnalysisService } from '../src/compute/product/elasticAnalysisService.js';
import { p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';
import { buildElasticResultViewModel } from '../src/ui/elasticResultVisualization.js';
import { buildAnalysisCaseResultView } from '../src/ui/indexResultViews.js';
import { createResultSelectionStore } from '../src/ui/resultSelectionStore.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { latestDisplayResult } from '../src/ui/resultSelectionProjection.js';
import { runAnalysisCase } from '../src/ui/analysisRunners.js';
import { summarizeElasticAnalysisRibbon } from '../src/ui/indexElasticAnalysisRibbon.js';
import { decorateAgentControls, listAgentControls } from '../src/ui/indexAgentControlsDom.js';
const model=p9M1CantileverModel();
model.loadCombinations=Array.from({length:20},(_,i)=>({id:`C${i+1}`,name:`C${i+1}`,type:'service',factors:{W:i+1}}));
const service=createElasticAnalysisService({worker:{workerFactory:(url,opts)=>new NodeWorker(url,opts)}});
const all=await service.run(model,{runId:'all',retainDetailedCombinations:true});
assert.equal(all.execution.solveCount,20);assert.equal(Object.keys(all.result.byCombo).length,20);
const one=await service.run(model,{runId:'one',settings:{comboId:'C2'}});
assert.equal(one.execution.solveCount,1);assert.deepEqual(Object.keys(one.result.byCombo),['C2']);
assert.equal(one.result.byCombo.C2.dmax,all.result.byCombo.C2.dmax);
await assert.rejects(service.run(model,{settings:{comboId:'absent'}}),{code:'ELASTIC_COMBINATION_NOT_FOUND'});
await service.dispose();
const analysisCase={id:'ONE',kind:'static',name:'Selected C2',settings:{comboId:'C2'}};
const result={kind:'static',caseId:'ONE',ok:true,status:'ok',settings:analysisCase.settings,payload:all.result};
const view=buildElasticResultViewModel(model,analysisCase,result);
assert.equal(view.selection.comboId,'C2');
const shown=view.metrics.find(x=>x.label==='최대 변위').value;assert.match(shown,/ mm$/);assert.ok(Math.abs(parseFloat(shown)-all.result.byCombo.C2.dmax*1000)<=0.005);
const selectionStore=createResultSelectionStore({selectedComboId:'C1'});
const canvas=buildAnalysisCaseResultView(model,result,{selectionStore});
assert.equal(canvas.overlayData.visuals.maxDisplacement,all.result.byCombo.C1.dmax);
const missing=buildElasticResultViewModel(model,analysisCase,result,{selectedComboId:'absent'});
assert.equal(missing.resultAvailable,false);assert.equal(missing.structuralPreview,null);
const directView=buildElasticResultViewModel(model,{...analysisCase,settings:{pDeltaMethod:'direct'}},
 {...result,settings:{pDeltaMethod:'direct'},payload:{...all.result,pDelta:{enabled:true,method:'direct',
 summary:{maxAmplification:9,comboCount:2,convergedCount:2},byCombo:{C1:{amplification:1.1,result:all.result.byCombo.C1},C2:{amplification:1.2,result:all.result.byCombo.C2}}}}},
 {selectedComboId:'C2'});
assert.equal(Number(directView.metrics.find(x=>x.label==='절점 성분 최대 증폭').value),1.2,'selected combination amplification must not use another combination maximum');
for(const status of ['failed','running','cancelled','stale','unsupported']) {
 const bad={...result,status};
 assert.equal(buildElasticResultViewModel(model,analysisCase,bad).structuralPreview,null);
 assert.equal(buildAnalysisCaseResultView(model,bad).overlayData,null);
}
const workers=[];const previousWorker=globalThis.Worker;
globalThis.Worker=class extends NodeWorker { constructor(url,opts){super(url,opts);workers.push(this);} };
try {
 model.analysisCases=[analysisCase];
 model.analysisSettings.responseSpectrum={enabled:true};
 const synchronous=runAnalysisCase(model,analysisCase);
 assert.equal(synchronous.payload.dynamics,undefined,'static case does not run implicit modal/RSA');
 const target={model:()=>model,location:{search:''},activeResult:()=>all.result.envelope};
 const bridge=installIndexEngineBridge(target);
 const job=bridge.startAnalysisRun({analysisCase});
 await bridge.getProductAnalysisService().wait(job.id);
 const published=bridge.getAnalysisLatestAttempt('ONE');
 assert.equal(published.payload.dynamics,undefined,'Worker static case does not run implicit modal/RSA');
 assert.equal(model.analysisSettings.responseSpectrum.enabled,true,'case execution preserves authored dynamic settings');
 assert.deepEqual(Object.keys(published.payload.byCombo),['C2'],'actual indexBridge Worker request executes only the authored combo');
 assert.equal(target.activeResult().dmax,one.result.byCombo.C2.dmax);
 target.__SStructuresAnalysisLatestAttempts.ONE={...published,ok:false,status:'failed'};
 assert.equal(target.activeResult(),null);assert.equal(latestDisplayResult(target,'ONE').status,'failed');
} finally {globalThis.Worker=previousWorker;await Promise.all(workers.map(worker=>worker.terminate()));}
const authored=[{id:'CUSTOM-FIRST',kind:'static',settings:{pDeltaMethod:'off'}},
 {id:'CUSTOM-X',kind:'static',settings:{pDeltaMethod:'direct'}},{id:'CUSTOM-Y',kind:'static',settings:{pDeltaMethod:'direct'}}];
const unchanged=JSON.stringify(authored),saved=Object.fromEntries(authored.map(c=>[c.id,{ok:true,status:'ok'}]));
const ribbonTarget={SStructuresEngine:{getAnalysisCases:()=>authored,getAnalysisResults:()=>saved},
 SStructuresResultSelection:{getState:()=>({activeCaseId:'CUSTOM-Y'})}};
const ribbon=summarizeElasticAnalysisRibbon(ribbonTarget);
assert.equal(ribbon.commands.find(c=>c.key==='static').caseId,'CUSTOM-FIRST');
assert.equal(ribbon.commands.find(c=>c.key==='direct-pdelta').caseId,'CUSTOM-Y');
assert.equal(ribbon.commands.find(c=>c.key==='direct-pdelta').hasResult,true);
assert.equal(JSON.stringify(authored),unchanged,'display lookup cannot rewrite authored cases');
const attrs=new Map([['id','statusTxt'],['aria-label','old 3.38mm']]);
const status={tagName:'SPAN',textContent:'new 4.73mm',getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
const doc={querySelectorAll:s=>['[id]','[data-agent-id]'].includes(s)?[status]:[]};
decorateAgentControls(doc);assert.equal(attrs.has('aria-label'),false);
status.textContent='changed 9.51mm';assert.equal(listAgentControls(doc)[0].label,'changed 9.51mm');
console.log(JSON.stringify({ok:true,fullSolves:all.execution.solveCount,selectedSolves:one.execution.solveCount,actualIndexWorker:true,customRibbon:true,liveStatusLabel:true,selectedDisplacement:one.result.byCombo.C2.dmax}));
