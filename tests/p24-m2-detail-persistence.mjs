import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {createProductBook,extractProductModel} from '../src/ui/indexNativePersistence.js';
import {validateSectionRecord} from '../src/materials/sectionSchema.js';
import {validateMaterialRecord} from '../src/materials/materialSchema.js';
const ctx=designContext();
ctx.model.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];
ctx.model.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
try {
  const section=validateSectionRecord({id:'typed',version:1,kind:'parametric',shape:'RECT',params:{B:300,H:500},dimensionUnit:'mm',inputContract:'p24-section-v1'}).normalized;
  assert.equal(validateSectionRecord({...section,properties:{...section.properties,A:10}}).ok,false,'stored typed section cannot override computed geometry');
  assert.equal(validateSectionRecord({...section,inputContract:'p24-section-v99'}).ok,false);
  assert.equal(validateMaterialRecord({id:'future',version:1,kind:'steel',elastic:{E:200000,G:77000},strength:{steel:{Fy:235,Fu:400}},inputContract:'p24-material-v99'}).ok,false);
  const command={type:'reinforcement-record',id:'RB',name:'Synthetic stored detail',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[{y:-0.2,z:0,diameter:16}],stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,sourceNote:'test'};
  const p=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'T05-preview',commands:[command]});
  await ctx.call('apply_design_changes',{handle:p.handle,requestId:'T05-apply'});
  const expected=structuredClone(ctx.model.designDetails);
  const book=createProductBook(ctx.model);
  assert.equal(book.version,2,'new design inputs require a product-book version rejected by older readers');
  const restored=extractProductModel(book);
  assert.deepEqual(restored.designDetails,expected);
  const oldModel=structuredClone(ctx.model);delete oldModel.designDetails;
  assert.equal(createProductBook(oldModel).version,1);
  assert.throws(()=>extractProductModel({...book,version:1}),{code:'PRODUCT_BOOK_DETAIL_VERSION_REQUIRED'});
  for(const alter of [
    m=>{m.designDetails.reinforcement[0].bars[0].area*=2;},
    m=>{m.designDetails.version='future';},
    m=>{m.designDetails.reinforcement[0].barMaterialId='missing@1';},
    m=>{m.designDetails.reinforcement[0].bars[0].y=5;},
  ]) {
    const bad=structuredClone(ctx.model);alter(bad);
    assert.throws(()=>createProductBook(bad),{code:'PRODUCT_MODEL_INVALID'},'invalid stored detail must not gain a valid export signature');
    assert.throws(()=>extractProductModel(bad),{code:'PRODUCT_MODEL_INVALID'});
  }
  assert.deepEqual(ctx.model.designDetails,expected);
  console.log('PASS T05 native detail roundtrip, corrupted area, future version, references and geometry rejection');
} finally {await ctx.dispose();}
