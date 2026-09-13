import assert from 'node:assert/strict';
import {baseFrictionBounds} from '../src/design/foundation/baseFrictionBounds.js';
const contact={ok:true,polygon:[[-1,-1],[1,-1],[1,1],[-1,1]],pressurePlane:[25,0,0]};
const args={contact,normal:100,friction:.5,Hx:0,Hy:0,torsion:20};
const pure=baseFrictionBounds(args);assert.equal(pure.status,'CALCULATED');assert.equal(pure.mechanicsStatus,'FEASIBLE_BOUND');assert.ok(Math.abs(pure.torsionLowerCapacity-25)<1e-9);assert.equal(pure.translationCapacity,50);
assert.equal(baseFrictionBounds({...args,torsion:40}).mechanicsStatus,'UNRESOLVED');
assert.equal(baseFrictionBounds({...args,torsion:100}).mechanicsStatus,'NG');
assert.equal(baseFrictionBounds({...args,Hx:51,torsion:0}).mechanicsStatus,'NG');
const combined=baseFrictionBounds({...args,Hx:10,torsion:10});assert.ok(Math.abs(combined.sufficientUtilization-.6)<1e-9);
const shifted={...contact,polygon:contact.polygon.map(([x,y])=>[x+2,y-3])};
const shift=baseFrictionBounds({...args,contact:shifted,Hx:10,Hy:5,torsion:20+2*5+3*10});
const origin=baseFrictionBounds({...args,Hx:10,Hy:5});assert.ok(Math.abs(shift.sufficientUtilization-origin.sufficientUtilization)<1e-9);
assert.equal(baseFrictionBounds({...args,normal:90}).status,'NOT_CHECKED');
assert.equal(baseFrictionBounds({...args,friction:0,torsion:0}).mechanicsStatus,'FEASIBLE_BOUND');
assert.equal(baseFrictionBounds({...args,friction:0}).mechanicsStatus,'NG');
assert.equal(pure.capacityQualified,false);
console.log('PASS friction capacity bounds, conservative unresolved region, eccentric resultant shift and missing normal equilibrium');

const triangular=baseFrictionBounds({...args,normal:50,contact:{ok:true,polygon:[[0,0],[2,0],[0,2]],pressurePlane:[25,0,0]},torsion:5});
assert.equal(triangular.status,'CALCULATED');assert.ok(Math.abs(triangular.pressureCentroid[0]-2/3)<1e-12);
for(const couple of triangular.couples){assert.ok(Math.abs(couple.positiveNormal*couple.positiveTractionFraction-couple.negativeNormal*couple.negativeTractionFraction)<1e-10);assert.ok(couple.positiveTractionFraction<=1&&couple.negativeTractionFraction<=1);}
const scaled=baseFrictionBounds({...args,contact:{...contact,polygon:contact.polygon.map(p=>p.map(x=>x*1000)),pressurePlane:[25/1e6,0,0]},torsion:20000});assert.ok(Math.abs(scaled.sufficientUtilization-pure.sufficientUtilization)<1e-9);
assert.equal(baseFrictionBounds({...args,contact:{...contact,polygon:[[0,0],[2,0],[.1,.1],[0,2]]}}).status,'NOT_CHECKED');
const {designContext}=await import('./fixtures/p24/context.js');const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loads=[{id:'P',type:'nodal',node:'B',P:100,dir:'-z',case:'D'},{id:'T',type:'nmoment',node:'B',M:10,dir:'+z',case:'D'}];m.loadCombinations=[{id:'S',name:'S',type:'service',factors:{D:1}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'S',pDeltaMethod:'off'}}];
 const commands=[{type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'synthetic only',sourceReference:'fixture',basisStatus:'specified',allowableBearing:200,bearingBasis:'gross',friction:.5},{type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'synthetic only',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3}];
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'friction-preview',commands});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'friction-input'})).ok,true);
 const evaluate=async key=>{const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:key});assert.equal(run.ok,true);const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'S'}]});return {result,check:ctx.bridge.getPracticalDesignSnapshot(result.evaluationId).checks.find(c=>c.checkId==='foundation-sliding')};};
 const first=await evaluate('friction-small');assert.equal(first.check.status,'NOT_CHECKED');assert.equal(first.check.baseFriction.mechanicsStatus,'FEASIBLE_BOUND');assert.equal(first.check.codeBasis.status,'NOT_ESTABLISHED');assert.ok(first.check.codeBasis.reviewTargets.length>0);
 let text='',offset=0;do{const page=await ctx.call('get_practical_design_check',{evaluationId:first.result.evaluationId,checkId:first.check.id,offset,limit:8000});text+=page.chunk;offset=page.nextOffset;}while(offset!==null);assert.equal(JSON.parse(text).baseFriction.capacityQualified,false);
 m.loads.find(l=>l.id==='T').M=10000;
 const second=await evaluate('friction-large');assert.equal(second.check.status,'NG');assert.equal(second.check.incomplete,true);assert.equal(second.check.baseFriction.mechanicsStatus,'NG');assert.equal(second.result.summary.complete,false);
 console.log('PASS actual WebMCP torsion friction bounds remain unqualified; necessary capacity violation preserves NG plus pending review');
}finally{await ctx.dispose();}

const {designCodeBasis}=await import('../src/metadata/designCodeBasis.js');
for(const key of ['foundation-bearing','foundation-sliding','foundation-overturning','foundation-settlement']){const basis=designCodeBasis(key);assert.equal(basis.status,'NOT_ESTABLISHED');assert.ok(basis.reviewTargets.some(r=>r.id==='115005'&&r.sha256&&r.applicability==='TO_BE_CONFIRMED'));}
console.log('PASS bearing/sliding/overturning/settlement retain official shallow-foundation review targets without claiming clause application');
