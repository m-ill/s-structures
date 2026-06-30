import { qaItem } from './qaItem.js';

export function qaChecklistItems(model, analysis, post, demand) {
  return [
    qaItem('model-validation', 'Model validation', !analysis?.validation?.errors?.length),
    qaItem('analysis-result', 'Elastic analysis result', !!analysis?.ok),
    qaItem('load-combinations', 'Load combinations', !!model?.loadCombinations?.length),
    qaItem('load-trace', 'Load derivation trace', !!model?.loadEstimation, true),
    qaItem('result-post', 'Result postprocessing', post.summary.memberRowCount > 0),
    qaItem('design-demand', 'Design demand package', demand.summary.memberCount > 0),
  ];
}
