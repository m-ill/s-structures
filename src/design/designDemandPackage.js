import { buildResultPostprocessing } from '../results/resultPostprocessing.js';
import { buildDesignDemandFoundations } from './designDemandFoundations.js';
import { buildDesignDemandMembers } from './designDemandMembers.js';
import { designDemandSource } from './designDemandSource.js';
import { designDemandSummary } from './designDemandSummary.js';
import { DESIGN_DEMAND_PACKAGE_VERSION } from './designDemandVersion.js';

export { DESIGN_DEMAND_PACKAGE_VERSION } from './designDemandVersion.js';

export function buildDesignDemandPackage(model, analysis, options = {}) {
  const post = options.resultPostprocessing || buildResultPostprocessing(model, analysis, options);
  const members = buildDesignDemandMembers(post);
  const foundations = buildDesignDemandFoundations(post);
  return {
    version: DESIGN_DEMAND_PACKAGE_VERSION,
    source: designDemandSource(post, analysis),
    members,
    foundations,
    summary: designDemandSummary(members, foundations),
  };
}
