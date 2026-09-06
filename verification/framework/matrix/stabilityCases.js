import { createModel } from '../../../src/core/model.js';
import { materialOf, sectionOf } from '../../../src/core/catalogs.js';
import { estimateGlobalBucklingTrace } from '../../../src/dynamics/globalBuckling.js';
import { analyzeModel, analyzePDelta } from '../../../src/solver/linear3d.js';
import {
  NONLINEAR_BENCHMARK_VERSION,
  runCantileverLargeDisplacementBenchmark,
  runEulerBucklingBenchmark,
} from '../nonlinearBenchmarks.js';

export const VERIFICATION_STABILITY_CASES = [
  {
    caseId: 'S01',
    tier: 'stability',
    name: 'Euler column benchmark',
    toleranceKey: 'tolerance.pdelta.max',
    referenceSource: 'Euler critical load',
    run: () => {
      const benchmark = runEulerBucklingBenchmark();
      return {
        computed: benchmark.actual,
        reference: benchmark.reference,
        hashInput: benchmark,
        solverVersion: NONLINEAR_BENCHMARK_VERSION,
        metric: 'Pcr',
        details: { benchmarkId: benchmark.id, errorRatio: benchmark.errorRatio },
      };
    },
  },
  {
    caseId: 'S02',
    tier: 'stability',
    name: 'cantilever large-displacement Newton compatibility',
    toleranceKey: 'tolerance.pdelta.max',
    referenceSource: 'corotational estimate vs Newton solution',
    run: () => {
      const benchmark = runCantileverLargeDisplacementBenchmark();
      return {
        computed: benchmark.actual,
        reference: benchmark.reference,
        hashInput: benchmark,
        solverVersion: NONLINEAR_BENCHMARK_VERSION,
        metric: 'tip displacement',
        details: { benchmarkId: benchmark.id, errorRatio: benchmark.errorRatio },
      };
    },
  },
  {
    caseId: 'S03',
    tier: 'stability',
    name: 'global buckling pinned column',
    tolerance: 0.02,
    referenceSource: 'Euler pinned-pinned column closed form',
    run: () => {
      const model = createEulerColumnModel();
      const preloadResult = analyzeModel(model);
      const trace = estimateGlobalBucklingTrace(model, {
        preloadResult,
        preloadCombinationId: 'P',
      });
      const material = materialOf(model, 'steel');
      const section = sectionOf(model, 'h300');
      const reference = (Math.PI ** 2 * material.E * section.Iy) / 3 ** 2;
      return {
        computed: trace.criticalLoadFactor,
        reference,
        model,
        solverVersion: trace.version,
        metric: 'critical load factor',
        details: { status: trace.status, iterations: trace.iterations, residual: trace.residual },
      };
    },
  },
  {
    caseId: 'S04',
    tier: 'stability',
    name: 'P-Delta iteration convergence',
    toleranceKey: 'tolerance.pdelta.max',
    referenceSource: 'secondary load iteration residual',
    run: () => {
      const model = createPDeltaColumnModel();
      const result = analyzePDelta(model, { D: 1, L: 1 }, model.analysisSettings);
      return {
        computed: result.iterations.at(-1)?.residual || 0,
        reference: 0,
        errorScale: 1,
        model,
        solverVersion: result.criteria?.version || 'pdelta-secondary-load-iteration',
        metric: 'terminal residual',
        details: { converged: result.converged, iterationCount: result.iterations.length, amplification: result.amplification },
      };
    },
  },
  {
    caseId: 'S05',
    tier: 'stability',
    name: 'P-Delta curve terminal consistency',
    toleranceKey: 'tolerance.pdelta.max',
    referenceSource: 'P-Delta load-step curve final point',
    run: () => {
      const model = createPDeltaColumnModel();
      model.analysisSettings.includeGeometricStiffness = true;
      const analysis = analyzeModel(model);
      const combo = analysis.pDelta?.byCombo?.CO1;
      const finalPoint = combo?.curve?.global?.points?.at(-1);
      return {
        computed: finalPoint?.secondOrder?.roofDisplacement,
        reference: roofDisplacement(model, combo?.result),
        model,
        solverVersion: combo?.curve?.version || 'pdelta-load-step-curves-v1',
        metric: 'roof displacement',
        details: { converged: combo?.converged || false, curvePointCount: combo?.curve?.global?.points?.length || 0 },
      };
    },
  },
];

function createEulerColumnModel() {
  const nodes = Array.from({ length: 9 }, (_item, index) => ({
    id: `N${index}`,
    x: 0,
    y: 0,
    z: (3 * index) / 8,
    support: index === 0 || index === 8 ? 'custom' : undefined,
    fix: index === 0
      ? [true, true, true, false, false, true]
      : index === 8
        ? [true, true, false, false, false, false]
        : undefined,
  }));
  const members = Array.from({ length: 8 }, (_item, index) => ({
    id: `C${index + 1}`,
    n1: `N${index}`,
    n2: `N${index + 1}`,
    matId: 'steel',
    secId: 'h300',
  }));
  return createModel({
    nodes,
    members,
    loadCases: [{ id: 'P', name: 'Unit compression', type: 'dead' }],
    loadCombinations: [{ id: 'P', name: '1.0P', type: 'strength', factors: { P: 1 } }],
    loads: [{ id: 'P-TOP', type: 'nodal', node: 'N8', P: 1, dir: '-z', case: 'P' }],
  });
}

function createPDeltaColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'L', name: 'Lateral', type: 'wind' },
  ];
  model.loadCombinations = [{ id: 'CO1', name: 'D + L', type: 'strength', factors: { D: 1, L: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 800, dir: '-z', case: 'D' },
    { id: 'H1', type: 'nodal', node: 'N2', P: 20, dir: '+x', case: 'L' },
  ];
  model.analysisSettings.pDeltaMaxIterations = 20;
  model.analysisSettings.pDeltaTolerance = 1e-6;
  return model;
}

function roofDisplacement(model, result) {
  const maxZ = Math.max(...(model.nodes || []).map((node) => Number(node.z) || 0));
  return Math.max(0, ...(model.nodes || [])
    .filter((node) => Math.abs((Number(node.z) || 0) - maxZ) <= 1e-8)
    .map((node) => {
      const d = result?.disp?.[node.id] || [0, 0, 0];
      return Math.hypot(Number(d[0]) || 0, Number(d[1]) || 0);
    }));
}
