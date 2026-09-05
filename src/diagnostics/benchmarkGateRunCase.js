import { analyzeModel } from '../solver/linear3d.js';
import { gateCaseStatus, totalLoadCheck } from './benchmarkGateChecks.js';

export function runBenchmarkGateCase(id, name, create, residualLimit) {
  const fixture = create();
  const analysis = analyzeModel(fixture.model);
  const result = analysis.byCombo?.D_ONLY || Object.values(analysis.byCombo || {})[0];
  const totalLoad = totalLoadCheck(fixture.expected, result?.summary);
  const residual = analysis.audit?.maxEquilibriumResidual;
  const solver = analysis.audit?.maxSolverResidualNorm;
  const status = gateCaseStatus([
    analysis.ok,
    analysis.audit?.ok,
    residual == null || residual <= residualLimit,
    solver == null || solver <= residualLimit,
    totalLoad.ok,
  ]);
  return { id, name, status, residual, solverResidual: solver, totalLoad };
}
