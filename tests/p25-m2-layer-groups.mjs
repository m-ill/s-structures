import assert from 'node:assert/strict';
import {validatePracticalCommand,practicalInputSchema,practicalCommandFromRecord} from '../src/modeling/practicalInputContract.js';
import {kdsBarSpacing} from '../src/design/rc/kdsSpacing.js';
import {memberCandidateCommands} from '../src/design/rc/memberCandidateCommands.js';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
const bars=[[-.2,-.08],[-.2,.08],[.2,-.08],[.2,.08],[-.08,-.1],[.08,.1]].map(([y,z])=>({y,z,diameter:20}));
m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loads=[{id:'F',type:'nodal',node:'B',P:1,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
const command={spacingStandard:'KDS-142050-2022',memberRole:'flexural-member',reinforcementForm:'single-deformed',lapRequired:false,aggregateMaxSize:.02,type:'reinforcement-record',id:'R',name:'Layered',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic layer roles',bars,barLayerGroups:['bottom-1:1/2','top-1:3/4','side-left:5','side-right:6']};
try{
 assert.ok(practicalInputSchema('reinforcement-record').properties.barLayerGroups);
 validatePracticalCommand(command);
 for(const groups of [['bottom-1:1/2','top-1:3/4'],['bottom-1:1/2','top-1:3/4','side-left:5','side-right:5/6'],['bottom-1:1/2','top-1:3/4','side-left:7','side-right:6'],['bottom-0:1/2','top-1:3/4','side-left:5','side-right:6']])assert.throws(()=>validatePracticalCommand({...command,barLayerGroups:groups}));
 const schema=await ctx.call('get_design_input_schema',{type:'reinforcement-record'});assert.ok(schema.schema.properties.barLayerGroups);
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'layers-preview',commands:[command]});assert.equal(preview.ok,true,JSON.stringify(preview));
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'layers-apply'})).ok,true);
 const record=(await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0];assert.deepEqual(record.barLayerGroups,command.barLayerGroups);
 assert.deepEqual(practicalCommandFromRecord('reinforcement-record',record).barLayerGroups,command.barLayerGroups);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'layers-analysis'});assert.equal(run.ok,true);
 const reviewed=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(reviewed.evaluationId),spacing=snapshot.checks.find(c=>c.checkId==='rc-spacing'&&c.entityId==='AB');
 assert.equal(spacing.status,'OK');assert.equal(spacing.layerMembership.basis,'explicit-design-input');assert.equal(spacing.codeBasis.status,'CLAUSE_APPLIED');assert.equal(spacing.layerMembership.groups.length,4);

 const declared={B:.3,H:.6,aggregate:.02,role:'flexural-member',bars:bars.map((b,i)=>({...b,diameter:.02,...(i>=4?{y:i===4?-.08:.08,z:i===4?-.1:.1}:{})})),barLayerGroups:command.barLayerGroups};
 assert.equal(kdsBarSpacing({...declared,barLayerGroups:undefined}).status,'NG');
 assert.equal(kdsBarSpacing(declared).status,'OK');
 assert.equal(kdsBarSpacing({...declared,bars:declared.bars.map((b,i)=>i===4?{...b,y:-.19,z:-.09}:b)}).status,'NG','declared side role must retain physical spacing failure');
 const adjusted=memberCandidateCommands(m,[command],{spacing:100});assert.deepEqual(adjusted.commands[0].barLayerGroups,command.barLayerGroups);
 const innerSide=structuredClone(command);innerSide.bars[4].z=-.01;assert.throws(()=>validatePracticalCommand(innerSide),'interior bar cannot be relabelled as a side bar');
 const uneven=structuredClone(command);uneven.bars[0].y+=.001;assert.throws(()=>validatePracticalCommand(uneven));
 assert.throws(()=>memberCandidateCommands(m,[command],{barsPerFace:3}),/BAR_LAYER_TOPOLOGY_MAPPING_REQUIRED/);
 const primary={...command,bars:command.bars.slice(0,4),barLayerGroups:['bottom-1:1/2','top-1:3/4'],stirrupDiameter:10,stirrupLegs:2,stirrupSpacing:150};
 const increased=memberCandidateCommands(m,[primary],{barsPerFace:3}).commands[0];
 assert.deepEqual(increased.barLayerGroups,['bottom-1:1/2/3','top-1:4/5/6']);validatePracticalCommand(increased);
 const layered=memberCandidateCommands(m,[primary],{barsPerFace:3,layersPerFace:2,layerClearSpacing:.04}).commands[0];
 assert.deepEqual(layered.barLayerGroups,['bottom-1:1/2/3','bottom-2:4/5/6','top-1:7/8/9','top-2:10/11/12']);validatePracticalCommand(layered);
 assert.deepEqual(primary.barLayerGroups,['bottom-1:1/2','top-1:3/4']);
 const primaryPreview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'primary-preview',commands:[{...primary,version:2}]});
 await ctx.call('apply_design_changes',{handle:primaryPreview.handle,requestId:'primary-apply'});
 const source=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'primary-analysis'});
 const baseline=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:source.steps[0].analysisRunId,comboId:'U'}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:baseline.evaluationId,memberId:'AB',barsPerFace:[3],maxCandidates:1,maxMillis:10000});
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'primary-candidate'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'primary-candidate-apply'});
 assert.equal(applied.followUp.status,'completed',JSON.stringify(applied));
 const latest=(await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows.at(-1);
 assert.equal(latest.version,3);assert.equal(latest.bars.length,6);assert.deepEqual(latest.barLayerGroups,increased.barLayerGroups);
 const finalCheck=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).checks.find(c=>c.checkId==='rc-spacing'&&c.entityId==='AB');
 assert.equal(finalCheck.status,'OK');assert.equal(finalCheck.layerMembership.basis,'explicit-design-input');assert.equal(applied.followUp.summary.complete,false);
 console.log('PASS actual typed candidate remaps layer membership through worker, apply and post-review');


 console.log('PASS typed layer and side-bar membership WebMCP schema, partition validation, stored record and edit round trip');
}finally{await ctx.dispose();}
