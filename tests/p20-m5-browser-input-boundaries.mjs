import assert from 'node:assert/strict';
import { createModel } from '../src/core/model.js';
import { installIndexRuntimeAdapter } from '../src/ui/indexRuntimeAdapter.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { createFakeIndexDocument, buildNativeIndexShell } from './helpers/fakeIndexDom.mjs';
import { createWebMcpTools } from '../src/ui/webmcp/tools.js';

const old = {...createModel(), schemaVersion:3};
delete old.analysisCases; delete old.nonlinearSections;
const host={model:()=>old,migrateToV3:x=>({...x,schemaVersion:3}),makeV3Model:()=>structuredClone(old)};
installIndexRuntimeAdapter(host);
assert.equal(old.schemaVersion,6);assert.ok(Array.isArray(old.analysisCases));
assert.equal(host.makeV3Model().schemaVersion,6);
const incoming=structuredClone(old),before=structuredClone(incoming);
assert.equal(host.migrateToV3(incoming).schemaVersion,6);assert.deepEqual(incoming,before);
const doc=createFakeIndexDocument();buildNativeIndexShell(doc);
let model=createModel();
const target={document:doc,model:()=>model,location:{search:''},draw(){}};doc.defaultView=target;
const bridge=installIndexEngineBridge(target);
// A later import can lack metadata. Opening/closing setup must not create it.
model=host.migrateToV3(incoming);delete model.meta;
const inputBefore=structuredClone(model),identity=bridge.getWorkflowInputIdentity();
bridge.elasticSetupWorkflow.open(0);bridge.elasticSetupWorkflow.close();
assert.deepEqual(model,inputBefore);assert.deepEqual(bridge.getWorkflowInputIdentity(),identity);
const tools=createWebMcpTools({agent:target.SStructuresAgent,bridge});
const preview=await tools.find(x=>x.name==='preview_analysis_case').execute({inputHash:identity.inputHash,requestId:'import-case',command:{type:'analysis-case',mode:'create',id:'P20-IMPORTED',name:'Imported',kind:'static',settings:{comboId:model.loadCombinations[0].id,pDeltaMethod:'off'}}});
assert.equal(preview.ok,true);assert.deepEqual(model,inputBefore);tools.dispose();
console.log('PASS P20 browser input boundaries: startup/new/import current schema; view open preserves identity; typed preview accepts imported model');
