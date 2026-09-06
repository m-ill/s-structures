import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { stableHash } from '../src/core/stableHash.js';
import {
  createMemberFiberInteractionCacheIdentity,
  createMemberFiberInteractionCacheKey,
} from '../src/nonlinear/fiber/memberInteraction.js';
import {
  createPmmInteractionCache,
} from '../src/nonlinear/fiber/pmmInteractionCache.js';
import {
  prepareModelFiberPmmInteractions,
} from '../src/nonlinear/fiber/fiberPmmPreprocessor.js';
import { solveSectionAxialEquilibrium } from '../src/nonlinear/fiber/momentCurvatureV2.js';
import { generatePmmSurface } from '../src/nonlinear/fiber/pmmSurface.js';
import {
  createSectionEnvelopeEvaluator,
  evaluateSectionResponse,
} from '../src/nonlinear/fiber/sectionResponse.js';
import { createWorkerClient } from '../src/nonlinear/runtime/workerClient.js';
import {
  P8_M6_EXPLICIT_DEFAULT_OPTIONS,
  P8_M6_PMM_RUNTIME_GATE_MS,
  createEnvelopeParityFixtures,
  createStaleProtectionFixture,
  createWorkerSteelFixture,
} from './fixtures/p8-m6-pmm-runtime-fixture.mjs';

const verificationIds = Array.from(
  { length: 6 },
  (_, index) => `NL-PMM-${String(index + 9).padStart(2, '0')}`,
);

// NL-PMM-09: a fresh Node process measures the existing RC 400x600 fixture.
const measurementRun = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../tools/measure-p8-m6-pmm.mjs', import.meta.url))],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: P8_M6_PMM_RUNTIME_GATE_MS + 30_000,
    windowsHide: true,
  },
);
assert.ifError(measurementRun.error);
assert.equal(measurementRun.signal, null, measurementRun.stderr);
assert.equal(measurementRun.status, 0, measurementRun.stderr);
const measurement = JSON.parse(measurementRun.stdout);
assert.equal(measurement.verificationId, 'NL-PMM-09');
assert.equal(measurement.benchmark.id, 'existing-rc-400x600-cold');
assert.equal(measurement.benchmark.isolatedProcess, true);
assert.equal(measurement.benchmark.coldCache, true);
assert.equal(measurement.benchmark.cacheEnabled, false);
assert.equal(measurement.benchmark.gateMs, P8_M6_PMM_RUNTIME_GATE_MS);
assert.ok(measurement.benchmark.elapsedMs >= 0);
assert.ok(
  measurement.benchmark.elapsedMs <= P8_M6_PMM_RUNTIME_GATE_MS,
  `RC 400x600 cold PMM generation took ${measurement.benchmark.elapsedMs} ms`,
);
assert.equal(measurement.benchmark.pass, true);
assert.equal(measurement.operations.uniqueInteractionCount, 1);
assert.equal(measurement.operations.computedInteractionCount, 1);
assert.ok(measurement.operations.fiberCount > 0);
assert.ok(measurement.operations.sectionEvaluationCount > 0);
assert.ok(measurement.operations.sectionSolveCount > 0);
assert.ok(measurement.operations.sectionSolveRequestCount >= measurement.operations.sectionSolveCount);
assert.equal(
  measurement.operations.sectionSolveRequestCount,
  measurement.operations.sectionSolveCount + measurement.operations.sectionSolveCacheHitCount,
);
assert.ok(measurement.operations.progressEventCount > 0);
assert.ok(measurement.operations.progressStageCount >= 2);

// NL-PMM-10: default-normalized keys and both cache lookup tiers.
const { model: staleModel, target, unrelated } = createStaleProtectionFixture();
const implicitDefaultIdentity = createMemberFiberInteractionCacheIdentity(staleModel, target, {});
const implicitDefaultKey = createMemberFiberInteractionCacheKey(staleModel, target, {});
assert.equal(Object.isFrozen(staleModel.materials[0]), false, 'cache identity must not freeze model materials');
assert.equal(Object.isFrozen(staleModel.sections[0]), false, 'cache identity must not freeze model sections');
assert.equal(Object.isFrozen(target.nonlinear.reinforcementSnapshot), false, 'cache identity must not freeze reinforcement');
const explicitDefaultKey = createMemberFiberInteractionCacheKey(
  staleModel,
  target,
  P8_M6_EXPLICIT_DEFAULT_OPTIONS,
);
assert.equal(explicitDefaultKey, implicitDefaultKey);
assert.equal(
  createMemberFiberInteractionCacheKey(staleModel, target, {
    workerClient: { runtimeOnly: true },
    cacheEnabled: false,
    requireWorker: true,
    onProgress() {},
  }),
  implicitDefaultKey,
  'execution-only options must not alter the numerical cache key',
);

const deterministic = buildDeterministicSurfaces();
const cachedInteraction = syntheticCachedInteraction(
  deterministic.memoized,
  implicitDefaultKey,
  implicitDefaultIdentity,
  'target',
);
const sharedAdapter = createPersistentTestAdapter();
const firstCache = createPmmInteractionCache({ adapter: sharedAdapter, maxMemoryEntries: 32 });
await firstCache.set(implicitDefaultKey, cachedInteraction, implicitDefaultIdentity);
assert.equal((await firstCache.get(implicitDefaultKey, implicitDefaultIdentity)).surface.surfaceHash, deterministic.memoized.surfaceHash);
assert.equal(firstCache.stats().memoryHits, 1);
const reopenedCache = createPmmInteractionCache({ adapter: sharedAdapter, maxMemoryEntries: 32 });
assert.equal((await reopenedCache.get(implicitDefaultKey, implicitDefaultIdentity)).surface.surfaceHash, deterministic.memoized.surfaceHash);
assert.equal(reopenedCache.stats().persistentHits, 1);
assert.equal(reopenedCache.stats().adapterKind, 'verification-persistent');

// NL-PMM-11: execution counters may change, but numerical hashes and progress do not.
assert.equal(deterministic.memoized.sourceHash, deterministic.unmemoized.sourceHash);
assert.equal(deterministic.memoized.surfaceHash, deterministic.unmemoized.surfaceHash);
assert.equal(deterministic.memoized.summary.sectionSolveRequestCount, deterministic.unmemoized.summary.sectionSolveRequestCount);
assert.ok(deterministic.memoized.summary.sectionSolveCacheHitCount > 0);
assert.equal(deterministic.unmemoized.summary.sectionSolveCacheHitCount, 0);
assert.ok(deterministic.memoized.summary.sectionSolveCount < deterministic.unmemoized.summary.sectionSolveCount);
assert.equal(
  stableHash(withoutExecutionMetrics(deterministic.memoized)),
  stableHash(withoutExecutionMetrics(deterministic.unmemoized)),
);
assert.deepEqual(
  deterministic.memoizedProgress.map(normalizeProgress),
  deterministic.unmemoizedProgress.map(normalizeProgress),
);

// NL-PMM-12: use the repository worker client with an actual node:worker_threads Worker.
const workerFixture = createWorkerSteelFixture();
const workerProgress = [];
const assemblySources = [];
const workerAdapter = createPersistentTestAdapter();
const workerCache = createPmmInteractionCache({ adapter: workerAdapter });
const successfulClient = createNodeWorkerClient();
let prepared;
try {
  prepared = await prepareModelFiberPmmInteractions(workerFixture.model, {
    ...workerFixture.options,
    cache: workerCache,
    workerClient: successfulClient,
    requireWorker: true,
    onProgress(event) {
      workerProgress.push(event);
    },
    onInteractionBuilt(event) {
      assemblySources.push(event.cacheSource);
    },
  });
} finally {
  await successfulClient.dispose();
}
assert.equal(prepared.preprocessing.executionMode, 'worker');
assert.equal(prepared.preprocessing.uniqueInteractionCount, 2);
assert.equal(prepared.preprocessing.computedInteractionCount, 2);
assert.equal(workerAdapter.snapshot().length, 2);
assert.equal(workerProgress.filter((event) => event.stage === 'fiber-pmm-cache-commit').length, 2);
assert.deepEqual(assemblySources, ['precomputed', 'precomputed']);
assert.ok(workerProgress.some((event) => event.stage?.endsWith('pmm-capacity-surface')));
assert.ok(workerProgress.some((event) => event.stage === 'fiber-pmm-interaction-complete'));

const cancelledAdapter = createPersistentTestAdapter();
const cancelledCache = createPmmInteractionCache({ adapter: cancelledAdapter });
const cancelledClient = createNodeWorkerClient();
const controller = new AbortController();
const cancelledModel = structuredClone(workerFixture.model);
cancelledModel.members = cancelledModel.members.slice(0, 1);
let cancellationRequestedDuringInteraction = false;
try {
  await assert.rejects(
    prepareModelFiberPmmInteractions(cancelledModel, {
      ...workerFixture.options,
      cache: cancelledCache,
      workerClient: cancelledClient,
      requireWorker: true,
      signal: controller.signal,
      onProgress(event) {
        if (!cancellationRequestedDuringInteraction && event.stage?.endsWith('pmm-capacity-surface')) {
          cancellationRequestedDuringInteraction = true;
          controller.abort();
        }
      },
    }),
    (error) => error?.code === 'PMM_GENERATION_CANCELLED'
      && error?.details?.causeCode === 'CANCELLED',
  );
} finally {
  await cancelledClient.dispose();
}
assert.equal(cancellationRequestedDuringInteraction, true);
assert.equal(cancelledAdapter.snapshot().length, 0, 'cancelled worker results must not be persisted');
assert.equal(cancelledCache.stats().writes, 0);
assert.equal(cancelledCache.stats().memoryEntries, 0);

const lateCancelAdapter = createPersistentTestAdapter();
const lateCancelCache = createPmmInteractionCache({ adapter: lateCancelAdapter });
const lateCancelModel = structuredClone(workerFixture.model);
lateCancelModel.members = lateCancelModel.members.slice(0, 1);
const completedInteraction = prepared.interactions['WORKER-A:z'];
let lateCancelled = false;
const lateCancelClient = {
  run(_taskType, payload) {
    lateCancelled = true;
    return Promise.resolve({
      entries: [{
        cacheKey: payload.plans[0].cacheKey,
        representativeMemberId: payload.plans[0].representativeMemberId,
        interaction: completedInteraction,
      }],
      skipped: [],
    });
  },
};
await assert.rejects(
  prepareModelFiberPmmInteractions(lateCancelModel, {
    ...workerFixture.options,
    cache: lateCancelCache,
    workerClient: lateCancelClient,
    requireWorker: true,
    isCancelled: () => lateCancelled,
  }),
  (error) => error?.code === 'PMM_GENERATION_CANCELLED',
);
assert.equal(lateCancelCache.stats().writes, 0, 'late cancellation must be checked before cache commit');
assert.equal(lateCancelAdapter.snapshot().length, 0);

// NL-PMM-13: stale content misses while an independently addressed entry remains reusable.
const unrelatedKey = createMemberFiberInteractionCacheKey(staleModel, unrelated, {});
const unrelatedIdentity = createMemberFiberInteractionCacheIdentity(staleModel, unrelated, {});
await assert.rejects(
  reopenedCache.set(unrelatedKey, cachedInteraction, unrelatedIdentity),
  (error) => error?.code === 'PMM_CACHE_INTERACTION_INVALID',
);
const unrelatedInteraction = syntheticCachedInteraction(
  deterministic.memoized,
  unrelatedKey,
  unrelatedIdentity,
  'unrelated',
);
await reopenedCache.set(unrelatedKey, unrelatedInteraction, unrelatedIdentity);
const changedMaterial = structuredClone(staleModel);
changedMaterial.materials.find((row) => row.id === target.matId).fck = 35;
const changedSection = structuredClone(staleModel);
changedSection.sections.find((row) => row.id === target.secId).params.B = 450;
const changedReinforcement = structuredClone(staleModel);
changedReinforcement.members.find((row) => row.id === target.id)
  .nonlinear.reinforcementSnapshot.bars[0].area += 1;
const staleKeys = [
  createMemberFiberInteractionCacheKey(changedMaterial, changedMaterial.members[0], {}),
  createMemberFiberInteractionCacheKey(changedSection, changedSection.members[0], {}),
  createMemberFiberInteractionCacheKey(changedReinforcement, changedReinforcement.members[0], {}),
  createMemberFiberInteractionCacheKey(staleModel, target, { directionIterations: 13 }),
  createMemberFiberInteractionCacheKey(staleModel, target, { bracketExpansion: 3 }),
];
assert.equal(new Set(staleKeys).size, staleKeys.length);
for (const staleKey of staleKeys) {
  assert.notEqual(staleKey, implicitDefaultKey);
  assert.equal(await reopenedCache.get(staleKey), null);
  assert.equal((await reopenedCache.get(unrelatedKey, unrelatedIdentity)).surface.surfaceHash, deterministic.memoized.surfaceHash);
}
for (const changedModel of [changedMaterial, changedSection, changedReinforcement]) {
  const changedUnrelated = changedModel.members.find((row) => row.id === unrelated.id);
  assert.equal(createMemberFiberInteractionCacheKey(changedModel, changedUnrelated, {}), unrelatedKey);
}
assert.equal(reopenedCache.stats().memoryEvictions, 0);

// NL-PMM-14: optimized monotonic envelopes match full trial-state numerics.
const parity = createEnvelopeParityFixtures().map((fixture) => {
  try {
    return runEnvelopeParityFixture(fixture);
  } catch (error) {
    error.message = `${fixture.id}: ${error.message}`;
    throw error;
  }
});
assert.deepEqual(parity.map((row) => row.id), ['small-steel', 'symmetric-rc', 'asymmetric-rc']);

console.log(JSON.stringify({
  milestone: 'P8-M6.1',
  verificationIds,
  coldBenchmark: {
    elapsedMs: measurement.benchmark.elapsedMs,
    gateMs: measurement.benchmark.gateMs,
    operations: measurement.operations,
  },
  cache: {
    memoryHits: firstCache.stats().memoryHits,
    persistentHits: reopenedCache.stats().persistentHits,
    explicitDefaultsNormalized: explicitDefaultKey === implicitDefaultKey,
  },
  determinism: {
    sourceHash: deterministic.memoized.sourceHash,
    surfaceHash: deterministic.memoized.surfaceHash,
    memoizedSolves: deterministic.memoized.summary.sectionSolveCount,
    unmemoizedSolves: deterministic.unmemoized.summary.sectionSolveCount,
  },
  worker: {
    executionMode: prepared.preprocessing.executionMode,
    uniqueWorkerRuns: prepared.preprocessing.computedInteractionCount,
    cancellationRequestedDuringInteraction,
    cancelledCacheWrites: cancelledCache.stats().writes,
    lateCancellationCacheWrites: lateCancelCache.stats().writes,
  },
  staleProtection: {
    changedInputCount: staleKeys.length,
    unrelatedReusable: true,
    evictionPolicyClaimed: false,
  },
  parity,
}, null, 2));

function buildDeterministicSurfaces() {
  const section = {
    id: 'DETERMINISTIC-ELLIPSE',
    fibers: [
      { id: 'D1', area: 1, y: -1, z: -1, materialId: 'analytic' },
      { id: 'D2', area: 1, y: 1, z: 1, materialId: 'analytic' },
    ],
  };
  const common = {
    axialIntercepts: { compression: -100, tension: 100 },
    axialLevels: [-50, 0, 50],
    angleCount: 8,
    curvatures: [0, 0.25, 0.5, 0.75, 1, 1.25],
    directionIterations: 2,
    capacityIterations: 4,
    solveTargetAxial: deterministicSectionSolve,
    solverId: 'p8-m6.1-deterministic-analytic',
    solverVersion: 'v1',
  };
  const memoizedProgress = [];
  const unmemoizedProgress = [];
  return {
    memoized: generatePmmSurface(section, {
      ...common,
      memoizeSectionStates: true,
      onProgress(event) { memoizedProgress.push(event); },
    }),
    unmemoized: generatePmmSurface(section, {
      ...common,
      memoizeSectionStates: false,
      onProgress(event) { unmemoizedProgress.push(event); },
    }),
    memoizedProgress,
    unmemoizedProgress,
  };
}

function deterministicSectionSolve(_section, input) {
  const axialForce = Number(input.targetN);
  const curvature = Math.hypot(input.kappaY, input.kappaZ);
  const angle = curvature > 0 ? Math.atan2(input.kappaZ, input.kappaY) : 0;
  const directionalCapacity = 1 / Math.sqrt(
    (Math.cos(angle) / 40) ** 2 + (Math.sin(angle) / 20) ** 2,
  );
  const axialFactor = Math.max(0, 1 - (axialForce / 100) ** 2);
  const radialCapacity = directionalCapacity * axialFactor;
  const curveFactor = Math.max(0, 2 * curvature - curvature ** 2);
  const radialMoment = radialCapacity * curveFactor;
  return {
    converged: true,
    axialResidual: 0,
    epsilon0: axialForce / 1000,
    N: axialForce,
    My: radialMoment * Math.cos(angle),
    Mz: radialMoment * Math.sin(angle),
    directionalTangent: radialCapacity * (2 - 2 * curvature),
    limitState: {
      reached: curvature >= 1,
      type: curvature >= 1 ? 'analytic-limit' : null,
    },
  };
}

function withoutExecutionMetrics(surface) {
  const copy = structuredClone(surface);
  delete copy.execution;
  delete copy.validation;
  delete copy.summary.sectionSolveCount;
  delete copy.summary.sectionSolveRequestCount;
  delete copy.summary.sectionSolveCacheHitCount;
  return copy;
}

function normalizeProgress(event) {
  const copy = structuredClone(event);
  delete copy.sectionSolveCount;
  return copy;
}

function createNodeWorkerClient() {
  const workerUrl = new URL('../src/nonlinear/runtime/analysisWorker.js?role=fiber-pmm', import.meta.url);
  return createWorkerClient({
    workerFactory: () => new Worker(workerUrl, { type: 'module' }),
  });
}

function createPersistentTestAdapter() {
  const records = new Map();
  return Object.freeze({
    kind: 'verification-persistent',
    async get(key) {
      return records.has(key) ? structuredClone(records.get(key)) : null;
    },
    async set(key, record) {
      records.set(key, structuredClone(record));
    },
    async delete(key) {
      records.delete(key);
    },
    async clear() {
      records.clear();
    },
    snapshot() {
      return structuredClone([...records.values()]);
    },
  });
}

function syntheticCachedInteraction(surface, cacheKey, identity, label) {
  return {
    version: 'p8-m6-member-fiber-interaction-v1',
    mesh: { geometryHash: `p8-m6.1-runtime-synthetic-mesh-${label}` },
    surface,
    source: {
      cacheKey,
      cacheIdentityHash: cacheKey,
      materialRef: identity.matId ?? null,
      sectionRef: identity.secId ?? null,
      materialSourceHash: stableHash(identity.materialSnapshot),
      sectionHash: stableHash(identity.sectionSnapshot),
      sectionSourceHash: stableHash(identity.sectionSnapshot),
      reinforcementHash: identity.reinforcementSnapshot == null
        ? null
        : stableHash(identity.reinforcementSnapshot),
    },
  };
}

function runEnvelopeParityFixture(fixture) {
  const evaluator = createSectionEnvelopeEvaluator(fixture.section, { materials: fixture.materials });
  let responseMaxRelativeError = 0;
  for (const deformation of fixture.deformations) {
    const full = evaluateSectionResponse(fixture.section, deformation, { materials: fixture.materials });
    const optimized = evaluator.evaluate(deformation);
    responseMaxRelativeError = Math.max(
      responseMaxRelativeError,
      compareNumericArrays(
        [...full.force.vector, ...full.tangent.flat()],
        [...optimized.force.vector, ...optimized.tangent.flat()],
        2e-12,
        `${fixture.id} section response`,
      ),
    );
  }

  const rootOptions = {
    ...fixture.root,
    forceTolerance: 1e-3,
    relativeTolerance: 1e-10,
    maxIterations: 80,
    epsilonBracket: [-0.05, 0.05],
    bracketSamples: 16,
  };
  const fullRoot = solveSectionAxialEquilibrium(fixture.section, {
    ...rootOptions,
    materials: fixture.materials,
  });
  const optimizedRoot = solveSectionAxialEquilibrium(fixture.section, {
    ...rootOptions,
    evaluateSection(_section, deformation) {
      return evaluator.evaluate(deformation);
    },
  });
  assert.equal(fullRoot.converged, true, `${fixture.id} full root: ${fullRoot.failureCode}`);
  assert.equal(optimizedRoot.converged, true, `${fixture.id} optimized root: ${optimizedRoot.failureCode}`);
  const rootMaxRelativeError = compareNumericArrays(
    [
      fullRoot.epsilon0,
      fullRoot.residual,
      ...fullRoot.response.force.vector,
      ...fullRoot.response.tangent.flat(),
    ],
    [
      optimizedRoot.epsilon0,
      optimizedRoot.residual,
      ...optimizedRoot.response.force.vector,
      ...optimizedRoot.response.tangent.flat(),
    ],
    2e-10,
    `${fixture.id} axial root`,
  );

  const pmmOptions = {
    ...fixture.pmm,
    angleCount: 8,
    directionTolerance: 5e-4,
    directionIterations: 12,
    capacityIterations: 4,
    capacityCurvatureTolerance: 1e-6,
    axialTolerance: 1e-8,
    axialAbsoluteTolerance: 1e-3,
    memoizeSectionStates: true,
    solverId: 'p8-m6.1-envelope-parity-root',
    solverVersion: 'v1',
    solverOptions: {
      forceTolerance: 1e-3,
      relativeTolerance: 1e-10,
      maxIterations: 80,
      epsilonBracket: [-0.05, 0.05],
      bracketSamples: 16,
    },
  };
  const fullSurface = generatePmmSurface(fixture.section, {
    ...pmmOptions,
    solveTargetAxial(section, input) {
      return solveSectionAxialEquilibrium(section, { ...input, materials: fixture.materials });
    },
  });
  const optimizedSurface = generatePmmSurface(fixture.section, {
    ...pmmOptions,
    solveTargetAxial(section, input) {
      return solveSectionAxialEquilibrium(section, {
        ...input,
        evaluateSection(_section, deformation) {
          return evaluator.evaluate(deformation);
        },
      });
    },
  });
  assert.equal(fullSurface.sourceHash, optimizedSurface.sourceHash);
  const fullLeaves = numericLeaves(fullSurface);
  const optimizedLeaves = numericLeaves(optimizedSurface);
  assert.deepEqual([...fullLeaves.keys()], [...optimizedLeaves.keys()]);
  const pmmMaxRelativeError = compareNumericArrays(
    [...fullLeaves.values()],
    [...optimizedLeaves.values()],
    2e-9,
    `${fixture.id} PMM surface`,
  );

  return {
    id: fixture.id,
    responseMaxRelativeError,
    rootMaxRelativeError,
    pmmMaxRelativeError,
    comparedPmmNumericValues: fullLeaves.size,
    fullSurfaceHash: fullSurface.surfaceHash,
    optimizedSurfaceHash: optimizedSurface.surfaceHash,
  };
}

function numericLeaves(value) {
  const leaves = new Map();
  visit(value, 'surface');
  return leaves;

  function visit(candidate, path) {
    if (typeof candidate === 'number') {
      leaves.set(path, candidate);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(candidate)) {
      if (['execution', 'summary', 'validation', 'limitState'].includes(key)) continue;
      visit(entry, `${path}.${key}`);
    }
  }
}

function compareNumericArrays(left, right, tolerance, label) {
  assert.equal(left.length, right.length, `${label} numeric length`);
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const actual = Number(left[index]);
    const expected = Number(right[index]);
    assert.ok(Number.isFinite(actual), `${label}[${index}] full value is non-finite`);
    assert.ok(Number.isFinite(expected), `${label}[${index}] optimized value is non-finite`);
    const relative = Math.abs(actual - expected) / Math.max(1, Math.abs(actual), Math.abs(expected));
    maximum = Math.max(maximum, relative);
    assert.ok(
      relative <= tolerance,
      `${label}[${index}]: ${actual} != ${expected} (relative error ${relative})`,
    );
  }
  return maximum;
}
