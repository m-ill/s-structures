import { createModel } from '../../src/core/model.js';
import { createHingeProperty } from '../../src/nonlinear/properties/hingeRegistry.js';
import { createProductionNonlinearCase } from '../../src/nonlinear/product/preflight.js';

export function createM10Model() {
  const property = createM10HingeProperty();
  return createModel({
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'T', x: 0, y: 0, z: 3, mass: [1, 1, 1, 0, 0, 0] },
    ],
    members: [{
      id: 'C',
      type: 'frame',
      behavior: 'frame',
      n1: 'B',
      n2: 'T',
      matId: 'SS275',
      secId: 'h300',
      localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
      nonlinear: {
        formulation: 'concentrated-plasticity',
        hinges: [{
          id: 'C:i:z',
          memberId: 'C',
          end: 'i',
          axis: 'z',
          propertyId: property.id,
          source: { mode: 'user' },
        }],
      },
    }],
    loads: [{ id: 'G', type: 'nodal', node: 'T', P: 5, direction: [0, 0, -1], case: 'D' }],
    loadCases: [
      { id: 'D', name: 'Dead load', type: 'dead' },
      { id: 'L', name: 'Live load', type: 'live' },
    ],
    loadCombinations: [{
      id: 'GRAV',
      name: 'Nonlinear gravity preload',
      type: 'service',
      purpose: 'gravity-preload',
      factors: { D: 1 },
    }],
    massSources: [{
      id: 'MS',
      name: 'Explicit model mass',
      version: 1,
      includeNodeMass: true,
      includeMemberMass: false,
      components: [{ caseId: 'D', factor: 1 }],
      combos: [],
    }],
    hingeProperties: [property],
    nonlinearMaterials: [],
    nonlinearSections: [],
    linkProperties: [],
    timeHistoryFunctions: [],
    analysisStates: [],
    analysisCases: [],
    analysisSettings: { includeSelfWeight: false },
  });
}

export function createM10PushoverCase(model = createM10Model(), overrides = {}) {
  return createProductionNonlinearCase(model, {
    id: 'PUSH-PROD-01',
    mode: 'pushover',
    gravityCombinationId: 'GRAV',
    controlNodeId: 'T',
    direction: '+x',
    settings: {
      targetDisplacement: 0.06,
      steps: 6,
      fiberPmm: false,
    },
    ...overrides,
  });
}

export function createM10NlthCase(model = createM10Model(), overrides = {}) {
  return createProductionNonlinearCase(model, {
    id: 'NLTH-PROD-01',
    mode: 'nlth',
    gravityCombinationId: 'GRAV',
    massSourceId: 'MS',
    settings: {
      massSourceId: 'MS',
      groundMotionRecords: [{
        id: 'GM-X',
        values: [0, 0.4, -0.25, 0.1, 0],
        dt: 0.02,
        unit: 'm/s2',
        direction: 'x',
        baseline: 'none',
      }],
      newmark: {
        outputDt: 0.02,
        initialDt: 0.02,
        minDt: 0.00125,
        maxIterations: 30,
      },
      fiberPmm: false,
    },
    ...overrides,
  });
}

export function syntheticPushoverResult(input = {}) {
  const capacityCurve = Array.from({ length: 6 }, (_, index) => {
    const displacement = index * 0.01;
    return {
      step: index,
      controlDisplacement: displacement,
      roofDisplacement: displacement,
      baseShear: index <= 4 ? index * 12 : 43,
      lambda: index * 0.2,
      yieldedHingeCount: Math.max(0, index - 2),
      cappingHingeCount: index === 5 ? 1 : 0,
      failedHingeCount: 0,
      stories: [{ id: 'S1', storyId: 'S1', drift: displacement / 3, shear: index * 12 }],
      members: [{ id: 'C', memberId: 'C', N: -5, Mz: index * 10 }],
      hinges: [{ id: 'C:i:z', hingeId: 'C:i:z', memberId: 'C', end: 'i', axis: 'z', state: index >= 3 ? 'yielded' : 'elastic', rotation: displacement / 3 }],
      integration: { nodes: [{ id: 'T', nodeId: 'T', ux: displacement, uy: 0, uz: -0.0002 }] },
      convergence: { converged: true, iterations: index ? 3 : 1, forceNorm: 1e-8, energyNorm: 1e-10 },
    };
  });
  return {
    ok: true,
    status: 'completed',
    kind: 'pushover',
    qualification: 'candidate',
    designBlocked: true,
    designBlockReason: 'P8_M11_INDEPENDENT_QUALIFICATION_PENDING',
    engine: { id: 'p8-production-mdof-pushover', version: 'test-double-v1' },
    routing: { requestedEngineId: 'p8-production-mdof-pushover', executedEngineId: 'p8-production-mdof-pushover', fallbackUsed: false },
    summary: { ok: true, stepCount: capacityCurve.length, peakBaseShear: 48, finalControlDisplacement: 0.05 },
    capacityCurve,
    convergence: { converged: true, maximumIterations: 4 },
    dependencies: { canonical: { identityHash: 'M10-DOMAIN' } },
    provenance: { modelHash: 'M10-MODEL', backend: 'production-wasm-sparse' },
    runRecord: { id: 'NLRUN-PUSH-01', caseId: 'PUSH-PROD-01' },
    ...input,
  };
}

export function syntheticNlthResult(input = {}) {
  const rows = Array.from({ length: 240 }, (_, index) => {
    const time = index * 0.02;
    const response = Math.sin(index / 13) * (1 + index / 500);
    return {
      time,
      q: [response, response * 0.2, -0.0002],
      baseReactionForce: [-response * 15, response * 2, 5],
      energies: {
        input: Math.abs(response) * 2,
        kinetic: response * response * 0.3,
        strain: response * response * 0.5,
        damping: time * 0.02,
      },
      convergence: { converged: true, iterations: 3, forceNorm: 1e-8 },
    };
  });
  return {
    ok: true,
    status: 'completed',
    kind: 'nlth',
    qualification: 'candidate',
    designBlocked: true,
    designBlockReason: 'P8_M11_INDEPENDENT_QUALIFICATION_PENDING',
    engine: { id: 'p8-production-mdof-nlth', version: 'test-double-v1' },
    routing: { requestedEngineId: 'p8-production-mdof-nlth', executedEngineId: 'p8-production-mdof-nlth', fallbackUsed: false },
    summary: { ok: true, outputStepCount: rows.length, completedTime: rows.at(-1).time, rejectedStepCount: 0 },
    history: {
      outputStepCount: rows.length,
      retainedChunks: [
        { id: 'CHUNK-1', rows: rows.slice(0, 120) },
        { id: 'CHUNK-2', rows: rows.slice(120) },
      ],
      envelopes: { 'q[0]': { absoluteMaximum: 1.4 } },
    },
    historyEnvelope: {
      stories: { S1: { id: 'S1', storyId: 'S1', drift: 0.004, shear: 22 } },
      members: { C: { id: 'C', memberId: 'C', N: -5, Mz: 18 } },
    },
    integration: {
      nodes: { T: { id: 'T', nodeId: 'T', ux: 0.012, uy: 0.001, uz: -0.0002 } },
      hinges: [{ id: 'C:i:z', hingeId: 'C:i:z', memberId: 'C', end: 'i', axis: 'z', state: 'yielded' }],
    },
    convergence: { matrixClass: 'general', converged: true },
    dependencies: { canonical: { identityHash: 'M10-DOMAIN' } },
    provenance: { modelHash: 'M10-MODEL', backend: 'production-wasm-sparse' },
    runRecord: { id: 'NLRUN-NLTH-01', caseId: 'NLTH-PROD-01' },
    ...input,
  };
}

function createM10HingeProperty() {
  const side = [
    { id: 'A', rotation: 0, moment: 0 },
    { id: 'B', rotation: 0.0005, moment: 55 },
    { id: 'C', rotation: 0.012, moment: 62 },
    { id: 'D', rotation: 0.035, moment: 48 },
    { id: 'E', rotation: 0.07, moment: 5 },
  ];
  return createHingeProperty({
    id: 'HP-C-Z',
    qualification: 'candidate',
    units: { rotation: 'rad', moment: 'kN-m', length: 'm' },
    parameters: {
      positive: side,
      negative: side,
      hingeLength: 0.2,
      hysteresis: { rule: 'kinematic-masing' },
      regularization: { tangentPolicy: 'diagnostic-only' },
      integration: { maxRotationIncrement: 0.0001, maxSubsteps: 1024 },
    },
    source: { type: 'closed-form-test', reference: 'P8-M10-product-workflow-fixture' },
  });
}
