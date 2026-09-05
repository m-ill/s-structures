import { stableHash } from '../../core/stableHash.js';
import { runProductionNlth } from '../dynamics/productionNlth.js';
import { createWasmSparseBackend } from '../equilibrium/backends/wasmSparseBackend.js';
import { runProductionPushover } from '../pushover/productionPushover.js';
import { buildPhase8PilotArtifact, getPhase8PilotPackage } from './pilotPackages.js';

export const PHASE8_PILOT_RUNNER_VERSION = 'p8-m11-pilot-runner-v1';
export const PHASE8_PILOT_REPORT_VERSION = 'p8-m11-pilot-report-v1';

export async function executePhase8PilotPackage(pilotInput, options = {}) {
  const pilot = typeof pilotInput === 'string' ? getPhase8PilotPackage(pilotInput) : clone(pilotInput);
  if (!pilot) throw pilotRunnerError('PILOT_PACKAGE_NOT_FOUND', `Unknown Phase 8 pilot ${pilotInput}.`);
  const backend = options.backend || await createWasmSparseBackend(options.wasm || {});
  const started = now();
  const results = [];
  for (const analysisCase of pilot.analysisCases) {
    const result = analysisCase.kind === 'nonlinearTimeHistory'
      ? await runProductionNlth(pilot.model, analysisCase, nlthOptions(pilot, analysisCase, backend, options))
      : await runProductionPushover(pilot.model, analysisCase, pushoverOptions(pilot, analysisCase, backend, options));
    results.push(result);
    if (result.status === 'blocked' || result.status === 'failed' || result.status === 'cancelled') break;
  }
  const durationMs = now() - started;
  const execution = buildExecution(pilot, results, durationMs);
  const report = buildPhase8PilotReport({ pilot, execution, results, durationMs });
  const artifact = buildPhase8PilotArtifact(pilot, {
    generatedAt: clean(options.generatedAt) || new Date().toISOString(),
    sourceRevision: clean(options.sourceRevision) || 'working-tree',
    execution,
    report: {
      path: `verification/specs/phase8/pilots/${pilot.id}.md`,
      reportHash: report.reportHash,
      resultHash: execution.resultHash,
      format: 'json+markdown',
    },
  });
  return deepFreeze({
    version: PHASE8_PILOT_RUNNER_VERSION,
    pilot,
    execution,
    report,
    artifact,
    resultSummaries: results.map(compactResult),
    durationMs,
  });
}

export async function executeAllPhase8PilotPackages(pilots, options = {}) {
  const rows = [];
  for (const pilot of pilots || []) {
    rows.push(await executePhase8PilotPackage(pilot, options));
    options.onProgress?.({ pilotId: pilot.id, completed: rows.length, total: pilots.length, status: rows.at(-1).artifact.qualification.status });
  }
  return deepFreeze(rows);
}

export function buildPhase8PilotReport(input = {}) {
  const pilot = input.pilot || {};
  const execution = input.execution || {};
  const results = input.results || [];
  const core = {
    version: PHASE8_PILOT_REPORT_VERSION,
    pilotId: pilot.id || null,
    title: pilot.title || null,
    packageHash: pilot.packageHash || null,
    inputHash: pilot.inputHash || null,
    materialSystem: pilot.materialSystem || null,
    workflow: clone(pilot.workflow || []),
    execution: clone(execution),
    resultSummaries: results.map(compactResult),
    qualification: {
      value: 'candidate',
      designBlocked: true,
      reason: 'INDEPENDENT_EXTERNAL_COMPARISON_REQUIRED',
    },
    externalComparison: {
      status: 'MISSING',
      required: pilot.comparison?.required === true,
      channels: clone(pilot.comparison?.channels || []),
    },
    limitations: [
      'This artifact proves deterministic input-to-report execution only.',
      'It does not substitute for an external numerical comparison or project owner approval.',
      'Design transfer remains blocked while the Phase 8 release manifest is candidate.',
    ],
  };
  return deepFreeze({ ...core, reportHash: stableHash(core).slice(0, 24) });
}

function pushoverOptions(pilot, analysisCase, backend, options) {
  const settings = analysisCase.settings || {};
  const rc = pilot.id === 'PILOT-RC-01';
  return {
    backend,
    production: true,
    includeInternal: false,
    gravityCombinationId: 'GRAV',
    controlNodeId: analysisCase.control?.nodeId,
    direction: analysisCase.control?.direction || settings.direction,
    pattern: settings.pattern || 'triangular',
    referenceBaseShear: settings.referenceBaseShear || 20,
    targetDisplacement: analysisCase.control?.targetDisplacement || settings.targetDisplacement,
    steps: settings.steps || 8,
    minIncrement: rc ? 1e-6 : 1e-5,
    eventAware: false,
    stopAtPostPeak: false,
    fiberPmm: rc ? {
      strict: true,
      refinement: { rcDivisions: 2 },
      angleCount: 8,
      curvatureSteps: 16,
      directionIterations: 12,
      integrationPoints: 2,
      cacheEnabled: false,
    } : false,
    reinforcementSnapshots: rc ? pilot.model.reinforcementSnapshots : undefined,
    stationCount: rc ? 3 : undefined,
    gravity: {
      initialStep: 0.5,
      maxStep: 0.5,
      minStep: 1e-5,
      newton: strictNewton(),
      equilibriumAbsolute: 1e-6,
      equilibriumRelative: 1e-7,
    },
    newton: strictNewton(),
    arcLength: settings.arcLength?.enabled ? {
      ...settings.arcLength,
      minRadius: 1e-8,
      maxIterations: 30,
      convergence: strictNewton().convergence,
    } : undefined,
    signal: options.signal,
    isCancelled: options.isCancelled,
    onProgress: options.onSolverProgress,
  };
}

function nlthOptions(_pilot, analysisCase, backend, options) {
  const settings = analysisCase.settings || {};
  const newton = dynamicNewton();
  return {
    backend,
    production: true,
    includeInternal: false,
    fiberPmm: false,
    gravityCombinationId: 'GRAV',
    massSourceId: settings.massSourceId || 'MS',
    groundMotionRecords: settings.groundMotionRecords,
    damping: settings.damping,
    gravity: {
      initialStep: 0.25,
      maxStep: 0.25,
      minStep: 1e-8,
      newton,
    },
    newmark: {
      ...(settings.newmark || {}),
      convergence: newton.convergence,
    },
    output: settings.output,
    signal: options.signal,
    isCancelled: options.isCancelled,
    onProgress: options.onSolverProgress,
  };
}

function dynamicNewton() {
  return {
    maxIterations: 80,
    lineSearch: true,
    pivotTolerance: 1e-14,
    linearRelativeTolerance: 1e-10,
    convergence: {
      forceAbsolute: 1e-5,
      forceRelative: 1e-6,
      momentAbsolute: 1e-5,
      momentRelative: 1e-6,
      displacementAbsolute: 1e-8,
      displacementRelative: 1e-6,
      rotationAbsolute: 1e-8,
      rotationRelative: 1e-6,
      energyAbsolute: 1e-8,
      energyRelative: 1e-6,
    },
  };
}

function buildExecution(pilot, results, durationMs) {
  const firstFailure = results.find((result) => result.ok !== true);
  if (firstFailure) {
    const failedSummary = compactResult(firstFailure);
    return {
      status: firstFailure.status || 'failed',
      engineId: firstFailure.engine?.id || pilot.analysisCases[0]?.engineId || null,
      terminationReason: firstFailure.reason || firstFailure.designBlockReason || null,
      reason: firstFailure.reason || firstFailure.designBlockReason || null,
      resultHash: firstFailure.resultHash || null,
      runRecordId: firstFailure.runRecord?.id || null,
      checkpointHash: firstFailure.checkpoint?.integrityHash || null,
      fallbackUsed: firstFailure.routing?.fallbackUsed === true,
      designBlocked: firstFailure.designBlocked !== false,
      resultChannels: failedSummary.resultChannels,
      summary: {
        durationMs,
        resultCount: results.length,
        reason: firstFailure.reason || null,
        capabilityHash: firstFailure.details?.capabilityHash || firstFailure.details?.capability?.capabilityHash || null,
      },
    };
  }
  const summaries = results.map(compactResult);
  const resultChannels = mergeResultChannels(summaries.map((row) => row.resultChannels));
  const terminationReasons = results.map(terminationReason);
  const resultHash = results.length === 1
    ? results[0].resultHash
    : stableHash(summaries).slice(0, 24);
  const runRecordId = results.length === 1
    ? results[0].runRecord?.id
    : `PILOT:${pilot.id}:${stableHash(results.map((result) => result.runRecord?.id || null)).slice(0, 16)}`;
  return {
    status: 'completed',
    engineId: pilot.analysisCases[0]?.engineId || results[0]?.engine?.id || null,
    terminationReason: commonTermination(terminationReasons),
    resultHash,
    runRecordId,
    checkpointHash: results.at(-1)?.checkpoint?.integrityHash
      || results.at(-1)?.arcLength?.restartCheckpointHash
      || results.at(-1)?.arcLengthHandoff?.sourceCheckpointHash
      || null,
    fallbackUsed: results.some((result) => result.routing?.fallbackUsed === true),
    designBlocked: results.some((result) => result.designBlocked !== false),
    resultChannels,
    summary: {
      durationMs,
      resultCount: results.length,
      terminationReasons,
      cases: summaries,
    },
    outputManifest: {
      resultHashes: results.map((result) => result.resultHash || null),
      runRecordIds: results.map((result) => result.runRecord?.id || null),
    },
  };
}

function commonTermination(reasons) {
  if (reasons.every((reason) => reason === reasons[0])) return reasons[0];
  if (reasons.every((reason) => ['TARGET_REACHED', 'MECHANISM_DETECTED'].includes(reason))) return 'TARGET_REACHED';
  return reasons[0] || null;
}

function terminationReason(result) {
  return result.termination?.reason || result.reason || (result.status === 'completed' ? 'DYNAMIC_TIME_RANGE_COMPLETED' : null);
}

function compactResult(result = {}) {
  const checkpointHash = result.checkpoint?.integrityHash || result.arcLength?.restartCheckpointHash || null;
  const resultChannels = {
    resultHash: Boolean(clean(result.resultHash)),
    runRecordId: Boolean(clean(result.runRecord?.id)),
    capacityCurve: Array.isArray(result.capacityCurve) && result.capacityCurve.length > 0,
    hingeEvents: Array.isArray(result.events),
    checkpointHash: Boolean(clean(checkpointHash)),
    storyResponse: Array.isArray(result.storyResponse),
    memberResults: Boolean(result.memberResults && typeof result.memberResults === 'object'),
    domainIdentityHash: Boolean(
      clean(result.provenance?.domainHash)
      || clean(result.provenance?.domainHashes?.domainHash)
      || result.provenance?.domainHashes,
    ),
    fiberPmmHash: Boolean(clean(result.fiberPmm?.contentHash)),
    historyManifestHash: Boolean(clean(result.history?.manifestHash)),
    energyAudit: Boolean(result.summary?.energyAudit),
    reason: Boolean(clean(result.reason || result.designBlockReason)),
    designBlocked: result.designBlocked === true,
    capabilityHash: Boolean(clean(result.details?.capabilityHash || result.details?.capability?.capabilityHash)),
  };
  return {
    ok: result.ok === true,
    status: result.status || null,
    reason: result.reason || null,
    terminationReason: terminationReason(result),
    resultHash: result.resultHash || null,
    runRecordId: result.runRecord?.id || null,
    qualification: result.qualification || null,
    designBlocked: result.designBlocked !== false,
    fallbackUsed: result.routing?.fallbackUsed === true,
    summary: clone(result.summary || null),
    convergence: clone(result.convergence || null),
    checkpointHash,
    historyManifestHash: result.history?.manifestHash || null,
    energyAudit: clone(result.summary?.energyAudit || null),
    resultChannels,
  };
}

function mergeResultChannels(rows = []) {
  const merged = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row || {})) merged[key] ||= value === true;
  }
  return merged;
}

function strictNewton() {
  return {
    maxIterations: 40,
    lineSearch: true,
    pivotTolerance: 1e-14,
    linearRelativeTolerance: 1e-10,
    controlAbsolute: 1e-9,
    controlRelative: 1e-8,
    convergence: {
      forceAbsolute: 1e-7,
      forceRelative: 1e-7,
      momentAbsolute: 1e-7,
      momentRelative: 1e-7,
      displacementAbsolute: 1e-10,
      displacementRelative: 1e-8,
      rotationAbsolute: 1e-10,
      rotationRelative: 1e-8,
      energyAbsolute: 1e-10,
      energyRelative: 1e-8,
    },
  };
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function now() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

function pilotRunnerError(code, message) {
  const error = new Error(message);
  error.name = 'Phase8PilotRunnerError';
  error.code = code;
  return error;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
