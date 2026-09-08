import { createModel, validateModel } from '../core/model.js';
import { createKdsRuleBasedLoadCombinations } from '../core/kdsLoadCombinations.js';
import { applyDesignBasisLoads } from '../design/loadEstimation.js';
import { createCalculationPackageHtml } from '../report/calculationPackage.js';
import { createHtmlReport } from '../report/htmlReport.js';
import { analyzeModel } from '../compute/product/elasticAnalysisWorkflow.js';
import { createTwoStoryElasticFrameModel } from '../examples/twoStoryElasticFrame.js';
import { createAllRepresentativeBuildingModels } from '../examples/representativeBuildings.js';
import { createCantileverTipLoad } from '../examples/verification.js';
import { executeModelingAction } from '../ui/indexAgentActions.js';
import { buildIndexResultVisuals } from '../ui/indexResultVisuals.js';

export const STABILIZATION_HARNESS_VERSION = 'm46-stabilization-harness';

export const STABILIZATION_HARNESS_TOLERANCES = Object.freeze({
  equilibriumResidual: 1e-8,
  minReportHtmlLength: 1000,
  minCalculationPackageHtmlLength: 3000,
});

export function createStabilizationHarnessCases(options = {}) {
  const includeRepresentative = options.includeRepresentative !== false;
  const cases = [
    {
      id: 'structured-two-story-elastic-frame',
      name: 'Structured JSON two-story elastic frame',
      category: 'structured-json',
      inputPath: 'structured-json',
      model: createNamedModel(createTwoStoryElasticFrameModel(), 'Structured JSON two-story elastic frame'),
      required: { minCombinations: 3, minLoads: 1 },
    },
    {
      id: 'agent-grid-frame',
      name: 'Agent-action generated grid frame',
      category: 'agent-api',
      inputPath: 'agent-modeling-actions',
      ...createAgentActionGridFrame(),
      required: { minCombinations: 3, minLoads: 1, actionHistory: true },
    },
    {
      id: 'design-basis-two-story',
      name: 'Design-basis generated load frame',
      category: 'design-basis',
      inputPath: 'generated-design-basis-loads',
      ...createDesignBasisTwoStoryFrame(),
      required: { minCombinations: 6, minLoads: 1, loadDerivation: true },
    },
    {
      id: 'braced-two-story-frame',
      name: 'Braced two-story elastic frame',
      category: 'braced-frame',
      inputPath: 'programmatic-model-generator',
      model: createBracedTwoStoryFrame(),
      required: { minCombinations: 3, minLoads: 1 },
    },
    {
      id: 'solver-cantilever-tip-load',
      name: 'Solver cantilever tip-load benchmark',
      category: 'solver-benchmark',
      inputPath: 'benchmark-model-generator',
      model: createNamedModel(createCantileverTipLoad().model, 'Solver cantilever tip-load benchmark'),
      required: { minCombinations: 1, minLoads: 1 },
    },
  ];

  if (includeRepresentative) {
    for (const { spec, model } of createAllRepresentativeBuildingModels()) {
      cases.push({
        id: `representative-${spec.id}`,
        name: spec.name,
        category: 'representative-building',
        inputPath: 'representative-building-generator',
        spec,
        model,
        required: { minCombinations: 3, minLoads: 1 },
      });
    }
  }
  return cases;
}

export function runStabilizationHarness(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const tolerances = {
    ...STABILIZATION_HARNESS_TOLERANCES,
    ...(options.tolerances || {}),
  };
  const cases = createStabilizationHarnessCases(options).map((caseDef) => (
    runStabilizationCase(caseDef, { ...options, generatedAt, tolerances })
  ));
  const failed = cases.filter((item) => !item.ok);
  return {
    version: STABILIZATION_HARNESS_VERSION,
    generatedAt,
    ok: failed.length === 0,
    count: cases.length,
    failedCount: failed.length,
    summary: summarizeHarness(cases),
    cases,
  };
}

export function runStabilizationCase(caseDef, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const tolerances = {
    ...STABILIZATION_HARNESS_TOLERANCES,
    ...(options.tolerances || {}),
  };
  const model = caseDef.model;
  const validation = validateModel(model);
  const analysis = analyzeModel(model);
  const resultVisuals = buildIndexResultVisuals(model, analysis, { resultId: 'ENVELOPE' });
  const report = createHtmlReport(model, analysis, {
    title: `${caseDef.name} - Stabilization Report`,
    generatedAt,
  });
  const calculationPackage = createCalculationPackageHtml(model, analysis, {
    title: `${caseDef.name} - Stabilization Calculation Package`,
    projectName: caseDef.name,
    engineer: 'S-Structures',
    reviewer: 'Stabilization harness',
    purpose: 'Regression verification for modeling, elastic analysis, result visuals, and reports',
    generatedAt,
  });

  const checks = buildCaseChecks({
    caseDef,
    validation,
    analysis,
    resultVisuals,
    report,
    calculationPackage,
    tolerances,
  });
  const issues = checks.filter((check) => !check.ok).map((check) => check.message);
  const summary = summarizeCase(caseDef, model, validation, analysis, resultVisuals, report, calculationPackage);

  return {
    version: STABILIZATION_HARNESS_VERSION,
    id: caseDef.id,
    name: caseDef.name,
    category: caseDef.category,
    inputPath: caseDef.inputPath,
    ok: issues.length === 0,
    issues,
    checks,
    summary,
    artifacts: {
      model,
      analysisSummary: summary.analysis,
      reportHtml: report.html,
      calculationPackageData: calculationPackage.data,
      calculationPackageHtml: calculationPackage.html,
    },
  };
}

function createAgentActionGridFrame() {
  const model = createModel({
    meta: {
      id: 'agent-grid-frame',
      name: 'Agent-action generated grid frame',
      generatorVersion: STABILIZATION_HARNESS_VERSION,
    },
  });
  const state = {};
  const actionHistory = [];
  const run = (action, payload) => {
    const result = executeModelingAction(model, state, action, payload);
    actionHistory.push({ action, changed: !!result.changed });
    return result;
  };
  run('createGridFrame', {
    baysX: 2,
    baysY: 1,
    stories: 2,
    bayX: 6,
    bayY: 5,
    storyH: 3.4,
    replace: true,
    baseSupport: 'fixed',
  });
  run('autoAssignMemberRoles', {});
  run('applyLoadTemplate', {
    template: 'gravityUdl',
    case: 'D',
    caseType: 'dead',
    w: 4.5,
  });
  run('applyLoadTemplate', {
    template: 'windX',
    case: 'WX',
    caseType: 'wind',
    total: 80,
  });
  run('applyLoadTemplate', {
    template: 'windY',
    case: 'WY',
    caseType: 'wind',
    total: 65,
  });
  model.loadCombinations = [
    { id: 'AG-D', name: '1.0D', type: 'service', factors: { D: 1, L: 0, WX: 0, WY: 0 } },
    { id: 'AG-WX', name: '1.0D + 1.0WX', type: 'service', factors: { D: 1, L: 0, WX: 1, WY: 0 } },
    { id: 'AG-WY', name: '1.0D + 1.0WY', type: 'service', factors: { D: 1, L: 0, WX: 0, WY: 1 } },
  ];
  return { model, actionHistory };
}

function createDesignBasisTwoStoryFrame() {
  const model = createNamedModel(createTwoStoryElasticFrameModel(), 'Design-basis generated load frame');
  model.meta.id = 'design-basis-two-story';
  model.loads = [];
  model.loadCombinations = [];
  const loadEstimation = applyDesignBasisLoads(model, {
    occupancy: 'office',
    floorArea: 120,
    roofArea: 120,
    deadLoad: 4.2,
    liveLoad: 2.4,
    roofLiveLoad: 1.0,
    windPressureX: 0.72,
    windPressureY: 0.64,
    seismicCoefficientX: 0.07,
    seismicCoefficientY: 0.07,
    seismicLiveLoadFactor: 0.25,
    notes: [
      'Generated for stabilization harness regression.',
      'Project-specific coefficients require engineering review.',
    ],
  });
  model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });
  return { model, loadEstimation };
}

function createBracedTwoStoryFrame() {
  const model = createNamedModel(createTwoStoryElasticFrameModel(), 'Braced two-story elastic frame');
  model.meta.id = 'braced-two-story-frame';
  const braces = [
    ['N111', 'N212'],
    ['N211', 'N112'],
    ['N112', 'N213'],
    ['N212', 'N113'],
    ['N131', 'N232'],
    ['N231', 'N132'],
    ['N132', 'N233'],
    ['N232', 'N133'],
  ];
  let next = model.members.length + 1;
  for (const [n1, n2] of braces) {
    if (!model.nodes.some((node) => node.id === n1) || !model.nodes.some((node) => node.id === n2)) continue;
    model.members.push({
      id: `B${next}`,
      type: 'frame',
      n1,
      n2,
      matId: 'steel',
      secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
      releases: { i: 'rigid', j: 'rigid' },
      design: { role: 'brace' },
    });
    next += 1;
  }
  return model;
}

function createNamedModel(model, name) {
  model.meta = {
    ...(model.meta || {}),
    name,
    generatorVersion: STABILIZATION_HARNESS_VERSION,
  };
  return model;
}

function buildCaseChecks(input) {
  const {
    caseDef,
    validation,
    analysis,
    resultVisuals,
    report,
    calculationPackage,
    tolerances,
  } = input;
  const comboRows = summarizeComboResults(analysis);
  const required = caseDef.required || {};
  const checks = [
    check(validation.errors.length === 0, 'validation-errors', 'Model validation must have no errors.'),
    check(analysis.ok === true, 'analysis-ok', 'Elastic analysis must complete successfully.'),
    check((analysis.combos || []).length >= (required.minCombinations || 1), 'combination-count', 'Required load combinations must be present.'),
    check((caseDef.model.loads || []).length >= (required.minLoads || 0), 'load-count', 'Required model loads must be present.'),
    check(comboRows.length > 0 && comboRows.every((row) => row.ok), 'combo-results', 'Every load combination must solve.'),
    check(
      comboRows.every((row) => row.equilibriumResidual < number(row.equilibriumLimit, tolerances.equilibriumResidual)),
      'equilibrium',
      'Equilibrium residual must stay within the analysis criterion recorded for each combination.',
    ),
    check(resultVisuals.nodes.length === caseDef.model.nodes.length, 'visual-nodes', 'Result visuals must include every node.'),
    check(resultVisuals.members.length === caseDef.model.members.length, 'visual-members', 'Result visuals must include every member.'),
    check(resultVisuals.maxDisplacement > 0, 'visual-displacement', 'Result visuals must include a nonzero displacement envelope.'),
    check(report.data.analysis.ok === true && report.html.length >= tolerances.minReportHtmlLength, 'html-report', 'HTML report must be generated from the same result.'),
    check(calculationPackage.data.sections.length >= 7 && calculationPackage.html.length >= tolerances.minCalculationPackageHtmlLength, 'calculation-package', 'Calculation package must include the standard sections.'),
    check(calculationPackage.data.detailed.memberDesignTrace.rows.length > 0, 'member-trace', 'Member design trace rows must be available.'),
  ];

  if (required.loadDerivation) {
    checks.push(check(
      calculationPackage.data.detailed.loadDerivation?.derivationTrace?.rows?.length > 0,
      'load-derivation',
      'Generated design-basis case must include load derivation trace rows.',
    ));
  }
  if (required.actionHistory) {
    checks.push(check(
      Array.isArray(caseDef.actionHistory) && caseDef.actionHistory.length >= 4,
      'agent-action-history',
      'Agent-action case must record its modeling command path.',
    ));
  }
  return checks;
}

function summarizeHarness(cases) {
  return {
    categories: countBy(cases, (item) => item.category),
    inputPaths: countBy(cases, (item) => item.inputPath),
    maxNodeCount: Math.max(0, ...cases.map((item) => item.summary.model.nodes)),
    maxMemberCount: Math.max(0, ...cases.map((item) => item.summary.model.members)),
    maxLoadCount: Math.max(0, ...cases.map((item) => item.summary.model.loads)),
    maxDisplacement: Math.max(0, ...cases.map((item) => number(item.summary.analysis.maxDisplacement, 0))),
    maxUtilization: Math.max(0, ...cases.map((item) => number(item.summary.analysis.maxUtilization, 0))),
    failedIds: cases.filter((item) => !item.ok).map((item) => item.id),
  };
}

function summarizeCase(caseDef, model, validation, analysis, resultVisuals, report, calculationPackage) {
  const comboRows = summarizeComboResults(analysis);
  return {
    model: {
      nodes: model.nodes?.length || 0,
      members: model.members?.length || 0,
      loads: model.loads?.length || 0,
      loadCases: model.loadCases?.length || 0,
      combinations: model.loadCombinations?.length || 0,
    },
    validation: {
      ok: validation.errors.length === 0,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    analysis: {
      ok: !!analysis.ok,
      comboCount: analysis.combos?.length || 0,
      maxDisplacement: analysis.envelope?.dmax ?? null,
      maxUtilization: analysis.design?.summary?.maxUtilization ?? analysis.envelope?.maxRatio ?? null,
      designStatus: analysis.design?.ok ? 'OK' : 'Review',
      designOk: !!analysis.design?.ok,
      validationErrors: analysis.validation?.errors || [],
      comboResults: comboRows,
    },
    visuals: {
      version: resultVisuals.version,
      resultId: resultVisuals.resultId,
      nodes: resultVisuals.nodes.length,
      members: resultVisuals.members.length,
      loads: resultVisuals.loads.length,
      reactions: resultVisuals.reactions.length,
      maxDisplacement: resultVisuals.maxDisplacement,
    },
    report: {
      version: report.data.version,
      title: report.data.title,
      htmlLength: report.html.length,
    },
    calculationPackage: {
      version: calculationPackage.data.version,
      sectionCount: calculationPackage.data.sections.length,
      htmlLength: calculationPackage.html.length,
      qualityAuditOk: calculationPackage.data.qualityAudit.ok,
      qualityItems: calculationPackage.data.qualityAudit.items,
      loadDerivationRows: calculationPackage.data.detailed.loadDerivation?.derivationTrace?.rows?.length || 0,
      memberTraceRows: calculationPackage.data.detailed.memberDesignTrace.rows.length,
      serviceabilityRows: calculationPackage.data.detailed.serviceability.rows.length,
    },
    actionHistory: caseDef.actionHistory || [],
  };
}

function summarizeComboResults(analysis) {
  return Object.entries(analysis.byCombo || {}).map(([comboId, result]) => ({
    id: comboId,
    ok: !!result.ok && !!result.anyOk,
    maxDisplacement: result.summary?.maxDisplacement ?? result.dmax ?? null,
    maxUtilization: result.maxRatio ?? null,
    equilibriumResidual: result.summary?.equilibriumResidual ?? null,
    equilibriumLimit: result.summary?.equilibriumLimit ?? null,
    solverResidualNorm: result.summary?.solverResidualNorm ?? null,
    totalLoad: result.summary?.totalLoad || null,
    totalReaction: result.summary?.totalReaction || null,
  }));
}

function check(ok, id, message) {
  return { id, ok: !!ok, message };
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function number(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
