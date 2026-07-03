import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';
import { optionalText, requiredText, TEXT_LIMITS } from '../validation.mjs';

export function registerProjectRoutes(router, ctx) {
  router.get('/api/projects', async (req) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    const projects = await ctx.projectStore.list(user.id);
    return ok({ projects });
  }, { auth: { user: true } });

  router.post('/api/projects', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    const project = await ctx.projectStore.create(user.id, {
      name: requiredText(body?.name, 'Project name', TEXT_LIMITS.projectName),
      description: optionalText(body?.description, 'Project description', TEXT_LIMITS.projectDescription),
    });
    return ok({ project });
  }, { auth: { user: true } });

  router.get('/api/projects/:id', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const project = await ctx.projectStore.get(params.id);
    return ok({ project });
  }, { auth: { project: true, role: 'viewer' } });

  router.patch('/api/projects/:id', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'owner');
    const patch = {};
    if (body && Object.hasOwn(body, 'name')) {
      patch.name = requiredText(body.name, 'Project name', TEXT_LIMITS.projectName);
    }
    if (body && Object.hasOwn(body, 'description')) {
      patch.description = optionalText(body.description, 'Project description', TEXT_LIMITS.projectDescription);
    }
    const project = await ctx.projectStore.update(params.id, patch);
    return ok({ project });
  }, { auth: { project: true, role: 'owner' } });

  router.delete('/api/projects/:id', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'owner');
    await ctx.projectStore.softDelete(params.id);
    return ok({ deleted: true });
  }, { auth: { project: true, role: 'owner' } });

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
    await ctx.auditLog?.append('member-changed', {
      projectId: params.id, actorId: user.id, targetUserId: params.userId, role, action: 'upsert',
    });
    return ok({ project });
  }, { auth: { project: true, role: 'owner' } });

  router.delete('/api/projects/:id/members/:userId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'owner');
    const project = await ctx.projectStore.removeMember(params.id, params.userId);
    await ctx.auditLog?.append('member-changed', {
      projectId: params.id, actorId: user.id, targetUserId: params.userId, action: 'remove',
    });
    return ok({ project });
  }, { auth: { project: true, role: 'owner' } });
}
