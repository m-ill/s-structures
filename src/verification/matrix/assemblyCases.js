import { createModel } from '../../core/model.js';
import { createPortalFrameSample } from '../../examples/sampleFrame.js';
import { analyzeModel } from '../../solver/linear3d.js';
import { runMemberReleaseBenchmark } from '../memberReleaseBenchmark.js';
import { runRigidDiaphragmBenchmark } from '../rigidDiaphragmBenchmark.js';

const SOURCE = 'solver equilibrium / benchmark harness regression';

export const VERIFICATION_ASSEMBLY_CASES = [
  {
    caseId: 'A01',
    tier: 'assembly',
    name: 'portal frame global equilibrium',
    toleranceKey: 'tolerance.smallFrame.max',
    referenceSource: SOURCE,
    run: () => equilibriumCase(createPortalFrameSample(), 'portal frame'),
  },
  {
    caseId: 'A02',
    tier: 'assembly',
    name: '3D skew frame global equilibrium',
    toleranceKey: 'tolerance.smallFrame.max',
    referenceSource: SOURCE,
    run: () => equilibriumCase(createSkewFrameModel(), '3D skew frame'),
  },
  {
    caseId: 'A03',
    tier: 'assembly',
    name: 'single-story rigid diaphragm compatibility',
    toleranceKey: 'tolerance.smallFrame.max',
    referenceSource: 'P2 rigid diaphragm benchmark',
    run: () => {
      const benchmark = runRigidDiaphragmBenchmark();
      return {
        computed: benchmark.maxPlanDelta,
        reference: 0,
        errorScale: 1,
        hashInput: benchmark,
        solverVersion: benchmark.version,
        metric: 'max diaphragm in-plane displacement mismatch',
        details: { ok: benchmark.ok, diaphragmCount: benchmark.diaphragmCount, residual: benchmark.residual },
      };
    },
  },
  {
    caseId: 'A04',
    tier: 'assembly',
    name: 'two-story rigid diaphragm compatibility',
    toleranceKey: 'tolerance.smallFrame.max',
    referenceSource: 'rigid diaphragm kinematic constraint',
    run: () => {
      const model = createTwoStoryDiaphragmModel();
      const analysis = analyzeModel(model);
      const result = firstResult(analysis);
      const dx1 = Math.abs((result?.disp?.S1A?.[0] || 0) - (result?.disp?.S1B?.[0] || 0));
      const dx2 = Math.abs((result?.disp?.S2A?.[0] || 0) - (result?.disp?.S2B?.[0] || 0));
      return {
        computed: Math.max(dx1, dx2),
        reference: 0,
        errorScale: 1,
        model,
        solverVersion: solverVersion(result),
        metric: 'max diaphragm in-plane displacement mismatch',
        details: { ok: analysis.ok, diaphragmCount: result?.solver?.diaphragmCount || 0 },
      };
    },
  },
  {
    caseId: 'A05',
    tier: 'assembly',
    name: 'member release benchmark suite',
    toleranceKey: 'tolerance.smallFrame.max',
    referenceSource: 'P2 member release benchmark',
    run: () => {
      const benchmark = runMemberReleaseBenchmark();
      const failed = benchmark.cases.filter((item) => item.status !== 'OK').length;
      return {
        computed: failed,
        reference: 0,
        errorScale: 1,
        hashInput: benchmark,
        solverVersion: benchmark.version,
        metric: 'failed release cases',
        details: { count: benchmark.count, ok: benchmark.ok },
      };
    },
  },
  {
    caseId: 'A06',
    tier: 'assembly',
    name: 'spring support equilibrium',
    toleranceKey: 'tolerance.smallFrame.max',
    referenceSource: SOURCE,
    run: () => equilibriumCase(createSpringSupportModel(), 'spring support beam'),
  },
];

function equilibriumCase(model, metric) {
  const analysis = analyzeModel(model);
  const result = firstResult(analysis);
  return {
    computed: analysis.audit?.maxEquilibriumResidual ?? result?.summary?.equilibriumResidual ?? 0,
    reference: 0,
    errorScale: 1,
    model,
    solverVersion: solverVersion(result),
    metric,
    details: {
      ok: analysis.ok,
      auditOk: analysis.audit?.ok ?? null,
      maxSolverResidualNorm: analysis.audit?.maxSolverResidualNorm ?? null,
    },
  };
}

function createSkewFrameModel() {
  const model = createModel();
  model.nodes = [
    { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B2', x: 5, y: 0.7, z: 0, support: 'fixed' },
    { id: 'B3', x: 5.4, y: 4.2, z: 0, support: 'fixed' },
    { id: 'B4', x: -0.3, y: 3.8, z: 0, support: 'fixed' },
    { id: 'T1', x: 0.2, y: 0.1, z: 3.2 },
    { id: 'T2', x: 5.1, y: 0.9, z: 3.2 },
    { id: 'T3', x: 5.5, y: 4.1, z: 3.2 },
    { id: 'T4', x: -0.1, y: 3.9, z: 3.2 },
  ];
  model.members = [
    member('C1', 'B1', 'T1'),
    member('C2', 'B2', 'T2'),
    member('C3', 'B3', 'T3'),
    member('C4', 'B4', 'T4'),
    member('G1', 'T1', 'T2'),
    member('G2', 'T2', 'T3'),
    member('G3', 'T3', 'T4'),
    member('G4', 'T4', 'T1'),
  ];
  model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }, { id: 'EX', name: 'Earthquake X', type: 'seismic' }];
  model.loadCombinations = [{ id: 'CO1', name: 'D+EX', type: 'strength', factors: { D: 1, EX: 1 } }];
  model.loads = [
    { id: 'W1', type: 'udl', member: 'G1', w: 4, dir: '-z', case: 'D' },
    { id: 'P1', type: 'nodal', node: 'T3', P: 25, dir: '+x', case: 'EX' },
  ];
  return model;
}

function createTwoStoryDiaphragmModel() {
  const model = createModel();
  model.nodes = [
    { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B2', x: 4, y: 0, z: 0, support: 'fixed' },
    { id: 'S1A', x: 0, y: 0, z: 3 },
    { id: 'S1B', x: 4, y: 0, z: 3 },
    { id: 'S2A', x: 0, y: 0, z: 6 },
    { id: 'S2B', x: 4, y: 0, z: 6 },
  ];
  model.members = [
    member('C1A', 'B1', 'S1A'),
    member('C1B', 'B2', 'S1B'),
    member('C2A', 'S1A', 'S2A'),
    member('C2B', 'S1B', 'S2B'),
    member('B1', 'S1A', 'S1B'),
    member('B2', 'S2A', 'S2B'),
  ];
  model.loadCases = [{ id: 'EX', name: 'Earthquake X', type: 'seismic' }];
  model.loadCombinations = [{ id: 'CO1', name: 'EX', type: 'strength', factors: { EX: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'S1A', P: 10, dir: '+x', case: 'EX' },
    { id: 'P2', type: 'nodal', node: 'S2A', P: 20, dir: '+x', case: 'EX' },
  ];
  model.diaphragms = [{ id: 'D1', type: 'rigid', z: 3 }, { id: 'D2', type: 'rigid', z: 6 }];
  return model;
}

function createSpringSupportModel() {
  const model = createModel();
  model.nodes = [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'spring', spring: { kz: 500000 } },
  ];
  model.members = [member('M1', 'A', 'B')];
  model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  model.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'B', P: 10, dir: '-z', case: 'D' }];
  return model;
}

function member(id, n1, n2) {
  return { id, type: 'frame', n1, n2, matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } };
}

function firstResult(analysis) {
  return Object.values(analysis.byCombo || {})[0] || null;
}

function solverVersion(result) {
  return result?.solver?.version || result?.solver?.type || 'linear_static_3d_frame';
}
