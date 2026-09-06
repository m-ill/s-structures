import { resultEntries } from './resultUtils.js';
import {
  emptyReactionRange,
  finalizeReactionRange,
  updateReactionRange,
} from './reactionRange.js';

export function buildFoundationReactionRows(model, analysis) {
  return (model?.nodes || [])
    .filter((node) => node.support)
    .map((node) => {
      const range = emptyReactionRange();
      for (const [comboId, result] of resultEntries(analysis)) {
        updateReactionRange(range, comboId, result.reactions?.[node.id]);
      }
      const reactions = finalizeReactionRange(range);
      return {
        nodeId: node.id,
        support: node.support,
        reactions,
        uplift: reactions.rz.min < 0,
        governingVerticalCombo: Math.abs(reactions.rz.max) >= Math.abs(reactions.rz.min)
          ? reactions.rz.comboMax
          : reactions.rz.comboMin,
      };
    });
}
