import assert from 'node:assert/strict';
import {
  DESIGN_FEEDBACK_EDGES,
  DESIGN_FEEDBACK_QUANTITIES,
  directEdges,
  feedbackReach,
} from '../src/compute/product/designFeedbackPaths.js';
import { report } from '../verification/harnesses/check-feedback-path-evidence.mjs';

// Phase30 M1. The feedback declaration, and the gate that keeps it honest.

// The fact phase 30 exists for: a section change reaches the seismic mass, and
// the path says how it gets there.
const fromSection = feedbackReach('section-dimensions');
assert.equal(fromSection.ok, true);
assert.ok(fromSection.reaches.includes('seismic-mass'));
assert.ok(fromSection.reaches.includes('base-shear'));
assert.deepEqual(
  fromSection.paths['base-shear'].map((step) => `${step.from}->${step.to}`),
  ['section-dimensions->self-weight', 'self-weight->seismic-mass', 'seismic-mass->base-shear'],
);

// And it reaches itself. The loop is closed and the declaration says so rather
// than leaving it to be rediscovered.
assert.equal(fromSection.formsLoop, true);
assert.ok(fromSection.reaches.includes('section-dimensions'));

// The seismic edge is conditional on the mass source folding in self weight,
// and dropping the condition drops exactly that branch.
const withoutConditional = feedbackReach('section-dimensions', { includeConditional: false });
assert.equal(withoutConditional.reaches.includes('seismic-mass'), false);
assert.equal(withoutConditional.reaches.includes('base-shear'), false);
// Everything not on that branch survives.
assert.ok(withoutConditional.reaches.includes('member-forces'));
assert.ok(withoutConditional.reaches.includes('story-drift'));
assert.ok(withoutConditional.reaches.includes('design-sections'));
// The mechanism is named on the conditional step, not just flagged.
const conditionalStep = fromSection.paths['seismic-mass'].at(-1);
assert.match(conditionalStep.conditional, /includeSelfWeight/);

// Reinforcement does not change the gross area the self weight is taken on, so
// it has no DIRECT edge to self weight.
assert.deepEqual(directEdges('reinforcement')[0].invalidates.sort(), ['member-stiffness', 'section-strength']);

// Transitively it reaches self weight anyway, through the design decision that
// can resize the member. That is not a defect in the declaration: once the loop
// is closed, transitive reach saturates, and saturated reach answers nothing.
// This is why the direct edges are the ones worth reasoning with, and why the
// convergence judgement cannot be "did anything downstream change".
const fromBars = feedbackReach('reinforcement');
assert.equal(fromBars.formsLoop, true);
assert.equal(fromBars.reaches.includes('self-weight'), true);
assert.equal(fromBars.paths['self-weight'].at(-1).from, 'section-dimensions');
assert.ok(fromBars.paths['self-weight'].some((step) => step.to === 'design-sections'));

// An undeclared change is refused rather than answered with an empty set: "no
// reach" and "no such change" are different answers.
const unknown = feedbackReach('paint-colour');
assert.equal(unknown.ok, false);
assert.equal(unknown.reason, 'UNKNOWN_CHANGE');
assert.ok(unknown.known.includes('section-dimensions'));

// Direct edges are unexpanded, which is what a caller wants when it only needs
// the immediate invalidation.
const direct = directEdges('section-dimensions');
assert.equal(direct.length, 1);
assert.deepEqual(direct[0].invalidates.sort(), ['member-stiffness', 'section-strength', 'self-weight']);
assert.equal(directEdges('self-weight').length, 2);

// Every quantity in the graph is declared, and every edge target is a quantity.
for (const edge of DESIGN_FEEDBACK_EDGES) {
  for (const target of edge.invalidates) {
    assert.ok(DESIGN_FEEDBACK_QUANTITIES.includes(target), `${edge.change} -> ${target} is not a declared quantity`);
  }
}

// The gate: evidence that points at code must still find it.
assert.equal(report.broken.length, 0, JSON.stringify(report.broken));
assert.equal(report.undeclaredTargets.length, 0, JSON.stringify(report.undeclaredTargets));
assert.ok(report.verified >= 10);
assert.equal(report.sectionChangeFormsLoop, true);

// Evidence naming no source file is allowed and reported, because not every
// edge in the problem is an edge in this repository: one is a KDS clause and
// one is the milestone that will close the loop.
assert.ok(report.unverifiable.length <= 3, JSON.stringify(report.unverifiable));
assert.ok(report.unverifiable.some((row) => /KDS/.test(row.evidence)));

// A material change is an entry point: the loop never produces one, so nothing
// should claim it does.
assert.ok(report.unreachableChanges.includes('material-strength'));

console.log(JSON.stringify({
  ok: true,
  edges: report.edges,
  verified: report.verified,
  sectionReaches: fromSection.reaches.length,
  formsLoop: fromSection.formsLoop,
}, null, 2));
