import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';
import { upsertMaterial, upsertSection } from '../../src/materials/libraryEdit.js';

export function registerLibraryRoutes(router, ctx) {
  router.get('/api/projects/:id/library/:kind', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const kind = normalizeKind(params.kind);
    return ok({ kind, items: await ctx.projectStore.listLibrary(params.id, kind) });
  });

  router.get('/api/projects/:id/library/:kind/:itemId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const kind = normalizeKind(params.kind);
    const rows = await ctx.projectStore.listLibrary(params.id, kind);
    const url = new URL(req.url || '/', 'http://internal');
    const version = url.searchParams.get('version');
    const item = rows.find((row) => row.id === params.itemId && (version == null || Number(row.version || 1) === Number(version)));
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Library item not found.');
    return ok({ kind, item });
  });

  router.put('/api/projects/:id/library/:kind/:itemId', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const kind = normalizeKind(params.kind);
    const model = { materials: await ctx.projectStore.listLibrary(params.id, 'materials'), sections: await ctx.projectStore.listLibrary(params.id, 'sections'), members: [] };
    const record = { ...(body?.item || body || {}), id: params.itemId };
    const result = kind === 'sections' ? upsertSection(model, record, { scope: 'project' }) : upsertMaterial(model, record, { scope: 'project' });
    if (result.ok === false) throw new ApiError(400, 'VALIDATION', 'Library item is not valid.', result.errors);
    await ctx.projectStore.upsertLibraryItem(params.id, kind, result.item);
    return ok({ kind, item: result.item, audit: result.audit });
  });
}

function normalizeKind(kind) {
  if (['section', 'sections'].includes(kind)) return 'sections';
  if (['material', 'materials'].includes(kind)) return 'materials';
  throw new ApiError(400, 'VALIDATION', 'kind must be materials or sections.');
}
