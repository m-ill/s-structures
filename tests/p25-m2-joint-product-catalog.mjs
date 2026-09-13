import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {REBAR_CATALOG_ID,expandRebarCatalogInput} from '../src/materials/rebarProductCatalog.js';
import {practicalCommandFromRecord,practicalInputFields} from '../src/modeling/practicalInputContract.js';
import {validateStoredDesignDetails} from '../src/modeling/designDetailValidation.js';
import {kdsJointHoopQuantity} from '../src/design/connection/kdsJointHoops.js';
const joint={type:'connection-record',id:'J',version:1,name:'catalog joint',sourceNote:'synthetic',nodeId:'B',memberIds:['AB','BC'],connectionType:'rc-joint',restraint:'rigid',barMaterialId:'SD400@1',tieDiameter:13,tieSpacing:50,tieLegs:2,barCatalogId:REBAR_CATALOG_ID,barProductGrade:'SD400'};
assert.equal(expandRebarCatalogInput(joint).tieDiameter,12.7);
assert.ok(practicalInputFields('connection-record').some(f=>f.key==='barCatalogId'));
const ctx=designContext();
try{
 Object.assign(ctx.model,{nodes:[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3}],members:[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'},{id:'BC',n1:'B',n2:'C',type:'frame',matId:'concrete',secId:'rc3060'}]});
 const material={type:'material-record',id:'SD400',version:1,name:'bar',kind:'steel',E:200000,nu:.3,density:7.85,Fy:400,Fu:460,product:'rebar',grade:'SD400',sourceReference:'synthetic',edition:'fixture',sourceNote:'not certified',basisStatus:'assumed'};
 const staged=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-catalog',commands:[material,joint]});assert.equal(staged.ok,true,JSON.stringify(staged));
 assert.equal((await ctx.call('apply_design_changes',{handle:staged.handle,requestId:'joint-catalog-apply'})).ok,true);
 const stored=(await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0];
 assert.equal(stored.reinforcement.diameter,.0127);assert.equal(stored.reinforcement.area,126.7e-6);assert.equal(stored.reinforcement.unitMassKgPerM,.995);
 assert.equal(stored.reinforcement.designation,'D13');assert.equal(practicalCommandFromRecord('connection-record',stored).barCatalogId,REBAR_CATALOG_ID);
 assert.deepEqual(validateStoredDesignDetails(ctx.model),[]);
 const check=kdsJointHoopQuantity({B:.3,H:.3,cover:.04,diameter:stored.reinforcement.diameter,area:stored.reinforcement.area,spacing:.05,longitudinalDiameter:.02,fck:24,fy:400});
 assert.ok(check.directions.every(d=>Math.abs(d.providedArea-2*126.7e-6)<1e-15));assert.ok(check.codeReferences.length);
 const corrupt=structuredClone(ctx.model);corrupt.designDetails.connections[0].reinforcement.unitMassKgPerM=1;assert.ok(validateStoredDesignDetails(corrupt).length);
 await assert.rejects(ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'wrong-grade',commands:[{...joint,version:2,barProductGrade:'SD500'}]}),/YIELD_MISMATCH/);
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).ok,true);
 console.log('PASS joint product selection through WebMCP, nominal KDS hoop area, mass, roundtrip, tamper guard and undo');
}finally{await ctx.dispose();}
