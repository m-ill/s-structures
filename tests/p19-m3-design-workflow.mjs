import assert from 'node:assert/strict';
import { createModel } from '../src/core/model.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { createElasticReviewService } from '../src/compute/product/elasticReviewService.js';
import { stableHash } from '../src/core/stableHash.js';
import { validateReportSnapshot } from '../src/report/phase11/reportSnapshot.js';
import { renderProductionReport } from '../src/report/phase11/productionReport.js';
import { installIndexDesignReview } from '../src/ui/indexDesignReview.js';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const must=x=>{assert.equal(x.ok,true,JSON.stringify({code:x.code,details:x.details}));return x;};
function fixture(rc) {
  const model=createModel();model.meta={id:rc?'M3-RC':'M3-STEEL'};
  model.nodes=[{id:'N1',x:0,y:0,z:0,support:'fixed'},{id:'N2',x:0,y:0,z:3}];
  model.members=[{id:'M1',type:'frame',n1:'N1',n2:'N2',matId:rc?'concrete':'steel',secId:rc?'rc3060':'h300'}];
  model.loadCases=[{id:'D',type:'dead'}];model.loads=[{id:'F',type:'nodal',node:'N2',P:10,dir:'-x',case:'D'},{id:'G',type:'nodal',node:'N2',P:20,dir:'-z',case:'D'}];
  model.loadCombinations=[{id:'S',name:'Service',type:'service',factors:{D:1}},{id:'U',name:'Ultimate',type:'strength',factors:{D:1.4}}];
  model.analysisCases=[{id:'SERVICE',kind:'static',settings:{comboId:'S',pDeltaMethod:'off'}},{id:'DIRECT',kind:'static',settings:{comboId:'U',pDeltaMethod:'direct'}}];
  return model;
}

for(const rc of [false,true]) {
  const outputs=[];
  for(const surface of ['ui','agent']) {
    const model=fixture(rc),target={model:()=>model,location:{search:''}},bridge=installIndexEngineBridge(target),api=surface==='ui'?bridge:target.SStructuresAgent;
    assert.equal(api.getDesignReview('none').code,'RESULT_REQUIRED');assert.equal(api.getDesignReviewReport('none').code,'RESULT_REQUIRED');
    const plan=must(api.planElasticWorkflow({caseIds:['DIRECT','SERVICE']}));assert.deepEqual(plan.steps.map(x=>x.caseId),['SERVICE','DIRECT']);
    const workflow=must(await api.runElasticWorkflow({plan,requestId:'run'}));assert.equal(workflow.steps.length,2);
    assert.deepEqual(await api.runElasticWorkflow({plan,requestId:'run'}),workflow);
    const sources=workflow.steps.map(step=>({analysisRunId:step.analysisRunId,comboId:step.caseId==='SERVICE'?'S':'U'}));
    const reviewPlan=must(api.planDesignReview({sources}));
    const before=stableHash(model),jobs=bridge.listAnalysisRuns().length;
    const review=must(api.startDesignReview({plan:reviewPlan,requestId:'design'}));
    assert.equal(stableHash(model),before);assert.equal(bridge.listAnalysisRuns().length,jobs);
    assert.equal(review.designTransferAllowed,false);assert.equal(review.designReviewStatus,'review-required');
    assert.ok(review.result.checks.some(x=>x.category===(rc?'concrete':'steel')));
    assert.ok(review.result.summary.counts.NOT_CHECKED>0);
    for(const row of review.result.checks) assert.ok(sources.some(x=>x.analysisRunId===row.analysisRunId&&x.comboId===row.comboId));
    const report=must(api.createDesignReviewReport(review.designRunId));assert.equal(validateReportSnapshot(report.snapshot).ok,true);
    assert.deepEqual(report.snapshot.designReview.summary,review.result.summary);
    assert.ok(report.reports['ko-KR'].html.includes(String(review.result.summary.maxUtilization)));
    assert.ok(report.reports['en-US'].html.includes(report.reportSnapshotHash));
    assert.equal(JSON.parse(report.json).reportSnapshotHash,report.reportSnapshotHash);
    for(const source of sources) assert.ok(report.csv.includes(source.analysisRunId));
    for(const locale of ['ko-KR','en-US']) {
      const pdfHtml=renderProductionReport(report.snapshot,locale,{requireFigures:false});
      assert.ok(pdfHtml.sectionOrder.includes('design-review-1'));
      for(const row of review.result.checks) {assert.ok(pdfHtml.html.includes(row.analysisRunId));assert.ok(pdfHtml.html.includes(row.checkId));assert.ok(pdfHtml.html.includes(String(row.ratio??'—')));}
    }
    const capability=must(api.getDesignReviewExportCapability(review.designRunId));assert.equal(capability.automaticPdf,false);
    assert.equal((await api.exportDesignReviewPdf(review.designRunId)).code,'PDF_EXPORT_BLOCKED');
    assert.equal(bridge.listAnalysisRuns().length,jobs);
    const mutated=api.getDesignReview(review.designRunId);mutated.result.summary.status='FORGED';assert.notEqual(api.getDesignReview(review.designRunId).result.summary.status,'FORGED');
    assert.equal(api.startDesignReview({plan:{...reviewPlan,qualification:'verified'},requestId:'tamper'}).code,'DESIGN_PLAN_INVALID');
    assert.equal(api.planDesignReview({sources:[sources[0],sources[0]]}).code,'DUPLICATE_COMBINATION');
    assert.equal(api.planDesignReview({sources:[{...sources[0],comboId:'U'}]}).ok,false);
    outputs.push(review.result.checks.map(({analysisRunId,...row})=>row));
    model.nodes[1].x=0.1;
    assert.equal(api.getDesignReview(review.designRunId).stale,true);assert.equal(api.getDesignReviewReport(review.designRunId).stale,true);
    assert.equal(api.createDesignReviewReport(review.designRunId).code,'STALE_INPUT');
    assert.equal(api.startDesignReview({plan:reviewPlan,requestId:'stale'}).code,'STALE_INPUT');
    console.log(`PASS ${rc?'RC':'steel'} ${surface}: two real static/P-Delta product runs → explicit design → immutable report; no implicit solve`);
  }
  assert.deepEqual(outputs[0],outputs[1]);
}
console.log('PASS UI/Agent canonical check rows; stale/tamper/missing/duplicate/PDF-unavailable guards');

{
  const model=fixture(false);model.nodes[1].mass=[2,2,2];
  model.analysisCases.push(
    {id:'MODAL',kind:'modal',settings:{modalModeCount:2}},
    {id:'RSA',kind:'responseSpectrum',settings:{modalModeCount:2,spectrum:{method:'SRSS',directions:['x'],dampingRatio:0.05,scale:9.80665,points:[{period:0,sa:0.3},{period:2,sa:0.2}]}}},
    {id:'BUCKLE',kind:'buckling',settings:{modeCount:1,maxIterations:30,preloadCombinationId:'U'}},
    {id:'THA',kind:'linearTha',settings:{integration:'direct',direction:'x',dampingRatio:0.05,dt:0.01,accelerations:[0,0.01,0],accelerationUnit:'g',timeUnit:'s'}},
  );
  const target={model:()=>model,location:{search:''}},bridge=installIndexEngineBridge(target);
  const plan=must(bridge.planElasticWorkflow({caseIds:model.analysisCases.map(x=>x.id).reverse()}));
  assert.deepEqual(plan.steps.map(x=>x.caseId),['SERVICE','DIRECT','MODAL','RSA','BUCKLE','THA']);
  assert.deepEqual(plan.steps.find(x=>x.caseId==='BUCKLE').prerequisites,['DIRECT']);
  const result=must(await bridge.runElasticWorkflow({plan,requestId:'all-elastic'}));
  assert.equal(result.steps.length,6);assert.ok(result.steps.every(x=>x.ok));
  const modal=result.steps.find(x=>x.caseId==='MODAL');
  assert.equal(bridge.planDesignReview({sources:[{analysisRunId:modal.analysisRunId,comboId:'S'}]}).code,'DESIGN_DEMAND_MAPPING_UNSUPPORTED');
  const doc=createFakeIndexDocument(),host=doc.createElement('div');host.setAttribute('data-ss-ribbon-panel','elastic');doc.body.appendChild(host);
  const panel=installIndexDesignReview({...target,document:doc},bridge);panel.open();
  const click=text=>{const node=doc.querySelectorAll('button').find(x=>x.textContent===text);assert.ok(node,text);node.click();};
  const jobs=bridge.listAnalysisRuns().length;click('설계 검토 실행');click('보고서 생성');
  assert.ok(doc.querySelectorAll('button').find(x=>x.textContent==='HTML 저장'));
  assert.equal(bridge.listAnalysisRuns().length,jobs);
  console.log('PASS real static/direct/modal/RSA/buckling/THA sequence; native design/report button events; unsupported demand mapping');
}

// A failed/cancelled new job must never reuse a retained successful case result.
for(const finishStatus of ['failed','cancelled','completed']) {
  const model=fixture(false);model.analysisCases.push({id:'B',kind:'buckling',settings:{preloadCombinationId:'S'}});
  const real=installIndexEngineBridge({model:()=>model,location:{search:''}}), started=[];
  const bridge={...real,getAnalysisCaseResult:()=>({runRecordId:'retained-success'}),
    startAnalysisRun:({caseId})=>{started.push(caseId);return {id:'new-job'};},
    getProductAnalysisService:()=>({wait:async()=>({status:finishStatus})}),
    getWorkflowAnalysisResult:()=>({ok:true,analysisRunId:'retained-success',executionStatus:'completed',stale:false})};
  const service=createElasticReviewService({bridge});
  const plan=must(service.planWorkflow({caseIds:['B','SERVICE']}));
  const result=await service.runWorkflow({plan,requestId:'failure'});
  assert.equal(result.ok,false);assert.equal(result.status,'failed');
  assert.equal(result.steps[1].code,'DEPENDENCY_FAILED');assert.deepEqual(started,['SERVICE']);
}
console.log('PASS failed/cancelled/unpublished rerun cannot reuse retained success; dependent buckling skipped');

{
  const model=fixture(false);model.analysisCases=[{id:'LEGACY',kind:'static',settings:{comboId:'S',pDeltaMethod:'legacy'}}];
  const bridge=installIndexEngineBridge({model:()=>model,location:{search:''}});
  const plan=must(bridge.planElasticWorkflow({caseIds:['LEGACY']}));
  const run=must(await bridge.runElasticWorkflow({plan,requestId:'legacy-run'}));
  const result=bridge.planDesignReview({sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'S'}]});
  assert.equal(result.code,'PDELTA_COMPARISON_ONLY');
  console.log('PASS legacy P-Delta comparison-only result is blocked from design review');
}
