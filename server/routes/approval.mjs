import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';

export function registerApprovalRoutes(router, ctx) {
  router.get('/api/projects/:id/approval', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const project = await ctx.projectStore.get(params.id);
    if (!project) throw new ApiError(404, 'NOT_FOUND', 'Project not found.');
    return ok({ approval: project.approval });
  }, { auth: { project: true, role: 'viewer' } });

  router.post('/api/projects/:id/approval', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    if (!['approved', 'released'].includes(body?.state)) {
      throw new ApiError(400, 'VALIDATION', 'state must be approved or released.');
    }
    await requireProjectRole(ctx, params.id, user.id, body.state === 'released' ? 'owner' : 'reviewer');
    const revisions = await ctx.projectStore.listRevisions(params.id);
    const latestRev = revisions.at(-1)?.rev ?? null;
    const rev = body.rev ?? latestRev;
    if (rev == null) throw new ApiError(400, 'VALIDATION', 'Project has no revisions to approve.');
    if (!Number.isInteger(Number(rev)) || Number(rev) < 1) throw new ApiError(400, 'VALIDATION', 'rev must be a positive integer.');
    const result = await ctx.projectStore.transitionApproval(params.id, {
      state: body.state,
      rev: Number(rev),
      actorId: user.id,
      expectedVersion: body.expectedVersion,
    });
    if (!result.ok) throw approvalError(result);
    await ctx.auditLog?.append('approval-changed', {
      projectId: params.id, actorId: user.id, state: body.state, rev: Number(rev),
      modelHash: result.approval.modelHash, approvalVersion: result.approval.version,
    });
    return ok({ approval: result.approval });
  }, { auth: { project: true, role: 'reviewer' } });
}

function approvalError(result) {
  if (result.code === 'NOT_FOUND') return new ApiError(404, 'NOT_FOUND', 'Project not found.');
  if (result.code === 'REV_NOT_FOUND') return new ApiError(400, 'REV_NOT_FOUND', 'Revision does not exist.');
  if (result.code === 'STALE_REV') return new ApiError(409, 'STALE_REV', 'Only the latest revision can be approved or released.', { latestRev: result.latestRev });
  if (result.code === 'REV_TAMPERED') return new ApiError(409, 'REV_TAMPERED', 'Revision content does not match its recorded hash.');
  if (result.code === 'VERSION_CONFLICT') return new ApiError(409, 'VERSION_CONFLICT', 'Approval state changed concurrently.', { currentVersion: result.currentVersion });
  return new ApiError(409, 'INVALID_TRANSITION', 'Release requires the same current approved revision and model hash.');
}
