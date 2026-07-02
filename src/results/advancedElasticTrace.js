import { advancedTraceSummary } from './advancedTraceSummary.js';
import { buildModalTrace } from './modalTrace.js';
import { buildPDeltaTrace } from './pDeltaTrace.js';
import { buildResponseSpectrumTrace } from './rsaTrace.js';
import { buildUnilateralMemberTrace } from './unilateralTrace.js';
import { ADVANCED_ELASTIC_TRACE_VERSION } from './advancedTraceUtils.js';

export function buildAdvancedElasticTrace(model, analysis) {
  const pDelta = buildPDeltaTrace(model, analysis);
  const modal = buildModalTrace(analysis);
  const responseSpectrum = buildResponseSpectrumTrace(analysis);
  const unilateral = buildUnilateralMemberTrace(analysis);
  return {
    version: ADVANCED_ELASTIC_TRACE_VERSION,
    pDelta,
    modal,
    responseSpectrum,
    unilateral,
    summary: advancedTraceSummary(pDelta, modal, responseSpectrum, unilateral),
  };
}
