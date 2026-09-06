import {
  buildPhase3FinalApprovalReview,
  buildPhase3FinalApprovals,
  buildPhase3EvidenceRegister,
  validatePhase3EvidenceRecord,
} from '../../src/platform/phase3EvidenceRegister.js';
import { buildPhase3OwnerSignoffReview } from '../../src/platform/phase3OwnerSignoffReview.js';
import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';

export function registerEvidenceRoutes(router, ctx) {
  router.get('/api/projects/:id/evidence', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const evidence = await ctx.projectStore.listEvidence(params.id);
    const finalApprovals = buildPhase3FinalApprovals(evidence);
    return ok({
      evidence,
      finalApprovals,
      finalApprovalReview: buildPhase3FinalApprovalReview({ finalApprovals }),
      ownerSignoffReview: buildPhase3OwnerSignoffReview({ evidence, finalApprovals }),
      register: buildPhase3EvidenceRegister({ evidence }),
    });
  }, { auth: { project: true, role: 'viewer' } });

  router.post('/api/projects/:id/evidence', async (req, res, params, body) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const evidence = body?.evidence || body;
    if (!evidence?.id && !evidence?.type) {
      throw new ApiError(400, 'VALIDATION', 'Evidence id or type is required.');
    }
    const validation = validatePhase3EvidenceRecord(evidence);
    if (!validation.ok) {
      throw new ApiError(400, 'VALIDATION', 'Evidence id or type is not in the Phase 3 evidence register.', {
        reason: validation.reason,
        allowedIds: validation.allowedIds,
      });
    }
    if (evidence.fileId) {
      const found = await ctx.projectStore.getFile(params.id, evidence.fileId);
      if (!found) {
        throw new ApiError(400, 'VALIDATION', 'Evidence fileId does not reference an uploaded project file.', {
          reason: 'missing-evidence-file',
          fileId: evidence.fileId,
        });
      }
    }
    const entry = await ctx.projectStore.addEvidence(params.id, { evidence, author: user.id });
    const rows = await ctx.projectStore.listEvidence(params.id);
    const finalApprovals = buildPhase3FinalApprovals(rows);
    return ok({
      evidence: entry,
      finalApprovals,
      finalApprovalReview: buildPhase3FinalApprovalReview({ finalApprovals }),
      ownerSignoffReview: buildPhase3OwnerSignoffReview({ evidence: rows, finalApprovals }),
      register: buildPhase3EvidenceRegister({ evidence: rows }),
    });
  }, { auth: { project: true, role: 'engineer' } });
}
