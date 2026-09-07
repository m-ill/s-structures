import { changedAnalysisDomainHashes } from '../../core/analysisDomainHashes.js';
import { normalizeAnalysisCase } from '../../core/analysisCase.js';
import { stableHash, stableStringify } from '../../core/stableHash.js';
import { validateModel } from '../../core/validation.js';
import { buildMdofGroundMotionSet } from '../dynamics/mdofGroundMotion.js';
import { buildMdofMassDomain } from '../dynamics/massDomain.js';
import { buildReducedSparsePattern } from '../equilibrium/typedSparse.js';
import { evaluateNonlinearIntegrationCapabilities } from '../integration/capabilityMatrix.js';
import { buildNlthLoadSet } from '../dynamics/productionNlth.js';
import { previewHingeAssignmentChangeSet, resolveDomainHingeAssignments } from '../properties/assignments.js';
import { buildPushoverLoadSet } from '../pushover/loadPatterns.js';
import { estimateRuntimeMemory } from '../runtime/preflight.js';
import {
  NONLINEAR_ENGINE_IDS,
  evaluateNonlinearCapability,
  getNonlinearCapability,
} from '../capabilities.js';
import { buildNonlinearCaseDependencyGraph } from '../workflow/initialState.js';

export const NONLINEAR_PRODUCT_CASE_VERSION = 'p8-m10-product-case-v1';
export const NONLINEAR_PRODUCT_PREFLIGHT_VERSION = 'p8-m10-product-preflight-v1';
export const NONLINEAR_PRODUCT_MODEL_HASH_VERSION = 'p8-m10-product-model-hash-v1';
export const NONLINEAR_PRODUCT_DEFAULT_HINGE_RULE_VERSION = 'p8-m10-default-hinge-rule-v1';

export const NONLINEAR_PRODUCT_DEFAULT_HINGE_RULES = Object.freeze({
  version: NONLINEAR_PRODUCT_DEFAULT_HINGE_RULE_VERSION,
  qualification: 'assumed',
  default: Object.freeze({
    initialStiffnessRatio: 20,
    hingeLengthFactor: 0.5,
    thetaC: 4,
    thetaD: 8,
    thetaE: 12,
    momentC: 1.1,
    momentD: 0.2,
    momentE: 0.2,
    qualification: 'assumed',
    hysteresis: Object.freeze({ rule: 'kinematic-masing' }),
    source: Object.freeze({
      reference: null,
      assumption: 'Capacity is generated from the project material and section snapshot. Deformation limits require project review.',
    }),
  }),
});

export const NONLINEAR_PRODUCT_STAGES = Object.freeze([
  Object.freeze({ id: 'model', label: '모델 검증' }),
  Object.freeze({ id: 'gravity', label: '중력 선행상태' }),
  Object.freeze({ id: 'properties', label: '비선형 속성' }),
  Object.freeze({ id: 'control', label: '해 제어' }),
  Object.freeze({ id: 'groundMotion', label: '지진파' }),
  Object.freeze({ id: 'run', label: '실행' }),
  Object.freeze({ id: 'results', label: '결과' }),
]);

const DEFAULT_CONVERGENCE = Object.freeze({
  forceAbsolute: 1e-7,
  forceRelative: 1e-7,
  momentAbsolute: 1e-7,
  momentRelative: 1e-7,
  displacementAbsolute: 1e-9,
  displacementRelative: 1e-7,
  rotationAbsolute: 1e-9,
  rotationRelative: 1e-7,
  energyAbsolute: 1e-10,
  energyRelative: 1e-7,
});

export function createProductionNonlinearCase(model = {}, input = {}) {
  const mode = normalizeProductMode(input.mode || input.analysisType || input.kind);
  const pushover = mode === 'pushover';
  const kind = pushover ? 'pushover' : 'nonlinearTimeHistory';
  const engineId = pushover
    ? NONLINEAR_ENGINE_IDS.productionPushover
    : NONLINEAR_ENGINE_IDS.productionNlth;
  if (input.engineId && input.engineId !== engineId) {
    throw Object.assign(new Error('Explicit engine must match the production case kind; migration requires a new case.'), { code: 'NONLINEAR_ENGINE_MISMATCH' });
  }
  const gravityCombinationId = clean(
    input.gravityCombinationId
      || input.inputRefs?.gravityCombinationId
      || input.settings?.gravityCombinationId,
  ) || defaultGravityCombinationId(model);
  const massSourceId = clean(
    input.massSourceId
      || input.inputRefs?.massSourceId
      || input.settings?.massSourceId,
  ) || String(model.massSources?.[0]?.id || '');
  const controlNodeId = clean(
    input.controlNodeId
      || input.control?.nodeId
      || input.settings?.controlNodeId,
  ) || defaultControlNodeId(model);
  const direction = normalizeDirection(
    input.direction
      || input.control?.direction
      || input.settings?.direction
      || '+x',
  );
  const defaults = pushover
    ? pushoverSettings(model, {
      gravityCombinationId,
      controlNodeId,
      direction,
    })
    : nlthSettings({ gravityCombinationId, massSourceId });
  const settings = deepMerge(defaults, input.settings || {});
  if (pushover) {
    settings.gravityCombinationId = gravityCombinationId;
    settings.controlNodeId = controlNodeId;
    settings.direction = direction;
    settings.pattern = normalizePattern(settings.pattern);
    const requested = input.settings?.control || input.control?.type || input.settings?.controlStrategy;
    settings.control = requested || (settings.arcLength?.enabled === true ? 'arcLength' : 'displacement');
    if (!['displacement', 'arcLength'].includes(settings.control)) {
      throw Object.assign(new Error('Product cases support displacement or arcLength. P14 load control is a kernel-only capability.'), { code: 'PUSHOVER_CONTROL_UNSUPPORTED' });
    }
    if ((requested && settings.arcLength?.enabled === true && requested !== 'arcLength') ||
        (input.settings?.controlStrategy && input.settings.controlStrategy !== settings.control)) {
      throw Object.assign(new Error('Conflicting control settings.'), { code: 'PUSHOVER_CONTROL_CONFLICT' });
    }
    settings.arcLength = { ...settings.arcLength, enabled: settings.control === 'arcLength' };
    settings.targetDisplacement = finite(settings.targetDisplacement, defaults.targetDisplacement);
    settings.steps = positiveInteger(settings.steps, defaults.steps);
  } else {
    settings.gravityCombinationId = gravityCombinationId;
    settings.massSourceId = massSourceId;
    settings.groundMotionRecords = clone(input.groundMotionRecords || settings.groundMotionRecords || []);
  }
  const existing = Array.isArray(model.analysisCases) ? model.analysisCases : [];
  const id = clean(input.id) || nextCaseId(existing, pushover ? 'PUSH-PROD' : 'NLTH-PROD');
  const analysisCase = normalizeAnalysisCase({
    ...clone(input),
    id,
    name: clean(input.name) || (pushover ? 'Production Pushover' : 'Production NLTH'),
    kind,
    caseVersion: NONLINEAR_PRODUCT_CASE_VERSION,
    engineId,
    settings,
    input: {},
    inputRefs: {
      ...(input.inputRefs || {}),
      gravityCombinationId: gravityCombinationId || null,
      ...(pushover
        ? { lateralPattern: { type: settings.pattern, direction } }
        : {
          massSourceId: massSourceId || null,
          functionIds: clone(input.inputRefs?.functionIds || settings.functionIds || []),
        }),
    },
    initialState: clone(input.initialState || { policy: 'zero' }),
    control: pushover ? {
      ...(input.control || {}),
      type: settings.control,
      nodeId: controlNodeId || null,
      direction,
      targetDisplacement: settings.targetDisplacement,
    } : {},
    solver: clone(input.solver || { execution: 'worker-wasm-sparse' }),
    outputPolicy: clone(input.outputPolicy || settings.output || {}),
    qualificationRequest: 'candidate',
    status: input.status || 'not-run',
    lastRun: input.lastRun || null,
  });
  analysisCase.productVersion = NONLINEAR_PRODUCT_CASE_VERSION;
  analysisCase.settingsHash = stableHash(analysisCase.settings).slice(0, 24);
  return deepFreeze(analysisCase);
}

export function preflightProductionNonlinearCase(model = {}, inputCase = {}, options = {}) {
  const analysisCase = createProductionNonlinearCase(model, inputCase);
  const mode = analysisCase.kind === 'nonlinearTimeHistory' ? 'nlth' : 'pushover';
  const issues = [];
  if ((model.zeroLengthPmmHinges?.length || model.pmmHinges?.length)) {
    issues.push(issue('blocking', 'model', 'ZERO_LENGTH_PMM_PRODUCT_ASSEMBLY_UNAVAILABLE',
      'Standalone SH1 PMM assembly is not connected to the production element registry. These elements must not be silently omitted.'));
  }
  const modelValidation = safeModelValidation(model);
  for (const row of modelValidation.errors || []) {
    issues.push(issue('blocking', stageForValidation(row, mode), row.code || 'MODEL_VALIDATION_FAILED', row.message, {
      entityId: row.target || null,
      action: 'open-model-editor',
      label: '모델링에서 수정',
    }));
  }
  for (const row of modelValidation.warnings || []) {
    issues.push(issue('warning', stageForValidation(row, mode), row.code || 'MODEL_VALIDATION_WARNING', row.message, {
      entityId: row.target || null,
      action: 'open-model-editor',
      label: '모델링에서 확인',
    }));
  }

  const capabilityDecision = evaluateNonlinearCapability({
    kind: analysisCase.kind,
    engineId: analysisCase.engineId,
  });
  if (!capabilityDecision.ok) {
    issues.push(issue('blocking', 'run', capabilityDecision.code, capabilityDecision.message, {
      action: 'select-supported-engine',
      label: '지원 엔진 선택',
    }));
  }

  let loadSet = null;
  let domain = null;
  let integrationCapability = null;
  let massDomain = null;
  let groundMotion = null;
  try {
    loadSet = mode === 'pushover'
      ? buildPushoverLoadSet(model, analysisCase, analysisCase.settings)
      : buildNlthLoadSet(model, analysisCase, analysisCase.settings);
    domain = loadSet.domain;
  } catch (error) {
    issues.push(issue('blocking', stageForCode(error?.code), error?.code || 'NONLINEAR_DOMAIN_PREFLIGHT_FAILED', error?.message || String(error), remediationForCode(error?.code)));
  }

  if (domain) {
    integrationCapability = evaluateNonlinearIntegrationCapabilities(domain, {
      mode: mode === 'nlth' ? 'dynamic' : 'static',
    });
    for (const row of integrationCapability.issues) {
      issues.push(issue(row.severity, 'model', row.code, row.message, {
        entityType: row.entityType,
        entityId: row.entityId,
        action: 'focus-entity',
        label: '문제 객체 선택',
      }));
    }
  }

  if (mode === 'pushover') validatePushoverControl(model, analysisCase, issues);
  else {
    validateNlthInputs(model, analysisCase, issues);
    if (domain && clean(analysisCase.settings.massSourceId)) {
      try {
        massDomain = buildMdofMassDomain(model, domain, {
          massSourceId: analysisCase.settings.massSourceId,
          formulation: analysisCase.settings.massFormulation || 'lumped',
        });
      } catch (error) {
        issues.push(issue('blocking', 'groundMotion', error?.code || 'NLTH_MASS_DOMAIN_FAILED', error?.message || String(error), {
          action: 'open-load-mass-editor',
          label: '하중·질량 편집',
        }));
      }
    }
    if (massDomain && analysisCase.settings.groundMotionRecords?.length) {
      try {
        groundMotion = buildMdofGroundMotionSet(
          analysisCase.settings.groundMotionRecords,
          massDomain,
          analysisCase.settings.groundMotionSet || {},
        );
      } catch (error) {
        issues.push(issue('blocking', 'groundMotion', error?.code || 'NLTH_GROUND_MOTION_INVALID', error?.message || String(error), {
          action: 'edit-ground-motion',
          label: '지진파 입력 수정',
        }));
      }
    }
  }

  let assignmentResolution = null;
  if (domain) {
    try {
      assignmentResolution = resolveDomainHingeAssignments(domain, {
        assumedPolicy: analysisCase.settings.assumedPolicy,
      });
    } catch (error) {
      issues.push(issue('blocking', 'properties', error?.code || 'NONLINEAR_ASSIGNMENT_INVALID', error?.message || String(error), {
        action: 'preview-auto-assignment',
        label: '자동 배정 미리보기',
      }));
    }
  }

  const nonlinearMemberCount = countNonlinearMembers(model);
  if (nonlinearMemberCount === 0) {
    issues.push(issue('blocking', 'properties', 'NONLINEAR_PROPERTY_ASSIGNMENT_REQUIRED', '비선형 거동이 배정된 부재가 없습니다. 자동 배정 미리보기를 검토한 뒤 적용하세요.', {
      action: 'preview-auto-assignment',
      label: '자동 배정 미리보기',
    }));
  }

  const assignmentPreview = buildAssignmentPreview(model, options, issues);
  const runtime = buildRuntimePreflight(domain, analysisCase, options, issues);
  const runRecords = normalizeRunRecords(options.runRecords);
  const graphCases = upsertCase(model.analysisCases || [], analysisCase);
  const dependencyGraph = buildNonlinearCaseDependencyGraph(graphCases, runRecords);
  for (const row of dependencyGraph.errors || []) {
    issues.push(issue('blocking', 'gravity', row.code, row.message, {
      entityId: row.target,
      action: 'select-predecessor',
      label: '선행 케이스 수정',
    }));
  }

  const previousHashes = options.previousDomainHashes || options.previousResult?.dependencies?.canonical || null;
  const domainDiff = {
    previousAvailable: Boolean(previousHashes),
    changed: previousHashes && domain ? changedAnalysisDomainHashes(previousHashes, domain.hashes) : [],
    current: clone(domain?.hashes || null),
    previous: clone(previousHashes),
  };
  const stages = NONLINEAR_PRODUCT_STAGES.map((stage) => stageSummary(stage, issues, mode));
  const blocking = deduplicateIssues(issues.filter((row) => row.severity === 'blocking'));
  const warnings = deduplicateIssues(issues.filter((row) => row.severity === 'warning'));
  const infos = deduplicateIssues(issues.filter((row) => row.severity === 'info'));
  const executionSettings = clone(analysisCase.settings);
  const core = {
    version: NONLINEAR_PRODUCT_PREFLIGHT_VERSION,
    ok: blocking.length === 0,
    status: blocking.length ? 'blocked' : warnings.length ? 'ready-with-warnings' : 'ready',
    mode,
    analysisCase,
    modelHash: nonlinearProductModelHash(model),
    settingsHash: stableHash(executionSettings).slice(0, 24),
    settingsBytes: stableStringify(executionSettings),
    executionSettings,
    capability: clone(capabilityDecision.capability || getNonlinearCapability(analysisCase.engineId)),
    qualification: 'candidate',
    designBlocked: true,
    designBlockReason: 'P8_M11_INDEPENDENT_QUALIFICATION_PENDING',
    modelValidation,
    domain: domain ? domainSummary(domain) : null,
    domainDiff,
    integrationCapability: clone(integrationCapability),
    assignment: {
      nonlinearMemberCount,
      resolvedAssignmentCount: assignmentResolution?.rows?.length || 0,
      preview: assignmentPreview,
    },
    gravity: loadSet ? {
      combinationId: loadSet.gravity?.id || null,
      factorHash: loadSet.gravity?.contentHash || null,
      loadSetHash: loadSet.loadSetHash || null,
    } : null,
    mass: massDomain ? {
      sourceId: massDomain.sourceSnapshot?.sourceId || analysisCase.settings.massSourceId || null,
      activeDofCount: massDomain.activeDofs?.length || 0,
      massHash: massDomain.massHash || null,
    } : null,
    groundMotion: groundMotion ? {
      componentCount: groundMotion.records?.length || 0,
      duration: groundMotion.endTime || groundMotion.duration || null,
      setHash: groundMotion.setHash || null,
    } : null,
    runtime,
    dependencyGraph,
    stages,
    blocking,
    warnings,
    infos,
  };
  return deepFreeze({ ...core, preflightHash: stableHash(core).slice(0, 24) });
}

export function nonlinearProductModelHash(model = {}) {
  const snapshot = clone(model) || {};
  snapshot.analysisCases = (snapshot.analysisCases || []).map((row) => {
    const analysisCase = { ...row };
    delete analysisCase.status;
    delete analysisCase.lastRun;
    return analysisCase;
  });
  return stableHash({
    version: NONLINEAR_PRODUCT_MODEL_HASH_VERSION,
    model: snapshot,
  });
}

function pushoverSettings(model, input) {
  const height = modelHeight(model);
  return {
    gravityCombinationId: input.gravityCombinationId || '',
    direction: input.direction,
    pattern: 'triangular',
    control: 'displacement',
    controlNodeId: input.controlNodeId || '',
    targetDisplacement: round(Math.max(0.01, height * 0.02), 6),
    steps: 20,
    referenceBaseShear: 1,
    stopAtPostPeak: true,
    postPeakRatio: 0.8,
    eventAware: true,
    newton: {
      maxIterations: 30,
      lineSearch: true,
      convergence: clone(DEFAULT_CONVERGENCE),
    },
    gravity: {
      initialStep: 0.2,
      maxStep: 0.25,
      minStep: 1e-5,
      newton: { maxIterations: 30, lineSearch: true, convergence: clone(DEFAULT_CONVERGENCE) },
    },
    fiberPmm: { useWorker: true, cacheEnabled: true },
  };
}

function nlthSettings(input) {
  return {
    gravityCombinationId: input.gravityCombinationId || '',
    massSourceId: input.massSourceId || '',
    groundMotionRecords: [],
    massFormulation: 'lumped',
    damping: {
      type: 'rayleigh',
      coefficients: { alpha: 0.05, beta: 0.0001 },
      stiffnessPolicy: 'initial',
    },
    gravity: {
      initialStep: 0.2,
      maxStep: 0.25,
      minStep: 1e-5,
      newton: { maxIterations: 30, lineSearch: true, convergence: clone(DEFAULT_CONVERGENCE) },
    },
    newmark: {
      outputDt: 0.02,
      initialDt: 0.02,
      minDt: 0.000078125,
      maximumSubstepLevel: 8,
      checkpointInterval: 10,
      maxIterations: 30,
      convergence: clone(DEFAULT_CONVERGENCE),
    },
    output: {
      history: {
        chunkSize: 200,
        retainChunks: true,
        memoryBudgetBytes: 128 * 1024 * 1024,
      },
    },
    fiberPmm: { useWorker: true, cacheEnabled: true },
    gpuEnabled: false,
  };
}

function validatePushoverControl(model, analysisCase, issues) {
  const settings = analysisCase.settings || {};
  if (!(Number(settings.targetDisplacement) > 0)) {
    issues.push(issue('blocking', 'control', 'PUSHOVER_TARGET_DISPLACEMENT_REQUIRED', '양의 목표 제어변위를 입력하세요.', {
      action: 'edit-control', label: '해 제어 수정',
    }));
  }
  if (!clean(settings.controlNodeId) || !(model.nodes || []).some((node) => String(node.id) === String(settings.controlNodeId))) {
    issues.push(issue('blocking', 'control', 'PUSHOVER_CONTROL_NODE_REQUIRED', '모델에 존재하는 제어절점을 선택하세요.', {
      action: 'select-control-node', label: '제어절점 선택',
    }));
  }
  if (!['displacement', 'arcLength'].includes(settings.control)) {
    issues.push(issue('blocking', 'control', 'PUSHOVER_CONTROL_UNSUPPORTED', 'Production Pushover는 변위제어 또는 arc-length만 지원합니다.', {
      action: 'edit-control', label: '지원 제어법 선택',
    }));
  }
}

function validateNlthInputs(model, analysisCase, issues) {
  const settings = analysisCase.settings || {};
  const sourceId = clean(settings.massSourceId);
  if (!sourceId || !(model.massSources || []).some((row) => String(row.id) === sourceId)) {
    issues.push(issue('blocking', 'groundMotion', 'NLTH_MASS_SOURCE_REQUIRED', 'Production NLTH에 사용할 명시적 질량원을 선택하세요.', {
      action: 'open-load-mass-editor', label: '하중·질량 편집',
    }));
  }
  const records = settings.groundMotionRecords || [];
  const functionIds = analysisCase.inputRefs?.functionIds || [];
  if (!records.length && !functionIds.length) {
    issues.push(issue('blocking', 'groundMotion', 'NLTH_GROUND_MOTION_REQUIRED', '가속도 시간이력 또는 등록된 지진파 함수가 필요합니다.', {
      action: 'edit-ground-motion', label: '지진파 입력',
    }));
  }
  const outputDt = Number(settings.newmark?.outputDt);
  const initialDt = Number(settings.newmark?.initialDt);
  const minDt = Number(settings.newmark?.minDt);
  if (!(outputDt > 0) || !(initialDt > 0) || !(minDt > 0) || minDt > initialDt) {
    issues.push(issue('blocking', 'control', 'NLTH_TIME_STEP_INVALID', '출력·초기·최소 시간간격은 양수이고 최소 간격은 초기 간격 이하여야 합니다.', {
      action: 'edit-control', label: '시간적분 설정 수정',
    }));
  }
}

function buildAssignmentPreview(model, options, issues) {
  if (options.includeAssignmentPreview === false) return null;
  const memberIds = (model.members || [])
    .filter((row) => row.generated !== true && !['truss', 'tensionOnly', 'compressionOnly'].includes(row.type || row.behavior))
    .map((row) => String(row.id));
  if (!memberIds.length) return null;
  try {
    const preview = previewHingeAssignmentChangeSet(model, {
      memberIds,
      ends: ['i', 'j'],
      axes: ['y', 'z'],
      rules: options.assignmentRules || NONLINEAR_PRODUCT_DEFAULT_HINGE_RULES,
      reinforcementSnapshots: options.reinforcementSnapshots || {},
      propertyOverrides: options.propertyOverrides || {},
      assignmentOverrides: options.assignmentOverrides || {},
    });
    for (const row of preview.errors || []) {
      issues.push(issue('warning', 'properties', row.code, row.message, {
        entityId: row.target,
        action: 'open-property-editor',
        label: '재료·단면 확인',
      }));
    }
    return clone(preview);
  } catch (error) {
    issues.push(issue('warning', 'properties', error?.code || 'HINGE_AUTO_PREVIEW_FAILED', error?.message || String(error), {
      action: 'open-property-editor', label: '재료·단면 확인',
    }));
    return null;
  }
}

function buildRuntimePreflight(domain, analysisCase, options, issues) {
  if (!domain?.constraint?.ok) return null;
  let pattern = null;
  try {
    pattern = buildReducedSparsePattern(
      domain.constraint,
      domain.elements.map((row) => ({ id: row.id, dofs: row.fullDofs })),
    );
  } catch (error) {
    issues.push(issue('blocking', 'run', error?.code || 'SPARSE_PATTERN_PREFLIGHT_FAILED', error?.message || String(error), {
      action: 'open-model-editor', label: '모델 연결 검토',
    }));
    return null;
  }
  const stepCount = analysisCase.kind === 'nonlinearTimeHistory'
    ? Math.max(1, ...((analysisCase.settings.groundMotionRecords || []).map((row) => row.values?.length || row.accelerations?.length || 0)))
    : positiveInteger(analysisCase.settings.steps, 20);
  const resultVectorCount = analysisCase.kind === 'nonlinearTimeHistory' ? Math.min(stepCount, 5000) * 3 : stepCount;
  const estimate = estimateRuntimeMemory({
    dofCount: domain.constraint.reducedDofCount,
    nnz: pattern.nnz,
    backendMode: 'production',
    resultVectorCount,
    additionalResultBytes: analysisCase.kind === 'nonlinearTimeHistory'
      ? Number(analysisCase.settings.output?.history?.memoryBudgetBytes || 0)
      : 0,
  });
  const workerSupported = options.workerSupported ?? (typeof Worker !== 'undefined');
  const wasmSupported = options.wasmSupported ?? (typeof WebAssembly !== 'undefined');
  const requireWorker = options.requireWorker === true;
  if (requireWorker && !workerSupported) {
    issues.push(issue('blocking', 'run', 'NONLINEAR_WORKER_UNAVAILABLE', '이 실행은 모듈 Worker가 필요하지만 현재 환경에서 사용할 수 없습니다.', {
      action: 'inspect-runtime', label: '실행환경 확인',
    }));
  }
  if (requireWorker && !wasmSupported) {
    issues.push(issue('blocking', 'run', 'NONLINEAR_WASM_UNAVAILABLE', 'Production 희소행렬 WASM backend를 사용할 수 없습니다.', {
      action: 'inspect-runtime', label: '실행환경 확인',
    }));
  }
  const availableBytes = Number(options.availableMemoryBytes)
    || (Number(options.deviceMemoryGb) > 0 ? Number(options.deviceMemoryGb) * 1024 ** 3 : 0);
  const memoryLimitBytes = Number(options.memoryLimitBytes)
    || (availableBytes > 0 ? Math.floor(availableBytes * 0.6) : null);
  if (memoryLimitBytes && estimate.totalBytes > memoryLimitBytes) {
    issues.push(issue('blocking', 'run', 'PREFLIGHT_MEMORY_LIMIT_EXCEEDED', '예상 메모리가 실행환경 한도를 초과합니다. 출력 간격이나 저장 이력을 줄이세요.', {
      action: 'reduce-output-history', label: '출력량 줄이기',
    }));
  }
  const work = Math.max(1, pattern.nnz) * Math.max(1, domain.constraint.reducedDofCount) * Math.max(1, stepCount);
  const nominalSeconds = Math.max(0.1, work / 25_000_000);
  return {
    dofCount: domain.constraint.reducedDofCount,
    fullDofCount: domain.constraint.fullDofCount,
    elementCount: domain.elements.length,
    nnz: pattern.nnz,
    sparsePatternHash: pattern.patternHash,
    memory: {
      ...estimate,
      limitBytes: memoryLimitBytes,
      withinLimit: !memoryLimitBytes || estimate.totalBytes <= memoryLimitBytes,
    },
    runtimeEstimate: {
      basis: 'screening-only-not-a-performance-qualification',
      lowerSeconds: round(nominalSeconds * 0.5, 2),
      upperSeconds: round(nominalSeconds * 4, 2),
      stepCount,
    },
    backend: {
      mode: 'production-wasm-sparse',
      status: wasmSupported ? 'deferred-worker-initialization' : 'unavailable',
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
    },
    thread: {
      mode: workerSupported ? 'module-worker' : options.injectedRunner ? 'injected-runner' : 'unavailable',
      workerSupported,
      mainThreadSolverAllowed: false,
    },
  };
}

function safeModelValidation(model) {
  try { return validateModel(model); }
  catch (error) {
    return {
      ok: false,
      errors: [{ code: error?.code || 'MODEL_VALIDATION_EXCEPTION', message: error?.message || String(error), target: 'model' }],
      warnings: [],
    };
  }
}

function stageSummary(stage, issues, mode) {
  if (stage.id === 'groundMotion' && mode === 'pushover') {
    return { ...stage, status: 'not-applicable', blockingCount: 0, warningCount: 0, issues: [] };
  }
  if (stage.id === 'results') {
    return { ...stage, status: 'pending', blockingCount: 0, warningCount: 0, issues: [] };
  }
  const rows = deduplicateIssues(issues.filter((row) => row.stage === stage.id));
  const blockingCount = rows.filter((row) => row.severity === 'blocking').length;
  const warningCount = rows.filter((row) => row.severity === 'warning').length;
  return {
    ...stage,
    status: blockingCount ? 'blocked' : warningCount ? 'warning' : 'ready',
    blockingCount,
    warningCount,
    issues: rows,
  };
}

function domainSummary(domain) {
  return {
    ok: domain.ok,
    reason: domain.reason,
    identityHash: domain.identity?.identityHash || null,
    hashes: clone(domain.hashes),
    nodeCount: domain.nodes.length,
    elementCount: domain.elements.length,
    generatedElementCount: domain.generatedMemberIds?.length || 0,
    fullDofCount: domain.constraint?.fullDofCount || 0,
    reducedDofCount: domain.constraint?.reducedDofCount || 0,
  };
}

function stageForValidation(row, mode) {
  const text = `${row?.code || ''}:${row?.target || ''}`.toUpperCase();
  if (text.includes('NONLINEAR') || text.includes('HINGE')) return 'properties';
  if (text.includes('LOAD_COMBINATION') || text.includes('LOAD_CASE')) return 'gravity';
  if (mode === 'nlth' && (text.includes('MASS') || text.includes('TIME_HISTORY'))) return 'groundMotion';
  return 'model';
}

function stageForCode(code) {
  const value = String(code || '').toUpperCase();
  if (value.includes('GRAVITY') || value.includes('LOAD_AUDIT')) return 'gravity';
  if (value.includes('CONTROL') || value.includes('TARGET') || value.includes('PATTERN')) return 'control';
  if (value.includes('MASS') || value.includes('GROUND') || value.includes('TIME_HISTORY')) return 'groundMotion';
  if (value.includes('HINGE') || value.includes('FIBER') || value.includes('PMM')) return 'properties';
  return 'model';
}

function remediationForCode(code) {
  const stage = stageForCode(code);
  if (stage === 'gravity') return { action: 'open-load-mass-editor', label: '하중·질량 편집' };
  if (stage === 'control') return { action: 'edit-control', label: '해 제어 수정' };
  if (stage === 'groundMotion') return { action: 'edit-ground-motion', label: '지진파 입력 수정' };
  if (stage === 'properties') return { action: 'open-property-editor', label: '재료·단면 확인' };
  return { action: 'open-model-editor', label: '모델링에서 수정' };
}

function issue(severity, stage, code, message, detail = {}) {
  return {
    severity: severity === 'blocking' ? 'blocking' : severity === 'warning' ? 'warning' : 'info',
    stage,
    code: clean(code) || 'NONLINEAR_PREFLIGHT_ISSUE',
    message: clean(message) || String(code || 'Nonlinear preflight issue.'),
    entityType: detail.entityType || null,
    entityId: detail.entityId || null,
    remediation: detail.action ? {
      action: detail.action,
      label: detail.label || detail.action,
    } : null,
  };
}

function deduplicateIssues(rows) {
  const map = new Map();
  for (const row of rows || []) map.set(`${row.severity}:${row.stage}:${row.code}:${row.entityId || ''}`, row);
  return [...map.values()].sort((a, b) => `${a.stage}:${a.code}:${a.entityId || ''}`.localeCompare(`${b.stage}:${b.code}:${b.entityId || ''}`));
}

function countNonlinearMembers(model) {
  return (model.members || []).filter((row) => (
    row.nonlinear?.formulation
    || row.nonlinear?.hinges?.length
    || row.nonlinear?.sectionId
    || row.nonlinear?.fiberSectionId
  )).length;
}

function normalizeRunRecords(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.records)) return input.records;
  if (input?.attempts) return Object.values(input.attempts).flat();
  return [];
}

function upsertCase(cases, analysisCase) {
  const rows = clone(cases || []);
  const index = rows.findIndex((row) => row.id === analysisCase.id);
  if (index >= 0) rows[index] = clone(analysisCase);
  else rows.push(clone(analysisCase));
  return rows;
}

function defaultGravityCombinationId(model) {
  const combinations = model.loadCombinations || [];
  return String(
    combinations.find((row) => row.purpose === 'gravity-preload')?.id
      || combinations.find((row) => /^GRAV(?:ITY)?$/i.test(String(row.id || '')))?.id
      || combinations.find((row) => row.factors && Object.keys(row.factors).length)?.id
      || '',
  );
}

function defaultControlNodeId(model) {
  return (model.nodes || []).slice().sort((a, b) => (
    Number(b.z || 0) - Number(a.z || 0)
      || String(a.id).localeCompare(String(b.id))
  )).find((row) => !row.support)?.id
    || (model.nodes || []).slice().sort((a, b) => Number(b.z || 0) - Number(a.z || 0))[0]?.id
    || '';
}

function modelHeight(model) {
  const z = (model.nodes || []).map((row) => Number(row.z || 0)).filter(Number.isFinite);
  return z.length ? Math.max(...z) - Math.min(...z) : 1;
}

function nextCaseId(cases, prefix) {
  const ids = new Set((cases || []).map((row) => String(row.id)));
  let index = 1;
  while (ids.has(`${prefix}-${String(index).padStart(2, '0')}`)) index += 1;
  return `${prefix}-${String(index).padStart(2, '0')}`;
}

function normalizeProductMode(value) {
  const text = String(value || '').trim().toLowerCase();
  return ['nlth', 'nonlineartimehistory', 'nonlinear-time-history', 'time-history'].includes(text) ? 'nlth' : 'pushover';
}

function normalizeDirection(value) {
  const text = String(value || '').trim().toLowerCase();
  return ['+x', '-x', '+y', '-y'].includes(text) ? text : '+x';
}

function normalizePattern(value) {
  const text = String(value || '').trim().toLowerCase();
  return ['uniform', 'triangular', 'modal', 'user'].includes(text) ? text : 'triangular';
}

function deepMerge(base, patch) {
  const output = clone(base) || {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (record(value) && record(output[key])) output[key] = deepMerge(output[key], value);
    else output[key] = clone(value);
  }
  return output;
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function clean(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
