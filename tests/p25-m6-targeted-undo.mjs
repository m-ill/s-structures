import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext();
try {
 const command={type:'section-record',id:'UNDO',name:'undo',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'synthetic'};
 async function apply(requestId,version){const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId,commands:[{...command,version,B:300+version*10}]});return ctx.call('apply_design_changes',{handle:preview.handle,requestId:requestId+'-apply'});}
 await apply('candidate-input',1);await apply('later-user-input',2);
 const before=structuredClone(ctx.model),inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const refused=await ctx.call('undo_design_input',{inputHash,expectedRequestId:'candidate-input'});
 assert.equal(refused.ok,false);assert.equal(refused.code,'UNDO_TARGET_MISMATCH');assert.deepEqual(ctx.model,before);
 assert.equal((await ctx.call('undo_design_input',{inputHash,expectedRequestId:'later-user-input'})).ok,true);
 const redoHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 assert.equal((await ctx.call('redo_design_input',{inputHash:redoHash,expectedRequestId:'candidate-input'})).code,'REDO_TARGET_MISMATCH');
 assert.equal((await ctx.call('redo_design_input',{inputHash:redoHash,expectedRequestId:'later-user-input'})).ok,true);
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,expectedRequestId:'later-user-input'})).ok,true);
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,expectedRequestId:'candidate-input'})).ok,true);
 console.log('PASS explicit undo/redo targets protect later user transactions');
}finally{await ctx.dispose();}
