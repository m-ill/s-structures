import assert from 'node:assert/strict';
import { normalizeMaterialRecord, validateMaterialRecord } from '../src/materials/materialSchema.js';
import { designInputCommandFromFields } from '../src/ui/indexDesignInput.js';
import { designContext } from './fixtures/p24/context.js';

assert.equal(validateMaterialRecord({ id:'P24-M',version:1,kind:'masonry',elastic:{E:8000,G:3200},strength:{masonry:{fm:10}} }).ok,true,'T01: masonry must have its own material schema');
assert.notEqual(normalizeMaterialRecord({id:'ambiguous',E:100,G:40}).kind,'steel');
const ctx=designContext();
try {
  const common={type:'material-record',version:1,name:'Synthetic material',E:24000,nu:0.2,density:2.4,sourceReference:'synthetic fixture',edition:'test-only',sourceNote:'Not project design data',basisStatus:'assumed',product:'test-product',grade:'test-grade'};
  const records=[
    {...common,id:'P24-C',kind:'concrete',fck:24},
    {...common,id:'P24-S',kind:'steel',E:200000,nu:0.3,density:7.85,Fy:400,Fu:500,thickness:20},
    {...common,id:'P24-T',kind:'timber',E:11000,G:700,density:0.5,species:'test-species',moisture:12,serviceClass:'dry',durationClass:'normal',fb:20,ft0:10,fc0:20,fc90:3,fv:2,E90:400,analysisAssumption:'frame-longitudinal'},
    {...common,id:'P24-M',kind:'masonry',fm:10,unitType:'test-unit',mortar:'test-mortar',grout:'ungrouted',reinforced:false},
  ];
  const schema=await ctx.call('get_design_input_schema',{type:'material-record'});
  assert.ok(schema.schema.properties.E.description.includes('MPa'));
  const before=JSON.stringify(ctx.model);
  const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'T01-preview',commands:records});
  assert.equal(preview.ok,true);
  assert.equal(JSON.stringify(ctx.model),before);
  const applied=await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'T01-apply'});
  assert.equal(applied.ok,true);
  for(const input of records) {
    const response=await ctx.call('get_design_records',{channel:'materials',id:input.id,version:1});
    const item=response.rows[0];
    assert.equal(item.kind,input.kind);
    assert.equal(item.elastic.rho,input.density);
    assert.equal(item.specification.basisStatus,'assumed');
    const form=designInputCommandFromFields('material-record',Object.fromEntries(Object.entries(input).filter(([k])=>k!=='type').map(([k,v])=>[k,String(v)])));
    assert.deepEqual(form,input,'same typed contract from UI fields');
  }
  const missing={...records[2],id:'P24-BAD'};delete missing.fc90;
  await assert.rejects(ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'T01-missing',commands:[missing]}));
  const conflict={...records[1],id:'P24-BAD2',G:100};
  await assert.rejects(ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'T01-isotropic',commands:[conflict]}));
  assert.ok(!ctx.model.materials.some(r=>r.id==='P24-BAD'||r.id==='P24-BAD2'));
  console.log('PASS T01/T18 material types, units, provenance, UI/WebMCP, missing properties, isotropic consistency');
} finally {await ctx.dispose();}
