import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';
import { summarizeImportEntry } from '../../src/app/importReviewModel.js';
import { validateImportCandidate } from '../../src/import/candidate.js';

export function registerImportRoutes(router, ctx) {
  router.post('/api/projects/:id/imports', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    if (!body?.candidate) throw new ApiError(400, 'VALIDATION', 'candidate is required.');
    assertImportCandidate(body.candidate, 'candidate');
    const entry = await ctx.projectStore.saveImport(params.id, body);
    return ok({ import: withImportReview(entry) });
  }, { auth: { project: true, role: 'engineer' } });

  router.get('/api/projects/:id/imports', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const imports = await ctx.projectStore.listImports(params.id);
    return ok({ imports: imports.map(withImportReview) });
  }, { auth: { project: true, role: 'viewer' } });

  router.get('/api/projects/:id/imports/:importId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const entry = await ctx.projectStore.getImport(params.id, params.importId);
    if (!entry) throw new ApiError(404, 'NOT_FOUND', 'Import not found.');
    return ok({ import: withImportReview(entry) });
  }, { auth: { project: true, role: 'viewer' } });

  router.patch('/api/projects/:id/imports/:importId', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    if (!['confirmed', 'rejected'].includes(body?.status)) {
      throw new ApiError(400, 'VALIDATION', 'status must be confirmed or rejected.');
    }
    if (body.resolvedCandidate != null) assertImportCandidate(body.resolvedCandidate, 'resolvedCandidate');
    const entry = await ctx.projectStore.updateImport(params.id, params.importId, {
      status: body.status, resolvedCandidate: body.resolvedCandidate ?? null, resolvedBy: user.id,
    });
    if (!entry) throw new ApiError(404, 'NOT_FOUND', 'Import not found.');
    return ok({ import: withImportReview(entry) });
  }, { auth: { project: true, role: 'engineer' } });
}

function withImportReview(entry) {
  return { ...entry, review: summarizeImportEntry(entry) };
}

function assertImportCandidate(candidate, field) {
  const validation = validateImportCandidate(candidate);
  if (!validation.ok) {
    throw new ApiError(400, 'VALIDATION', `${field} is not a valid ImportCandidate.`, {
      field,
      errors: validation.errors,
    });
  }
}
