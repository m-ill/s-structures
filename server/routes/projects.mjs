import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';

export function registerProjectRoutes(router, ctx) {
  router.get('/api/projects', async (req) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    const projects = await ctx.projectStore.list(user.id);
    return ok({ projects });
  });

  router.post('/api/projects', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    if (!body?.name || typeof body.name !== 'string') {
      throw new ApiError(400, 'VALIDATION', 'Project name is required.');
    }
    const project = await ctx.projectStore.create(user.id, body);
    return ok({ project });
  });

  router.get('/api/projects/:id', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const project = await ctx.projectStore.get(params.id);
    return ok({ project });
  });

  router.patch('/api/projects/:id', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'owner');
    const patch = {};
    if (typeof body?.name === 'string') patch.name = body.name;
    if (typeof body?.description === 'string') patch.description = body.description;
    const project = await ctx.projectStore.update(params.id, patch);
    return ok({ project });
  });

  router.delete('/api/projects/:id', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'owner');
    await ctx.projectStore.softDelete(params.id);
    return ok({ deleted: true });
  });

  router.put('/api/projects/:id/members/:userId', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'owner');
    const role = body?.role;
    if (!['owner', 'engineer', 'reviewer', 'viewer'].includes(role)) {
      throw new ApiError(400, 'VALIDATION', 'role must be one of owner, engineer, reviewer, viewer.');
    }
    const targetUser = await ctx.userStore.findById(params.userId);
    if (!targetUser) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
    const project = await ctx.projectStore.setMemberRole(params.id, params.userId, role);
    return ok({ project });
  });

  router.delete('/api/projects/:id/members/:userId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'owner');
    const project = await ctx.projectStore.removeMember(params.id, params.userId);
    return ok({ project });
  });
}
