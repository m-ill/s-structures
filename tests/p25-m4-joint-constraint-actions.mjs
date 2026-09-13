import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {analyzeModel} from '../src/index.js';
import {evaluateRcJoint} from '../src/design/connection/rcJoint.js';
import {designSetSnapshot} from '../src/compute/product/candidateAnalysisSnapshot.js';
function fixture(mode){
 const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0},{id:'C',x:6,y:0,z:0,support:'fixed'},{id:'D',x:0,y:2,z:0,support:'fixed'},{id:'E',x:3,y:2,z:0},{id:'F',x:6,y:2,z:0,support:'fixed'}];m.members=[['A','B'],['B','C'],['D','E'],['E','F']].map(([n1,n2])=>({id:n1+n2,n1,n2,type:'frame',matId:'concrete',secId:'rc3060'}));
 m.constraints=mode==='mpc'?[{id:'tie',type:'mpc',slave:{node:'E',dof:'ux'},terms:[{node:'B',dof:'ux',c:1}],d:0}]:[];m.diaphragms=mode==='diaphragm'?[{id:'floor',type:'rigid',nodeIds:['B','E']}]:[];
 m.loads=[{id:'P',type:'nodal',node:'B',case:'D',dir:'+x',P:100}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1}}];m.analysisSettings.includeSelfWeight=false;m.analysisSettings.pDeltaMethod='off';return m;
}
for(const method of ['off','direct'])for(const mode of ['mpc','diaphragm']){
 const model=fixture(mode);model.analysisSettings.pDeltaMethod=method;const r=analyzeModel(model),set=method==='direct'?{...r.pDelta.byCombo.U.result,combo:{id:'U'}}:r.byCombo.U;if(method==='direct')assert.equal(r.pDelta.byCombo.U.converged,true,JSON.stringify({mode,reason:r.pDelta.byCombo.U.reason,reasonCodes:r.pDelta.byCombo.U.reasonCodes,solver:r.pDelta.byCombo.U.solver}));assert.equal(set.ok,true,JSON.stringify({method,mode,recovery:set.recovery,reason:set.reason,stability:set.stability}));
 assert.equal(set.constraintActions.version,'p25-constraint-actions-v1');
 const action=node=>set.constraintActions.rows.find(row=>row.nodeId===node&&row.dof==='ux').force;
 assert.equal(set.summary.equilibriumStatus,'PASS');assert.ok(Array.isArray(set.summary.totalConstraintResultant));if(mode==='mpc'){assert.ok(Math.abs(set.summary.totalConstraintResultant[5]+100)<1e-7);assert.ok(Math.abs(action('B')+50)<1e-7);assert.ok(Math.abs(action('E')-50)<1e-7);}else{assert.ok(Math.abs(action('B'))>1e-8);assert.ok(Math.abs(action('B')+action('E'))<1e-7);}
 for(const [nodeId,memberIds] of [['B',['AB','BC']],['E',['DE','EF']]]){
  const joint={nodeId,memberIds,connectionType:'rc-joint',restraint:'rigid'};
  const check=evaluateRcJoint(model,joint,set)['joint-equilibrium'];assert.equal(check.status,'OK',JSON.stringify(check));assert.ok(check.constraintAction.rows.length>0);
  const copied=designSetSnapshot(set);assert.deepEqual(copied.constraintActions,set.constraintActions);assert.equal(evaluateRcJoint(model,joint,copied)['joint-equilibrium'].status,'OK');
  const absent=structuredClone(copied);delete absent.constraintActions;assert.equal(evaluateRcJoint(model,joint,absent)['joint-equilibrium'].reason,'JOINT_CONSTRAINT_ACTIONS_REQUIRED');
 }
}
console.log('PASS actual first-order MPC/rigid diaphragm load transfer, joint equilibrium and candidate source snapshot');

const {jointConstraintActions}=await import('../src/design/connection/jointConstraintActions.js');
const unitModel=fixture('mpc'),unitSource={constraintActions:{version:'p25-constraint-actions-v1',signConvention:'force applied by constraint to structural DOF',units:{force:'kN',moment:'kN.m'},rows:[{nodeId:'B',dof:'ux',force:7,supportCoupled:true}]}};
assert.deepEqual(jointConstraintActions(unitModel,'B',unitSource).global,[0,0,0,0,0,0]);unitSource.constraintActions.rows.push({...unitSource.constraintActions.rows[0]});assert.equal(jointConstraintActions(unitModel,'B',unitSource).reason,'JOINT_CONSTRAINT_ACTIONS_INVALID');unitSource.constraintActions.rows=[];assert.equal(jointConstraintActions(unitModel,'B',unitSource).reason,'JOINT_CONSTRAINT_ACTIONS_INCOMPLETE');
const {designContext}=await import('./fixtures/p24/context.js');const {readJsonRecord}=await import('../src/ui/jsonRecordReader.js');const ctx=designContext();
unitSource.constraintActions.rows=[null];assert.equal(jointConstraintActions(unitModel,'B',unitSource).reason,'JOINT_CONSTRAINT_ACTIONS_INVALID');
try{
 Object.assign(ctx.model,fixture('diaphragm'));ctx.model.analysisSettings.pDeltaMethod='direct';ctx.model.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'direct'}}];
 const commands=[['B',['AB','BC']],['E',['DE','EF']]].map(([nodeId,memberIds])=>({type:'connection-record',id:'J'+nodeId,name:'synthetic joint',version:1,nodeId,memberIds,connectionType:'rc-joint',restraint:'rigid',sourceNote:'synthetic constraint equilibrium'}));
 const {validateModel}=await import('../src/core/validation.js');assert.deepEqual(validateModel(ctx.model).errors,[]);
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-constraint-preview',commands});assert.equal(preview.ok,true);await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-constraint-apply'});
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'constraint-run'});assert.equal(run.ok,true);
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId);
 const checks=snapshot.checks.filter(c=>c.checkId==='joint-equilibrium');assert.equal(checks.length,2);assert.ok(checks.every(c=>c.status==='OK'));assert.ok(checks.every(c=>c.actions.every(a=>a.actionSource==='consistent-global-equilibrium-end')));assert.equal(snapshot.summary.complete,false);
 const detail=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:evaluated.evaluationId,checkId:checks[0].id,...args}));assert.deepEqual(detail.value.constraintAction,checks[0].constraintAction);
}finally{await ctx.dispose();}
console.log('PASS actual WebMCP joint input -> Direct rigid diaphragm -> two equilibrium checks -> detail, with whole-design qualification unchanged');
