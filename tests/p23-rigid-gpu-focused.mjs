import assert from 'node:assert/strict';
import { rigidGpuFixture, independentRoof } from './fixtures/p23-rigid-gpu.js';
import { executeProductionElastic, isElasticAutoGpuProfileEligible } from '../src/compute/adapters/elasticProductionAdapter.js';
import { createAnalysisProductService } from '../src/compute/product/analysisProductService.js';
import { createReferenceSpdGpuSession } from '../src/compute/hybrid/referenceSpdGpu.js';
import { createHybridPDeltaTangentSolver } from '../src/compute/elastic/hybridPDelta.js';
import { createWebGpuBufferPool } from '../src/compute/backends/webgpu/bufferPool.js';
import { createWebGpuSpdSession } from '../src/compute/backends/webgpu/spdSession.js';
import { prepareHybridSpdSystem } from '../src/compute/hybrid/spdEligibility.js';
import { createAnalysisCaseResult } from '../src/ui/analysisRunners.js';

const model = rigidGpuFixture(); model.analysisSettings.pDeltaMethod = 'direct';
const result = await executeProductionElastic({model,computeTarget:'gpu'}, {gpuSessionFactory:createReferenceSpdGpuSession});
assert.equal(result.result.pDelta.ok,true);
assert.ok(Math.abs(result.result.pDelta.byCombo.DW.result.disp.T0[0]-independentRoof(model).ux)<1e-10);
assert.equal(result.result.designBlocked,true);
assert.equal(result.execution.resourceBalanced,true);
assert.equal(result.execution.rigidDiaphragm.autoEnabled,false);
assert.equal(isElasticAutoGpuProfileEligible(model,{elasticCandidateApproved:true,directPDeltaCandidateApproved:true,minDofs:1,endToEndSpeedup:100}),false);
const service = createAnalysisProductService({getModel:()=>model,environment:{webgpuSupported:true,workerSupported:true,secureContext:true},
  caseRunner:async(_,analysisCase)=>createAnalysisCaseResult(analysisCase,result.result)});
const gpu = service.getCapabilities({kind:'static'}).targets.find(t=>t.id==='gpu');
assert.equal(gpu.available,true); assert.equal(gpu.candidate,true);
assert.equal(service.getCapabilities({kind:'static',environment:{webgpuSupported:true,workerSupported:false,secureContext:true}}).targets.find(t=>t.id==='gpu').available,false);
const denied=createAnalysisProductService({getModel:()=>model,environment:{webgpuSupported:true,workerSupported:true,secureContext:true},qualificationPolicy:{gpuAllowed:false}});
assert.equal(denied.getCapabilities({kind:'static'}).targets.find(t=>t.id==='gpu').available,false);denied.dispose();
assert.equal(service.getCapabilities({kind:'modal'}).targets.find(t=>t.id==='gpu').available,false);
const noRigid = structuredClone(model); noRigid.diaphragms=[];
assert.equal(service.getCapabilities({kind:'static',model:noRigid}).targets.find(t=>t.id==='gpu').available,false);
assert.equal(service.plan({analysisCase:{id:'S',kind:'static'},computeTarget:'gpu'}).designTransfer,'blocked');
const job=service.start({analysisCase:{id:'S',kind:'static'},computeTarget:'gpu'});
await service.wait(job.id);
assert.equal(service.getStatus(job.id).status,'completed');
const published=service.getResult(job.id);
assert.equal(published.designBlocked,true);
assert.equal(published.routing.executedTarget,'gpu');
assert.equal(published.payload.gpuCapability.productionQualified,false);
service.dispose();

const device = {createBuffer:()=>({destroy(){}})};
const pool = createWebGpuBufferPool(device,{maxBytes:32,maxCachedBytes:32});
const a=pool.acquire({size:24,usage:8}); a.release();
const b=pool.acquire({size:32,usage:8});
assert.equal(pool.snapshot().cachedBytes,0); // Eviction before new allocation.
assert.throws(()=>pool.acquire({size:4,usage:8}),{code:'WEBGPU_BUFFER_POOL_BUDGET'});
b.release(); assert.equal(pool.dispose().allocationBalanced,true);

const matrix=prepareHybridSpdSystem([[2]]).scaledCsr;
for (const fault of ['allocation','pipeline','device-loss']) {
  let count=0, lost=false;
  const faultPool=createWebGpuBufferPool({createBuffer(){if(fault==='allocation'&&++count===4)throw Error('allocation');return {destroy(){}};}});
  const platform={pool:faultPool,capability:{limits:{maxComputeInvocationsPerWorkgroup:256,maxComputeWorkgroupSizeX:256,maxStorageBuffersPerShaderStage:8,maxStorageBufferBindingSize:1e6,maxUniformBufferBindingSize:1e6,maxBufferSize:1e6}},
    assertReady(){if(lost)throw Object.assign(Error('lost'),{code:'WEBGPU_DEVICE_LOST'});},
    withErrorScopes:async(fn)=>fn(),queue:{writeBuffer(){}},device:{},
    getPipeline:async()=>{if(fault==='device-loss'){lost=true;return {};}throw Error('pipeline');}};
  await assert.rejects(createWebGpuSpdSession(platform,matrix));
  assert.equal(faultPool.snapshot().activeBytes,0,`${fault} retained a lease`);
  assert.equal(faultPool.dispose().allocationBalanced,true);
}
// Disposal must not recycle buffers while submitted work/readback still owns them.
let finishSubmit, enteredSubmit;
const submitted=new Promise(resolve=>{enteredSubmit=resolve;});
const submission=new Promise(resolve=>{finishSubmit=resolve;});
const fakeDevice={createBuffer:({size})=>({destroy(){},unmap(){},mapAsync:async()=>{},getMappedRange:()=>new ArrayBuffer(size)}),
  createBindGroup:()=>({}),createCommandEncoder:()=>({beginComputePass:()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}}),copyBufferToBuffer(){},finish:()=>({})})};
const busyPool=createWebGpuBufferPool(fakeDevice);
const busyPlatform={pool:busyPool,device:fakeDevice,queue:{writeBuffer(){}},assertReady(){},withErrorScopes:async fn=>fn(),
  submit:()=>{enteredSubmit();return submission;},getPipeline:async()=>({getBindGroupLayout:()=>({})}),
  capability:{limits:{maxComputeInvocationsPerWorkgroup:256,maxComputeWorkgroupSizeX:256,maxStorageBuffersPerShaderStage:8,maxStorageBufferBindingSize:1e6,maxUniformBufferBindingSize:1e6,maxBufferSize:1e6}}};
const busySession=await createWebGpuSpdSession(busyPlatform,matrix);
const solving=busySession.solve([1]);await submitted;
const disposing=busySession.dispose();
assert.ok(busyPool.snapshot().activeBytes>0);
finishSubmit();assert.equal((await solving).ok,false);await disposing;
assert.equal(busyPool.snapshot().activeBytes,0);assert.equal(busyPool.dispose().allocationBalanced,true);
const controller=new AbortController();controller.abort();
const cancelled=createHybridPDeltaTangentSolver({gpuSessionFactory:()=>{throw Error('must not allocate');},signal:controller.signal});
await assert.rejects(cancelled.solve(),{code:'HYBRID_PDELTA_CANCELLED'});
assert.equal(cancelled.dispose().resourceBalanced,true);
console.log('PASS P23 focused: candidate routing, reference parity, GPU pool budget, allocation/pipeline/loss rollback, pre-cancel');
