import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {profileLoadScopeHash} from '../src/design/evaluation/projectProfile.js';
import {PRACTICAL_RULE_PACK_HASH} from '../src/metadata/practicalRuleImplementations.js';
import {LOAD_FAMILIES} from '../src/loads/loadCaseMetadata.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 m.loadCases=[{id:'D',name:'D',type:'dead'},{id:'L',name:'L',type:'live'}];m.loads=[{id:'D1',type:'nodal',node:'B',P:10,dir:'-x',case:'D'},{id:'L1',type:'nodal',node:'B',P:10,dir:'-x',case:'L'}];m.analysisSettings.selfWeight=false;
 m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.2,L:1.6}},{id:'TOTAL',name:'TOTAL',type:'service',factors:{D:1,L:1}},{id:'LIVE',name:'LIVE',type:'service',factors:{L:1}},{id:'SUST',name:'SUST',type:'service',factors:{D:1,L:.5}}];
 m.analysisCases=m.loadCombinations.map(c=>({id:'E-'+c.id,name:c.id,kind:'static',status:'not-run',settings:{comboId:c.id,pDeltaMethod:'off'}}));
 const section={type:'section-record',id:'S',name:'240 square synthetic',version:1,shape:'RECT',B:240,H:240,dimensionUnit:'mm',sourceNote:'numerical integration fixture'};
 const corner=.05+.01/Math.sqrt(2);
 const reinforcement={type:'reinforcement-record',id:'R',name:'ordinary beam synthetic',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*corner,z:z*corner,diameter:20}))),stirrupDiameter:10,stirrupSpacing:100,stirrupLegs:2,reinforcementForm:'single-deformed',sourceNote:'explicit synthetic engineering assumptions; not a building',strengthStandard:'KDS-142020-2022',detailingStandard:'KDS-142020-2022',memberRole:'compression-member',stabilityStandard:'KDS-142020-2022',stabilitySystem:'braced-column',stabilityClassificationReference:'synthetic restrained member classification',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',stirrupForm:'closed-rectangular-two-leg',concreteWeight:'normal',torsionStandard:'KDS-142022-2022',coverStandard:'KDS-142050-2022',coverExposure:'indoor',chlorideExposure:'none',fireCoverRequired:0,abrasionCoverRequired:0,spacingStandard:'KDS-142050-2022',aggregateMaxSize:.02,confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-tied-column',topAnchorBolts:false,tieClosure:'standard-135',tieHookTail:.075,tieBendInsideRadius:.02,tieFirstStart:.05,tieFirstEnd:.05,anchorageStandard:'KDS-142052-2024',anchorageMode:'straight-tension',barPosition:'other',barCoating:'uncoated',lapRequired:false,startFabricationShape:'straight',endFabricationShape:'straight',startExtension:1.04,endExtension:1.04,endSetbackStart:.04,endSetbackEnd:.04,anchorageStartCriticalX:0,anchorageEndCriticalX:3,crackControlStandard:'KDS-142030-2021-appendix',crackWidthEnvironment:'dry',crackEffectiveTensileStrength:3,crackTensileStrengthReference:'specified synthetic input 3MPa',crackEvaluationFactor:1.7,crackSustainedLoadReference:'synthetic specified permanent action',crackEnvironment:'dry',crackSpecialRequirements:'ordinary-no-special-water-or-appearance',temperatureReinforcementRequired:false,serviceabilityMode:'long-term-curvature',serviceBoundary:'cantilever-start',serviceDeflectionLimit:'live-floor',serviceCrackingComboId:'TOTAL',serviceSustainedComboId:'SUST',serviceDurationMonths:60,serviceLoadSequence:'sustained-before-attachment',nonstructuralDamageSensitive:true};
 const profile={type:'design-profile-record',id:'P',name:'isolated beam integration scope',version:1,structuralSystem:'ordinary-rc-frame',construction:'cast-in-place',concreteWeight:'normal',sectionScope:'rectangular-single-bars',stiffnessBasis:'gross-section-only',requiredFamilies:['D','L'],excludedFamilies:LOAD_FAMILIES.filter(f=>!['D','L'].includes(f)),confirmedCaseIds:['D','L'],loadScopeHash:profileLoadScopeHash(m),decisionReference:'synthetic single beam without lateral environmental loading; not building qualification',rulePackHash:PRACTICAL_RULE_PACK_HASH};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'complete-profile',commands:[section,{type:'member-assignment',memberIds:['AB'],secId:'S@1'},reinforcement,profile]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'complete-profile-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:m.analysisCases.map(c=>c.id)}),requestId:'complete-profile-analysis'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:run.steps.map(step=>({analysisRunId:step.analysisRunId,comboId:step.caseId.slice(2)}))});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId),memberChecks=snapshot.checks.filter(c=>c.entityId==='AB');
 const expected=['rc-section-strength','rc-stability','rc-shear-y','rc-shear-z','rc-spacing','rc-cover','rc-reinforcement-ratio','rc-confinement','rc-anchorage','rc-splices','rc-deflection','rc-serviceability','rc-torsion','rc-code-compliance'];
 assert.equal(memberChecks.length,56);
 for(const combo of ['U','LIVE','TOTAL','SUST'])assert.deepEqual(memberChecks.filter(c=>c.comboId===combo).map(c=>c.checkId).sort(),[...expected].sort());

 assert.equal(snapshot.summary.combinationCoverage.projectProfile.status,'OK');

 assert.equal(snapshot.summary.complete,false,'a member check is not foundation/project qualification');

 const strength=memberChecks.find(c=>c.comboId==='U'&&c.checkId==='rc-section-strength');
 assert.equal(strength.status,'NG');assert.equal(strength.reason,'MINIMUM_TENSION_STRAIN_NOT_SATISFIED');
 const stability=memberChecks.find(c=>c.comboId==='U'&&c.checkId==='rc-stability');
 assert.equal(stability.status,'OK');assert.ok(stability.codeReferences.some(r=>r.clause.includes('4.4.6')));
 const deflection=memberChecks.find(c=>c.comboId==='LIVE'&&c.checkId==='rc-deflection');
 assert.equal(deflection.status,'NOT_CHECKED');assert.equal(deflection.reason,'UNIAXIAL_FLEXURE_WITHOUT_AXIAL_FORCE_REQUIRED');
 assert.equal(deflection.requestedServiceabilityMode,'long-term-curvature');assert.equal(deflection.prerequisiteStage,'regional-source-applicability');assert.ok(deflection.codeReferences.some(r=>r.clause.includes('4.2-1..4')));
 const width=memberChecks.find(c=>c.comboId==='SUST'&&c.checkId==='rc-serviceability');
 assert.equal(width.status,'OK');assert.equal(width.demand,0);assert.equal(width.tensileZone,false);
 assert.ok(width.codeBasis.blockers.includes('METHOD_REVIEW_REQUIRED'));
 for(const combo of ['LIVE','SUST'])assert.equal(memberChecks.find(c=>c.comboId===combo&&c.checkId==='rc-code-compliance').status,'NOT_CHECKED');
 assert.equal(memberChecks.find(c=>c.comboId==='U'&&c.checkId==='rc-code-compliance').status,'NG');
 assert.ok(memberChecks.every(c=>c.status!=='FAILED'));
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.ok,true,JSON.stringify(plan));
 assert.ok(plan.generation.sectionCandidates.length,'strain NG retains section alternatives');
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'strain-candidate'});
 let job;
 for(let i=0;i<700;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.notEqual(job.status,'running');
 assert.equal(job.candidateCount,1);assert.ok(job.best);assert.equal(job.best.impact,'REANALYSIS_REQUIRED');assert.equal(job.candidates[0].analysisProofCount,4);assert.equal(job.best.summary.complete,false);
 assert.equal(job.best.engineeringSeverity.version,'p25-candidate-severity-v3-strain-deficit');
 const {mkdirSync,writeFileSync}=await import('node:fs');
 mkdirSync('output/phase25',{recursive:true});
 writeFileSync('output/phase25/column-profile-audit.json',JSON.stringify({scope:'synthetic prescribed restrained axial member; not whole profile qualification',evaluatorVersion:snapshot.evaluatorVersion,inputHash:snapshot.inputHash,candidate:{generation:plan.generation,job},checks:memberChecks.map(c=>({combo:c.comboId,check:c.checkId,status:c.status,reason:c.reason,incomplete:c.incomplete})),strength,stability,deflection,width},null,2));
 console.log('PASS 56 required column checks: low-axial strain NG, axial long-term method NC, no-tension width and method-review blocker preserved');
}finally{await ctx.dispose();}
