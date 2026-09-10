import { rigidGpuFixture, independentRoof } from '../fixtures/p23-rigid-gpu.js';
import { runSecondOrderPDeltaAsync } from '../../src/solver/pdelta/secondOrder.js';
import { createHybridPDeltaTangentSolver } from '../../src/compute/elastic/hybridPDelta.js';
import { executeProductionElastic } from '../../src/compute/adapters/elasticProductionAdapter.js';
import { createWebGpuPlatform, createWebGpuSpdSession } from '../../src/compute/backends/webgpu/index.js';
import { createElasticAnalysisService } from '../../src/compute/product/elasticAnalysisService.js';

const output = document.querySelector('#result');
document.querySelector('#run').onclick = async () => {
  const button = document.querySelector('#run'); button.disabled = true;
  output.textContent = '실행 중';
  let platform;
  const evidence = { version:'p23-rigid-webgpu-v1', status:'FAIL', cases:[], userAgent:navigator.userAgent };
  try {
    platform = await createWebGpuPlatform({label:'Phase23 synthetic rigid qualification'});
    evidence.capability = platform.capability;
    if (platform.capability.adapterInfo.isFallbackAdapter) throw Error('Hardware GPU required');
    const gpuSessionFactory = (matrix, options) => createWebGpuSpdSession(platform,matrix,options);
    for (const P of [0,100]) {
      const model = rigidGpuFixture(P), expected = independentRoof(model,P);
      const tangent = createHybridPDeltaTangentSolver({gpuSessionFactory,f64Tolerance:1e-10,loadResidualTolerance:1e-9,maxCorrections:4});
      try {
        const result = await runSecondOrderPDeltaAsync(model,{D:1,W:1},{loadSteps:2,tangentSolver:tangent.solve});
        check(result.ok, result.reason);
        for (const [key,index] of [['ux',0],['uy',1],['rz',5]]) close(result.result.disp.T0[index],expected[key],key);
        check(result.result.recovery.qualified,'recovery');
        check(result.result.summary.equilibriumOk,'equilibrium');
        check(tangent.snapshot().resourceBalanced,'tangent resource balance');
        evidence.cases.push({name:`independent-direct-P${P}`,status:'PASS',expected,actual:result.result.disp.T0,
          equilibrium:result.result.summary.equilibriumResidual,session:tangent.snapshot()});
      } finally { tangent.dispose(); }
    }
    const model = rigidGpuFixture(0);
    const product = await executeProductionElastic({model,computeTarget:'gpu'},{gpuSessionFactory});
    close(product.result.byCombo.DW.disp.T0[0],independentRoof(model,0).ux,'linear-product');
    check(product.execution.resourceBalanced,'linear cleanup');
    evidence.cases.push({name:'elastic-product',status:'PASS',execution:product.execution});
    // Real Worker + default WebGPU factory, without a reference adapter injection.
    const service = createElasticAnalysisService();
    try {
      const direct = rigidGpuFixture(); direct.analysisSettings.pDeltaMethod='direct';
      let progressCount = 0;
      const worker = await service.run(direct,{computeTarget:'gpu',onProgress:p=>{if(p.stage==='direct-pdelta-iteration')progressCount++;}});
      check(worker.result.pDelta.ok,'worker Direct failed');
      close(worker.result.pDelta.byCombo.DW.result.disp.T0[0],independentRoof(direct).ux,'worker Direct');
      check(worker.execution.target==='gpu'&&!worker.execution.fallbackUsed,'worker route');
      check(worker.execution.resourceBalanced,'worker cleanup');
      check(worker.result.designBlocked===true,'candidate transfer must stay blocked');
      check(progressCount>0,'Direct progress missing');
      evidence.cases.push({name:'worker-direct-product',status:'PASS',progressCount,execution:worker.execution});
    } finally { service.dispose(); }
    for (const name of ['affine-support','unstable']) {
      const sample=rigidGpuFixture(name==='unstable'?1e8:0);
      if(name==='affine-support')sample.nodes.filter(n=>n.support==='fixed').forEach(n=>{n.settlement={kx:0.001};});
      const tangent=createHybridPDeltaTangentSolver({gpuSessionFactory,f64Tolerance:1e-10,loadResidualTolerance:1e-9,maxCorrections:4});
      try {
        const result=await runSecondOrderPDeltaAsync(sample,{D:1,W:1},{loadSteps:2,tangentSolver:tangent.solve});
        if(name==='unstable')check(!result.ok&&!result.designEligibility.eligible,'instability must fail closed');
        else { check(result.ok,result.reason);close(result.result.disp.T0[0],independentRoof(sample,0).ux+0.001,'affine support'); }
        check(tangent.snapshot().resourceBalanced,'special case cleanup');
        evidence.cases.push({name,status:'PASS',solverStatus:result.status,session:tangent.snapshot()});
      } finally { tangent.dispose(); }
    }
    evidence.status = 'PASS';
  } catch (error) { evidence.error = {code:error.code,message:error.message,details:error.details}; }
  finally {
    if (platform) { evidence.beforeDispose = platform.snapshot(); evidence.afterDispose = await platform.dispose();
      if (!evidence.afterDispose.pool.allocationBalanced) evidence.status='FAIL'; }
    output.textContent = JSON.stringify(evidence,null,2); button.disabled=false;
  }
};
function check(ok, message) { if (!ok) throw Error(message || 'Assertion failed'); }
function close(a,b,name) { check(Number.isFinite(a)&&Math.abs(a-b)<=Math.max(1e-11,Math.abs(b)*1e-6),`${name}: ${a} != ${b}`); }
