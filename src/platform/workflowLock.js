export const WORKFLOW_LOCK_VERSION = 'p3-m19-workflow-lock';

export function canEditWorkflow(model = {}) {
  return !model.workflow?.locked && model.workflow?.approvalState !== 'released';
}

export function applyWorkflowApproval(model = {}, approval = {}) {
  const state = approval.state || 'approved';
  model.workflow = {
    ...(model.workflow || {}),
    approvalState: state,
    approvedRev: approval.rev || model.meta?.revision || model.workflow?.revision || 'R0',
    locked: state === 'approved' || state === 'released',
    releasedAt: state === 'released' ? approval.at || new Date().toISOString() : model.workflow?.releasedAt || null,
  };
  return buildWorkflowLockState(model);
}

export function revokeWorkflowApproval(model = {}, reason = 'model-changed') {
  model.workflow = {
    ...(model.workflow || {}),
    approvalState: 'revoked',
    locked: false,
    revokeReason: reason,
  };
  return buildWorkflowLockState(model);
}

export function buildWorkflowLockState(model = {}) {
  const workflow = model.workflow || {};
  return {
    version: WORKFLOW_LOCK_VERSION,
    approvalState: workflow.approvalState || 'not-submitted',
    locked: !!workflow.locked,
    editable: canEditWorkflow(model),
    approvedRev: workflow.approvedRev || null,
    releasedAt: workflow.releasedAt || null,
    revokeReason: workflow.revokeReason || null,
  };
}
