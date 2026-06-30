import { advancedTraceSummary } from './advancedTraceSummary.js';
import { buildModalTrace } from './modalTrace.js';
import { buildPDeltaTrace } from './pDeltaTrace.js';
import { buildResponseSpectrumTrace } from './rsaTrace.js';
import { ADVANCED_ELASTIC_TRACE_VERSION } from './advancedTraceUtils.js';

export function buildAdvancedElasticTrace(model, analysis) {
  const pDelta = buildPDeltaTrace(model, analysis);
  const modal = buildModalTrace(analysis);
  const responseSpectrum = buildResponseSpectrumTrace(analysis);
  return {
    version: ADVANCED_ELASTIC_TRACE_VERSION,
    pDelta,
    modal,
    responseSpectrum,
    summary: advancedTraceSummary(pDelta, modal, responseSpectrum),
  };
}
