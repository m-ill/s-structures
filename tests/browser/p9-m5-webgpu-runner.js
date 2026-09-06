import { createWebGpuPlatform, createWebGpuSpdSession } from '../../src/compute/backends/webgpu/index.js';
import { createMixedPrecisionSpdSession } from '../../src/compute/hybrid/mixedPrecisionSpd.js';
import { executeProductionElastic } from '../../src/compute/adapters/elasticProductionAdapter.js';
import { analyzeModel } from '../../src/solver/linear3d.js';
import { createModel } from '../../src/core/model.js';

const output = document.querySelector('#result');
window.__P9_M5_RESULT__ = null;

try {
  window.__P9_M5_RESULT__ = await qualify();
} catch (error) {
  window.__P9_M5_RESULT__ = failure(error);
}
output.textContent = JSON.stringify(window.__P9_M5_RESULT__, null, 2);
document.body.dataset.status = window.__P9_M5_RESULT__.status;

async function qualify() {
  const platform = await createWebGpuPlatform({ label: 'P9-M5 browser qualification' });
  let mixed = null;
  try {
    const matrix = tridiagonal(512, 4, -1);
    mixed = await createMixedPrecisionSpdSession(matrix, {
      gpuSessionFactory: (scaled, defaults) => createWebGpuSpdSession(platform, scaled, defaults),
      gpuTolerance: 1e-5,
      f64Tolerance: 1e-9,
      loadResidualTolerance: 1e-8,
      maxCorrections: 3,
      maxConditionProxy: 1e6,
    });
    const rhsA = Float64Array.from({ length: 512 }, (_, index) => Math.sin((index + 1) * 0.07) + 0.5);
    const rhsB = Float64Array.from({ length: 512 }, (_, index) => Math.cos((index + 1) * 0.05) - 0.25);
    const warmup = await mixed.solve(rhsA);
    if (!warmup.ok) throw Object.assign(new Error(warmup.reason), { code: warmup.reason, details: warmup });
    const samples = [];
    let repeated = null;
    for (let index = 0; index < 6; index += 1) {
      const started = performance.now();
      repeated = await mixed.solve(index % 2 ? rhsB : rhsA);
      samples.push(performance.now() - started);
      if (!repeated.ok) throw Object.assign(new Error(repeated.reason), { code: repeated.reason, details: repeated });
    }
    const sessionBeforeDispose = mixed.snapshot();
    const maxBackwardError = Math.max(warmup.f64Residual.backwardError, repeated.f64Residual.backwardError);
    const maxLoadRelativeResidual = Math.max(warmup.f64Residual.loadRelativeResidual, repeated.f64Residual.loadRelativeResidual);
    const gpuContext = () => ({
      ...noOpContext(),
      gpuSessionFactory: (scaled, defaults) => createWebGpuSpdSession(platform, scaled, defaults),
    });
    const productModel = frameModel(3, 3);
    const productCpu = analyzeModel(productModel);
    const productGpu = await executeProductionElastic({ model: productModel, computeTarget: 'gpu' }, gpuContext());
    const productDelta = Math.abs(
      productGpu.result.byCombo.C1.dmax - productCpu.byCombo.C1.dmax,
    );
    const directModel = pDeltaColumnModel();
    const directCpu = analyzeModel(directModel);
    const directGpu = await executeProductionElastic({ model: directModel, computeTarget: 'gpu' }, gpuContext());
    const directDelta = Math.abs(
      directGpu.result.pDelta.byCombo.CO1.amplification - directCpu.pDelta.byCombo.CO1.amplification,
    );

    const performanceModel = frameModel(10, 14);
    await executeProductionElastic({ model: performanceModel, computeTarget: 'cpu' }, noOpContext());
    await executeProductionElastic({ model: performanceModel, computeTarget: 'gpu' }, gpuContext());
    const cpuEndToEndSamples = await benchmark(3, () => executeProductionElastic({
      model: performanceModel,
      computeTarget: 'cpu',
    }, noOpContext()));
    const gpuEndToEndSamples = await benchmark(3, () => executeProductionElastic({
      model: performanceModel,
      computeTarget: 'gpu',
    }, gpuContext()));
    const cpuEndToEnd = summarize(cpuEndToEndSamples);
    const gpuEndToEnd = summarize(gpuEndToEndSamples);
    const speedup = cpuEndToEnd.median / gpuEndToEnd.median;
    const endToEnd = {
      workload: { bays: 10, stories: 14, nodeCount: performanceModel.nodes.length, dofCount: performanceModel.nodes.length * 6 },
      cpu: cpuEndToEnd,
      gpu: gpuEndToEnd,
      speedup,
      threshold: 1.2,
      thresholdMet: speedup >= 1.2,
    };
    const qualification = {
      backwardError: maxBackwardError <= 1e-9,
      loadRelativeResidual: maxLoadRelativeResidual <= 1e-8,
      elasticDisplacementParity: productDelta <= 1e-8,
      directAmplificationParity: directDelta <= 5e-7,
      elasticDesignStatusParity: productGpu.result.designEligibility.status === productCpu.designEligibility.status,
      directDesignStatusParity: directGpu.result.designEligibility.status === directCpu.designEligibility.status,
    };
    const numericQualified = Object.values(qualification).every(Boolean);
    await mixed.dispose();
    mixed = null;
    const platformBeforeDispose = platform.snapshot();
    const platformAfterDispose = await platform.dispose();
    const resourceBalanced = platformAfterDispose.pool.allocationBalanced === true;
    return {
      version: 'p9-m5-browser-raw-v1',
      status: numericQualified && resourceBalanced ? 'PASS' : 'FAIL',
      available: true,
      verificationIds: ['P9-GPU-ELA-01~16', 'P9-PERF-08~10', 'P9-FAIL-01~04'],
      capability: platformBeforeDispose.capability,
      matrix: { rowCount: 512, nnz: sessionBeforeDispose.gpu.nnz },
      numeric: {
        maxBackwardError,
        maxLoadRelativeResidual,
        correctionCount: repeated.diagnostics.correctionCount,
        gpuIterations: repeated.diagnostics.gpuIterations,
        designTransferAllowed: repeated.designTransferAllowed,
        qualified: numericQualified,
        checks: qualification,
      },
      product: {
        elastic: {
          ok: productGpu.result.ok,
          displacementDelta: productDelta,
          designStatus: productGpu.result.designEligibility.status,
          target: productGpu.execution.target,
          fallbackUsed: productGpu.execution.fallbackUsed,
          resourceBalanced: productGpu.execution.resourceBalanced,
        },
        directPDelta: {
          ok: directGpu.result.pDelta.ok,
          amplificationDelta: directDelta,
          designStatus: directGpu.result.designEligibility.status,
          matrixSessionCount: directGpu.execution.pDeltaSessionBeforeDispose.matrixSessionCount,
          reusedMatrixSessionCount: directGpu.execution.pDeltaSessionBeforeDispose.reusedMatrixSessionCount,
          resourceBalanced: directGpu.execution.resourceBalanced,
        },
      },
      performance: {
        residentSpd: summarize(samples),
        endToEnd,
      },
      sessionBeforeDispose,
      resource: {
        beforePlatformDispose: platformBeforeDispose.pool,
        afterPlatformDispose: platformAfterDispose.pool,
        allocationBalanced: resourceBalanced,
      },
    };
  } finally {
    await mixed?.dispose?.();
    if (platform.state !== 'disposed') await platform.dispose();
  }
}

async function benchmark(sampleCount, work) {
  const rows = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const started = performance.now();
    await work();
    rows.push(performance.now() - started);
  }
  return rows;
}

function frameModel(bays, stories) {
  const model = createModel();
  const nodeId = (bay, story) => `N-${bay}-${story}`;
  model.nodes = [];
  for (let story = 0; story <= stories; story += 1) {
    for (let bay = 0; bay <= bays; bay += 1) {
      model.nodes.push({
        id: nodeId(bay, story),
        x: bay * 6,
        y: 0,
        z: story * 3.2,
        ...(story === 0 ? { support: 'fixed' } : {}),
      });
    }
  }
  model.members = [];
  for (let story = 1; story <= stories; story += 1) {
    for (let bay = 0; bay <= bays; bay += 1) {
      model.members.push(member(`C-${bay}-${story}`, nodeId(bay, story - 1), nodeId(bay, story)));
    }
    for (let bay = 0; bay < bays; bay += 1) {
      model.members.push(member(`B-${bay}-${story}`, nodeId(bay, story), nodeId(bay + 1, story)));
    }
  }
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'W', name: 'Wind', type: 'wind' },
  ];
  model.loadCombinations = [
    { id: 'C1', name: 'Service +', type: 'service', factors: { D: 1, W: 1 } },
    { id: 'C2', name: 'Strength -', type: 'strength', factors: { D: 1.2, W: -1.3 } },
  ];
  model.loads = [];
  for (let bay = 0; bay <= bays; bay += 1) {
    model.loads.push({ id: `D-${bay}`, type: 'nodal', node: nodeId(bay, stories), P: 20, dir: '-z', case: 'D' });
    model.loads.push({ id: `W-${bay}`, type: 'nodal', node: nodeId(bay, stories), P: 5, dir: '+x', case: 'W' });
  }
  model.analysisSettings = {
    ...(model.analysisSettings || {}),
    pDeltaMethod: 'off',
    useSparseSolver: true,
    responseSpectrum: { enabled: false },
  };
  return model;
}

function pDeltaColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4 },
  ];
  model.members = [member('M1', 'N1', 'N2')];
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'L', name: 'Lateral', type: 'wind' },
  ];
  model.loadCombinations = [{ id: 'CO1', name: 'D + L', type: 'strength', factors: { D: 1, L: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 80, dir: '-z', case: 'D' },
    { id: 'H1', type: 'nodal', node: 'N2', P: 20, dir: '+x', case: 'L' },
  ];
  model.analysisSettings = {
    ...(model.analysisSettings || {}),
    pDeltaMethod: 'direct',
    pDeltaLoadSteps: 4,
    responseSpectrum: { enabled: false },
  };
  return model;
}

function member(id, n1, n2) {
  return {
    id,
    type: 'frame',
    n1,
    n2,
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  };
}

function noOpContext() {
  return {
    signal: { aborted: false },
    throwIfCancelled() {},
    reportProgress() {},
    commitBoundary() {},
    yieldControl() { return Promise.resolve(); },
  };
}

function tridiagonal(size, diagonal, offDiagonal) {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => (
    row === column ? diagonal : Math.abs(row - column) === 1 ? offDiagonal : 0
  )));
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    unit: 'ms',
    sampleCount: samples.length,
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted.at(-1),
    samples,
  };
}

function failure(error) {
  return {
    version: 'p9-m5-browser-raw-v1',
    status: 'FAIL',
    available: !!navigator.gpu,
    reason: error?.code || error?.message || 'UNKNOWN',
    message: error?.message || String(error),
    details: serializable(error?.details || error?.gpuErrors || null),
  };
}

function serializable(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}
