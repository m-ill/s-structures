import {REBAR_CATALOG_ID,getRebarProductCatalog} from '../src/materials/rebarProductCatalog.js';
import assert from 'node:assert/strict';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {designContext} from './fixtures/p24/context.js';
const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};
const options={SStructuresCheckpointStorage:storage,SStructuresBuildIdentity:{version:'synthetic-shear-provenance'}};
const ctx=designContext(options),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'C@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:70,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const c=.05+.01/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.18,z:z*.08,diameter:20})));
 const detail={type:'reinforcement-record',id:'R',name:'synthetic anchor column',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupSpacing:400,stirrupLegs:2,strengthStandard:'KDS-142020-2022',concreteWeight:'normal',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',memberRole:'flexural-member',reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-flexural-member',tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03,tieHookTail:.06,tieBendInsideRadius:.02,tieFirstStart:.18,tieFirstEnd:.18,topAnchorBolts:false,anchorBoltTieEnd:'end'};
 stagePracticalDesignInput(m,{type:'section-record',id:'C',name:'240 square',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'synthetic'},[]);
 stagePracticalDesignInput(m,{type:'material-record',id:'SD400',name:'specified test steel',version:1,kind:'steel',E:200000,nu:.3,density:7.85,Fy:400,Fu:560,product:'rebar',grade:'SD400',sourceReference:'synthetic',edition:'test',sourceNote:'not a certificate',basisStatus:'assumed'},[]);
 Object.assign(detail,{barMaterialId:'SD400@1',barCatalogId:REBAR_CATALOG_ID,barProductGrade:'SD400'});detail.bars=detail.bars.map(b=>({...b,diameter:19.1}));
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'catalog-preview',commands:[detail]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'catalog-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'catalog-run'});
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',maxCandidates:3,maxMillis:10000});assert.equal(plan.generation.ok,true,JSON.stringify(plan));assert.deepEqual(plan.generation.regionConstraints[0].diameters,[19.1,22.2,25.4]);assert.deepEqual(plan.generation.sectionCandidates,[null,{B:350,H:500},{B:300,H:550},{B:350,H:550}]);
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'catalog-candidates'});let job;
 for(let i=0;i<700;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'catalog-followup'});assert.equal(applied.followUp.status,'completed');assert.equal(applied.followUp.summary.complete,false);
 const record=(await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0];assert.equal(record.barMaterialId,'SD400@1');assert.equal(record.barProductGrade,'SD400');assert.equal(record.barCatalogId,REBAR_CATALOG_ID);assert.ok(record.bars.some(b=>b.diameter>.0191));
 const catalog=getRebarProductCatalog();for(const b of record.bars){const product=catalog.products.find(p=>p.designation===b.designation);assert.ok(product);assert.ok(Math.abs(b.nominalArea-product.areaMm2/1e6)<1e-12);assert.ok(Math.abs(b.diameter-product.diameterMm/1000)<1e-12);}
 const artifact=await ctx.call('export_design_drawings',{evaluationId:applied.followUp.evaluationId,format:'json'}),chunks=[];let next=0;
 do{const part=await ctx.call('get_design_drawing_artifact',{artifactId:artifact.artifactId,offset:next});chunks.push(Buffer.from(part.content,'base64'));next=part.nextOffset;}while(next!==null);
 const document=JSON.parse(Buffer.concat(chunks).toString()),quantities=document.quantities.filter(q=>q.kind==='longitudinal'&&q.detailId==='R');assert.equal(quantities.length,record.bars.length);assert.ok(quantities.every(q=>q.productCatalogId===REBAR_CATALOG_ID&&q.productVerification==='manufacturer-table-not-certificate'));
 console.log('PASS automatic same-grade catalog size candidates -> applied nominal area/diameter -> WebMCP JSON product provenance');
}finally{await ctx.dispose();}
