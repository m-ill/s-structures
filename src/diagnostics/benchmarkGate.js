import { BENCHMARK_GATE_CASES } from './benchmarkGateCases.js';
import { runBenchmarkGateCase } from './benchmarkGateRunCase.js';

export const BENCHMARK_GATE_VERSION = 'p2-t05-benchmark-gate';

export function runBenchmarkGate(options = {}) {
  const residualLimit = Number(options.residualLimit || 1e-8);
  const cases = BENCHMARK_GATE_CASES.map(([id, name, create]) => runBenchmarkGateCase(id, name, create, residualLimit));
  return {
    version: BENCHMARK_GATE_VERSION,
    residualLimit,
    count: cases.length,
    ok: cases.every((item) => item.status === 'OK'),
    failedCount: cases.filter((item) => item.status !== 'OK').length,
    cases,
  };
}
