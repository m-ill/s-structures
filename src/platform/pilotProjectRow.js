import { analyzeModel } from '../compute/product/elasticAnalysisWorkflow.js';
import { summarizeRepresentativeBuilding } from '../examples/representativeBuildings.js';
import { buildPracticeValidationReport } from './practiceValidationReport.js';

export function buildPilotProjectRow(spec, model, options = {}) {
  const analysis = analyzeModel(model);
  const validation = buildPracticeValidationReport(model, analysis, options.validation || {});
  const representative = summarizeRepresentativeBuilding(spec, model, analysis);
  return {
    id: spec.id,
    name: spec.name,
    analysisOk: !!analysis.ok,
    reviewStatus: validation.status,
    issueCount: validation.issues.summary.totalCount,
    nodeCount: representative.model.nodeCount,
    memberCount: representative.model.memberCount,
    comboCount: representative.model.combinationCount,
  };
}
