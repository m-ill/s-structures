import assert from 'node:assert/strict';
import {
  BENCHMARK_GATE_VERSION,
  runBenchmarkGate,
} from '../src/index.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';

const gate = runBenchmarkGate();
assert.equal(gate.version, BENCHMARK_GATE_VERSION);
assert.equal(gate.count, 10);
assert.equal(gate.ok, true, JSON.stringify(gate.cases, null, 2));
assert.equal(gate.failedCount, 0);
assert.ok(gate.cases.every((item) => item.totalLoad.ok));
assert.ok(gate.cases.every((item) => item.residual == null || item.residual <= gate.residualLimit));

const manifest = buildAgentManifest();
assert.equal(manifest.modules.benchmarkGate, BENCHMARK_GATE_VERSION);
assert.ok(manifest.dataContracts.includes('phase2BenchmarkGate'));
assert.ok(manifest.milestones.some((item) => item.id === 'P2-MVP-S3'));

console.log(JSON.stringify({
  ok: true,
  version: BENCHMARK_GATE_VERSION,
  cases: gate.count,
  failed: gate.failedCount,
}, null, 2));
