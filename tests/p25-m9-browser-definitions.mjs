import assert from 'node:assert/strict';
import {createWebMcpTools} from '../src/ui/webmcp/tools.js';
import {registerDefinitions} from '../src/ui/webmcp/register.js';
import {getDesignInputSchema} from '../src/modeling/practicalDesignInputs.js';
import {browserDefinitions} from '../src/ui/webmcp/browserDefinitions.js';
import {createBrowserTools,browserDescriptorBytes,BROWSER_DESCRIPTOR_BUDGET} from '../src/ui/webmcp/browserTools.js';
const tools=createWebMcpTools({agent:{},bridge:{getDesignInputSchema}});
try{
 const before=JSON.stringify(tools),advertised=browserDefinitions(tools);
 assert.equal(JSON.stringify(tools),before);assert.deepEqual(advertised.map(t=>t.name),tools.map(t=>t.name));
 advertised.forEach((t,i)=>assert.equal(t.execute,tools[i].execute));
 // Check the actual fixed browser surface, including origin/pageUrl overhead.
 const surface=createBrowserTools(tools);
 const ADVERTISED_BUDGET=BROWSER_DESCRIPTOR_BUDGET;
 const size=browserDescriptorBytes(surface,'https://m-ill.github.io/s-structures/app.html?project='+'x'.repeat(2048));
 assert.ok(size<ADVERTISED_BUDGET);
 assert.equal(surface.length,4);
 const preview=advertised.find(t=>t.name==='preview_design_changes'),original=tools.find(t=>t.name===preview.name);
 assert.ok(original.inputSchema.properties.commands.items.oneOf.length>5);
 assert.equal(preview.inputSchema.properties.commands.maxItems,original.inputSchema.properties.commands.maxItems);
 assert.ok(preview.description.includes('get_design_input_schema'));
 const lookup=tools.find(t=>t.name==='get_design_input_schema');
 for(const type of new Set(original.inputSchema.properties.commands.items.oneOf.flatMap(s=>s.properties.type.enum))){
  assert.ok(lookup.inputSchema.properties.type.enum.includes(type), `missing schema lookup: ${type}`);
  const result=await lookup.execute({type});
  const value=typeof result==='string'?JSON.parse(result):result;
  const expected=original.inputSchema.properties.commands.items.oneOf.filter(s=>s.properties.type.enum.includes(type));
  assert.deepEqual(value.schema, expected.length===1?expected[0]:{oneOf:expected}, type);
 }
 await assert.rejects(preview.execute({inputHash:'a'.repeat(64),requestId:'invalid-command',commands:[{type:'combination',unexpected:true}]}),{code:'INVALID_INPUT'});
 const registered=[];const state={};
 registerDefinitions({isSecureContext:true,document:{modelContext:{registerTool(definition,options){registered.push({definition,options});}}}},tools,state);
 assert.equal(state.status,'registered');assert.equal(registered.length,surface.length);
 assert.deepEqual(registered.map(x=>x.definition.inputSchema),surface.map(x=>x.inputSchema));
 state.dispose();assert.ok(registered.every(x=>x.options.signal.aborted));
 assert.throws(()=>registered[0].definition.execute({}),/inactive/);
 console.log(JSON.stringify({count:advertised.length,utf8Bytes:size,budget:ADVERTISED_BUDGET,marginBytes:ADVERTISED_BUDGET-size,canonicalBytes:Buffer.byteLength(before),sameExecution:true}));
}finally{tools.dispose();}
