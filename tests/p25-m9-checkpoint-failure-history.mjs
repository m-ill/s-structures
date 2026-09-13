import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {createWorkflowCheckpointRepository} from '../src/compute/product/workflowCheckpoint.js';
import {stableHash} from '../src/core/stableHash.js';
const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};
const projectId='P24-SYNTHETIC',options={SStructuresCheckpointStorage:storage};
const source=designContext(options);
try{await source.bridge.saveWorkflowCheckpoint({projectId});}finally{await source.dispose();}
const repository=createWorkflowCheckpointRepository({storage});
const saved=(await repository.read(projectId)).bundle;repository.releaseRead();
for(const failure of ['read','late-store']){
 await repository.save(projectId,saved);
 if(failure==='read')data.get(projectId).sha256='broken';
 else {const invalid=structuredClone(saved);invalid.practical.checksum='broken';await repository.save(projectId,invalid);}
 const ctx=designContext(options);
 try{
  const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
  const p=await ctx.call('preview_design_changes',{inputHash,requestId:'existing-edit',commands:[{type:'section-record',id:'EDIT',name:'existing edit',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'test'}]});
  assert.equal((await ctx.call('apply_design_changes',{handle:p.handle,requestId:'apply-existing'})).ok,true);
  const before=stableHash(ctx.model);
  await assert.rejects(ctx.bridge.restoreWorkflowCheckpoint({projectId}),{code:'CHECKPOINT_RESTORE_REQUIRES_EMPTY_RUNTIME'});
  assert.equal(stableHash(ctx.model),before,'failed restore must preserve the live input');
  const undo=await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,expectedRequestId:'existing-edit'});
  assert.equal(undo.ok,true,`${failure}: failed restore erased live undo history: ${JSON.stringify(undo)}`);
  assert.equal(ctx.model.sections.some(s=>s.id==='EDIT'),false);
 }finally{await ctx.dispose();}
 const empty=designContext(options);
 try{
  await assert.rejects(empty.bridge.restoreWorkflowCheckpoint({projectId}));
  // A failed restoration must not poison the next valid restore attempt.
  await repository.save(projectId,saved);
  assert.equal((await empty.bridge.restoreWorkflowCheckpoint({projectId})).ok,true);
 }finally{await empty.dispose();}
}
console.log('PASS read/late-store failure preserves current model and undo; valid restore retry succeeds');
