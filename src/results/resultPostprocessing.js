import { buildFoundationReactionRows } from './foundationReactionRows.js';
import { buildMemberStationForceRows } from './memberStationRows.js';
import { RESULT_POST_LIMITATIONS } from './resultPostLimitations.js';
import { resultPostSummary } from './resultPostSummary.js';
import { RESULT_POSTPROCESSING_VERSION } from './resultUtils.js';
import { buildStoryResultRows } from './storyResultRows.js';

export function buildResultPostprocessing(model, analysis, options = {}) {
  const storyResults = buildStoryResultRows(model, analysis, options);
  const memberStationForces = buildMemberStationForceRows(model, analysis);
  const foundationReactions = buildFoundationReactionRows(model, analysis);
  return {
    version: RESULT_POSTPROCESSING_VERSION,
    storyResults,
    memberStationForces,
    foundationReactions,
    summary: resultPostSummary(storyResults, memberStationForces, foundationReactions),
    limitations: RESULT_POST_LIMITATIONS,
  };
}
