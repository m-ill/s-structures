import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeModel,
  applyDesignBasisLoads,
  CALCULATION_PACKAGE_VERSION,
  createAllRepresentativeBuildingModels,
  createCalculationPackageHtml,
  createKdsRuleBasedLoadCombinations,
  REPRESENTATIVE_BUILDINGS_VERSION,
} from '../src/index.js';

const outputRoot = path.resolve('reports/representative-building-calculation-packages');
const GENERATED_AT = '2026-06-27T00:00:00.000Z';

const generated = [];
for (const { spec, model } of createAllRepresentativeBuildingModels()) {
  model.loads = [];
  model.loadCombinations = [];
  const designBasis = designBasisFromSpec(spec);
  const loadEstimation = applyDesignBasisLoads(model, designBasis);
  model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

  const analysis = analyzeModel(model);
  const comboFailures = Object.entries(analysis.byCombo || {})
    .filter(([, result]) => !result.ok || !result.anyOk)
    .map(([comboId]) => comboId);
  if (analysis.validation?.errors?.length || comboFailures.length) {
    throw new Error(`${spec.id} analysis failed: ${JSON.stringify({
      errors: analysis.validation?.errors || [],
      comboFailures,
    }, null, 2)}`);
  }

  const pkg = createCalculationPackageHtml(model, analysis, {
    title: `${spec.name} - Calculation Package`,
    projectName: spec.name,
    engineer: 'S-Structures',
    reviewer: 'Manual verification required',
    purpose: 'Representative elastic analysis and preliminary design trace',
    generatedAt: GENERATED_AT,
    missingScopes: [
      'Drawing/image/MGT import audit trail is not attached to this generated test set.',
      'Project-specific KDS coefficients and jurisdictional assumptions must be confirmed before issue.',
    ],
  });

  const folder = path.join(outputRoot, spec.id);
  await mkdir(folder, { recursive: true });
  await writeJson(path.join(folder, 'model.json'), model);
  await writeJson(path.join(folder, 'load-estimation.json'), loadEstimation);
  await writeJson(path.join(folder, 'analysis-summary.json'), summarizeAnalysis(spec, model, analysis, pkg.data));
  await writeJson(path.join(folder, 'calculation-package.json'), pkg.data);
  await writeFile(path.join(folder, 'calculation-package.html'), pkg.html, 'utf8');
  await writeFile(path.join(folder, 'review.md'), renderReviewMarkdown(spec, model, analysis, pkg.data), 'utf8');

  const item = summarizeIndexItem(spec, model, analysis, pkg.data, folder);
  generated.push(item);
  console.log(`[${generated.length}/10] ${spec.id} OK - loads ${item.loads}, combos ${item.combinations}, max util ${format(item.maxUtilization)}`);
}

await writeJson(path.join(outputRoot, 'index.json'), {
  version: `${REPRESENTATIVE_BUILDINGS_VERSION}+${CALCULATION_PACKAGE_VERSION}`,
  generatedAt: GENERATED_AT,
  count: generated.length,
  buildings: generated,
});
await writeFile(path.join(outputRoot, 'README.md'), renderIndexMarkdown(generated), 'utf8');

console.log(JSON.stringify({
  ok: true,
  outputRoot: path.relative(process.cwd(), outputRoot),
  count: generated.length,
}, null, 2));

function designBasisFromSpec(spec) {
  const occupancy = occupancyFromType(spec.type);
  const planArea = areaFromGrid(spec.xs, spec.ys);
  return {
    occupancy,
    floorArea: planArea,
    roofArea: planArea,
    deadLoad: Math.max(3.0, Number(spec.deadUdl) || 4.0),
    liveLoad: Math.max(0.8, Number(spec.liveUdl) || 2.0),
    roofLiveLoad: Math.max(0.8, Math.min(1.5, (Number(spec.liveUdl) || 2.0) * 0.5)),
    windPressureX: clamp((Number(spec.windX) || 7) / 18, 0.45, 1.0),
    windPressureY: clamp((Number(spec.windY) || 7) / 18, 0.45, 1.0),
    seismicCoefficientX: clamp(0.055 + (Number(spec.stories) || 1) * 0.006, 0.06, 0.10),
    seismicCoefficientY: clamp(0.055 + (Number(spec.stories) || 1) * 0.006, 0.06, 0.10),
    seismicLiveLoadFactor: 0.25,
    notes: [
      'Representative design basis generated for workflow verification.',
      'Loads are equivalent preliminary loads and require project-specific review.',
    ],
  };
}

function occupancyFromType(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('school')) return 'school';
  if (value.includes('hospital')) return 'hospital';
  if (value.includes('parking')) return 'parking';
  if (value.includes('industrial') || value.includes('warehouse')) return 'warehouse';
  if (value.includes('apartment') || value.includes('residential')) return 'residential';
  return 'office';
}

function areaFromGrid(xs = [], ys = []) {
  if (xs.length < 2 || ys.length < 2) return null;
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...ys) - Math.min(...ys);
  return Math.max(1, width * depth);
}

function summarizeAnalysis(spec, model, analysis, pkg) {
  const detailed = pkg.detailed;
  return {
    id: spec.id,
    name: spec.name,
    type: spec.type,
    description: spec.description,
    generatedAt: GENERATED_AT,
    packageVersion: pkg.version,
    analysisOk: !!analysis.ok,
    auditOk: !!pkg.qualityAudit.ok,
    model: {
      nodes: model.nodes.length,
      members: model.members.length,
      loads: model.loads.length,
      loadCases: model.loadCases.length,
      combinations: model.loadCombinations.length,
      stories: spec.stories,
      bounds: detailed.model.bounds,
    },
    designBasis: model.designBasis,
    loadSummary: model.loadEstimation?.summary || null,
    analysis: {
      status: detailed.analysis.status,
      comboCount: detailed.analysis.comboCount,
      maxDisplacement: detailed.analysis.maxDisplacement,
      maxUtilization: detailed.analysis.maxUtilization,
      warnings: detailed.analysis.warningCount,
      errors: detailed.analysis.errorCount,
      governing: detailed.analysis.governing,
    },
    qualityAudit: pkg.qualityAudit,
    designStatus: designStatus(pkg.data),
    actionItems: detailed.actionItems,
  };
}

function summarizeIndexItem(spec, model, analysis, pkg, folder) {
  return {
    id: spec.id,
    name: spec.name,
    type: spec.type,
    ok: !!analysis.ok,
    auditOk: !!pkg.qualityAudit.ok,
    designStatus: designStatus(pkg),
    nodes: model.nodes.length,
    members: model.members.length,
    loads: model.loads.length,
    loadCases: model.loadCases.length,
    combinations: model.loadCombinations.length,
    maxDisplacement: pkg.detailed.analysis.maxDisplacement,
    maxUtilization: pkg.detailed.analysis.maxUtilization,
    folder: path.relative(process.cwd(), folder),
  };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderIndexMarkdown(items) {
  const rows = items.map((item) => (
    `| ${item.id} | ${item.name} | ${item.loads} | ${item.combinations} | ${format(item.maxDisplacement)} | ${format(item.maxUtilization)} | ${item.designStatus} | ${item.auditOk ? 'OK' : 'Check'} |`
  )).join('\n');
  return `# Representative Building Calculation Packages

Generated M42 calculation-package review set for 10 representative structural models.

| ID | Name | Loads | Combos | Max displacement | Max utilization | Design | Package audit |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
${rows}
`;
}

function renderReviewMarkdown(spec, model, analysis, pkg) {
  const combos = pkg.detailed.combinationResults
    .slice(0, 12)
    .map((row) => `| ${row.id} | ${row.ok ? 'OK' : 'Check'} | ${format(row.maxDisplacement)} | ${format(row.maxUtilization)} | ${format(row.equilibriumResidual)} |`)
    .join('\n');
  const members = pkg.detailed.governingMembers
    .slice(0, 10)
    .map((row, index) => `| ${index + 1} | ${row.memberId} | ${row.status} | ${format(row.utilization)} | ${row.governingCheck || '-'} | ${row.comboId || '-'} |`)
    .join('\n');
  return `# ${spec.name}

## Model

- Type: ${spec.type}
- Description: ${spec.description}
- Nodes/members/loads: ${model.nodes.length} / ${model.members.length} / ${model.loads.length}
- Load cases/combinations: ${model.loadCases.length} / ${model.loadCombinations.length}

## Analysis

- Status: ${pkg.detailed.analysis.status}
- Max displacement: ${format(pkg.detailed.analysis.maxDisplacement)}
- Max utilization: ${format(pkg.detailed.analysis.maxUtilization)}
- Design status: ${designStatus(pkg)}
- Package audit: ${pkg.qualityAudit.ok ? 'OK' : 'Check'}

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
${combos}

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
${members}

## Notes

${pkg.qualityAudit.limitations.map((item) => `- ${item}`).join('\n')}
`;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function designStatus(pkg) {
  const maxUtilization = Number(pkg?.detailed?.analysis?.maxUtilization);
  const hasNg = (pkg?.detailed?.memberChecks || []).some((row) => row.status === 'NG');
  if (hasNg || (Number.isFinite(maxUtilization) && maxUtilization > 1)) return 'Review';
  return 'OK';
}

function format(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number !== 0 && (Math.abs(number) < 0.001 || Math.abs(number) > 100000)) return number.toExponential(3);
  return number.toFixed(6).replace(/\.?0+$/, '');
}
