export const NONLINEAR_CAPABILITY_VERSION = 'p8-m5-nonlinear-capability-v2';
export const NONLINEAR_PRODUCT_SCOPE_VERSION = 'p8-m0-product-scope-v1';

export const NONLINEAR_ENGINE_IDS = Object.freeze({
  legacyPushover: 'legacy-preliminary-stepwise-secant',
  legacySdofNlth: 'legacy-sdof-bilinear-newmark',
  productionNonlinearStatic: 'p8-production-mdof-nonlinear-static',
  productionPushover: 'p8-production-mdof-pushover',
  productionNlth: 'p8-production-mdof-nlth',
});

export const NONLINEAR_QUALIFICATIONS = Object.freeze([
  'legacy-preliminary',
  'implemented',
  'candidate',
  'verified',
  'blocked',
  'unsupported',
  'invalid',
]);

export const NONLINEAR_CASE_KINDS = new Set([
  'pushover',
  'nlth',
  'nonlinearStatic',
  'nonlinearTimeHistory',
]);

const CAPABILITIES = Object.freeze({
  [NONLINEAR_ENGINE_IDS.legacyPushover]: Object.freeze({
    version: NONLINEAR_CAPABILITY_VERSION,
    engineId: NONLINEAR_ENGINE_IDS.legacyPushover,
    caseKinds: ['pushover'],
    available: true,
    production: false,
    qualification: 'legacy-preliminary',
    qualificationCeiling: 'legacy-preliminary',
    designBlocked: true,
    modelBound: true,
    formulation: {
      geometry: 'small-displacement-linear-steps',
      material: 'previous-step-hinge-secant-degradation',
      equilibrium: 'independent-linear-step-solves',
      control: 'load-factor',
    },
    supportedControls: ['load-factor'],
    unsupportedControls: ['displacement', 'arcLength'],
    limitations: [
      'Uses one linear frame solve per load-factor step.',
      'Uses the previous accepted step hinge state for secant stiffness degradation.',
      'Does not assemble a simultaneous nonlinear residual and consistent tangent.',
      'Does not execute augmented displacement-control or arc-length equations.',
    ],
  }),
  [NONLINEAR_ENGINE_IDS.legacySdofNlth]: Object.freeze({
    version: NONLINEAR_CAPABILITY_VERSION,
    engineId: NONLINEAR_ENGINE_IDS.legacySdofNlth,
    caseKinds: ['nlth'],
    available: true,
    production: false,
    qualification: 'legacy-preliminary',
    qualificationCeiling: 'legacy-preliminary',
    designBlocked: true,
    modelBound: false,
    formulation: {
      geometry: 'scalar-sdof',
      material: 'bilinear-spring',
      equilibrium: 'newmark-average-acceleration-step-newton',
      control: 'time-step',
    },
    supportedControls: ['time-step'],
    unsupportedControls: [],
    limitations: [
      'Integrates one scalar mass, damping, and bilinear spring system.',
      'Does not assemble mass, damping, resisting force, or tangent from the 3D model.',
      'Cannot be represented as model-bound frame nonlinear time-history analysis.',
    ],
  }),
  [NONLINEAR_ENGINE_IDS.productionNonlinearStatic]: reservedCapability(
    NONLINEAR_ENGINE_IDS.productionNonlinearStatic,
    ['nonlinearStatic'],
    ['load'],
  ),
  [NONLINEAR_ENGINE_IDS.productionPushover]: Object.freeze({
    version: NONLINEAR_CAPABILITY_VERSION,
    engineId: NONLINEAR_ENGINE_IDS.productionPushover,
    caseKinds: ['pushover'],
    available: true,
    production: true,
    qualification: 'candidate',
    qualificationCeiling: 'candidate',
    designBlocked: true,
    modelBound: true,
    executionMode: 'async',
    formulation: {
      geometry: 'objective-corotational-3d',
      material: 'state-dependent-concentrated-plasticity',
      equilibrium: 'current-step-mdof-consistent-tangent',
      control: 'augmented-displacement',
    },
    supportedControls: ['displacement'],
    unsupportedControls: ['load-factor', 'arcLength'],
    limitations: [
      'Candidate Phase 8 engine; design transfer remains blocked pending qualification.',
      'Execution requires the asynchronous nonlinear analysis runner.',
      'Arc-length continuation is not available in P8-M5.',
    ],
  }),
  [NONLINEAR_ENGINE_IDS.productionNlth]: reservedCapability(
    NONLINEAR_ENGINE_IDS.productionNlth,
    ['nonlinearTimeHistory'],
    ['time-step'],
  ),
});

export function listNonlinearCapabilities() {
  return Object.values(CAPABILITIES).map(clone);
}

export function getNonlinearCapability(engineId) {
  const capability = CAPABILITIES[String(engineId || '')];
  return capability ? clone(capability) : null;
}

export function isLegacyNonlinearEngine(engineId) {
  return [NONLINEAR_ENGINE_IDS.legacyPushover, NONLINEAR_ENGINE_IDS.legacySdofNlth].includes(engineId);
}

export function defaultNonlinearEngineId(kind) {
  if (kind === 'pushover') return NONLINEAR_ENGINE_IDS.legacyPushover;
  if (kind === 'nlth') return NONLINEAR_ENGINE_IDS.legacySdofNlth;
  if (kind === 'nonlinearStatic') return NONLINEAR_ENGINE_IDS.productionNonlinearStatic;
  if (kind === 'nonlinearTimeHistory') return NONLINEAR_ENGINE_IDS.productionNlth;
  return null;
}

export function evaluateNonlinearCapability({ kind, engineId } = {}) {
  if (!NONLINEAR_CASE_KINDS.has(kind)) {
    return { ok: true, nonlinear: false, capability: null, code: null };
  }
  const resolvedEngineId = String(engineId || defaultNonlinearEngineId(kind) || '');
  const capability = getNonlinearCapability(resolvedEngineId);
  if (!capability) {
    return {
      ok: false,
      nonlinear: true,
      engineId: resolvedEngineId || null,
      capability: null,
      code: 'NONLINEAR_ENGINE_UNKNOWN',
      message: `Unknown nonlinear engine: ${resolvedEngineId || '(missing)'}`,
    };
  }
  if (!capability.caseKinds.includes(kind)) {
    return {
      ok: false,
      nonlinear: true,
      engineId: resolvedEngineId,
      capability,
      code: 'NONLINEAR_ENGINE_CASE_MISMATCH',
      message: `Engine ${resolvedEngineId} does not support analysis case kind ${kind}.`,
    };
  }
  if (!capability.available) {
    return {
      ok: false,
      nonlinear: true,
      engineId: resolvedEngineId,
      capability,
      code: 'NONLINEAR_ENGINE_NOT_AVAILABLE',
      message: `Engine ${resolvedEngineId} is reserved but not implemented. No legacy fallback is permitted.`,
    };
  }
  return { ok: true, nonlinear: true, engineId: resolvedEngineId, capability, code: null };
}

export function buildNonlinearProductScopeCatalog() {
  return {
    version: NONLINEAR_PRODUCT_SCOPE_VERSION,
    currentGrade: 'Q0',
    releaseRule: 'Feature qualification is independent; no scope is commercial-grade before Q1 through Q5 pass.',
    scopes: {
      'P8-S1': {
        name: 'Production Frame Scope',
        status: 'planned',
        required: true,
        features: [
          '3d-frame-truss-6dof',
          'gravity-preloaded-pushover',
          'mdof-direct-integration-nlth',
          'load-displacement-arc-length-control',
          'concentrated-and-fiber-plasticity',
          'worker-wasm-sparse-runtime',
          'qualified-results-report-api',
        ],
      },
      'P8-S2': {
        name: 'Extended Building Scope',
        status: 'planned-after-s1',
        required: false,
        features: [
          'nonlinear-links-and-unilateral-truss',
          'multi-component-ground-motion',
          'case-state-continuation',
          'cyclic-static-protocol',
          'checkpoint-restart-batch',
        ],
      },
    },
    qualificationGrades: [
      { id: 'Q0', name: 'Prototype', status: 'current' },
      { id: 'Q1', name: 'Numerically Qualified', status: 'not-achieved' },
      { id: 'Q2', name: 'Model-Integrated', status: 'not-achieved' },
      { id: 'Q3', name: 'Workflow-Complete', status: 'not-achieved' },
      { id: 'Q4', name: 'Scale-Qualified', status: 'not-achieved' },
      { id: 'Q5', name: 'Commercial-Grade in Scope', status: 'not-achieved' },
    ],
    engines: listNonlinearCapabilities(),
  };
}

function reservedCapability(engineId, caseKinds, supportedControls) {
  return Object.freeze({
    version: NONLINEAR_CAPABILITY_VERSION,
    engineId,
    caseKinds,
    available: false,
    production: true,
    qualification: 'blocked',
    qualificationCeiling: 'blocked',
    designBlocked: true,
    modelBound: true,
    formulation: {
      geometry: 'corotational-3d',
      material: 'state-dependent',
      equilibrium: 'mdof-consistent-tangent',
      control: supportedControls.join('|'),
    },
    supportedControls,
    unsupportedControls: [],
    limitations: ['Reserved Phase 8 engine ID. Execution is blocked until its capability gate is implemented and qualified.'],
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
