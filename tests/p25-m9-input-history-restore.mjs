import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stableHash} from '../src/core/stableHash.js';
import {createDesignInputService} from '../src/modeling/designInputService.js';
import {DESIGN_INPUT_UNITS} from '../src/modeling/designInputCommands.js';
const model=createModel(),service=createDesignInputService({getModel:()=>model});
const cmd={type:'section-record',id:'RESTORE',name:'restore',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'synthetic'};
for(const version of [1,2]){const preview=service.preview({requestId:'r'+version,units:DESIGN_INPUT_UNITS,commands:[{...cmd,version,B:300+version*10}]});assert.equal(preview.ok,true);assert.equal(service.apply(preview).ok,true);}
assert.equal(service.undo({expectedRequestId:'r2'}).ok,true);
const state=service.exportState();service.dispose();
for(const corrupt of [s=>s.requests[0][1].receipt.requestId='other',s=>s.history.push(structuredClone(s.history[0])),s=>s.requests[0][1].receipt=null]){
 const bad=structuredClone(state);corrupt(bad);const {checksum,...body}=bad;bad.checksum=stableHash(body);
 const restored=createDesignInputService({getModel:()=>model});
 try{assert.throws(()=>restored.restoreState(bad),{code:'INPUT_HISTORY_INVALID'});assert.equal(restored.getContext().undoDepth,0);assert.equal(restored.getContext().redoDepth,0);}finally{restored.dispose();}
}
const restored=createDesignInputService({getModel:()=>model});
try{restored.restoreState(state);assert.equal(restored.redo({expectedRequestId:'r1'}).code,'REDO_TARGET_MISMATCH');assert.equal(restored.redo({expectedRequestId:'r2'}).ok,true);assert.equal(restored.undo({expectedRequestId:'r1'}).code,'UNDO_TARGET_MISMATCH');assert.equal(restored.undo({expectedRequestId:'r2'}).ok,true);assert.equal(restored.undo({expectedRequestId:'r1'}).ok,true);console.log('PASS restored target guards and malformed receipt/history rejection');}finally{restored.dispose();}
