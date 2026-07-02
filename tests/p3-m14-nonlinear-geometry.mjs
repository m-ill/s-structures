import assert from 'node:assert/strict';
import {
  COROTATIONAL_BEAM_VERSION,
  NONLINEAR_ASSEMBLY_VERSION,
  NEWTON_RAPHSON_VERSION,
  NONLINEAR_BENCHMARK_VERSION,
  NONLINEAR_GEOMETRY_TRACE_VERSION,
  NONLINEAR_STATE_VERSION,
  NONLINEAR_TRACE_VERSION,
  advanceAnalysisState,
  buildCorotationalBeamState,
  buildNonlinearTangentAssembly,
  buildNonlinearAnalysisTrace,
  createAnalysisState,
  createPortalFrameSample,
  evaluateConvergenceNorms,
  geometricStiffnessTrace,
  runNonlinearGeometryBenchmarks,
  snapshotAnalysisState,
  solveNewtonRaphson,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const state = createAnalysisState({ u: 6, lambda: 0.2 });
assert.equal(state.version, NONLINEAR_STATE_VERSION);
const next = advanceAnalysisState(state, { dLambda: 0.1, du: [1, 0, 0, 0, 0, 0], converged: true, iterations: 3 });
assert.equal(next.step, 1);
assert.ok(Math.abs(next.lambda - 0.3) < 1e-12);
assert.equal(snapshotAnalysisState(next).u[0], 1);
const restored = createAnalysisState({ hinges: [{ id: 'H1', state: 'elastic', rotation: 0.01 }] });
assert.equal(snapshotAnalysisState(restored).hinges[0].id, 'H1');

const beam = buildCorotationalBeamState({ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 3, y: 0, z: 0 }, { N2: [0, 0.4, 0] });
assert.equal(beam.version, COROTATIONAL_BEAM_VERSION);
assert.ok(beam.length > 3);
assert.ok(beam.rotation.e1[0] < 1);

const kg = geometricStiffnessTrace({ axialForce: 100, length: 5 });
assert.equal(kg.matrix2[0][0], 20);
assert.equal(kg.matrix2[0][1], -20);

const assemblyModel = createPortalFrameSample();
const assemblyMemberId = assemblyModel.members[0].id;
const assembly = buildNonlinearTangentAssembly(assemblyModel, createAnalysisState(), {
  axialForces: { [assemblyMemberId]: 50 },
  hinges: [{ memberId: assemblyMemberId, end: 'i', rotation: 0.02, My: 20, thetaY: 0.01 }],
});
assert.equal(assembly.version, NONLINEAR_ASSEMBLY_VERSION);
assert.equal(assembly.ok, true);
assert.ok(assembly.summary.elasticMemberCount > 0);
assert.ok(assembly.summary.geometricMemberCount >= 1);
assert.ok(assembly.summary.hingeCorrectionCount >= 1);
assert.ok(assembly.summary.maxAbsTangent > 0);

const convergence = evaluateConvergenceNorms({ force: 1e-5, displacement: 1e-5, energy: 1e-8 }, { force: 1, displacement: 1, energy: 1 });
assert.equal(convergence.converged, true);

const nr = solveNewtonRaphson({
  initial: 1,
  residual: (x) => x * x - 4,
  tangent: (x) => 2 * x,
});
assert.equal(nr.version, NEWTON_RAPHSON_VERSION);
assert.equal(nr.converged, true);
assert.equal(nr.lineSearchEnabled, true);
assert.equal(nr.convergenceReason, 'CONVERGED');
assert.ok(Math.abs(nr.x - 2) < 1e-6);

const benchmarks = runNonlinearGeometryBenchmarks();
assert.equal(benchmarks.version, NONLINEAR_BENCHMARK_VERSION);
assert.equal(benchmarks.ok, true);
assert.equal(benchmarks.cases.length, 2);
assert.ok(benchmarks.cases.every((item) => ['B1', 'B2'].includes(item.id)));

const model = createPortalFrameSample();
const trace = buildNonlinearAnalysisTrace(model);
assert.equal(trace.version, NONLINEAR_TRACE_VERSION);
assert.ok(trace.method.control.includes('load'));
assert.equal(trace.geometryGate.version, NONLINEAR_GEOMETRY_TRACE_VERSION);
assert.equal(trace.geometryGate.contracts.assembly, NONLINEAR_ASSEMBLY_VERSION);
assert.equal(trace.geometryGate.assembly.version, NONLINEAR_ASSEMBLY_VERSION);
assert.deepEqual(trace.geometryGate.benchmarks.requiredCases, ['B1', 'B2']);
assert.equal(trace.geometryGate.convergence.lineSearchEnabled, true);
assert.equal(trace.benchmarks.geometry.ok, true);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => null });
const apiTrace = agent.getNonlinearAnalysisTrace();
assert.equal(apiTrace.version, NONLINEAR_TRACE_VERSION);
assert.equal(apiTrace.benchmarks.geometry.version, NONLINEAR_BENCHMARK_VERSION);
assert.equal(apiTrace.geometryGate.milestone, 'P3-M14');
assert.ok(agent.getCapabilities().readApis.includes('getNonlinearAnalysisTrace'));
assert.ok(agent.getCapabilities().dataContracts.includes('phase3NonlinearGeometryTrace'));

console.log(JSON.stringify({ ok: true, version: 'p3-m14-nonlinear-geometry' }, null, 2));
