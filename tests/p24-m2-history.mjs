import {DESIGN_DEPENDENCY_VERSION} from '../src/core/designDependencyIdentity.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {exportModel} from '../src/core/io.js';
const ctx=designContext();
try {
 const cmd={type:'section-record',id:'HISTORY',name:'history',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'synthetic'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'history-p',commands:[cmd]});
 assert.equal(preview.impact.decision,'REANALYSIS_REQUIRED');
 await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'history-a'});
 assert.equal(ctx.bridge.undoDesignInputChanges().ok,true);
 assert.equal(typeof ctx.bridge.redoDesignInputChanges,'function');
 assert.equal(ctx.bridge.redoDesignInputChanges().ok,true);
 assert.equal((await ctx.call('get_design_records',{channel:'sections',id:'HISTORY'})).rows.length,1);
 assert.throws(()=>exportModel(ctx.model),{code:'PRODUCT_BOOK_REQUIRED'},'legacy export must not silently emit modern details');
 const dependency=await ctx.call('get_design_dependencies');assert.equal(dependency.version,DESIGN_DEPENDENCY_VERSION);
 assert.equal((await ctx.call('reuse_design_analysis',{analysisRunId:'absent',inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).code,'RESULT_REQUIRED');
 console.log('PASS T04/T05/T18 history, legacy export fence, dependency preview and actual WebMCP');
} finally {await ctx.dispose();}
