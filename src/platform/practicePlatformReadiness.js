import { buildAiQaChecklist } from './aiQaChecklist.js';
import { buildImportExportContract } from './importExportContract.js';
import { PRACTICE_PLATFORM_VERSION } from './platformVersion.js';
import { practicePlatformSummary } from './practicePlatformSummary.js';
import { buildProjectWorkflowState } from './projectWorkflow.js';

export { PRACTICE_PLATFORM_VERSION } from './platformVersion.js';

export function buildPracticePlatformReadiness(model, analysis, options = {}) {
  const workflow = buildProjectWorkflowState(model, analysis, options);
  const qaChecklist = buildAiQaChecklist(model, analysis);
  const importExport = buildImportExportContract(model);
  return {
    version: PRACTICE_PLATFORM_VERSION,
    workflow,
    qaChecklist,
    importExport,
    summary: practicePlatformSummary(workflow, qaChecklist, importExport),
  };
}
