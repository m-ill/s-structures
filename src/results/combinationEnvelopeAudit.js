import { buildServiceabilityDriftReport } from '../design/serviceability.js';
import { envelopeDisplacementAudit } from './envelopeDisplacementAudit.js';
import { envelopeMemberAudit } from './envelopeMemberAudit.js';
import { envelopeReactionAudit } from './envelopeReactionAudit.js';

export function combinationEnvelopeAudit(model, analysis, post, options = {}) {
  return {
    available: !!analysis?.envelope,
    displacement: envelopeDisplacementAudit(analysis),
    members: envelopeMemberAudit(analysis),
    reactions: envelopeReactionAudit(post),
    drift: buildServiceabilityDriftReport(model, analysis, options.serviceability || {}).summary,
  };
}
