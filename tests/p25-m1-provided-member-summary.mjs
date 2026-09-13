import assert from 'node:assert/strict';
import {preparePracticalRcMemberResults} from '../src/design/evaluation/practicalMemberSummary.js';
import {buildIndexResultViewModel} from '../src/ui/indexResultsPanel.js';
import {createModel} from '../src/core/model.js';
const rows=preparePracticalRcMemberResults([
 {entityId:'C',checkId:'rc-section-strength',comboId:'U',status:'OK',ratio:.6},
 {entityId:'C',checkId:'rc-anchorage',comboId:'U',status:'NOT_CHECKED',reason:'MISSING'},
 {entityId:'D',checkId:'rc-section-strength',comboId:'U',status:'NG',ratio:1.2,incomplete:true},
 {entityId:'foundation:A',checkId:'foundation-bearing',status:'NG',ratio:5},
]);
assert.equal(rows.C.status,'NOT_CHECKED');assert.equal(rows.C.incomplete,true);assert.equal(rows.C.utilization,.6);
assert.equal(rows.D.status,'NG');assert.equal(rows.D.incomplete,true);assert.equal(rows.D.governingCheck,'rc-section-strength');assert.equal(Object.keys(rows).length,2);
const model=createModel(),analysis={design:{summary:{},steel:{memberResults:{}},concrete:{memberResults:{C:{memberId:'C',status:'NG',utilization:99}}},practicalMemberResults:rows}};
const view=buildIndexResultViewModel(model,analysis,{activeTab:'design'});
assert.equal(view.design.rows.find(r=>r.memberId==='C').status,'NOT_CHECKED');assert.equal(view.design.rows.find(r=>r.memberId==='C').utilization,.6);
assert.equal(view.design.rows.find(r=>r.memberId==='D').incomplete,true);
analysis.design.practicalMemberResults={};assert.equal(buildIndexResultViewModel(model,analysis).design.rows.length,0,'empty prepared result must not fall back to assumed rebar');
console.log('PASS native RC rows use provided checks, retain incomplete NG and never substitute legacy reinforcement');

const {analyzeForIndex}=await import('../src/ui/indexBridge.js');
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:1,case:'D'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1}}];m.analysisSettings.pDeltaMethod='off';
const actual=analyzeForIndex(m);assert.equal(actual.ok,true);assert.ok(actual.design.practicalMemberResults.AB);assert.equal(actual.design.summary.checkedMembers,0);assert.equal(actual.design.summary.skippedMembers,1);assert.equal(actual.design.summary.rcUnreviewedMembers,1);assert.equal(actual.design.practicalMemberResults.AB.incomplete,true);
const actualView=buildIndexResultViewModel(m,actual,{activeTab:'design'});assert.equal(actualView.design.rows.find(r=>r.memberId==='AB').basis,'provided-practical-checks');assert.ok(actualView.design.rows.find(r=>r.memberId==='AB').incompleteCheckCount>0);
console.log('PASS real index analysis finalizer publishes provided RC member rows');

const {preparePracticalRcSummary}=await import('../src/design/evaluation/practicalMemberSummary.js');
const {selectRcDesign}=await import('../src/results/designResultSelection.js');
const family=preparePracticalRcSummary(rows);
assert.equal(family.checkedMembers,2);assert.equal(family.unreviewedMembers,2);assert.equal(family.ngCount,1);assert.equal(family.maxUtilization,1.2);assert.equal(family.ok,false);
assert.equal(preparePracticalRcSummary({}).ok,false);assert.equal(preparePracticalRcSummary({}).maxUtilization,null);
assert.equal(actual.design.practicalRcSummary.unreviewedMembers,1);
assert.equal(selectRcDesign(actual).memberResults,actual.design.practicalMemberResults);
assert.equal(selectRcDesign(actual).summary,actual.design.practicalRcSummary);
assert.equal(selectRcDesign({design:{practicalMemberResults:{},concrete:{ok:true}}}).ok,false);
assert.equal(selectRcDesign({design:{concrete:{ok:true}}}).ok,true);
console.log('PASS prepared RC family summary and dedicated view selection');

const {preparePracticalRcSchedules}=await import('../src/design/evaluation/practicalMemberSummary.js');
const input={designDetails:{reinforcement:[{id:'R',version:1,memberId:'C',bars:[{diameter:10}]},{id:'R',version:2,memberId:'C',start:0,end:1,bars:[{diameter:20,y:0,z:0}],stirrupSpacing:150}]}};
const schedules=preparePracticalRcSchedules(input,rows);
assert.equal(schedules.C.regions.length,1);assert.equal(schedules.C.regions[0].version,2);assert.equal(schedules.C.regions[0].bars[0].diameter,20);
schedules.C.regions[0].bars[0].diameter=30;assert.equal(input.designDetails.reinforcement[1].bars[0].diameter,20);
assert.equal(actual.design.practicalRcSchedules.AB.regions.length,0);
const {buildRcDetailingReport}=await import('../src/design/rcDetailing.js');
const providedReport=buildRcDetailingReport(m,actual);assert.equal(providedReport.rows[0].status,'NOT_CHECKED');assert.equal(providedReport.rows[0].requiredRebar,null);assert.equal(providedReport.rows[0].regions.length,0);assert.equal(providedReport.basis,'provided-practical-checks');
console.log('PASS provided reinforcement schedules preserve latest inputs without invented bars');

const {createDetailedHtmlReport}=await import('../src/report/detailedReport.js');
const detailedProvided=createDetailedHtmlReport(m,actual);
assert.equal(detailedProvided.data.rcDetailing.basis,'provided-practical-checks');
assert.ok(detailedProvided.html.includes('Missing input'));assert.ok(detailedProvided.html.includes('Longitudinal bars (mm)'));
console.log('PASS actual detailed HTML renders provided reinforcement and missing input');

const {createIndexAgentApi}=await import('../src/ui/indexBridge.js');
const agent=createIndexAgentApi({model:()=>m,reanalyze:()=>{}},{getLastResult:()=>actual});
const agentReport=agent.prepareResultView('getRcDetailedDesignReport');
assert.equal(agentReport.basis,'provided-practical-checks');assert.equal(agentReport.rows[0].status,'NOT_CHECKED');assert.ok(agentReport.formulaTrace.length>0);assert.ok(agentReport.formulaTrace.every(c=>c.codeBasis));
console.log('PASS agent RC detailed report returns provided checks and KDS records');

const materialRows=preparePracticalRcMemberResults([{entityId:'RC',checkId:'material-test-evidence',status:'NG',incomplete:true,reason:'MATERIAL_TEST_STRENGTH_MISMATCH',incompleteReasons:['MATERIAL_TEST_BATCH_MISMATCH']},{entityId:'STEEL',checkId:'material-test-evidence',status:'NG'},{entityId:'foundation:A',checkId:'material-test-evidence',status:'NG'},{entityId:'RC',checkId:'rc-section-strength',status:'OK',ratio:.2}]);
assert.deepEqual(Object.keys(materialRows),['RC']);assert.equal(materialRows.RC.status,'NG');assert.equal(materialRows.RC.incomplete,true);assert.equal(materialRows.RC.checkCount,2);assert.equal(materialRows.RC.utilization,.2);assert.ok(materialRows.RC.blockingCheckIds.includes('material-test-evidence'));assert.ok(materialRows.RC.blockingReasons.includes('MATERIAL_TEST_BATCH_MISMATCH'));assert.equal(preparePracticalRcSummary(materialRows).ngCount,1);
console.log('PASS material evidence blocks an otherwise passing RC member without creating RC rows for steel or footings');
