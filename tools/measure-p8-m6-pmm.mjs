import { performance } from 'node:perf_hooks';
import { clearMemberFiberInteractionCache } from '../src/nonlinear/fiber/memberInteraction.js';
import { prepareModelFiberPmmInteractions } from '../src/nonlinear/fiber/fiberPmmPreprocessor.js';
import {
  P8_M6_PMM_RUNTIME_GATE_MS,
  createColdRc400x600Fixture,
} from '../tests/fixtures/p8-m6-pmm-runtime-fixture.mjs';

clearMemberFiberInteractionCache();
const { model, member, options } = createColdRc400x600Fixture();
const progress = [];
const started = performance.now();
const catalog = await prepareModelFiberPmmInteractions(model, {
  ...options,
  cacheEnabled: false,
  useWorker: false,
  onProgress(event) {
    progress.push(event);
  },
});
const elapsedMs = Number((performance.now() - started).toFixed(3));
const interaction = catalog.interactions[`${member.id}:z`] || catalog.byMember[member.id];
if (!interaction) throw new Error(`Cold PMM benchmark did not produce an interaction for ${member.id}.`);

const surface = interaction.surface;
const report = {
  version: 'p8-m6.1-pmm-runtime-measurement-v1',
  verificationId: 'NL-PMM-09',
  ok: elapsedMs <= P8_M6_PMM_RUNTIME_GATE_MS,
  benchmark: {
    id: 'existing-rc-400x600-cold',
    isolatedProcess: true,
    coldCache: true,
    cacheEnabled: false,
    executionMode: catalog.preprocessing.executionMode,
    elapsedMs,
    gateMs: P8_M6_PMM_RUNTIME_GATE_MS,
    pass: elapsedMs <= P8_M6_PMM_RUNTIME_GATE_MS,
  },
  operations: {
    uniqueInteractionCount: catalog.preprocessing.uniqueInteractionCount,
    computedInteractionCount: catalog.preprocessing.computedInteractionCount,
    fiberCount: interaction.mesh.fibers.length,
    sectionEvaluationCount: interaction.preprocessing.sectionEvaluationCount,
    sectionSolveCount: surface.summary.sectionSolveCount,
    sectionSolveRequestCount: surface.summary.sectionSolveRequestCount,
    sectionSolveCacheHitCount: surface.summary.sectionSolveCacheHitCount,
    axialLevelCount: surface.summary.axialLevelCount,
    angleCount: surface.summary.angleCount,
    curvatureSampleCount: surface.summary.curvatureSampleCount,
    progressEventCount: progress.length,
    progressStageCount: new Set(progress.map((event) => event.stage)).size,
  },
  hashes: {
    sourceHash: surface.sourceHash,
    surfaceHash: surface.surfaceHash,
    interactionHash: interaction.contentHash,
  },
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    processId: process.pid,
  },
};

console.log(JSON.stringify(report, null, 2));
