import { createModel } from '../../core/model.js';
import { materialOf, sectionOf } from '../../core/catalogs.js';
import {
  DYNAMIC_COMPLETENESS_VERSION,
  buildCqcCombinationReport,
  runLinearSdofTha,
  runModalSuperpositionTha,
} from '../../dynamics/elasticCompleteness.js';
import { analyzeDynamics, runResponseSpectrum } from '../../dynamics/modal.js';

export const VERIFICATION_DYNAMIC_CASES = [
  {
    caseId: 'D01',
    tier: 'dynamic',
    name: 'SDOF zero-input time history',
    toleranceKey: 'tolerance.modal.max',
    referenceSource: 'Newmark average acceleration invariant',
    run: () => {
      const trace = runLinearSdofTha({ period: 1, accelerations: [0, 0, 0, 0] });
      return {
        computed: trace.maxDisplacement,
        reference: 0,
        errorScale: 1,
        hashInput: { period: 1, accelerations: [0, 0, 0, 0] },
        solverVersion: trace.version,
        metric: 'max displacement under zero excitation',
      };
    },
  },
  {
    caseId: 'D02',
    tier: 'dynamic',
    name: 'cantilever weak-axis modal period',
    toleranceKey: 'tolerance.modal.max',
    referenceSource: 'closed-form cantilever k = 3EI/L^3',
    run: () => {
      const model = createModalColumnModel();
      const dynamics = analyzeDynamics(model);
      const material = materialOf(model, 'steel');
      const section = sectionOf(model, 'h300');
      const L = 4;
      const topMass = 10 + (material.density * section.A * L) / 2;
      const weakAxisK = (3 * material.E * section.Iy) / L ** 3;
      const expected = 2 * Math.PI * Math.sqrt(topMass / weakAxisK);
      return {
        computed: dynamics.modes?.[0]?.period,
        reference: expected,
        model,
        solverVersion: dynamics.type || DYNAMIC_COMPLETENESS_VERSION,
        metric: 'first modal period',
        details: { modeCount: dynamics.modes?.length || 0 },
      };
    },
  },
  {
    caseId: 'D03',
    tier: 'dynamic',
    name: 'modal participating mass ratio',
    toleranceKey: 'tolerance.modalParticipation.max',
    referenceSource: 'single translational mass participation invariant',
    run: () => {
      const model = createModalColumnModel();
      const dynamics = analyzeDynamics(model);
      return {
        computed: Math.abs(1 - (dynamics.modes?.[0]?.participation?.y?.massRatio || 0)),
        reference: 0,
        errorScale: 1,
        model,
        solverVersion: dynamics.type || DYNAMIC_COMPLETENESS_VERSION,
        metric: '|1 - first mode Y mass ratio|',
      };
    },
  },
  {
    caseId: 'D04',
    tier: 'dynamic',
    name: 'one-mode response-spectrum displacement',
    toleranceKey: 'tolerance.rsa.max',
    referenceSource: 'u = gamma Sa / omega^2',
    run: () => {
      const mode = { id: 'M1', period: 1, omega: 2 * Math.PI, participation: { x: { gamma: 1.25, massRatio: 1 } } };
      const rsa = runResponseSpectrum([mode], [0], [1], [1, 0, 0], {
        method: 'SRSS',
        directions: ['x'],
        scale: 9.80665,
        points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
      });
      return {
        computed: rsa.combined.x.srssDisplacement,
        reference: Math.abs(mode.participation.x.gamma * 0.4 * 9.80665 / mode.omega ** 2),
        hashInput: { mode, spectrum: rsa.spectrum },
        solverVersion: rsa.version,
        metric: 'SRSS displacement',
      };
    },
  },
  {
    caseId: 'D05',
    tier: 'dynamic',
    name: 'CQC close-mode combination',
    toleranceKey: 'tolerance.rsa.max',
    referenceSource: 'CQC closed-form modal correlation',
    run: () => {
      const responses = [
        { mode: 'M1', period: 1, displacement: 2 },
        { mode: 'M2', period: 1.05, displacement: 1 },
      ];
      const dampingRatio = 0.05;
      const report = buildCqcCombinationReport(responses, dampingRatio);
      return {
        computed: report.cqc,
        reference: cqcReference(responses, dampingRatio),
        hashInput: { responses, dampingRatio },
        solverVersion: report.version,
        metric: 'CQC combined displacement',
        details: { closeModeCount: report.closeModes.length, cqcToSrss: report.cqcToSrss },
      };
    },
  },
  {
    caseId: 'D06',
    tier: 'dynamic',
    name: 'single-mode THA compatibility',
    toleranceKey: 'tolerance.modal.max',
    referenceSource: 'modal-superposition one-mode equivalence',
    run: () => {
      const accelerations = [0, 0.1, -0.1, 0.05, 0];
      const direct = runLinearSdofTha({ period: 1, accelerations });
      const modal = runModalSuperpositionTha({
        modes: [{ id: 'M1', period: 1, participation: { x: { gamma: 1 } } }],
        accelerations,
      });
      return {
        computed: modal.maxDisplacement,
        reference: direct.maxDisplacement,
        hashInput: { accelerations, period: 1 },
        solverVersion: modal.version,
        metric: 'max displacement',
      };
    },
  },
];

function createModalColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
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
  model.loads = [];
  // D02 is compared with the Euler-Bernoulli closed form k = 3EI/L^3.
  // Keep shear deformation off so the numerical model matches that reference.
  model.analysisSettings.shearDeformation = false;
  model.analysisSettings.modalModeCount = 4;
  model.analysisSettings.responseSpectrum = {
    enabled: true,
    dampingRatio: 0.05,
    scale: 9.80665,
    directions: ['x', 'y'],
    points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
  };
  return model;
}

function cqcReference(responses, dampingRatio) {
  let sum = 0;
  for (const a of responses) {
    for (const b of responses) {
      sum += rho(a.period, b.period, dampingRatio) * a.displacement * b.displacement;
    }
  }
  return Math.sqrt(Math.max(0, sum));
}

function rho(Ti, Tj, zeta) {
  const r = Math.max(Ti, Tj) / Math.max(1e-12, Math.min(Ti, Tj));
  return (8 * zeta ** 2 * (1 + r) * r ** 1.5) / ((1 - r ** 2) ** 2 + 4 * zeta ** 2 * r * (1 + r) ** 2) || 1;
}
