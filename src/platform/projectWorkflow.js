import { PROJECT_WORKFLOW_VERSION } from './platformVersion.js';

export function buildProjectWorkflowState(model, analysis, options = {}) {
  const workflow = model?.workflow || {};
  return {
    version: PROJECT_WORKFLOW_VERSION,
    project: {
      name: model?.meta?.name || options.projectName || 'Untitled Project',
      revision: workflow.revision || model?.meta?.revision || 'R0',
      state: workflow.state || 'draft',
    },
    review: {
      engineer: workflow.engineer || options.engineer || '',
      reviewer: workflow.reviewer || options.reviewer || '',
      approvalState: workflow.approvalState || 'not-submitted',
      locked: !!workflow.locked,
    },
    analysisOk: !!analysis?.ok,
    issueCount: (analysis?.validation?.errors || []).length
      + (analysis?.validation?.warnings || []).length,
  };
}
