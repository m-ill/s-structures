import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stableHash} from '../src/core/stableHash.js';
import {installIndexEngineBridge} from '../src/ui/indexBridge.js';
import {createWebMcpTools} from '../src/ui/webmcp/tools.js';
import {DESIGN_INPUT_UNITS} from '../src/modeling/designInputCommands.js';

const good=x=>{assert.equal(x.ok,true,JSON.stringify(x));return x;};
function fixture(){const m=createModel();m.nodes=[{id:'N1',x:0,y:0,z:0,support:'fixed'},{id:'N2',x:0,y:0,z:3}];m.members=[{id:'M1',type:'frame',n1:'N1',n2:'N2',matId:'steel',secId:'h300'}];m.loadCases=[{id:'D',type:'dead'}];m.loads=[{id:'F',type:'nodal',node:'N2',P:10,dir:'-x',case:'D'}];m.loadCombinations=[{id:'S',name:'Service',type:'service',factors:{D:1}}];m.analysisCases=[];return m;}
for(const rc of [false,true]) {
 const model=fixture(),uiModel=structuredClone(model),target={model:()=>model,location:{search:''}},uiTarget={model:()=>uiModel,location:{search:''}};
 const bridge=installIndexEngineBridge(target),ui=installIndexEngineBridge(uiTarget),tools=createWebMcpTools({agent:target.SStructuresAgent,bridge});
 const call=(name,args={})=>tools.find(t=>t.name===name).execute(args);
 const ctx=await call('get_workflow_context');assert.equal(bridge.listAnalysisRuns().length,0);
 const otherTools=createWebMcpTools({agent:target.SStructuresAgent,bridge});
 const otherCall=(name,args)=>otherTools.find(t=>t.name===name).execute(args);
 const commands=[{type:'member-assignment',memberIds:['M1'],matId:rc?'concrete':'steel',secId:rc?'rc3050':'h300'}];
 const p=await call('preview_design_changes',{inputHash:ctx.inputIdentity.inputHash,requestId:'assignment',commands});
 good(p);const otherPreview=await otherCall('preview_design_changes',{inputHash:ctx.inputIdentity.inputHash,requestId:'assignment',commands});assert.notEqual(otherPreview.handle,p.handle);await assert.rejects(otherCall('apply_design_changes',{handle:p.handle,requestId:'cross-session'}),{code:'HANDLE_NOT_FOUND'});
 assert.equal(stableHash(model),stableHash(uiModel));
 const receipt=good(await call('apply_design_changes',{handle:p.handle,requestId:'apply'}));
 assert.deepEqual(await call('apply_design_changes',{handle:p.handle,requestId:'apply'}),receipt);
 good(ui.applyDesignInputChanges(good(ui.previewDesignInputChanges({requestId:'assignment',units:DESIGN_INPUT_UNITS,commands}))));
 assert.equal(stableHash(model),stableHash(uiModel));
 const command={type:'analysis-case',mode:'create',id:'STATIC',name:'Static',kind:'static',settings:{comboId:'S',pDeltaMethod:'off'}};
 const cp=good(await call('preview_analysis_case',{inputHash:bridge.getWorkflowInputIdentity().inputHash,requestId:'case',command}));
 good(await call('apply_analysis_case',{handle:cp.handle,requestId:'case-apply'}));
 good(ui.applyDesignInputChanges(good(ui.previewDesignInputChanges({requestId:'case',units:DESIGN_INPUT_UNITS,commands:[command]}))));
 assert.equal(stableHash(model),stableHash(uiModel));
 const plan=good(await call('plan_elastic_workflow',{inputHash:bridge.getWorkflowInputIdentity().inputHash,caseIds:['STATIC']}));
 const started=good(await call('start_elastic_workflow',{handle:plan.handle,requestId:'run'}));
 let state;for(let i=0;i<100;i++){state=await call('get_elastic_workflow',{handle:started.handle});if(state.status!=='running')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(state.status,'completed');
 const run=good(await ui.runElasticWorkflow({plan:good(ui.planElasticWorkflow({caseIds:['STATIC']})),requestId:'run'}));
 const source={analysisRunId:state.result.steps[0].analysisRunId,comboId:'S'};
 const dp=good(await call('plan_design_review',{inputHash:bridge.getWorkflowInputIdentity().inputHash,sources:[source]}));
 const design=good(await call('start_design_review',{handle:dp.handle,requestId:'design'}));
 const ur=good(ui.startDesignReview({plan:good(ui.planDesignReview({sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'S'}]})),requestId:'design'}));
 const rows=[];let offset=0;
 do {const result=good(await call('get_design_result',{designRunId:design.designRunId,channel:'checks',offset,limit:3}));rows.push(...result.data.rows);offset=result.data.nextOffset;}while(offset!==null);
 const canonical=rows=>rows.map(({analysisRunId,...row})=>row);
 assert.deepEqual(canonical(rows),canonical(ur.result.checks));
 const jobs=bridge.listAnalysisRuns().length;
 const rp=good(await call('plan_report_export',{designRunId:design.designRunId}));
 assert.equal(bridge.getDesignReviewReport(design.designRunId).ok,false);
 const report=good(await call('start_report_export',{handle:rp.handle,requestId:'report'}));
 let content='';offset=0;do{const part=await call('get_report_artifact',{handle:report.handle,format:'json',offset});content+=part.content;offset=part.nextOffset;}while(offset!==null);
 assert.equal(JSON.parse(content).reportSnapshotHash,report.reportSnapshotHash);
 assert.equal(bridge.listAnalysisRuns().length,jobs);
 await assert.rejects(call('apply_design_changes',{handle:cp.handle,requestId:'apply'}),{code:'REQUEST_ID_CONFLICT'});
 await assert.rejects(call('preview_design_changes',{inputHash:bridge.getWorkflowInputIdentity().inputHash,requestId:'bad',commands:[{type:'execute',action:'setModel'}]}),{code:'INVALID_INPUT'});
 await assert.rejects(call('get_report_artifact',{handle:report.handle,format:'json',path:'C:/secret'}),{code:'INVALID_INPUT'});
 model.nodes[1].x=0.1;
 assert.equal((await call('get_design_result',{designRunId:design.designRunId,channel:'summary'})).stale,true);
 await assert.rejects(call('plan_report_export',{designRunId:design.designRunId}),{code:'STALE_INPUT'});
 tools.dispose();await assert.rejects(call('get_report_artifact',{handle:report.handle,format:'json'}),{code:'SESSION_DISPOSED'});
 console.log(`PASS ${rc?'RC':'steel'} WebMCP typed changes → actual solver → design → report matches UI service; pagination/stale/dedup/limits`);
}
