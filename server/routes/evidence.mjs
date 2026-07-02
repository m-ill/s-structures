import { buildPhase3EvidenceRegister } from '../../src/platform/phase3EvidenceRegister.js';
import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';

export function registerEvidenceRoutes(router, ctx) {
  router.get('/api/projects/:id/evidence', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const evidence = await ctx.projectStore.listEvidence(params.id);
    return ok({ evidence, register: buildPhase3EvidenceRegister({ evidence }) });
  });

  router.post('/api/projects/:id/evidence', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const evidence = body?.evidence || body;
    if (!evidence?.id && !evidence?.type) {
      throw new ApiError(400, 'VALIDATION', 'Evidence id or type is required.');
    }
    const entry = await ctx.projectStore.addEvidence(params.id, { evidence, author: user.id });
    return ok({ evidence: entry, register: buildPhase3EvidenceRegister({ evidence: await ctx.projectStore.listEvidence(params.id) }) });
  });
}
