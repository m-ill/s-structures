import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CUSTOM_CASE_ID,
  M1_REASON_CODES,
  MODEL_EQUIVALENCE_DIMENSIONS,
  OFFICIAL_CASE_IDS,
  PHASE17_M1,
  PRODUCT_SERVICE_BINDING,
  REVIEW_ROLES,
} from './constants.mjs';
import { assertRepoRelativePath, prettyJson, sha256Canonical } from './canonical.mjs';
import { assertSuiteScaffold, validateManifestDocument } from './manifestValidation.mjs';

const SUITE_ROOT = 'verification/benchmarks/strix21';
const SOURCE_REGISTRY_PATH = `${SUITE_ROOT}/suite-source-registry-r2.json`;
const CUSTOM_METADATA = Object.freeze({
  caseId: CUSTOM_CASE_ID,
  ordinal: 0,
  family: 'STABILIZATION-SENSITIVITY',
  title: 'S-Structures custom shell stabilization qualification',
  sourceLockPath: null,
  sourceLockHash: null,
  sourceStatus: 'NOT_LOCKED',
  referenceClass: 'R5_INTERNAL_SPEC',
});

export function buildP17M1Scaffold(registry) {
  validateRegistryInput(registry);
  const files = new Map();
  const generatedCases = [];

  for (const caseMetadata of registry.cases) {
    const generated = buildCaseFiles(caseMetadata, {
      officialSuiteMember: true,
      registryHash: registry.registryHash,
    });
    addFiles(files, generated.files);
    generatedCases.push(generated.summary);
  }

  const custom = buildCaseFiles(CUSTOM_METADATA, {
    officialSuiteMember: false,
    registryHash: registry.registryHash,
  });
  addFiles(files, custom.files);

  const suiteManifest = buildSuiteManifest(registry, generatedCases, custom.summary);
  validateManifestDocument('suiteManifest', suiteManifest, { m1Scaffold: true });
  files.set(`${SUITE_ROOT}/suite-manifest.json`, prettyJson(suiteManifest));
  return files;
}

export function applyP17M1Scaffold(repoRoot, { mode = 'check' } = {}) {
  if (!['check', 'write'].includes(mode)) throw new Error(`Unsupported scaffold mode: ${mode}`);
  const resolvedRepoRoot = realpathSync(path.resolve(repoRoot));
  const registry = JSON.parse(readFileSync(path.join(resolvedRepoRoot, ...SOURCE_REGISTRY_PATH.split('/')), 'utf8'));
  const files = buildP17M1Scaffold(registry);
  const missing = [];
  const conflicts = [];
  const unchanged = [];

  for (const [relativePath, expectedText] of files) {
    assertRepoRelativePath(relativePath, 'generated scaffold path');
    const target = resolveInside(resolvedRepoRoot, relativePath);
    assertSafeParentChain(resolvedRepoRoot, target);
    if (!existsSync(target)) {
      missing.push(relativePath);
      continue;
    }
    const targetInfo = lstatSync(target);
    if (!targetInfo.isFile() || targetInfo.isSymbolicLink() || !realpathSync(target).startsWith(`${resolvedRepoRoot}${path.sep}`)) {
      conflicts.push(relativePath);
      continue;
    }
    const actualText = readFileSync(target, 'utf8');
    if (actualText === expectedText) unchanged.push(relativePath);
    else conflicts.push(relativePath);
  }

  if (conflicts.length) {
    throw new Error(`Refusing to overwrite ${conflicts.length} non-identical scaffold file(s):\n${conflicts.join('\n')}`);
  }
  if (mode === 'check' && missing.length) {
    throw new Error(`P17-M1 scaffold is incomplete; ${missing.length} generated file(s) are missing:\n${missing.join('\n')}`);
  }

  const written = [];
  let validation;
  try {
    if (mode === 'write') {
      for (const relativePath of missing) {
        const target = resolveInside(resolvedRepoRoot, relativePath);
        ensureSafeDirectoryChain(resolvedRepoRoot, path.dirname(target));
        assertSafeParentChain(resolvedRepoRoot, target);
        writeFileSync(target, files.get(relativePath), { encoding: 'utf8', flag: 'wx' });
        written.push(relativePath);
      }
    }
    validation = assertSuiteScaffold(resolvedRepoRoot, { m1Scaffold: true });
  } catch (error) {
    const rollbackFailures = rollbackGeneratedFiles(resolvedRepoRoot, files, written);
    if (rollbackFailures.length) error.message += `\nRollback retained ${rollbackFailures.length} changed/unsafe file(s):\n${rollbackFailures.join('\n')}`;
    throw error;
  }
  return {
    version: 'p17-m1-scaffold-result-v1',
    mode,
    expectedFileCount: files.size,
    writtenFileCount: written.length,
    unchangedFileCount: unchanged.length,
    officialCaseCount: validation.cases.length,
    customCaseCount: validation.customCases.length,
    schemaValidCaseCount: validation.cases.length,
    benchmarkExecutionCount: validation.suite.resultSummary.benchmarkExecutionCount,
    conflicts: [],
  };
}

function buildCaseFiles(caseMetadata, { officialSuiteMember, registryHash }) {
  const caseId = caseMetadata.caseId;
  const caseRoot = officialSuiteMember ? `${SUITE_ROOT}/cases/${caseId}` : `${SUITE_ROOT}/custom/${caseId}`;
  const commonReasonCodes = [
    M1_REASON_CODES.frameworkOnly,
    M1_REASON_CODES.modelNotBuilt,
    M1_REASON_CODES.referenceNotLocked,
    M1_REASON_CODES.toleranceNotLocked,
    M1_REASON_CODES.probesNotLocked,
  ];
  const sourceReasonCodes = officialSuiteMember ? [M1_REASON_CODES.sourceHasBlockers] : [M1_REASON_CODES.customSourceNotLocked];
  const sourceStatus = officialSuiteMember ? 'LOCKED_WITH_BLOCKERS' : 'NOT_LOCKED';

  const sourceManifest = {
    schemaVersion: 'p17-source-manifest-v1',
    caseId,
    officialSuiteMember,
    status: sourceStatus,
    custodyBinding: {
      registryPath: SOURCE_REGISTRY_PATH,
      registryHash,
      sourceLockPath: caseMetadata.sourceLockPath,
      sourceLockHash: caseMetadata.sourceLockHash,
    },
    extraction: {
      status: officialSuiteMember ? 'BOUND_TO_M0_SOURCE_LOCK' : 'NOT_STARTED',
      method: officialSuiteMember ? 'M0_SOURCE_LOCK_BINDING' : 'NONE_M1',
      artifacts: [],
    },
    transcription: {
      status: 'NOT_STARTED',
      path: `${caseRoot}/source/transcription.md`,
      valueCount: 0,
    },
    reasonCodes: sourceReasonCodes,
  };

  const expectedValues = {
    schemaVersion: 'p17-expected-values-v1',
    caseId,
    status: 'NOT_LOCKED',
    payloadAbsent: true,
    releaseAllowed: false,
    values: [],
    reasonCodes: [M1_REASON_CODES.referenceNotLocked, M1_REASON_CODES.frameworkOnly],
  };

  const referenceManifest = {
    schemaVersion: 'p17-reference-manifest-v1',
    caseId,
    artifactStatus: 'NOT_LOCKED',
    payloadAbsent: true,
    releaseAllowed: false,
    sourceManifestBinding: {
      path: `${caseRoot}/source/source-manifest.json`,
      sha256: sha256Canonical(sourceManifest),
    },
    expectedValuesPath: `${caseRoot}/reference/expected-values.json`,
    expectedValuesHash: sha256Canonical(expectedValues),
    lanes: ['PRIMARY_INDEPENDENT', 'STRIX_PUBLISHED', 'STRIX_R4', 'MIDAS_R4'].map((id) => ({
      id,
      referenceClass: id === 'PRIMARY_INDEPENDENT' ? caseMetadata.referenceClass : 'NOT_ASSIGNED',
      claimEvidenceLevel: 'NOT_ASSIGNED',
      status: 'NOT_LOCKED',
      artifacts: [],
      reasonCodes: [M1_REASON_CODES.referenceNotLocked],
    })),
    approval: reviewApprovalRecord(),
    reasonCodes: [M1_REASON_CODES.referenceNotLocked, M1_REASON_CODES.frameworkOnly],
  };

  const toleranceManifest = {
    schemaVersion: 'p17-tolerance-manifest-v1',
    caseId,
    status: 'NOT_LOCKED',
    payloadAbsent: true,
    releaseAllowed: false,
    policy: {
      signedComparisonDefault: true,
      nearZeroPolicy: 'NOT_LOCKED',
      postResultTuningAllowed: false,
    },
    criteria: [],
    approval: reviewApprovalRecord(),
    reasonCodes: [M1_REASON_CODES.toleranceNotLocked, M1_REASON_CODES.frameworkOnly],
  };

  const probeManifest = {
    schemaVersion: 'p17-probe-manifest-v1',
    caseId,
    status: 'NOT_LOCKED',
    payloadAbsent: true,
    releaseAllowed: false,
    signConventionStatus: 'NOT_LOCKED',
    probes: [],
    approval: reviewApprovalRecord(),
    reasonCodes: [M1_REASON_CODES.probesNotLocked, M1_REASON_CODES.frameworkOnly],
  };

  const canonicalInput = {
    schemaVersion: 'p17-canonical-input-v1',
    caseId,
    artifactStatus: 'NOT_PREPARED',
    payloadAbsent: true,
    releaseAllowed: false,
    canonicalUnitSystem: 'SI_KN_M_S_RAD',
    entities: {
      nodes: [], elements: [], materials: [], sections: [], constraints: [], loadCases: [], loads: [], masses: [], analysisCases: [],
    },
    silentDefaults: { status: 'NOT_LOCKED', items: [] },
    reasonCodes: [M1_REASON_CODES.modelNotBuilt, M1_REASON_CODES.frameworkOnly],
  };

  const sstructuresInput = {
    schemaVersion: 'p17-sstructures-input-v1',
    caseId,
    artifactStatus: 'NOT_PREPARED',
    payloadAbsent: true,
    releaseAllowed: false,
    productProjectSchemaVersion: 'NOT_BOUND',
    payload: {},
    reasonCodes: [M1_REASON_CODES.modelNotBuilt, M1_REASON_CODES.frameworkOnly],
  };

  const modelEquivalence = {
    schemaVersion: 'p17-model-equivalence-v1',
    caseId,
    artifactStatus: 'NOT_PREPARED',
    payloadAbsent: true,
    releaseAllowed: false,
    overallStatus: 'NOT_STARTED',
    dimensions: MODEL_EQUIVALENCE_DIMENSIONS.map((id) => ({
      id,
      mandatory: true,
      status: 'NOT_STARTED',
      sstructures: 'NOT_REVIEWED',
      strix: officialSuiteMember ? 'NOT_REVIEWED' : 'NOT_APPLICABLE_CUSTOM',
      midas: 'NOT_AVAILABLE',
      reasonCodes: [M1_REASON_CODES.modelNotBuilt],
    })),
    knownDifferences: [],
    reasonCodes: [M1_REASON_CODES.modelNotBuilt, M1_REASON_CODES.frameworkOnly],
  };

  const signoff = {
    schemaVersion: 'p17-review-signoff-v1',
    caseId,
    status: 'NOT_STARTED',
    releaseAllowed: false,
    reviewerApprovals: REVIEW_ROLES.map((role) => ({ role, ...approvalRecord() })),
    approvedArtifactHashes: [],
    reasonCodes: [M1_REASON_CODES.reviewNotStarted, M1_REASON_CODES.frameworkOnly],
  };

  const documentKinds = [
    ['sourceManifest', sourceManifest], ['canonicalInput', canonicalInput], ['sstructuresInput', sstructuresInput],
    ['modelEquivalence', modelEquivalence], ['referenceManifest', referenceManifest], ['expectedValues', expectedValues],
    ['toleranceManifest', toleranceManifest], ['probeManifest', probeManifest], ['reviewSignoff', signoff],
  ];
  for (const [kind, value] of documentKinds) validateManifestDocument(kind, value, { m1Scaffold: true });

  const caseManifest = {
    schemaVersion: 'p17-case-manifest-v1',
    phase: 17,
    milestone: PHASE17_M1,
    caseId,
    ordinal: caseMetadata.ordinal,
    title: caseMetadata.title,
    family: caseMetadata.family,
    officialSuiteMember,
    classification: officialSuiteMember ? 'OFFICIAL_STRIX_21' : 'S_STRUCTURES_CUSTOM_QUALIFICATION',
    lifecycle: {
      state: officialSuiteMember ? 'SOURCE_LOCKED' : 'NOT_STARTED',
      terminalStatus: 'NOT_STARTED',
      wipEligible: false,
    },
    statuses: {
      sourceStatus,
      modelStatus: 'NOT_STARTED',
      sstructuresRunStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY',
      independentQualificationStatus: 'NOT_STARTED',
      strixComparisonStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY',
      midasComparisonStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY',
      performanceComparisonStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY',
      reportStatus: 'NOT_STARTED',
      releaseStatus: 'NOT_STARTED',
    },
    roles: Object.fromEntries(REVIEW_ROLES.map((role) => [role, approvalRecord()])),
    conventions: {
      canonicalUnitSystem: {
        id: 'SI_KN_M_S_RAD', status: 'FRAMEWORK_DEFAULT_NOT_CASE_LOCKED', force: 'kN', length: 'm', time: 's', angle: 'rad', reasonCodes: ['P17_CASE_UNIT_SYSTEM_NOT_LOCKED'],
      },
      globalAxes: { status: 'FRAMEWORK_DEFAULT_NOT_CASE_LOCKED', handedness: 'RIGHT_HANDED', verticalAxis: '+Z', reasonCodes: ['P17_CASE_GLOBAL_AXES_NOT_LOCKED'] },
      localAxisConvention: { status: 'NOT_LOCKED', description: 'TO_BE_LOCKED_PER_CASE', reasonCodes: ['P17_CASE_LOCAL_AXIS_NOT_LOCKED'] },
      signConvention: { status: 'NOT_LOCKED', description: 'TO_BE_LOCKED_PER_PROBE', reasonCodes: ['P17_CASE_SIGN_CONVENTION_NOT_LOCKED'] },
    },
    productBinding: {
      ...PRODUCT_SERVICE_BINDING,
      solverSettingProfile: { status: 'NOT_LOCKED', profileId: 'NOT_ASSIGNED', reasonCodes: [M1_REASON_CODES.solverProfileNotLocked] },
      requestedOutputProbes: { status: 'NOT_LOCKED', manifestPath: `${caseRoot}/reference/probe-manifest.json`, reasonCodes: [M1_REASON_CODES.probesNotLocked] },
    },
    artifactBindings: {
      sourceLock: { status: sourceStatus, path: caseMetadata.sourceLockPath, sha256: caseMetadata.sourceLockHash, reasonCodes: sourceReasonCodes },
      sourceManifest: { status: sourceStatus, path: `${caseRoot}/source/source-manifest.json`, sha256: sha256Canonical(sourceManifest), reasonCodes: sourceReasonCodes },
      referenceManifest: { status: 'NOT_LOCKED', path: `${caseRoot}/reference/reference-manifest.json`, sha256: sha256Canonical(referenceManifest), reasonCodes: [M1_REASON_CODES.referenceNotLocked] },
      toleranceManifest: { status: 'NOT_LOCKED', path: `${caseRoot}/reference/tolerance-manifest.json`, sha256: sha256Canonical(toleranceManifest), reasonCodes: [M1_REASON_CODES.toleranceNotLocked] },
      probeManifest: { status: 'NOT_LOCKED', path: `${caseRoot}/reference/probe-manifest.json`, sha256: sha256Canonical(probeManifest), reasonCodes: [M1_REASON_CODES.probesNotLocked] },
      canonicalModel: { status: 'NOT_STARTED', path: `${caseRoot}/model/canonical-input.json`, sha256: sha256Canonical(canonicalInput), reasonCodes: [M1_REASON_CODES.modelNotBuilt] },
      modelMapping: { status: 'NOT_STARTED', path: `${caseRoot}/model/model-equivalence.json`, sha256: sha256Canonical(modelEquivalence), reasonCodes: [M1_REASON_CODES.modelNotBuilt] },
      nativeModel: { status: 'NOT_STARTED', path: `${caseRoot}/model/sstructures-input.json`, sha256: sha256Canonical(sstructuresInput), reasonCodes: [M1_REASON_CODES.modelNotBuilt] },
      productBuild: { status: 'NOT_BOUND', path: null, sha256: null, reasonCodes: [M1_REASON_CODES.buildNotBound] },
    },
    currentTerminalReasonCodes: commonReasonCodes,
    supersededRunIds: [],
    benchmarkExecutionCount: 0,
  };
  validateManifestDocument('caseManifest', caseManifest, { m1Scaffold: true });

  const files = new Map([
    [`${caseRoot}/README.md`, caseReadme(caseMetadata, officialSuiteMember)],
    [`${caseRoot}/case-manifest.json`, prettyJson(caseManifest)],
    [`${caseRoot}/source/source-manifest.json`, prettyJson(sourceManifest)],
    [`${caseRoot}/source/transcription.md`, transcriptionReadme(caseId)],
    [`${caseRoot}/model/canonical-input.json`, prettyJson(canonicalInput)],
    [`${caseRoot}/model/sstructures-input.json`, prettyJson(sstructuresInput)],
    [`${caseRoot}/model/model-equivalence.json`, prettyJson(modelEquivalence)],
    [`${caseRoot}/model/modeling-notes.md`, modelingNotes(caseId)],
    [`${caseRoot}/reference/reference-manifest.json`, prettyJson(referenceManifest)],
    [`${caseRoot}/reference/expected-values.json`, prettyJson(expectedValues)],
    [`${caseRoot}/reference/tolerance-manifest.json`, prettyJson(toleranceManifest)],
    [`${caseRoot}/reference/probe-manifest.json`, prettyJson(probeManifest)],
    [`${caseRoot}/runner/run.mjs`, runnerWrapper(caseId)],
    [`${caseRoot}/tests/case-contract.mjs`, testWrapper(caseId)],
    [`${caseRoot}/runs/README.md`, emptyArtifactReadme(caseId, 'runs', M1_REASON_CODES.noRunArtifacts)],
    [`${caseRoot}/figures/README.md`, emptyArtifactReadme(caseId, 'figures', M1_REASON_CODES.noCaptureArtifacts)],
    [`${caseRoot}/report/README.md`, emptyArtifactReadme(caseId, 'report', M1_REASON_CODES.noReportArtifacts)],
    [`${caseRoot}/review/checklist.md`, reviewChecklist(caseId)],
    [`${caseRoot}/review/signoff.json`, prettyJson(signoff)],
  ]);
  return {
    files,
    summary: {
      caseId,
      ordinal: caseMetadata.ordinal,
      caseRoot,
      manifestHash: sha256Canonical(caseManifest),
      officialSuiteMember,
    },
  };
}

function buildSuiteManifest(registry, generatedCases, customCase) {
  return {
    schemaVersion: 'p17-suite-manifest-v1',
    phase: 17,
    milestone: PHASE17_M1,
    frameworkStatus: 'CONTRACT_READY_NO_BENCHMARK_RUNS',
    benchmarkExecutionPolicy: 'NO_BENCHMARK_EXECUTION_IN_P17_M1',
    officialCaseCount: 21,
    officialOrder: [...OFFICIAL_CASE_IDS],
    officialDenominator: { classification: 'OFFICIAL_STRIX_21_ONLY', count: 21, customIncluded: false },
    customExcluded: [{ caseId: CUSTOM_CASE_ID, classification: 'S_STRUCTURES_CUSTOM_QUALIFICATION', reasonCode: 'CUSTOM_CASE_EXCLUDED_FROM_OFFICIAL_DENOMINATOR' }],
    sourceRegistryBinding: { path: SOURCE_REGISTRY_PATH, registryHash: registry.registryHash, revision: registry.revision },
    cases: generatedCases.map((entry) => ({
      caseId: entry.caseId,
      ordinal: entry.ordinal,
      folder: entry.caseRoot,
      manifestPath: `${entry.caseRoot}/case-manifest.json`,
      manifestHash: entry.manifestHash,
      status: 'NOT_STARTED',
    })),
    customCases: [{
      caseId: customCase.caseId,
      folder: customCase.caseRoot,
      manifestPath: `${customCase.caseRoot}/case-manifest.json`,
      manifestHash: customCase.manifestHash,
      officialSuiteMember: false,
      status: 'NOT_STARTED',
    }],
    resultSummary: { benchmarkExecutionCount: 0, terminalCaseCount: 0, passCount: 0, failCount: 0, blockedCount: 0 },
    reasonCodes: [M1_REASON_CODES.frameworkOnly],
  };
}

function validateRegistryInput(registry) {
  if (registry.version !== 'p17-suite-source-registry-v1' || registry.revision !== 2 || registry.registryHash == null) throw new Error('P17-M1 requires the sealed R2 source registry.');
  if (registry.officialCaseCount !== 21 || registry.cases.length !== 21 || registry.officialOrder.length !== 21) throw new Error('R2 registry must contain exactly 21 official cases.');
  if (!registry.officialOrder.every((caseId, index) => caseId === OFFICIAL_CASE_IDS[index])) throw new Error('R2 registry official order differs from the STRIX manual order.');
  if (!registry.cases.every((entry, index) => entry.caseId === OFFICIAL_CASE_IDS[index] && entry.ordinal === index + 1)) throw new Error('R2 registry case records are not in official ordinal order.');
  if (registry.cases.some((entry) => !entry.sourceLockPath || !/^[0-9a-f]{64}$/.test(entry.sourceLockHash))) throw new Error('Every official registry case requires an R2 source-lock path/hash.');
  if (!registry.customExcluded.some((entry) => entry.id === CUSTOM_CASE_ID && entry.official === false)) throw new Error('R2 registry must explicitly exclude P3S2-SS from the official denominator.');
  const registryCore = Object.fromEntries(Object.entries(registry).filter(([key]) => key !== 'registryHash'));
  if (sha256Canonical(registryCore) !== registry.registryHash) throw new Error('R2 registry content does not match its canonical registryHash.');
}

function approvalRecord() {
  return { assignment: 'UNASSIGNED', status: 'NOT_STARTED', approvalHash: null };
}

function reviewApprovalRecord() {
  return { reviewer: 'UNASSIGNED', status: 'NOT_STARTED', approvalHash: null };
}

function addFiles(target, source) {
  for (const [relativePath, content] of source) {
    if (target.has(relativePath)) throw new Error(`Duplicate generated scaffold path: ${relativePath}`);
    target.set(relativePath, content);
  }
}

function resolveInside(repoRoot, relativePath) {
  const target = path.resolve(repoRoot, ...relativePath.split('/'));
  const prefix = `${path.resolve(repoRoot)}${path.sep}`;
  if (!target.startsWith(prefix)) throw new Error(`Scaffold path escapes repository root: ${relativePath}`);
  return target;
}

function assertSafeParentChain(repoRoot, target) {
  const relative = path.relative(repoRoot, path.dirname(target));
  if (!relative || relative === '.') return;
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Scaffold target escapes repository root: ${target}`);
  let current = repoRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (!existsSync(current)) break;
    const info = lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing scaffold path through link/reparse/non-directory parent: ${current}`);
    const actual = realpathSync(current);
    if (actual !== repoRoot && !actual.startsWith(`${repoRoot}${path.sep}`)) throw new Error(`Scaffold parent resolves outside repository root: ${current}`);
  }
}

function ensureSafeDirectoryChain(repoRoot, directory) {
  const relative = path.relative(repoRoot, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Scaffold directory escapes repository root: ${directory}`);
  let current = repoRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!existsSync(current)) mkdirSync(current);
    const info = lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing scaffold path through link/reparse/non-directory parent: ${current}`);
    const actual = realpathSync(current);
    if (!actual.startsWith(`${repoRoot}${path.sep}`)) throw new Error(`Scaffold directory resolves outside repository root: ${current}`);
  }
}

function rollbackGeneratedFiles(repoRoot, files, written) {
  const failures = [];
  for (const relativePath of [...written].reverse()) {
    const target = resolveInside(repoRoot, relativePath);
    try {
      const info = lstatSync(target);
      if (!info.isFile() || info.isSymbolicLink() || readFileSync(target, 'utf8') !== files.get(relativePath)) {
        failures.push(relativePath);
        continue;
      }
      unlinkSync(target);
    } catch {
      failures.push(relativePath);
    }
  }
  return failures;
}

function caseReadme(caseMetadata, officialSuiteMember) {
  return `# ${caseMetadata.caseId} — ${caseMetadata.title}\n\n- Phase: P17-M1\n- Classification: ${officialSuiteMember ? 'OFFICIAL_STRIX_21' : 'S_STRUCTURES_CUSTOM_QUALIFICATION'}\n- Status: NOT_STARTED\n- Benchmark execution: NOT_RUN_M1_FRAMEWORK_ONLY\n\n이 폴더는 사례 계약과 증거 경계만 고정한 fail-closed scaffold다. 모델, 기준값, 허용오차, probe와 제품 실행 결과는 아직 잠기지 않았다. P17-M1 산출물을 사례 PASS 또는 수치 검증으로 해석하면 안 된다.\n`;
}

function transcriptionReadme(caseId) {
  return `# ${caseId} source transcription\n\nStatus: NOT_STARTED\n\nP17-M1에서는 M0 R2 source lock에만 결속한다. 원문 수치 전사와 독립 검토는 해당 공식 case milestone에서 수행하며 이 파일에는 benchmark 값이 없다.\n`;
}

function modelingNotes(caseId) {
  return `# ${caseId} modeling notes\n\nStatus: NOT_STARTED\n\n형상, 요소 정식화, 지점, 하중, 질량, 축, silent default와 output mapping은 해당 사례 milestone에서 source/reference lock 이후 작성한다. P17-M1에서는 모델링 가정을 만들거나 추정하지 않는다.\n`;
}

function emptyArtifactReadme(caseId, artifactType, reasonCode) {
  return `# ${caseId} ${artifactType}\n\nStatus: NOT_RUN_M1_FRAMEWORK_ONLY\nReason: ${reasonCode}\n\n이 디렉터리는 append-only 사례 실행이 시작될 때 \`<RUN_ID>/\` 하위 산출물을 받는다. P17-M1에는 실제 run, 화면 또는 사례 보고서가 없다.\n`;
}

function runnerWrapper(caseId) {
  return `${'import'} { runP17CaseCli } from '../../../../../runners/run-p17-case.mjs';\n\nawait runP17CaseCli({ expectedCaseId: '${caseId}', invokedUrl: import.meta.url });\n`;
}

function testWrapper(caseId) {
  return `${'import'} { runP17CaseContract } from '../../../../../tests/phase17/run-case-contract.mjs';\n\nawait runP17CaseContract({ expectedCaseId: '${caseId}', invokedUrl: import.meta.url });\n`;
}

function reviewChecklist(caseId) {
  return `# ${caseId} review checklist\n\nStatus: NOT_STARTED\n\n- [ ] source/reference/probe/tolerance lock approved before execution\n- [ ] model equivalence and silent defaults reviewed\n- [ ] stable public product service used; external solver/network fallback absent\n- [ ] physics, convergence, mutation and determinism gates reviewed\n- [ ] Chrome/CLI/JSON/Markdown/PDF parity reviewed\n- [ ] immutable evidence hashes and reviewer signoff complete\n\nP17-M1에서는 모든 항목이 미완료이며 releaseAllowed=false다.\n`;
}
