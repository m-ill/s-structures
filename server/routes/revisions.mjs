import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';
import { optionalText, TEXT_LIMITS } from '../validation.mjs';

export function registerRevisionRoutes(router, ctx) {
  router.get('/api/projects/:id/revisions', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const revisions = await ctx.projectStore.listRevisions(params.id);
    return ok({ revisions });
  }, { auth: { project: true, role: 'viewer' } });

  router.post('/api/projects/:id/revisions', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const model = body?.model;
    if (!model || typeof model !== 'object' || model.schemaVersion == null) {
      throw new ApiError(400, 'VALIDATION', 'model with a schemaVersion is required.');
    }
    const result = await ctx.projectStore.saveRevision(params.id, {
      model,
      note: optionalText(body?.note, 'Revision note', TEXT_LIMITS.revisionNote),
      author: user.id,
      parentRev: body?.parentRev ?? null,
    });
    return ok({
      revision: result.entry,
      lineageWarning: result.lineageWarning,
      latestRev: result.latestRev,
      lineage: {
        warning: result.lineageWarning,
        requestedParentRev: body?.parentRev ?? null,
        latestRev: result.latestRev,
        savedRev: result.entry.rev,
      },
    });
  }, { auth: { project: true, role: 'engineer' } });

  router.get('/api/projects/:id/revisions/:rev', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const model = await ctx.projectStore.getRevision(params.id, params.rev);
    if (!model) throw new ApiError(404, 'NOT_FOUND', 'Revision not found.');
    return ok({ model });
  }, { auth: { project: true, role: 'viewer' } });
}
