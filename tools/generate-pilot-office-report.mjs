import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeModel,
  applyDesignBasisLoads,
  createCalculationPackageHtml,
  createKdsRuleBasedLoadCombinations,
  createRepresentativeBuildingModel,
} from '../src/index.js';

const PROJECT_ID = 'PILOT-OFFICE-01';
const outputRoot = path.resolve('reports/pilot-office-01');
const generatedAt = new Date().toISOString();

const model = createRepresentativeBuildingModel('01-regular-office-frame');
model.loads = [];
model.loadCases = [];
model.loadCombinations = [];
model.meta = {
  ...model.meta,
  id: PROJECT_ID,
  name: `${PROJECT_ID} - 4-Story Office Frame`,
  description: 'Program smoke-test office building: 4 stories, 12 m x 10 m plan, 3.6 m story height.',
  verificationScope: 'program-smoke-test',
};

const designBasis = {
  occupancy: 'office',
  floorArea: 120,
  roofArea: 120,
  deadLoad: 4.2,
  liveLoad: 2.0,
  roofLiveLoad: 1.0,
  windPressureX: 0.45,
  windPressureY: 0.45,
  seismicCoefficientX: 0.079,
  seismicCoefficientY: 0.079,
  seismicLiveLoadFactor: 0.25,
  status: 'draft',
  notes: [
    'Program workflow verification model; not an independently verified design model.',
    'Project-specific KDS coefficients and jurisdictional assumptions require engineering review.',
  ],
};

const loadEstimation = applyDesignBasisLoads(model, designBasis);
if (loadEstimation.application.conflicts.length) {
  throw new Error(`Generated load conflicts: ${JSON.stringify(loadEstimation.application.conflicts, null, 2)}`);
}

model.loadCombinations = createKdsRuleBasedLoadCombinations(model, {
  includeService: true,
});

const analysis = analyzeModel(model);
const failedCombinations = Object.entries(analysis.byCombo || {})
  .filter(([, result]) => !result.ok || !result.anyOk)
  .map(([comboId]) => comboId);
const validationErrors = analysis.validation?.errors || [];
if (!analysis.ok || validationErrors.length || failedCombinations.length) {
  throw new Error(`Office analysis failed: ${JSON.stringify({
    analysisOk: analysis.ok,
    validationErrors,
    failedCombinations,
  }, null, 2)}`);
}

const calculationPackage = createCalculationPackageHtml(model, analysis, {
  title: `${PROJECT_ID} Office Building Elastic Analysis Report`,
  projectName: model.meta.name,
  engineer: 'S-Structures',
  reviewer: 'Independent/manual verification pending',
  purpose: 'Program smoke verification - draft, not for construction',
  generatedAt,
  missingScopes: [
    'Independent reference-model correlation is not attached.',
    'Project-specific KDS inputs and final member selections require confirmation.',
    'This report is not a sealed structural calculation package.',
  ],
});

if (!calculationPackage.data.qualityAudit.ok) {
  throw new Error(`Calculation package audit failed: ${JSON.stringify(
    calculationPackage.data.qualityAudit.items,
    null,
    2,
  )}`);
}

const summary = {
  projectId: PROJECT_ID,
  generatedAt,
  scope: 'Program smoke verification only; independent engineering correctness is not established.',
  model: {
    nodes: model.nodes.length,
    members: model.members.length,
    loads: model.loads.length,
    loadCases: model.loadCases.length,
    combinations: model.loadCombinations.length,
    stories: 4,
    plan: { x: 12, y: 10 },
    totalHeight: 14.4,
  },
  loadApplication: loadEstimation.application,
  analysis: {
    ok: analysis.ok,
    validationErrors,
    validationWarnings: analysis.validation?.warnings || [],
    failedCombinations,
    maxDisplacement: calculationPackage.data.detailed.analysis.maxDisplacement,
    maxUtilization: calculationPackage.data.detailed.analysis.maxUtilization,
    maxEquilibriumResidual: calculationPackage.data.detailed.analysis.maxEquilibriumResidual,
    governing: calculationPackage.data.detailed.analysis.governing,
  },
  report: {
    version: calculationPackage.data.version,
    sections: calculationPackage.data.sections,
    qualityAudit: calculationPackage.data.qualityAudit,
    htmlBytes: Buffer.byteLength(calculationPackage.html, 'utf8'),
  },
};

await mkdir(outputRoot, { recursive: true });
await writeJson(path.join(outputRoot, 'model.json'), model);
await writeJson(path.join(outputRoot, 'load-estimation.json'), loadEstimation);
await writeJson(path.join(outputRoot, 'analysis-summary.json'), summary);
await writeFile(path.join(outputRoot, 'calculation-package.html'), calculationPackage.html, 'utf8');

console.log(JSON.stringify({
  ok: true,
  outputRoot: path.relative(process.cwd(), outputRoot),
  html: path.relative(process.cwd(), path.join(outputRoot, 'calculation-package.html')),
  ...summary,
}, null, 2));

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
