import { buildDesignDemandPackage } from '../design/designDemandPackage.js';
import { buildResultPostprocessing } from '../results/resultPostprocessing.js';
import { AI_QA_CHECKLIST_VERSION } from './platformVersion.js';
import { qaChecklistItems } from './qaChecklistItems.js';
import { qaSummary } from './qaSummary.js';

export function buildAiQaChecklist(model, analysis) {
  const post = buildResultPostprocessing(model, analysis);
  const demand = analysis?.design?.demandPackage || buildDesignDemandPackage(model, analysis, { resultPostprocessing: post });
  const items = qaChecklistItems(model, analysis, post, demand);
  return {
    version: AI_QA_CHECKLIST_VERSION,
    items,
    summary: qaSummary(items),
  };
}
