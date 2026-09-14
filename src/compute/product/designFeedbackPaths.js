export const DESIGN_FEEDBACK_PATHS_VERSION = 'p30-design-feedback-paths-v1';

// Phase30 M1. What a design change invalidates, declared rather than inferred.
//
// `inputIdentity` and the iteration loop's `sourceModelHash` already answer
// "has the input changed"; neither answers "how far does this change reach".
// A section change reaching seismic mass is a fact about the structure of the
// problem, and until it is written down it lives only in whoever remembers it.
//
// The rows follow the declarative shape phase 28 asked for and phase 29 used:
// the change, what it reaches, why, and how it gets there.
//
// This module DECLARES. It computes nothing and re-runs nothing; it answers
// what would have to be recomputed.

const QUANTITIES = Object.freeze([
  // The design decisions. They are both changes a user can make and quantities
  // the loop produces, which is precisely why the loop closes.
  'section-dimensions',
  'reinforcement',
  // Everything downstream of them.
  'self-weight',
  'applied-loads',
  'seismic-mass',
  'base-shear',
  'member-stiffness',
  'member-forces',
  'story-drift',
  'section-strength',
  'design-sections',
]);

// Each row: the change, the quantities it invalidates DIRECTLY, and the
// mechanism. Transitive reach is derived from these, not written out by hand,
// so a new edge cannot be added in one place and forgotten in another.
const EDGES = Object.freeze([
  {
    change: 'section-dimensions',
    invalidates: ['self-weight', 'member-stiffness', 'section-strength'],
    mechanism: 'createSelfWeightLoads takes density x gross area; the gross section sets EI and the strength envelope',
    evidence: 'src/solver/linear3dPost.js createSelfWeightLoads',
  },
  {
    change: 'reinforcement',
    invalidates: ['member-stiffness', 'section-strength'],
    mechanism: 'cracked-section stiffness depends on the bars; the strength envelope is the provided reinforcement',
    evidence: 'src/compute/product/rcCoupledIteration.js',
  },
  {
    change: 'material-strength',
    invalidates: ['member-stiffness', 'section-strength'],
    mechanism: 'E follows the concrete grade; the strength envelope follows fck and fy',
    evidence: 'src/core/catalogs.js materialOf',
  },
  {
    change: 'self-weight',
    invalidates: ['applied-loads'],
    mechanism: 'generated self weight joins the model loads for the combination',
    evidence: 'src/compute/product/rcModelNetwork.js generatedSelfWeight',
  },
  {
    change: 'self-weight',
    invalidates: ['seismic-mass'],
    mechanism: 'a mass source with includeSelfWeight folds the generated self weight into the seismic mass',
    evidence: 'src/loads/massSource.js includeSelfWeight',
    conditional: 'only when the mass source declares includeSelfWeight',
  },
  {
    change: 'applied-loads',
    invalidates: ['member-forces'],
    mechanism: 'the combination is re-solved',
    evidence: 'src/compute/product/rcModelNetwork.js',
  },
  {
    change: 'seismic-mass',
    invalidates: ['base-shear'],
    mechanism: 'the base shear scales with the seismic weight',
    evidence: 'KDS 41 17 00 7.2',
  },
  {
    change: 'base-shear',
    invalidates: ['member-forces'],
    mechanism: 'the scaled seismic forces enter the combination',
    evidence: 'src/compute/product/analysisCaseEngine.js',
  },
  {
    change: 'member-stiffness',
    invalidates: ['member-forces', 'story-drift'],
    mechanism: 'a statically indeterminate frame redistributes with stiffness, and drift is a displacement',
    evidence: 'src/compute/product/flexuralIteration.js',
  },
  {
    change: 'member-forces',
    invalidates: ['story-drift', 'design-sections'],
    mechanism: 'drift comes from the same solution; the design responds to the demand',
    evidence: 'src/compute/product/flexuralIteration.js',
  },
  {
    change: 'section-strength',
    invalidates: ['design-sections'],
    mechanism: 'the check compares demand against the strength envelope',
    evidence: 'src/design/rc/kdsStrength.js',
  },
  {
    change: 'design-sections',
    invalidates: ['section-dimensions', 'reinforcement'],
    mechanism: 'this is the edge that closes the loop: a design decision changes the member it came from',
    evidence: 'phase30 M2',
    closesLoop: true,
  },
]);

/**
 * Everything a change reaches, directly and transitively.
 *
 * Returns the reachable set and the path taken to each element, because the
 * point of the declaration is to be able to say WHY something is invalidated,
 * not only that it is.
 */
export function feedbackReach(change, options = {}) {
  const { includeConditional = true } = options;
  if (!KNOWN_CHANGES.has(change)) {
    return { version: DESIGN_FEEDBACK_PATHS_VERSION, ok: false, reason: 'UNKNOWN_CHANGE', change, known: [...KNOWN_CHANGES].sort() };
  }

  const paths = new Map();
  const queue = [{ node: change, path: [] }];
  let cyclic = false;
  while (queue.length) {
    const { node, path } = queue.shift();
    for (const edge of EDGES) {
      if (edge.change !== node) continue;
      if (edge.conditional && !includeConditional) continue;
      for (const target of edge.invalidates) {
        const step = [...path, { from: node, to: target, mechanism: edge.mechanism, conditional: edge.conditional ?? null }];
        if (target === change) cyclic = true;
        if (paths.has(target)) continue;
        paths.set(target, step);
        queue.push({ node: target, path: step });
      }
    }
  }

  return {
    version: DESIGN_FEEDBACK_PATHS_VERSION,
    ok: true,
    change,
    reaches: [...paths.keys()].sort(),
    paths: Object.fromEntries([...paths].map(([target, path]) => [target, path])),
    // A change that reaches itself is a feedback loop. That is not a defect
    // here; it is the thing phase 30 exists to judge.
    formsLoop: cyclic,
    conditionalIncluded: includeConditional,
  };
}

/** The direct edges out of one change, unexpanded. */
export function directEdges(change) {
  return EDGES.filter((edge) => edge.change === change).map((edge) => ({ ...edge, invalidates: [...edge.invalidates] }));
}

const KNOWN_CHANGES = new Set(EDGES.map((edge) => edge.change));

export { EDGES as DESIGN_FEEDBACK_EDGES, QUANTITIES as DESIGN_FEEDBACK_QUANTITIES, KNOWN_CHANGES };
