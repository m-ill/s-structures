import assert from 'node:assert/strict';
import {assessCandidateScope} from '../src/compute/product/candidateScope.js';
const model={members:[{id:'A',n1:'1',n2:'2'},{id:'B',n1:'2',n2:'3'},{id:'C',n1:'4',n2:'5'}]};
const row=(entityId,status='OK',ratio=.5)=>({entityId,comboId:'U',checkId:'strength',status,ratio});
const coverage={missingIds:[],missingPurposes:[],missingEvaluationIds:[],projectProfile:{status:'OK'}};
const baseline=[row('A','NG',1.2),row('joint:2'),row('foundation:1'),row('C','NOT_CHECKED',null)];
const checks=baseline.map(r=>r.entityId==='A'?row('A'):r);
const input={model,commands:[{type:'reinforcement-record',memberId:'A'}],impact:'DESIGN_ONLY',baselineChecks:baseline,checks,combinationCoverage:coverage};
let r=assessCandidateScope(input);
assert.equal(r.complete,true);assert.equal(r.projectComplete,false);assert.equal(r.unaffectedRegressionCount,0);
assert.ok(r.entityIds.includes('joint:2'));assert.ok(r.entityIds.includes('foundation:1'));
assert.equal(assessCandidateScope({...input,checks:checks.filter(c=>c.entityId!=='joint:2')}).complete,false);
assert.equal(assessCandidateScope({...input,checks:checks.map(c=>c.entityId==='joint:2'?{...c,incomplete:true}:c)}).complete,false);
assert.equal(assessCandidateScope({...input,impact:'REANALYSIS_REQUIRED'}).complete,false);
assert.equal(assessCandidateScope({...input,checks:[...checks,row('D','NG',2)]}).complete,false);
assert.equal(assessCandidateScope({...input,baselineChecks:[...baseline,row('D')],checks:[...checks,row('D','NG',2)]}).complete,false);
assert.equal(assessCandidateScope({...input,combinationCoverage:{...coverage,missingPurposes:['service']}}).complete,false);
assert.equal(assessCandidateScope({...input,commands:[{type:'connection-record',nodeId:'2',memberIds:['A','B']}]}).complete,false,'no checks for explicitly affected B');
assert.equal(assessCandidateScope({...input,commands:[{type:'unknown'}]}).complete,false);
assert.equal(assessCandidateScope({...input,checks:[...checks,checks[0]]}).complete,false);
assert.equal(assessCandidateScope({...input,commands:[{type:'foundation-record',nodeId:'99'}]}).complete,false);
assert.equal(assessCandidateScope({...input,combinationCoverage:undefined}).complete,false);
console.log('PASS candidate affected scope, unrelated incomplete separation, dependency coverage and regression veto');

const spliceCommands=[...input.commands,{type:'splice-record',memberId:'A',reinforcementId:'R@2'}];
const spliceInput={...input,commands:spliceCommands,baselineChecks:[...baseline,{...row('A'),checkId:'rc-splices'}],checks:[...checks,{...row('A'),checkId:'rc-splices'}]};
assert.equal(assessCandidateScope(spliceInput).supported,true,'validated splice commands must be included in the affected member scope');
assert.equal(assessCandidateScope(spliceInput).complete,true);
assert.equal(assessCandidateScope({...spliceInput,commands:[spliceCommands[1]]}).complete,true);
for(const status of ['NG','NOT_CHECKED'])assert.equal(assessCandidateScope({...spliceInput,checks:spliceInput.checks.map(c=>c.checkId==='rc-splices'?{...c,status}:c)}).complete,false);
assert.equal(assessCandidateScope({...spliceInput,checks:spliceInput.checks.filter(c=>c.checkId!=='rc-splices')}).complete,false);
assert.equal(assessCandidateScope({...spliceInput,commands:[{type:'splice-record',memberId:'missing'}]}).complete,false);
assert.equal(assessCandidateScope({...spliceInput,impact:'REANALYSIS_REQUIRED'}).complete,false,'global reanalysis still includes unrelated incomplete checks');
console.log('PASS splice commands participate in member and incident scope without bypassing NG, missing checks or global reanalysis');

const sourceBefore=baseline.map(c=>({...c,analysisRunId:'old-run'}));
const sourceAfter=checks.map(c=>({...c,analysisRunId:'reused-run'}));
const sourceInput={...input,baselineChecks:sourceBefore,checks:sourceAfter};
assert.equal(assessCandidateScope(sourceInput).unaffectedRegressionCount,0,'a new source record ID alone is not a changed check');
assert.equal(assessCandidateScope(sourceInput).unaffectedSourceRecordChangeCount,1);
for(const patch of [{analysisRunId:null},{analysisRunId:''},{ratio:.9},{reason:'DIFFERENT_MISSING_INPUT'},{demand:99},{sourceHash:'different-physical-source'},{codeBasis:{status:'UNQUALIFIED'}}]){
 const changed=sourceAfter.map(c=>c.entityId==='C'?{...c,...patch}:c);
 assert.equal(assessCandidateScope({...sourceInput,checks:changed}).unaffectedRegressionCount,1,'numerics, qualification and diagnostics still veto local completion');
}
assert.equal(sourceBefore.at(-1).analysisRunId,'old-run');
console.log('PASS source-record identity changes remain separate from full unrelated check regression');
