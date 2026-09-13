import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext();
try {
 assert.equal(typeof ctx.bridge.evaluatePracticalDesign,'function','practical workflow must be attached to the product bridge');
 assert.ok(ctx.tools.some(x=>x.name==='start_design_candidates'));
 assert.ok(ctx.tools.some(x=>x.name==='cancel_design_candidates'));
 const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 await assert.rejects(ctx.call('evaluate_practical_design',{inputHash,sources:[]}),/RESULT_REQUIRED/);
 console.log('PASS T12/T18 common product workflow and actual WebMCP registration/source guard');
} finally {await ctx.dispose();}
