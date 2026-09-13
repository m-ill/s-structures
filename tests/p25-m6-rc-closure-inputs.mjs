import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model,multipleRegions=process.env.P25_MINIMUM_REGIONS==='1',cageOnly=process.env.P25_CAGE_ONLY==='1'||process.env.P25_CAGE_SUPPORT==='1',cageSupport=process.env.P25_CAGE_SUPPORT==='1',longTerm=process.env.P25_LONGTERM_CLOSURE==='1'||process.env.P25_DEFLECTION_REPAIR==='1',deflectionRepair=process.env.P25_DEFLECTION_REPAIR==='1';
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];
m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',name:'D',type:'dead'},{id:'L',name:'L',type:'live'}];
m.loads=[{id:'FD',type:'nodal',node:'B',P:1,dir:'-z',case:'D'},{id:'FL',type:'nodal',node:'B',P:1,dir:'-z',case:'L'}];
m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.2,L:1.6}},{id:'S',name:'S',type:'service',factors:{D:1,L:1}},{id:'LIVE',name:'LIVE',type:'service',factors:{L:1}},{id:'DEAD',name:'DEAD',type:'service',factors:{D:1}}];
m.analysisCases=m.loadCombinations.map(c=>({id:'E-'+c.id,name:c.id,kind:'static',status:'not-run',settings:{comboId:c.id,pDeltaMethod:'off'}}));
const command={stirrupAreaBasis:'specified-nominal',stirrupNominalAreaMm2:71.33,stirrupProductReference:'synthetic D10 sheet',stirrupProductEdition:'fixture-1',stirrupProductGrade:'test-grade',strengthStandard:'KDS-142020-2022',stabilityStandard:'KDS-142020-2022',stabilitySystem:'braced-column',stabilityClassificationReference:'synthetic restrained column classification',torsionStandard:'KDS-142022-2022',concreteWeight:'normal',spacingStandard:'KDS-142050-2022',aggregateMaxSize:0.02,coverStandard:'KDS-142050-2022',coverExposure:'indoor',chlorideExposure:'none',fireCoverRequired:0,abrasionCoverRequired:0,confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-tied-column',tieClosure:'standard-135',tieHookTail:0.06,tieBendInsideRadius:0.02,tieFirstStart:0.075,tieFirstEnd:0.075,topAnchorBolts:false,type:'reinforcement-record',id:'R',name:'synthetic nominal product',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',sourceNote:'synthetic test only',barAreaBasis:'specified-nominal',barProductReference:'synthetic product sheet',barProductEdition:'fixture-1',barProductGrade:'test-grade',memberRole:'compression-member',detailingStandard:'KDS-142020-2022',lapRequired:false,reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*0.2,z:z*0.08,diameter:19.1,nominalAreaMm2:286.5,designation:'TEST19'})))};
Object.assign(command,{memberRole:'flexural-member',confinementSystem:'ordinary-flexural-member',tieClosureCorner:'+y+z',tieClosureSeparation:0,
 shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',
 anchorageStandard:'KDS-142052-2024',anchorageMode:'straight-tension',barPosition:'other',barCoating:'uncoated',
 startFabricationShape:'straight',endFabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04,anchorageStartCriticalX:0,anchorageEndCriticalX:3,startExtension:1.04,endExtension:1.04,
 crackControlStandard:'KDS-142020-2022',crackEnvironment:'other',crackSpecialRequirements:'ordinary-no-special-water-or-appearance',temperatureReinforcementRequired:false,
 serviceabilityMode:'instant-live-curvature',serviceBoundary:'cantilever-start',serviceDeflectionLimit:'live-floor',serviceCrackingComboId:'S',serviceBaselineComboId:'DEAD'});
if(cageOnly)command.tieClosureSeparation=.03;
if(cageOnly)command.bars=command.bars.map(b=>({...b,diameter:25.4,nominalAreaMm2:506.7,designation:'TEST25'}));
if(process.env.P25_LAYER_CAGE==='1')command.barLayerGroups=['bottom-1:1/2','top-1:3/4'];
if(cageSupport){const {memberCandidateCommands}=await import('../src/design/rc/memberCandidateCommands.js');Object.assign(command,memberCandidateCommands(m,[command],{perimeterYCount:2,perimeterZCount:2,crossTieCageFit:'separate',closureBarFit:'contact'}).commands[0]);}
if(longTerm)Object.assign(command,{serviceabilityMode:'long-term-curvature',nonstructuralDamageSensitive:true,serviceSustainedComboId:'DEAD',serviceDurationMonths:60,serviceLoadSequence:'sustained-before-attachment',servicePreAttachmentMultiplier:0});
if(deflectionRepair)m.loads.forEach(load=>load.P=100);
const inputCommands=multipleRegions?[{...command,end:.5,anchorageEndCriticalX:1.5},{...command,id:'R2',start:.5,anchorageEndCriticalX:1.5}]:[command];
try {
 const {validateModel}=await import('../src/core/validation.js');assert.equal(validateModel(m).ok,true);
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'closure-input',commands:inputCommands});assert.equal(preview.ok,true,JSON.stringify(preview));
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'closure-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:m.analysisCases.map(c=>c.id)}),requestId:'closure-source'});assert.equal(run.ok,true,JSON.stringify(run));
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:run.steps.map(s=>({analysisRunId:s.analysisRunId,comboId:m.analysisCases.find(c=>c.id===s.caseId).settings.comboId}))});
 let offset=0,checks=[];do{const page=await ctx.call('get_practical_design_result',{evaluationId:evaluated.evaluationId,offset,limit:50});checks.push(...page.checks);offset=page.nextOffset;}while(offset!==null);
 const rc=checks.filter(c=>c.entityId==='AB');
 assert.ok(rc.length>=14);assert.ok(rc.every(c=>c.reason!=='DESIGN_STANDARD_SELECTION_REQUIRED'));
 console.log('RC_CLOSURE '+JSON.stringify(rc.map(c=>({comboId:c.comboId,checkId:c.checkId,status:c.status,reason:c.reason,incomplete:c.incomplete,codeBasisStatus:c.codeBasis?.status}))));
 assert.equal(evaluated.summary.complete,false,'no project/foundation qualification is inferred from selected RC rules');
 
 if(!deflectionRepair)assert.equal(rc.find(c=>c.comboId==='U'&&c.checkId==='rc-section-strength').status,'OK');
 assert.equal(rc.find(c=>c.comboId==='U'&&c.checkId==='rc-reinforcement-ratio').status,cageOnly?'OK':'NG');
 if(cageOnly)assert.equal(rc.find(c=>c.comboId==='U'&&c.checkId==='rc-confinement').reason,cageSupport?'RECTANGULAR_TIE_REQUIREMENT_NOT_SATISFIED':'SPATIAL_HOOP_LONGITUDINAL_COLLISION');
 let plan=await ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',maxCandidates:cageSupport?3:1,maxMillis:10000});
 if(multipleRegions)assert.deepEqual(plan.generation.regionConstraints.map(r=>r.detailId).sort(),['R','R2']);
 assert.ok(plan.generation.basisCheckIds,JSON.stringify(plan.generation));
 assert.ok(plan.generation.basisCheckIds.includes(rc.find(c=>c.comboId==='U'&&c.checkId===(cageOnly?'rc-confinement':'rc-reinforcement-ratio')).id));
 if(deflectionRepair){
  const service=rc.find(c=>c.comboId==='LIVE'&&c.checkId==='rc-deflection');assert.equal(service.status,'NG',JSON.stringify(service));assert.ok(plan.generation.basisCheckIds.includes(service.id));
  const section=plan.generation.sectionCandidates.find(c=>c&&c.H>600);assert.ok(section);
  plan=await ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',sectionCandidates:[section],maxCandidates:1,maxMillis:10000});
 }
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'minimum-repair'});
 let job;for(let i=0;i<1200;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.equal(job.stageTiming.activeStage,null);assert.ok(job.stageTiming.durationsMs.geometry>0);assert.ok(job.stageTiming.durationsMs.evaluation>0);

 if(cageSupport){
  assert.equal(job.best.reinforcementChangeCount,1);let content='',at=0,hash;
  do{const page=await ctx.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:job.best.candidateId,offset:at,limit:4096});assert.ok(!hash||hash===page.detailHash);hash=page.detailHash;content+=page.chunk;at=page.nextOffset;}while(at!==null);
  const change=JSON.parse(content).reinforcementChanges[0];
  assert.equal(change.before.version,command.version);assert.equal(change.after.version,command.version+1);
  assert.equal(change.before.bars.length,4);assert.ok(change.after.bars.length>4);
  assert.ok(change.before.bars.every(b=>Math.abs(b.diameter-25.4)<1e-10));assert.ok(change.after.bars.every(b=>Math.abs(b.diameter-25.4)<1e-10));
  assert.ok(change.changedFields.includes('bars'));assert.ok(change.changedFields.includes('crossTieBarPairs'));assert.equal(change.geometryQualified,false);
 }
 const outcome=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'minimum-repair-apply'});
 assert.equal(outcome.ok,true,JSON.stringify(outcome));assert.equal(outcome.followUp.status,'completed');
 const post=[];offset=0;do{const page=await ctx.call('get_practical_design_result',{evaluationId:outcome.followUp.evaluationId,offset,limit:50});post.push(...page.checks);offset=page.nextOffset;}while(offset!==null);
 const ratio=post.find(c=>c.entityId==='AB'&&c.comboId==='U'&&c.checkId==='rc-reinforcement-ratio');
 if(multipleRegions){assert.equal(ratio.reinforcementRepairRegions.length,2);assert.ok(ratio.reinforcementRepairRegions.every(r=>r.detailVersion===2&&!r.needsRepair&&!r.blocked));}
 if(!deflectionRepair){assert.equal(ratio.status,'OK',JSON.stringify(ratio));assert.equal(ratio.codeBasis.status,'CLAUSE_APPLIED');}
 if(cageOnly){const confinement=post.find(c=>c.entityId==='AB'&&c.comboId==='U'&&c.checkId==='rc-confinement');let text='',cursor=0;do{const page=await ctx.call('get_practical_design_check',{evaluationId:outcome.followUp.evaluationId,checkId:confinement.id,offset:cursor,limit:8000});text+=page.chunk;cursor=page.nextOffset;}while(cursor!==null);const full=JSON.parse(text);assert.equal(full.outerHoop.actualPathAssembly.status,'OK',JSON.stringify(full.outerHoop.actualPathAssembly));if(cageSupport){assert.equal(full.supports.status,'OK',JSON.stringify(full.supports));assert.equal(full.outerHoop.closureGeometry.assemblyStatus,'OK');assert.ok(full.checks.every(c=>c.status!=='NG'&&(c.ratio??0)<=1+1e-10));assert.equal(confinement.status,'OK',JSON.stringify(full.readiness));assert.equal(confinement.reason,null);assert.ok(full.readiness.every(r=>r.status==='OK'||r.status==='N_A'));assert.equal(full.methodReviewRequired,true);assert.equal(full.fabricationApproved,false);}else{assert.equal(confinement.status,'NG');assert.ok(full.checks.some(c=>c.kind==='supported-bar-clearance'&&c.status==='NG'),'remaining clearance NG must not be suppressed');}const changed=m.designDetails.reinforcement.find(r=>r.id==='R'&&r.version===command.version+1);if(cageSupport)assert.ok(changed.bars.length>4&&changed.crossTieBarPairs.length>0);else assert.equal(changed.bars.length,4);assert.ok(changed.bars.every(b=>b.diameter===.0254));}
 if(longTerm){const service=post.find(c=>c.entityId==='AB'&&c.comboId==='LIVE'&&c.checkId==='rc-deflection');if(deflectionRepair){const before=rc.find(c=>c.comboId==='LIVE'&&c.checkId==='rc-deflection');assert.ok(service.demand<before.demand);assert.ok(job.best.analysisProof?.length>0);}else assert.equal(service.status,'OK',JSON.stringify(service));assert.equal(service.codeBasis.status,'CLAUSE_APPLIED');assert.equal(service.sustainedComboId,'DEAD');assert.ok(service.multiplier>0);}
 assert.equal(outcome.followUp.summary.complete,false);
 const {readJsonRecord}=await import('../src/ui/jsonRecordReader.js');
 const query=outcome.followUp.comparison.comparisonDetailQuery;
 const completeComparison=query?(await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:query.evaluationId,checkId:query.checkId,...args}))).value:outcome.followUp.comparison;
 const remaining=completeComparison.completionBlockers;
 if(process.env.P25_LAYER_CAGE==='1'){assert.equal(remaining.inputActions.rows.length,1);assert.deepEqual(remaining.inputActions.rows[0].target,{type:'foundation-record',nodeId:'A'});assert.equal(remaining.inputActions.rows[0].affectedCheckCount,remaining.counts.input);assert.ok(!remaining.rows.some(r=>r.entityId==='AB'),JSON.stringify(remaining.rows.filter(r=>r.entityId==='AB')));assert.equal(post.find(r=>r.entityId==='AB'&&r.comboId==='U'&&r.checkId==='rc-spacing').status,'OK');}
 if(process.env.P25_REPORT_BLOCKERS==='1'){
  console.log('POST_APPLY_BLOCKERS '+JSON.stringify(remaining));
  const snapshot=ctx.bridge.getPracticalDesignSnapshot(outcome.followUp.evaluationId);
  console.log('POST_APPLY_SPACING '+JSON.stringify({check:snapshot.checks.find(r=>r.checkId==='rc-spacing'&&r.comboId==='U'),reinforcement:m.designDetails.reinforcement.filter(r=>r.id==='R').at(-1)}));
  const spacing=snapshot.checks.find(r=>r.checkId==='rc-spacing'&&r.comboId==='U');
  if(spacing.checks.some(c=>c.kind==='layer-alignment'&&c.status==='NG')){assert.equal(spacing.ratio,null);assert.ok(Number.isFinite(spacing.maximumClearanceRatio));}
 }
 assert.ok(remaining.total>0,'post-apply receipt must expose remaining blockers');
 assert.equal(remaining.automaticInputSelectionAllowed,false);
 assert.ok(remaining.rows.some(r=>r.requiredInputRecords.some(t=>t.type==='foundation-record')),'remaining missing foundation must identify its input target');
 if(!deflectionRepair)assert.ok(!remaining.rows.some(r=>r.checkId==='rc-reinforcement-ratio'&&r.status==='NG'),'repaired minimum steel must not reuse candidate baseline blockers');

 console.log(deflectionRepair?'PASS recorded deflection NG activates automatic section alternatives; selected depth increase reanalyzes and reduces stored deflection':cageSupport?'PASS supported-bar clearance repaired with actual cross ties; all declared hoop checks OK; independent method and fabrication qualification remain separate':cageOnly?'PASS actual cage collision repaired at unchanged bar count/diameter; remaining KDS supported-bar clearance NG preserved':'PASS minimum reinforcement NG with passing strength generates an actual typed candidate, applies and becomes KDS OK; unresolved checks remain');

}finally{await ctx.dispose();}
