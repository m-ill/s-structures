import { analyzeAll as analyzeCanonicalFirstOrder } from '../linear3dFirstOrder.js';

export const PDELTA_FIRST_ORDER_SEED_VERSION = 'p15-m8-pdelta-first-order-seed-v2';

export function resolvePDeltaFirstOrderSeed(model, factors, options = {}) {
  if (options.linear) return options.linear;
  const analyzer = typeof options.linearAnalyzer === 'function'
    ? options.linearAnalyzer
    : analyzeCanonicalFirstOrder;
  return analyzer(model, factors);
}
