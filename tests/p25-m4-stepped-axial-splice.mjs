import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {classAMomentEnvelope} from '../src/compute/product/classAMomentEnvelope.js';
import {memberForceFromRecovery} from '../src/solver/memberForceField.js';
const source={version:'member-force-recovery-v1',L:4,endForces:[-2,0,0,0,0,0,0,0,0,0,0,0],spanLoads:[{type:'point',a:2,q:[1,0,0]}]};
const tuples=[0,1,3,4].map(x=>{const f=memberForceFromRecovery(source,x);return {...f,T:f.Tq,x};});
const e=classAMomentEnvelope(source,tuples,4);assert.equal(e.status,'OK',JSON.stringify(e));assert.deepEqual(e.tuples.filter(t=>t.x===2).map(t=>[t.side,t.N]),[['left',2],['right',1]]);
const smooth={...source,spanLoads:[{type:'udl',q:[.1,0,0]}]},smoothTuples=[0,1,4].map(x=>{const f=memberForceFromRecovery(smooth,x);return {...f,T:f.Tq,x};});assert.equal(classAMomentEnvelope(smooth,smoothTuples,4).status,'OK');
const coupled={...smooth,endForces:[-2,0,0,0,0,-1,0,0,0,0,0,0]};assert.equal(classAMomentEnvelope(coupled,smoothTuples.map(t=>({...t,Mz:1})),4).reason,'CLASS_A_CONSTANT_TENSION_REQUIRED');
const parabolic={...source,endForces:[-1,0,0,0,0,0,0,0,0,0,0,0],spanLoads:[{type:'distributed-linear',a:0,b:4,q1:[-2,0,0],q2:[2,0,0]}]},parabolicTuples=[0,1,4].map(x=>({x,N:1+2*x-.5*x*x,T:0,My:0,Mz:0,Vy:0,Vz:0}));
const parabola=classAMomentEnvelope(parabolic,parabolicTuples,4);assert.equal(parabola.status,'OK');assert.ok(parabola.tuples.some(t=>Math.abs(t.x-2)<1e-9&&Math.abs(t.N-3)<1e-9));
const valley={...parabolic,endForces:[-.039,0,0,0,0,0,0,0,0,0,0,0],spanLoads:[{type:'distributed-linear',a:0,b:4,q1:[.4,0,0],q2:[-7.6,0,0]}]},valleyTuples=[0,1,4].map(x=>({x,N:x*x-.4*x+.039,T:0,My:0,Mz:0,Vy:0,Vz:0}));assert.ok(valleyTuples.every(t=>t.N>0));assert.equal(classAMomentEnvelope(valley,valleyTuples,4).status,'NOT_CHECKED');
const distributed=process.env.P25_CLASS_A_AXIAL_DISTRIBUTED==='1',ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 const bars={type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,strengthStandard:'KDS-142020-2022',barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:-.06,diameter:20},{y:-.2,z:.06,diameter:20}],reinforcementForm:'single-deformed',concreteWeight:'normal',barPosition:'other',barCoating:'uncoated',lapRequired:true,aggregateMaxSize:.02,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2};
 const splice={type:'splice-record',id:'SP',name:'test',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1'],start:.125,end:.875,offsetY:.02,offsetZ:0,spliceType:'tension-A',spliceSystem:'ordinary-no-seismic-detail'};
 for(const c of [bars,splice])stagePracticalDesignInput(m,c,[]);
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'AXIAL',type:'nodal',node:'B',dir:'+x',P:1,case:'D'},{id:'POINT',type:'point',member:'AB',dir:'+x',P:1,t:.5,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 if(distributed)m.loads[1]={id:'DIST',type:'udl',member:'AB',dir:'+x',w:.25,shape:'uniform',case:'D'};
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'source'});assert.equal(run.ok,true);
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId),check=snapshot.checks.find(c=>c.checkId==='rc-splices');assert.equal(check.status,'OK',JSON.stringify(check));
 const proof=check.checks[0].classAProof;assert.equal(proof.axialEnvelope.kind,distributed?'variable-pure-tension':'piecewise-constant-tension');assert.equal(proof.axialEnvelope.force,null);if(!distributed)assert.equal(proof.axialEnvelope.values.length,2);assert.ok(proof.axialEnvelope.values.some(n=>Math.abs(n-1.4)<1e-9));assert.ok(proof.axialEnvelope.values.some(n=>Math.abs(n-2.8)<1e-9));assert.ok(check.codeReferences.length);assert.equal(snapshot.summary.complete,false);const {resolveMaterialRecord}=await import('../src/materials/registry.js');const fy=resolveMaterialRecord(m,'steel@1').strength.steel.Fy,halfArea=m.designDetails.reinforcement[0].bars.reduce((n,b)=>n+b.area/2,0);assert.ok(Math.abs(proof.worst.ratio-2.8/(.85*halfArea*fy*1000))<1e-10);
 const {readJsonRecord}=await import('../src/ui/jsonRecordReader.js');const read=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:evaluated.evaluationId,checkId:check.id,...args}));assert.deepEqual(read.value.checks[0].classAProof.axialEnvelope,proof.axialEnvelope);
 console.log('PASS axial point/uniform/parabolic envelope: critical N, hidden compression rejection, actual WebMCP A-class/KDS; coupled variable axial/bending remains unqualified');
}finally{await ctx.dispose();}
