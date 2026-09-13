import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {resolveMaterialRecord} from '../src/materials/registry.js';
import {practicalCommandFromRecord} from '../src/modeling/practicalInputContract.js';
import {writeFileSync,mkdirSync} from 'node:fs';
const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};
const options={SStructuresCheckpointStorage:storage,SStructuresBuildIdentity:{version:'synthetic-attachment-checkpoint'}};
const ctx=designContext(options),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];
 m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'CT@1',secId:'rc3060'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loadCombinations=[{id:'S',type:'service',name:'S',factors:{D:1}}];
 m.loads=[{id:'N',type:'nodal',node:'B',P:500,dir:'-x',case:'D'},{id:'Y',type:'nodal',node:'B',P:4,dir:'+y',case:'D'},{id:'Z',type:'nodal',node:'B',P:3,dir:'-z',case:'D'}];m.analysisSettings.pDeltaMethod='off';
 const c=resolveMaterialRecord(m,'concrete');
 const material={type:'material-record',name:'Test concrete',kind:'concrete',E:30000,nu:.2,density:2.4,fck:30,sourceReference:'synthetic',edition:'test',sourceNote:'synthetic',basisStatus:'specified',product:'concrete',grade:'C30',id:'CT',version:1,creepCoefficient:2,creepLoadingAgeDays:28,creepEvaluationAgeDays:365,creepElasticModulusAtLoading:30000,creepReference:'synthetic final',creepAttachmentCoefficient:1,creepAttachmentAgeDays:90,creepAttachmentReference:'synthetic attachment'};
 stagePracticalDesignInput(m,material,[]);
 const rt=practicalCommandFromRecord('material-record',resolveMaterialRecord(m,'CT@1'));assert.equal(rt.creepAttachmentCoefficient,1);assert.equal(rt.creepCoefficient,2);
 stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-.2,.2].flatMap(y=>[-.09,.09].map(z=>({y,z,diameter:20}))),sourceNote:'synthetic',concreteWeight:'normal'},[]);
 const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const run=async timeEffect=>ctx.call('run_rc_service_iteration',{inputHash,stiffnessMode:'fully-cracked-elastic',timeEffect,comboIds:['S'],maxRefinements:1,spatialTolerance:.002});
 const a=await run('attachment-effective-modulus'),b=await run('sustained-effective-modulus');assert.equal(a.converged,true,JSON.stringify(a));assert.equal(b.converged,true,JSON.stringify(b));
 const request={inputHash,memberId:'AB',extrema:true,boundary:'cantilever-start',stages:[{iterationId:b.iterationId,comboId:'S',factor:1},{iterationId:a.iterationId,comboId:'S',factor:-1}],postAttachment:{attachmentAgeDays:90,evaluationAgeDays:365,history:'constant-sustained-coeval',limits:{u:.001,v:.001,w:.001},limitReference:'synthetic component limits; not a KDS-derived limit'}};
 const result=await ctx.call('compose_rc_service_stages',request);assert.equal(result.ok,true);assert.equal(result.postAttachmentReview.sourceChronologyChecked,true);
 const As=4*Math.PI*.01**2,Es=resolveMaterialRecord(m,'steel@1').elastic.E;
 const inverse=(Ec,I,steelI)=>1/(1000*(Ec*I+(Es-Ec)*steelI));
 const expected={u:-500*3*(inverse(10000,.18,As)-inverse(15000,.18,As)),v:-3*27/3*(inverse(10000,.3*.6**3/12,As*.2**2)-inverse(15000,.3*.6**3/12,As*.2**2)),w:-4*27/3*(inverse(10000,.6*.3**3/12,As*.09**2)-inverse(15000,.6*.3**3/12,As*.09**2))};
 for(const row of result.postAttachmentReview.checks)assert.ok(Math.abs(row.signedValue-expected[row.axis])<1e-9,JSON.stringify({axis:row.axis,actual:row.signedValue,expected:expected[row.axis]}));
 assert.ok(result.report.content.includes(String(result.postAttachmentReview.checks[0].demand)));
 assert.equal(result.postAttachmentReview.kdsCompliance,'NOT_ESTABLISHED');assert.equal(result.designTransferAllowed,false);
 await assert.rejects(ctx.call('compose_rc_service_stages',{...request,postAttachment:{...request.postAttachment,attachmentAgeDays:100}}),/AGE_MISMATCH/);
 assert.equal(ctx.bridge.getWorkflowInputIdentity().inputHash,inputHash);
 await ctx.bridge.saveWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});
 const restored=designContext(options);
 try{await restored.bridge.restoreWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});const replay=await restored.call('compose_rc_service_stages',request);assert.equal(replay.resultHash,result.resultHash);assert.equal(replay.report.content,result.report.content);}finally{await restored.dispose();}
 mkdirSync('output/phase25',{recursive:true});writeFileSync('output/phase25/rc-attachment-review.json',JSON.stringify(result,null,2));writeFileSync('output/phase25/rc-attachment-review.md',result.report.content);
 console.log('PASS real Worker/WebMCP attachment/final axial-biaxial states, independent composite-beam oracle, report and age rejection');
}finally{await ctx.dispose();}
