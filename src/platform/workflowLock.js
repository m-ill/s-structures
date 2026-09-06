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
  const approvalState = workflow.approvalState || 'not-submitted';
  const locked = !!workflow.locked;
  const editable = canEditWorkflow(model);
  return {
    version: WORKFLOW_LOCK_VERSION,
    approvalState,
    locked,
    editable,
    approvedRev: workflow.approvedRev || null,
    releasedAt: workflow.releasedAt || null,
    revokeReason: workflow.revokeReason || null,
    review: buildWorkflowReview({ approvalState, locked, editable }),
  };
}

function buildWorkflowReview({ approvalState, locked, editable }) {
  const missing = [];
  if (['approved', 'released'].includes(approvalState) && !locked) missing.push('approval-lock');
  if (['approved', 'released'].includes(approvalState) && editable) missing.push('approval-edit-lock');
  if (approvalState === 'released' && editable) missing.push('released-edit-lock');
  if (approvalState === 'revoked' && locked) missing.push('revoked-unlock');
  return {
    status: missing.length ? 'review-required' : 'available',
    missing,
    agentDecision: missing.length ? 'review-workflow-lock-state' : 'workflow-lock-ready',
  };
}
