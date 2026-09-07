import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {installIndexEngineBridge} from '../src/ui/indexBridge.js';
import {installWebMcp} from '../src/ui/webmcp/register.js';
import {installHostWebMcp} from '../src/app/webmcpHost.js';
import {createElasticReviewService} from '../src/compute/product/elasticReviewService.js';
const model=createModel(),frame={model:()=>model,top:{},location:{origin:'https://test.example',protocol:'https:',search:'?project=A'},addEventListener(){}};
const bridge=installIndexEngineBridge(frame);frame.document={};
const child=installWebMcp(frame,bridge);let load;const definitions=[];
const win={location:{origin:'https://test.example'},document:{modelContext:{registerTool(d){definitions.push(d);}}}};
const iframe={contentWindow:frame,addEventListener(_t,fn){load=fn;},removeEventListener(){}};
const host=installHostWebMcp({window:win,iframe,projectId:'A'});load();assert.equal(definitions.length,27);
const get=definitions.find(x=>x.name==='get_workflow_context');assert.equal((await get.execute({})).ok,true);
assert.throws(()=>child.call({project:'A',session:child.session,nonce:'forged'},'get_workflow_context',{}),{code:'SESSION_BINDING_INVALID'});
frame.location.origin='https://evil.example';await assert.rejects(get.execute({}),{code:'SESSION_BINDING_INVALID'});frame.location.origin=win.location.origin;
const doc=frame.document;frame.document={};await assert.rejects(get.execute({}),{code:'SESSION_BINDING_INVALID'});frame.document=doc;
iframe.contentWindow={};await assert.rejects(get.execute({}),{code:'SESSION_BINDING_INVALID'});iframe.contentWindow=frame;
child.project='B';await assert.rejects(get.execute({}),{code:'SESSION_BINDING_INVALID'});child.project='A';
host.dispose();assert.equal(child.active,false);assert.throws(()=>get.execute({}),/inactive/);
const unsupported={model:()=>model,location:{search:''}};const b=installIndexEngineBridge(unsupported);unsupported.document={};assert.equal(installWebMcp(unsupported,b).status,'unsupported');
// Cancellation must cancel only this workflow's active job and skip later cases.
let complete,cancelled=[],started=[];model.analysisCases=[{id:'A',kind:'static',settings:{}},{id:'B',kind:'modal',settings:{}}];
const service=createElasticReviewService({bridge:{...bridge,getAnalysisCaseResult:()=>null,startAnalysisRun:({caseId})=>{started.push(caseId);return {id:'owned-job'};},getProductAnalysisService:()=>({wait:()=>new Promise(r=>complete=r)}),cancelAnalysisRun:id=>{cancelled.push(id);complete({status:'cancelled'});}}});
const p=service.planWorkflow({caseIds:['A','B']});const pending=service.runWorkflow({plan:p,requestId:'cancel'});service.cancelWorkflow('cancel');const result=await pending;
assert.equal(result.ok,false);assert.equal(result.code,'WORKFLOW_CANCELLED');assert.deepEqual(cancelled,['owned-job']);assert.deepEqual(started,['A']);
console.log('PASS host origin/frame/Document/nonce/project/dispose guards; unsupported fallback; owned-job cancellation skips remaining cases');

const cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
try {
 Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});
 const insecure={model:()=>model,location:{search:''},isSecureContext:false};
 const ib=installIndexEngineBridge(insecure);insecure.document={};
 assert.equal(installWebMcp(insecure,ib).status,'unsupported');
} finally {Object.defineProperty(globalThis,'crypto',cryptoDescriptor);}
console.log('PASS insecure/unsupported browser without randomUUID keeps ordinary UI initialization');
