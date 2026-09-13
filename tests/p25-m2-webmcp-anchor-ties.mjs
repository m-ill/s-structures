import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'C@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:10,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const c=.05+.01/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*c,z:z*c,diameter:20})));
 const detail={type:'reinforcement-record',id:'R',name:'synthetic anchor column',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupSpacing:100,stirrupLegs:2,memberRole:'compression-member',reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-tied-column',tieClosure:'standard-135',tieHookTail:.06,tieBendInsideRadius:.02,tieFirstStart:.05,tieFirstEnd:.05,topAnchorBolts:true,anchorBoltTieEnd:'end'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'anchor-preview',commands:[{type:'section-record',id:'C',name:'240 square',version:1,shape:'RECT',dimensionUnit:'mm',B:240,H:240,sourceNote:'synthetic'},detail]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'anchor-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'anchor-run'});
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const check=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId).checks.find(c=>c.checkId==='rc-confinement');
 assert.equal(check.status,'NG',JSON.stringify(check));assert.equal(check.anchorBoltTies.checks[0].required,3);assert.equal(check.anchorBoltTies.checks[0].provided,1);
 assert.equal((await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0].anchorBoltTieEnd,'end');
 const plan=await ctx.call('plan_design_candidates',{evaluationId:result.evaluationId,memberId:'AB',regionConstraints:[{detailId:'R',spacings:[40],tieFirstStarts:[.02],tieFirstEnds:[.02]}],maxCandidates:1,maxMillis:10000});
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'anchor-repair'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const receipt=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'anchor-repair-apply'});assert.equal(receipt.followUp.status,'completed');
 const after=ctx.bridge.getPracticalDesignSnapshot(receipt.followUp.evaluationId).checks.find(c=>c.checkId==='rc-confinement');
 assert.equal(after.status,'OK',JSON.stringify(after));assert.equal(after.anchorBoltTies.checks[0].provided,3);
 const record=(await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows.find(r=>r.version===2);assert.equal(record.tieFirstStart,.02);assert.equal(record.tieFirstEnd,.02);assert.equal(record.stirrups.spacing,.04);
 const front=await ctx.call('export_design_drawings',{evaluationId:receipt.followUp.evaluationId,format:'svg',page:0});
 assert.equal(front.retainedPages,1);assert.ok(front.totalPages>1);
 const last=await ctx.call('export_design_drawings',{evaluationId:receipt.followUp.evaluationId,format:'svg',page:front.totalPages-1});
 assert.equal(last.retainedPages,1);assert.equal(last.totalPages,front.totalPages);assert.notEqual(last.artifactId,front.artifactId);
 const chunk=await ctx.call('get_design_drawing_artifact',{artifactId:last.artifactId});assert.ok(Buffer.from(chunk.content,'base64').toString().startsWith('<svg'));
 const json=await ctx.call('export_design_drawings',{evaluationId:receipt.followUp.evaluationId,format:'json'});
 const chunks=[];let offset=0;
 do{const row=await ctx.call('get_design_drawing_artifact',{artifactId:json.artifactId,offset});chunks.push(Buffer.from(row.content,'base64'));offset=row.nextOffset;}while(offset!==null);
 const bytes=Buffer.concat(chunks),document=JSON.parse(bytes.toString('utf8'));
 assert.equal(bytes.length,json.byteLength);assert.equal(document.totalPages,front.totalPages);assert.equal(document.pages.length,front.totalPages);
 assert.deepEqual(bytes,Buffer.from(JSON.stringify(document,null,2)));
 console.log('PASS actual WebMCP declared anchor end, tie distribution and KDS count result');
}finally{await ctx.dispose();}
