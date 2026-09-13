import {createPracticalWorkflowService,PRACTICAL_WORKFLOW_VERSION} from '../src/compute/product/practicalWorkflowService.js';
import {stableHash} from '../src/core/stableHash.js';
import {sectionStressBlockResponse} from '../src/design/rc/providedSection.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {practicalCommandFromFields,practicalCommandFromRecord} from '../src/modeling/practicalInputContract.js';
import {validateStoredDesignDetails} from '../src/modeling/designDetailValidation.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];
m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];
m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];
const command={stirrupAreaBasis:'specified-nominal',stirrupNominalAreaMm2:71.33,stirrupProductReference:'synthetic D10 sheet',stirrupProductEdition:'fixture-1',stirrupProductGrade:'test-grade',strengthStandard:'KDS-142020-2022',stabilityStandard:'KDS-142020-2022',stabilitySystem:'braced-column',stabilityClassificationReference:'synthetic restrained column classification',torsionStandard:'KDS-142022-2022',concreteWeight:'normal',spacingStandard:'KDS-142050-2022',aggregateMaxSize:0.02,coverStandard:'KDS-142050-2022',coverExposure:'indoor',chlorideExposure:'none',fireCoverRequired:0,abrasionCoverRequired:0,confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-tied-column',tieClosure:'standard-135',tieHookTail:0.06,tieBendInsideRadius:0.02,tieFirstStart:0.075,tieFirstEnd:0.075,topAnchorBolts:false,type:'reinforcement-record',id:'R',name:'synthetic nominal product',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',sourceNote:'synthetic test only',barAreaBasis:'specified-nominal',barProductReference:'synthetic product sheet',barProductEdition:'fixture-1',barProductGrade:'test-grade',memberRole:'compression-member',detailingStandard:'KDS-142020-2022',lapRequired:false,reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*0.2,z:z*0.08,diameter:19.1,nominalAreaMm2:286.5,designation:'TEST19'})))};
try {
 const schema=await ctx.call('get_design_input_schema',{type:'reinforcement-record'});
 assert.ok(schema.schema.properties.barAreaBasis,'actual WebMCP schema exposes nominal area basis');
 const form=practicalCommandFromFields(command.type,{...command,bars:command.bars.map(b=>[b.y,b.z,b.diameter,b.nominalAreaMm2,b.designation].join(',')).join('\n')});
 assert.deepEqual(form,command);
 const plan=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'nominal-preview',commands:[command]});
 assert.equal((await ctx.call('apply_design_changes',{handle:plan.handle,requestId:'nominal-apply'})).ok,true);
 const record=(await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0];
 assert.equal(record.areaBasis,'specified-nominal');
 assert.equal(record.stirrups.area,71.33/1e6);
 assert.equal(record.bars[0].area,286.5/1e6);
 assert.notEqual(record.bars[0].area,record.bars[0].geometricArea);
 assert.equal(record.bars[0].nominalArea,record.bars[0].area);
 const tension=sectionStressBlockResponse({B:0.3,H:0.6},record.bars,{fc:24,fy:400,Es:200000},{alpha:0.85,beta:0.8,epscu:0.0033},0,1e-9);
 assert.ok(Math.abs(tension.N-(4*286.5/1e6*400*1000-0.85*24*tension.compressionArea*1000))<1e-9,'strength kernel uses the same nominal area');
 assert.deepEqual(practicalCommandFromRecord(command.type,record),command);
 assert.deepEqual(validateStoredDesignDetails(m),[]);
 const altered=structuredClone(m);altered.designDetails.reinforcement[0].bars[0].area*=2;
 assert.ok(validateStoredDesignDetails(altered).length,'tampered effective area cannot survive stored-record validation');
 for(const bad of [{...command,barProductReference:undefined},{...command,bars:command.bars.map(({nominalAreaMm2,...b})=>b)}])assert.throws(()=>practicalCommandFromFields(command.type,bad));
 m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'nominal-run'});
 assert.equal(run.ok,true);
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 let nextOffset=evaluated.nextOffset;
 while(nextOffset!==null){const page=await ctx.call('get_practical_design_result',{evaluationId:evaluated.evaluationId,offset:nextOffset});evaluated.checks.push(...page.checks);nextOffset=page.nextOffset;}
 for(const id of ['rc-cover','rc-spacing','rc-torsion','rc-stability'])assert.equal(evaluated.checks.find(x=>x.checkId===id).status,'OK');
 assert.equal(evaluated.checks.find(x=>x.checkId==='rc-confinement').status,'NG','corner support spacing needs additional ties');
 assert.equal(evaluated.checks.find(x=>x.checkId==='rc-stability').codeBasis.status,'CLAUSE_APPLIED');
 assert.ok(evaluated.checks.find(x=>x.checkId==='rc-stability').strengthDemandPrepared);
 const strength=evaluated.checks.find(x=>x.checkId==='rc-section-strength');assert.ok(['OK','NG'].includes(strength.status));assert.ok(strength.concurrentDemand.stability);
 assert.ok(Math.abs(strength.concurrentDemand.My)>0&&Math.abs(strength.concurrentDemand.Mz)>0);
 const ratio=evaluated.checks.find(x=>x.checkId==='rc-reinforcement-ratio');
 assert.equal(ratio.status,'NG');
 assert.equal(ratio.steelArea,4*286.5/1e6);
 assert.equal(ratio.codeBasis.status,'CLAUSE_APPLIED');
 assert.equal(ratio.productBasis.verification,'user-specified-not-independently-qualified');
 const drawings=buildDetailDrawings(ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId));
 const q=drawings.quantities.find(x=>x.kind==='longitudinal');assert.equal(q.area,286.5/1e6);assert.equal(q.designation,'TEST19');assert.equal(q.productReference,command.barProductReference);
 await assert.rejects(ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',diameters:[25],spacings:[150]}),/NOMINAL_PRODUCT_CANDIDATE_REQUIRED/);
 const candidatePlan=await ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',spacings:[100],covers:[.05],barsPerFace:[3],maxCandidates:1});
 assert.equal(candidatePlan.ok,true,'spacing edits preserve nominal product');
 const started=await ctx.call('start_design_candidates',{planId:candidatePlan.planId,requestId:'nominal-candidate'});let job;
 for(let i=0;i<100;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.best.changes.cover,.05);assert.equal(job.best.changes.barsPerFace,3);assert.equal(job.status,'NEEDS_INPUT');assert.ok(job.best,'spacing candidate remains evaluable');
 const restored=createPracticalWorkflowService({bridge:ctx.bridge});
 try {const saved=ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId);saved.evaluatorVersion='p25-practical-evaluation-v1';const body={version:PRACTICAL_WORKFLOW_VERSION,evaluations:[[saved.id,saved]],plans:[],jobs:[],applications:[]};assert.equal(restored.restoreState({...body,checksum:stableHash(body)}).ok,true);assert.equal(restored.getEvaluation({evaluationId:saved.id}).stale,true,'prior evaluator snapshots restore only as stale');}finally{restored.dispose();}
 // Restore analysis input so the independent input undo remains revision-bound.
 m.analysisCases=[];
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).ok,true);
 console.log('PASS nominal/geometric areas, source requirements, shared UI/WebMCP, tamper guard and undo');
}finally{await ctx.dispose();}
