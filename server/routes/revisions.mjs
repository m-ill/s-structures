import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';

export function registerRevisionRoutes(router, ctx) {
  router.get('/api/projects/:id/revisions', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const revisions = await ctx.projectStore.listRevisions(params.id);
    return ok({ revisions });
  });

  router.post('/api/projects/:id/revisions', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const model = body?.model;
    if (!model || typeof model !== 'object' || model.schemaVersion == null) {
      throw new ApiError(400, 'VALIDATION', 'model with a schemaVersion is required.');
    }
    const result = await ctx.projectStore.saveRevision(params.id, {
      model, note: body?.note, author: user.id, parentRev: body?.parentRev ?? null,
    });
    return ok({ revision: result.entry, lineageWarning: result.lineageWarning });
  });

  router.get('/api/projects/:id/revisions/:rev', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const model = await ctx.projectStore.getRevision(params.id, params.rev);
    if (!model) throw new ApiError(404, 'NOT_FOUND', 'Revision not found.');
    return ok({ model });
  });
}
