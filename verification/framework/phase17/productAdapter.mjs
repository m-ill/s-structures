import {
  ANALYSIS_RUNNER_VERSION,
  PRODUCT_ANALYSIS_SERVICE_VERSION,
  SCHEMA_VERSION,
  createAnalysisProductService,
  runAnalysisCaseAsync,
  validateModel,
} from '../../../src/index.js';

export const P17_PRODUCT_ADAPTER_VERSION = 'p17-m1-product-adapter-v1';
export const P17_PRODUCT_MODEL_SCHEMA_VERSION = SCHEMA_VERSION;
export const P17_PRODUCT_PUBLIC_ENTRYPOINT = 'src/index.js';
export const P17_PRODUCT_ADAPTER_MODES = Object.freeze({
  official: 'OFFICIAL_PUBLIC_SERVICE',
  testOnly: 'TEST_ONLY_INJECTED',
});

const PUBLIC_RUNNER_ORIGIN = 'S_STRUCTURES_PUBLIC_ANALYSIS_RUNNER';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'blocked', 'cancelled']);

/**
 * Verification-side boundary around the public product analysis service.
 *
 * The adapter never imports a solver, element, matrix, dynamics, nonlinear, or
 * reporting implementation. Official qualification always owns the public
 * factory and public case runner binding. Service injection is available only
 * through an explicitly non-qualifiable TEST_ONLY_INJECTED adapter.
 */
export function createP17ProductAdapter(options = {}) {
  const configuration = configureAdapter(options);
  const {
    mode,
    serviceFactory,
    serviceInstance,
    serviceOptions,
    executionProvenance,
  } = configuration;

  return Object.freeze({
    version: P17_PRODUCT_ADAPTER_VERSION,
    productServiceVersion: PRODUCT_ANALYSIS_SERVICE_VERSION,
    publicEntrypoint: P17_PRODUCT_PUBLIC_ENTRYPOINT,
    mode,
    executionProvenance,
    policy: Object.freeze({
      requestedComputeTarget: 'cpu',
      externalSolverRuntime: 'FORBIDDEN',
      networkFallback: 'FORBIDDEN',
      implicitFallback: 'FORBIDDEN',
      verificationReferenceInjection: 'FORBIDDEN',
    }),
    describe,
    preflight,
    execute,
  });

  function describe() {
    return deepFreeze({
      adapterVersion: P17_PRODUCT_ADAPTER_VERSION,
      productServiceVersion: PRODUCT_ANALYSIS_SERVICE_VERSION,
      publicEntrypoint: P17_PRODUCT_PUBLIC_ENTRYPOINT,
      executionPath: ['service.start', 'service.wait', 'service.getStatus', 'service.getResult'],
      requestedComputeTarget: 'cpu',
      fallbackPolicy: 'forbidden',
      externalRuntimePolicy: 'FORBIDDEN',
      externalRuntimeObservation: 'REQUIRED_EXPLICIT_FALSE_BEFORE_QUALIFICATION',
      networkFallbackObservation: 'REQUIRED_EXPLICIT_FALSE_BEFORE_QUALIFICATION',
      executionProvenance,
    });
  }

  function preflight(request = {}) {
    const errors = validateRequest(request);
    if (errors.length) return deepFreeze({ ok: false, errors, productPreflight: null, executionProvenance });
    const service = resolveService();
    try {
      const productPreflight = service.validate(toProductRequest(request));
      return deepFreeze({
        ok: productPreflight?.ok === true,
        errors: productPreflight?.ok === true
          ? []
          : Array.from(productPreflight?.blocking || [], (item) => item?.code || 'PRODUCT_PREFLIGHT_BLOCKED'),
        productPreflight,
        executionProvenance,
      });
    } finally {
      if (!serviceInstance) service.dispose?.();
    }
  }

  async function execute(request = {}) {
    const errors = validateRequest(request);
    if (errors.length) throw adapterError('P17_PRODUCT_REQUEST_INVALID', errors.join(', '));
    const service = resolveService();
    try {
      assertServiceContract(service);
      const productRequest = toProductRequest(request);
      const productPreflight = service.validate(productRequest);
      if (productPreflight?.ok !== true) {
        const reasonCodes = Array.from(productPreflight?.blocking || [], (item) => item?.code || 'PRODUCT_PREFLIGHT_BLOCKED');
        throw adapterError('P17_PRODUCT_PREFLIGHT_BLOCKED', reasonCodes.join(', ') || 'Product preflight blocked the run.');
      }
      const started = service.start(productRequest);
      const jobId = clean(started?.id || started?.jobId);
      if (!jobId) throw adapterError('P17_PRODUCT_JOB_ID_MISSING', 'The public product service returned no job ID.');
      if (jobId !== request.runId) {
        throw adapterError('P17_PRODUCT_RUN_ID_MISMATCH', `Expected ${request.runId}, received ${jobId}.`);
      }
      await service.wait(jobId);
      const status = service.getStatus(jobId);
      if (!TERMINAL_STATUSES.has(status?.status)) {
        throw adapterError('P17_PRODUCT_NON_TERMINAL_RESULT', `Product job ${jobId} ended at ${status?.status || 'unknown'}.`);
      }
      const result = service.getResult(jobId);
      const executionPolicy = assertP17ProductExecutionPolicy(result, { mode });
      return deepFreeze({
        adapterVersion: P17_PRODUCT_ADAPTER_VERSION,
        productServiceVersion: PRODUCT_ANALYSIS_SERVICE_VERSION,
        runId: jobId,
        status,
        result,
        externalRuntimePolicy: 'FORBIDDEN',
        externalRuntimeObservation: executionPolicy.externalRuntimeObservation,
        networkFallbackObservation: executionPolicy.networkFallbackObservation,
        requestedComputeTarget: 'cpu',
        fallbackPolicy: 'forbidden',
        executionProvenance,
      });
    } finally {
      if (!serviceInstance) service.dispose?.();
    }
  }

  function resolveService() {
    const service = serviceInstance || serviceFactory(serviceOptions);
    assertServiceContract(service);
    return service;
  }
}

function configureAdapter(options) {
  if (!plainRecord(options)) throw adapterError('P17_ADAPTER_OPTIONS_INVALID', 'Adapter options must be a plain object.');
  const mode = options.mode || P17_PRODUCT_ADAPTER_MODES.official;
  if (!Object.values(P17_PRODUCT_ADAPTER_MODES).includes(mode)) {
    throw adapterError('P17_ADAPTER_MODE_INVALID', `Unsupported adapter mode: ${String(mode)}`);
  }

  const injectionKeys = ['service', 'serviceFactory', 'serviceOptions', 'caseRunner', 'testProvenance'];
  if (mode === P17_PRODUCT_ADAPTER_MODES.official) {
    const injected = injectionKeys.filter((key) => Object.hasOwn(options, key));
    const unknown = Object.keys(options).filter((key) => key !== 'mode');
    if (injected.length || unknown.length) {
      throw adapterError(
        'P17_OFFICIAL_SERVICE_INJECTION_FORBIDDEN',
        `Official qualification owns its public service boundary; rejected options: ${[...new Set([...injected, ...unknown])].sort().join(', ')}.`,
      );
    }
    return {
      mode,
      serviceFactory: createAnalysisProductService,
      serviceInstance: null,
      serviceOptions: {
        caseRunner(model, analysisCase, executionOptions) {
          return runAnalysisCaseAsync(model, analysisCase, executionOptions);
        },
      },
      executionProvenance: deepFreeze({
        mode,
        terminalQualificationEligible: true,
        serviceOrigin: 'PUBLIC_FACTORY',
        callerServiceInjected: false,
        callerServiceFactoryInjected: false,
        callerCaseRunnerInjected: false,
        caseRunnerBinding: 'PUBLIC_RUN_ANALYSIS_CASE_ASYNC',
        publicEntrypoint: P17_PRODUCT_PUBLIC_ENTRYPOINT,
        testFixtureId: null,
        testProvenance: null,
      }),
    };
  }

  const allowed = new Set(['mode', 'service', 'serviceFactory', 'serviceOptions', 'testProvenance']);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw adapterError('P17_TEST_ADAPTER_OPTION_UNKNOWN', `Unknown test-only options: ${unknown.sort().join(', ')}.`);
  if (Boolean(options.service) === Boolean(options.serviceFactory)) {
    throw adapterError('P17_TEST_SERVICE_INJECTION_REQUIRED', 'Test-only mode requires exactly one injected service or serviceFactory.');
  }
  if (options.serviceFactory && typeof options.serviceFactory !== 'function') {
    throw adapterError('P17_TEST_SERVICE_FACTORY_INVALID', 'Test-only serviceFactory must be a function.');
  }
  if (options.service && Object.hasOwn(options, 'serviceOptions')) {
    throw adapterError('P17_TEST_SERVICE_OPTIONS_WITH_INSTANCE_FORBIDDEN', 'serviceOptions cannot accompany an injected service instance.');
  }
  if (options.serviceOptions !== undefined && !plainRecord(options.serviceOptions)) {
    throw adapterError('P17_TEST_SERVICE_OPTIONS_INVALID', 'Test-only serviceOptions must be a plain object.');
  }
  const testProvenance = normalizeTestProvenance(options.testProvenance);
  const caseRunnerInjected = typeof options.serviceOptions?.caseRunner === 'function';
  return {
    mode,
    serviceFactory: options.serviceFactory || null,
    serviceInstance: options.service || null,
    serviceOptions: { ...(options.serviceOptions || {}) },
    executionProvenance: deepFreeze({
      mode,
      terminalQualificationEligible: false,
      serviceOrigin: options.service ? 'TEST_ONLY_SERVICE_INSTANCE' : 'TEST_ONLY_SERVICE_FACTORY',
      callerServiceInjected: Boolean(options.service),
      callerServiceFactoryInjected: Boolean(options.serviceFactory),
      callerCaseRunnerInjected: caseRunnerInjected,
      caseRunnerBinding: caseRunnerInjected ? 'TEST_ONLY_CALLER_CASE_RUNNER' : 'TEST_ONLY_SERVICE_OWNED',
      publicEntrypoint: P17_PRODUCT_PUBLIC_ENTRYPOINT,
      testFixtureId: testProvenance.fixtureId,
      testProvenance,
    }),
  };
}

function normalizeTestProvenance(value) {
  if (!plainRecord(value)) throw adapterError('P17_TEST_PROVENANCE_REQUIRED', 'Test-only mode requires explicit testProvenance.');
  const expectedKeys = ['benchmarkExecuted', 'fixtureId', 'purpose', 'solverExecuted', 'source'];
  if (!sameSet(Object.keys(value), expectedKeys)) {
    throw adapterError('P17_TEST_PROVENANCE_INVALID', `testProvenance must contain exactly: ${expectedKeys.join(', ')}.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{3,127}$/u.test(clean(value.fixtureId))) {
    throw adapterError('P17_TEST_PROVENANCE_INVALID', 'testProvenance.fixtureId is invalid.');
  }
  if (!/^tests\/[A-Za-z0-9._/-]+\.(?:mjs|js)$/u.test(clean(value.source))) {
    throw adapterError('P17_TEST_PROVENANCE_INVALID', 'testProvenance.source must name a tests/*.js or tests/*.mjs path.');
  }
  if (!/^[A-Z0-9_]+$/u.test(clean(value.purpose))) {
    throw adapterError('P17_TEST_PROVENANCE_INVALID', 'testProvenance.purpose must be an uppercase contract identifier.');
  }
  if (value.solverExecuted !== false || value.benchmarkExecuted !== false) {
    throw adapterError('P17_TEST_EXECUTION_FORBIDDEN', 'P17-M1 test injection cannot execute a solver or benchmark.');
  }
  return deepFreeze({
    fixtureId: clean(value.fixtureId),
    source: clean(value.source),
    purpose: clean(value.purpose),
    solverExecuted: false,
    benchmarkExecuted: false,
  });
}

export function validateP17ProductRequest(request = {}) {
  return validateRequest(request);
}

export function validateP17ProductModel(model) {
  return validateModel(model);
}

export function assertP17ProductExecutionPolicy(result, { mode = P17_PRODUCT_ADAPTER_MODES.official } = {}) {
  if (!Object.values(P17_PRODUCT_ADAPTER_MODES).includes(mode)) {
    throw adapterError('P17_ADAPTER_MODE_INVALID', `Unsupported adapter mode: ${String(mode)}`);
  }
  return deepFreeze(assertExecutionPolicy(result, mode));
}

function validateRequest(request) {
  const errors = [];
  if (!plainRecord(request)) return ['P17_PRODUCT_REQUEST_OBJECT_REQUIRED'];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/u.test(clean(request.runId))) errors.push('P17_PRODUCT_RUN_ID_INVALID');
  if (!plainRecord(request.model)) errors.push('P17_PRODUCT_MODEL_REQUIRED');
  if (!plainRecord(request.analysisCase)) errors.push('P17_PRODUCT_ANALYSIS_CASE_REQUIRED');
  if (!clean(request.analysisCase?.id)) errors.push('P17_PRODUCT_CASE_ID_REQUIRED');
  if (!clean(request.analysisCase?.kind)) errors.push('P17_PRODUCT_ANALYSIS_KIND_REQUIRED');
  if (request.computeTarget && request.computeTarget !== 'cpu') errors.push('P17_PRODUCT_CPU_TARGET_REQUIRED');
  for (const [label, value] of [['model', request.model], ['analysisCase', request.analysisCase], ['options', request.options]]) {
    if (value !== undefined) validateJsonBoundary(value, label, errors);
  }
  if (containsForbiddenReferencePayload(request)) errors.push('P17_PRODUCT_REFERENCE_PAYLOAD_FORBIDDEN');
  return [...new Set(errors)].sort();
}

function toProductRequest(request) {
  return {
    model: request.model,
    analysisCase: request.analysisCase,
    jobId: request.runId,
    runId: request.runId,
    computeTarget: 'cpu',
    options: {
      ...(plainRecord(request.options) ? request.options : {}),
      fallbackPolicy: 'forbidden',
      externalRuntimeAllowed: false,
      networkFallbackAllowed: false,
    },
  };
}

function containsForbiddenReferencePayload(value) {
  const forbidden = new Set([
    'expectedValues',
    'referenceManifest',
    'referenceLanes',
    'toleranceManifest',
    'probeManifest',
    'oracle',
    'strixResult',
    'midasResult',
  ]);
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return false;
    seen.add(node);
    if (!Array.isArray(node) && Object.keys(node).some((key) => forbidden.has(key))) return true;
    return Object.values(node).some(visit);
  };
  return visit(value);
}

function validateJsonBoundary(value, label, errors, seen = new Set()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`P17_PRODUCT_${label.toUpperCase()}_NONFINITE`);
    return;
  }
  if (typeof value !== 'object' || typeof value === 'function') {
    errors.push(`P17_PRODUCT_${label.toUpperCase()}_NON_JSON`);
    return;
  }
  if (seen.has(value)) {
    errors.push(`P17_PRODUCT_${label.toUpperCase()}_CYCLIC`);
    return;
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    errors.push(`P17_PRODUCT_${label.toUpperCase()}_NON_PLAIN_OBJECT`);
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) value.forEach((child) => validateJsonBoundary(child, label, errors, seen));
  else {
    for (const child of Object.values(value)) {
      if (child === undefined) errors.push(`P17_PRODUCT_${label.toUpperCase()}_UNDEFINED`);
      else validateJsonBoundary(child, label, errors, seen);
    }
  }
  seen.delete(value);
}

function assertExecutionPolicy(result, mode) {
  const externalRuntimeUsed = result?.externalRuntimeUsed
    ?? result?.executionProvenance?.externalRuntimeUsed
    ?? result?.productProvenance?.externalRuntimeUsed
    ?? result?.provenance?.externalRuntimeUsed;
  if (externalRuntimeUsed === true) {
    throw adapterError('P17_EXTERNAL_RUNTIME_FORBIDDEN', 'The product result reports an external runtime.');
  }
  if (externalRuntimeUsed !== false) {
    throw adapterError('P17_EXTERNAL_RUNTIME_OBSERVATION_REQUIRED', 'The product result must explicitly report externalRuntimeUsed=false.');
  }
  const networkFallbackUsed = result?.networkFallbackUsed
    ?? result?.executionProvenance?.networkFallbackUsed
    ?? result?.productProvenance?.networkFallbackUsed
    ?? result?.provenance?.networkFallbackUsed;
  if (networkFallbackUsed === true) {
    throw adapterError('P17_NETWORK_FALLBACK_FORBIDDEN', 'The product result reports a network fallback.');
  }
  if (networkFallbackUsed !== false) {
    throw adapterError('P17_NETWORK_FALLBACK_OBSERVATION_REQUIRED', 'The product result must explicitly report networkFallbackUsed=false.');
  }
  if (result?.routing?.fallbackPolicy !== 'forbidden' || result?.routing?.fallbackUsed !== false) {
    throw adapterError('P17_PRODUCT_FALLBACK_POLICY_VIOLATION', 'The product result does not prove fallbackPolicy=forbidden and fallbackUsed=false.');
  }
  if (result?.routing?.requestedTarget !== 'cpu' || result?.routing?.executedTarget !== 'cpu') {
    throw adapterError('P17_PRODUCT_CPU_ROUTE_VIOLATION', 'The product result did not execute on the requested CPU route.');
  }
  if (mode === P17_PRODUCT_ADAPTER_MODES.official) {
    const runner = result?.executionProvenance;
    if (
      runner?.origin !== PUBLIC_RUNNER_ORIGIN
      || runner?.runnerVersion !== ANALYSIS_RUNNER_VERSION
      || runner?.externalRuntimeUsed !== false
      || runner?.networkFallbackUsed !== false
      || runner?.observationSource !== 'OWNED_IN_PROCESS_PUBLIC_RUNNER_BOUNDARY'
    ) {
      throw adapterError(
        'P17_PUBLIC_RUNNER_PROVENANCE_REQUIRED',
        'Official qualification requires the explicit public in-process analysis-runner provenance.',
      );
    }
  }
  return {
    externalRuntimeObservation: 'EXPLICIT_FALSE',
    networkFallbackObservation: 'EXPLICIT_FALSE',
  };
}

function assertServiceContract(service) {
  const required = ['validate', 'start', 'wait', 'getStatus', 'getResult'];
  const missing = required.filter((name) => typeof service?.[name] !== 'function');
  if (missing.length) throw adapterError('P17_PRODUCT_SERVICE_CONTRACT_INVALID', `Missing public methods: ${missing.join(', ')}`);
  if (service.version !== PRODUCT_ANALYSIS_SERVICE_VERSION) {
    throw adapterError('P17_PRODUCT_SERVICE_VERSION_MISMATCH', `Expected ${PRODUCT_ANALYSIS_SERVICE_VERSION}, received ${service?.version || '(missing)'}.`);
  }
}

function adapterError(code, message) {
  return Object.assign(new Error(message), { code });
}

function plainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
