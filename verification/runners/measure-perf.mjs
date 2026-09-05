import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, freemem, platform, arch } from 'node:os';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  analyzeModel,
  buildCalculationPackageData,
  createAllRepresentativeBuildingModels,
  createTwoStoryElasticFrameModel,
  renderCalculationPackageHtml,
  runNewmarkNlth,
  runPushover,
} from '../../src/index.js';

const OUT = 'verification/evidence/validation/perf-budget.json';
const RUNS = 3;

const cases = [
  budget('pointcloud-load-proxy', 30000, () => {
    const n = 200000;
    const values = new Float64Array(n * 3);
    for (let i = 0; i < values.length; i += 1) values[i] = i % 997;
    let sum = 0;
    for (let i = 0; i < values.length; i += 3) sum += values[i] * 0.001;
    return { points: n, proxyFor: 10000000, checksum: Number(sum.toFixed(3)) };
  }),
  budget('viewer-frame-proxy', 33.4, () => {
    const n = 50000;
    let visible = 0;
    for (let i = 0; i < n; i += 1) {
      const x = (i % 500) - 250;
      const y = Math.floor(i / 500) - 50;
      if (x * x + y * y < 90000) visible += 1;
    }
    return { projectedPoints: n, proxyFor: 2000000, visible };
  }),
  budget('elastic-representative-building', 5000, () => {
    const model = createAllRepresentativeBuildingModels()[0].model;
    const analysis = analyzeModel(model);
    return { nodes: model.nodes.length, members: model.members.length, ok: analysis.ok };
  }),
  budget('pushover-direction', 3000, () => {
    const model = createTwoStoryElasticFrameModel();
    const result = runPushover(model, { direction: '+x', steps: 6 });
    return { steps: result.curve.length, maxBaseShear: result.summary.maxBaseShear };
  }),
  budget('nlth-20s-record', 3000, () => {
    const accelerations = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 12) * 0.05);
    const result = runNewmarkNlth({ accelerations, dt: 0.02, stiffness: 100, damping: 0.2 });
    return { durationSeconds: 20, rows: result.rows.length, converged: result.converged };
  }),
  budget('calculation-table-generation', 3000, () => {
    const model = createTwoStoryElasticFrameModel();
    const analysis = analyzeModel(model);
    const data = buildCalculationPackageData(model, analysis, { projectName: 'Performance Budget' });
    const html = renderCalculationPackageHtml(data);
    return { sections: data.sections.length, htmlLength: html.length };
  }),
];

const rows = [];
for (const item of cases) {
  const runs = [];
  let lastDetails = {};
  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    lastDetails = item.fn();
    runs.push(Number((performance.now() - started).toFixed(3)));
  }
  const measuredMs = median(runs);
  rows.push({
    id: item.id,
    measuredMs,
    budgetMs: item.budgetMs,
    pass: measuredMs <= item.budgetMs,
    runs,
    details: lastDetails,
  });
}

const report = {
  version: 'p4-perf-budget-v1',
  generatedAt: new Date().toISOString(),
  machine: {
    platform: platform(),
    arch: arch(),
    cpuCount: cpus().length,
    cpuModel: cpus()[0]?.model || 'unknown',
    totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(freemem() / 1024 / 1024),
  },
  runCount: RUNS,
  rows,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: rows.every((row) => row.pass), version: report.version, rows: rows.length, out: OUT }, null, 2));

function budget(id, budgetMs, fn) {
  return { id, budgetMs, fn };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
