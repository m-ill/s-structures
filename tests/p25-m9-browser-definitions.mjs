import assert from 'node:assert/strict';
import {createWebMcpTools} from '../src/ui/webmcp/tools.js';
import {registerDefinitions} from '../src/ui/webmcp/register.js';
import {getDesignInputSchema} from '../src/modeling/practicalDesignInputs.js';
import {browserDefinitions} from '../src/ui/webmcp/browserDefinitions.js';
const tools=createWebMcpTools({agent:{},bridge:{getDesignInputSchema}});
try{
 const before=JSON.stringify(tools),advertised=browserDefinitions(tools);
 assert.equal(JSON.stringify(tools),before);assert.deepEqual(advertised.map(t=>t.name),tools.map(t=>t.name));
 advertised.forEach((t,i)=>assert.equal(t.execute,tools[i].execute));
 // Advertised payload budget. The phase 25 closure audit is explicit that no
 // per-browser limit was ever confirmed and that this is a PRODUCT REGRESSION
 // baseline, not an external constraint: 56,308 bytes then, 61,389 before the
 // phase 30 tools, 64,132 with them. Raised here rather than dropping a tool to
 // fit a number, and the margin is printed so the next approach is visible in
 // the gate output instead of only when it fails.
 const ADVERTISED_BUDGET=68000;
 const size=Buffer.byteLength(JSON.stringify(advertised));
 assert.ok(size<ADVERTISED_BUDGET,`advertised definitions ${size} bytes exceed the ${ADVERTISED_BUDGET} budget`);
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
 assert.equal(state.status,'registered');assert.equal(registered.length,tools.length);
 assert.deepEqual(registered.map(x=>x.definition.inputSchema),advertised.map(x=>x.inputSchema));
 state.dispose();assert.ok(registered.every(x=>x.options.signal.aborted));
 assert.throws(()=>registered[0].definition.execute({}),/inactive/);
 console.log(JSON.stringify({count:advertised.length,utf8Bytes:size,budget:ADVERTISED_BUDGET,marginBytes:ADVERTISED_BUDGET-size,canonicalBytes:Buffer.byteLength(before),sameExecution:true}));
}finally{tools.dispose();}
