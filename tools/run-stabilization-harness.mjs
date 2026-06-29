import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  runStabilizationHarness,
  STABILIZATION_HARNESS_VERSION,
} from '../src/index.js';

const outputRoot = path.resolve('reports/stabilization-harness');
const generatedAt = '2026-06-29T00:00:00.000Z';

const result = runStabilizationHarness({ generatedAt });
if (!result.ok) {
  throw new Error(`Stabilization harness failed: ${result.summary.failedIds.join(', ')}`);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const indexCases = [];
for (const item of result.cases) {
  const folder = path.join(outputRoot, item.id);
  await mkdir(folder, { recursive: true });
  await writeJson(path.join(folder, 'model.json'), item.artifacts.model);
  await writeJson(path.join(folder, 'analysis-summary.json'), item.summary.analysis);
  await writeJson(path.join(folder, 'case-summary.json'), stripArtifacts(item));
  await writeJson(path.join(folder, 'calculation-package.json'), item.artifacts.calculationPackageData);
  await writeFile(path.join(folder, 'report.html'), item.artifacts.reportHtml, 'utf8');
  await writeFile(path.join(folder, 'calculation-package.html'), item.artifacts.calculationPackageHtml, 'utf8');
  await writeFile(path.join(folder, 'review.md'), renderCaseReview(item), 'utf8');
  indexCases.push({
    id: item.id,
    name: item.name,
    category: item.category,
    inputPath: item.inputPath,
    ok: item.ok,
    nodes: item.summary.model.nodes,
    members: item.summary.model.members,
    loads: item.summary.model.loads,
    combinations: item.summary.model.combinations,
    maxDisplacement: item.summary.analysis.maxDisplacement,
    maxUtilization: item.summary.analysis.maxUtilization,
    designStatus: item.summary.analysis.designStatus,
    reportHtmlLength: item.summary.report.htmlLength,
    calculationPackageHtmlLength: item.summary.calculationPackage.htmlLength,
    folder: path.relative(process.cwd(), folder),
  });
}

await writeJson(path.join(outputRoot, 'index.json'), {
  version: STABILIZATION_HARNESS_VERSION,
  generatedAt: result.generatedAt,
  ok: result.ok,
  count: result.count,
  failedCount: result.failedCount,
  summary: result.summary,
  cases: indexCases,
});
await writeFile(path.join(outputRoot, 'README.md'), renderIndexReadme(result, indexCases), 'utf8');

console.log(JSON.stringify({
  ok: result.ok,
  version: result.version,
  outputRoot: path.relative(process.cwd(), outputRoot),
  count: result.count,
  categories: result.summary.categories,
}, null, 2));

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, jsonReplacer, 2)}\n`, 'utf8');
}

function stripArtifacts(item) {
  const { artifacts: _artifacts, ...summary } = item;
  return summary;
}

function renderIndexReadme(result, cases) {
  const rows = cases.map((item) => (
    `| ${item.id} | ${item.category} | ${item.inputPath} | ${item.nodes} | ${item.members} | ${item.loads} | ${item.combinations} | ${format(item.maxDisplacement)} | ${format(item.maxUtilization)} | ${item.designStatus} | ${item.ok ? 'OK' : 'Check'} |`
  )).join('\n');
  return `# M46 Stabilization Harness

This folder contains repeatable verification output for the current S-Structures modeling, elastic analysis, result visualization, and report pipeline.

## Coverage

- Structured JSON import-ready model
- Agent-action generated model
- Design-basis generated load model
- Braced frame model
- Solver benchmark model
- Ten representative building models

## Summary

- Version: ${result.version}
- Generated: ${result.generatedAt}
- Cases: ${result.count}
- Failed: ${result.failedCount}
- Max node count: ${result.summary.maxNodeCount}
- Max member count: ${result.summary.maxMemberCount}
- Max load count: ${result.summary.maxLoadCount}

| ID | Category | Input path | Nodes | Members | Loads | Combos | Max displacement | Max utilization | Design | Harness |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
${rows}

Each case folder contains \`model.json\`, \`analysis-summary.json\`, \`case-summary.json\`, \`report.html\`, \`calculation-package.json\`, \`calculation-package.html\`, and \`review.md\`.
`;
}

function renderCaseReview(item) {
  const combos = item.summary.analysis.comboResults.map((row) => (
    `| ${row.id} | ${row.ok ? 'OK' : 'Check'} | ${format(row.maxDisplacement)} | ${format(row.maxUtilization)} | ${format(row.equilibriumResidual)} |`
  )).join('\n');
  const checks = item.checks.map((check) => `- ${check.ok ? 'OK' : 'Check'}: ${check.id}`).join('\n');
  return `# ${item.name}

## Case

- ID: ${item.id}
- Category: ${item.category}
- Input path: ${item.inputPath}
- Status: ${item.ok ? 'OK' : 'Check'}
- Nodes/members/loads: ${item.summary.model.nodes} / ${item.summary.model.members} / ${item.summary.model.loads}
- Load cases/combinations: ${item.summary.model.loadCases} / ${item.summary.model.combinations}

## Analysis

- Max displacement: ${format(item.summary.analysis.maxDisplacement)}
- Max utilization: ${format(item.summary.analysis.maxUtilization)}
- Design status: ${item.summary.analysis.designStatus}
- Validation errors/warnings: ${item.summary.validation.errorCount} / ${item.summary.validation.warningCount}
- Report HTML length: ${item.summary.report.htmlLength}
- Calculation package HTML length: ${item.summary.calculationPackage.htmlLength}

| Combo | Status | Max displacement | Max utilization | Equilibrium residual |
| --- | --- | ---: | ---: | ---: |
${combos}

## Checks

${checks}
`;
}

function jsonReplacer(_key, value) {
  if (value instanceof Set) return [...value];
  return value;
}

function format(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number !== 0 && (Math.abs(number) < 0.001 || Math.abs(number) >= 100000)) return number.toExponential(3);
  return number.toFixed(6).replace(/\.?0+$/, '');
}
