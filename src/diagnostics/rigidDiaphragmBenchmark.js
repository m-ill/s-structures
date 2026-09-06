import { analyzeModel } from '../solver/linear3d.js';
import { createRigidDiaphragmBenchmarkModel } from './rigidDiaphragmBenchmarkModel.js';

export const RIGID_DIAPHRAGM_BENCHMARK_VERSION = 'p2-t11-rigid-diaphragm-benchmark';

export function runRigidDiaphragmBenchmark() {
  const model = createRigidDiaphragmBenchmarkModel();
  const analysis = analyzeModel(model);
  const dx = Math.abs((analysis.byCombo.D_ONLY?.disp.T1?.[0] || 0) - (analysis.byCombo.D_ONLY?.disp.T2?.[0] || 0));
  const result = analysis.byCombo.D_ONLY;
  return {
    version: RIGID_DIAPHRAGM_BENCHMARK_VERSION,
    ok: analysis.ok && dx <= 1e-8 && result?.solver?.diaphragmCount === 1,
    maxPlanDelta: dx,
    diaphragmCount: result?.solver?.diaphragmCount || 0,
    residual: analysis.audit?.maxEquilibriumResidual ?? null,
  };
}
