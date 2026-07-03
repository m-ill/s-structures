import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';

export function registerApprovalRoutes(router, ctx) {
  router.get('/api/projects/:id/approval', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const project = await ctx.projectStore.get(params.id);
    return ok({ approval: project.approval });
  }, { auth: { project: true, role: 'viewer' } });

  router.post('/api/projects/:id/approval', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'reviewer');
    if (!['approved', 'released'].includes(body?.state)) {
      throw new ApiError(400, 'VALIDATION', 'state must be approved or released.');
    }
    const revisions = await ctx.projectStore.listRevisions(params.id);
    const latestRev = revisions.at(-1)?.rev ?? null;
    const rev = body.rev ?? latestRev;
    if (rev == null) throw new ApiError(400, 'VALIDATION', 'Project has no revisions to approve.');
    const approval = await ctx.projectStore.setApproval(params.id, { state: body.state, rev, approvedBy: user.id });
    return ok({ approval });
  }, { auth: { project: true, role: 'reviewer' } });
}
