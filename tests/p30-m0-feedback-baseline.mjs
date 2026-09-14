import assert from 'node:assert/strict';
import { createModel } from '../src/core/modelFactory.js';
import { createSelfWeightLoads } from '../src/solver/linear3dPost.js';
import { prepareFlexuralAnalysisModel } from '../src/compute/product/flexuralAnalysisProfile.js';
import { workflowModelInput } from '../src/core/workflowIdentity.js';
import { stableHash } from '../src/core/stableHash.js';

// Phase30 M0. What actually feeds back today, measured rather than assumed.
//
// This is a baseline, not a wish: it records the CURRENT behaviour so the
// milestones that change it have something to change. Two of these assertions
// are expected to be rewritten in M2, and they say so.

const model = createModel();
const section = model.sections.find((row) => row.id === 'rc3050');
const material = model.materials[0];
assert.ok(section, 'fixture section rc3050 missing');

model.nodes = [
  { id: 'N1', x: 0, y: 0, z: 0 },
  { id: 'N2', x: 6, y: 0, z: 0 },
];
model.members = [
  { id: 'M1', n1: 'N1', n2: 'N2', secId: section.id, matId: material.id },
];

// ---------------------------------------------------------------------------
// 1. Self weight IS derived from the section, every time it is built.
// ---------------------------------------------------------------------------
const loads = createSelfWeightLoads(model);
assert.equal(loads.length, 1);
assert.ok(loads[0].w > 0, JSON.stringify(loads[0]));
assert.equal(loads[0].unit, 'kN/m');
assert.equal(loads[0].member, 'M1');

// The self weight scales with the section area. Two real catalogue sections are
// used rather than a hand-patched one: section properties are DERIVED, so
// overwriting properties.A or the dimensions on a model record does not change
// what sectionOf resolves. A design loop changes which section a member
// carries, which is exactly what this compares.
const bigger = structuredClone(model);
bigger.members[0].secId = 'rc5080';
const biggerLoads = createSelfWeightLoads(bigger);
const areaRatio = 0.4 / section.properties.A;
assert.ok(Math.abs(biggerLoads[0].w / loads[0].w - areaRatio) < 1e-9,
  `${biggerLoads[0].w} / ${loads[0].w} vs ${areaRatio}`);

// ---------------------------------------------------------------------------
// 2. The iteration loop cannot carry a section change. This is the broken edge.
// ---------------------------------------------------------------------------
// A flexural profile carries bending stiffness only, and each value is bounded
// by the gross section it came from. There is no area term at all, so an
// iteration can soften a member but never resize it.
const sourceModelHash = stableHash(workflowModelInput(model));
const profile = {
  memberId: 'M1',
  segments: [{ start: 0, end: 1, Iy: section.properties.Iy * 0.5, Iz: section.properties.Iz * 0.5 }],
};
const prepared = prepareFlexuralAnalysisModel(model, { sourceModelHash, profiles: [profile] });
assert.ok(prepared, 'a stiffness-only profile is accepted');

// Stiffness above the gross section is refused, which is what makes this a
// softening-only path.
assert.throws(
  () => prepareFlexuralAnalysisModel(model, {
    sourceModelHash,
    profiles: [{ memberId: 'M1', segments: [{ start: 0, end: 1, Iy: section.properties.Iy * 1.5, Iz: section.properties.Iz }] }],
  }),
  /FLEXURAL_PROFILE_INERTIA/,
);

// And the source model itself is pinned: changing the section between
// iterations is rejected by design, not by oversight. The outer loop phase 30
// adds has to re-enter with a new hash rather than mutate the inner one.
assert.throws(
  () => prepareFlexuralAnalysisModel(bigger, { sourceModelHash, profiles: [profile] }),
  /STALE_FLEXURAL_PROFILE/,
);

// ---------------------------------------------------------------------------
// 3. Therefore self weight is constant across inner iterations.
// ---------------------------------------------------------------------------
// EXPECTED TO CHANGE IN M2. Today the inner loop sees one self weight for its
// whole run, because the model it is pinned to never changes. M2 closes this by
// re-entering the loop with a regenerated model, not by loosening the pin.
const first = createSelfWeightLoads(model);
const second = createSelfWeightLoads(model);
assert.deepEqual(first, second);
assert.equal(stableHash(workflowModelInput(model)), sourceModelHash);

// ---------------------------------------------------------------------------
// 4. The mass path is wired but not exercised by the loop.
// ---------------------------------------------------------------------------
// massSource can fold self weight into seismic mass, so section -> mass ->
// base shear is expressible in the data model. Nothing in the iteration path
// rebuilds it, which is the second half of the broken edge.
const { createMassSourceDefinition } = await import('../src/loads/massSource.js');
const withSelfWeight = createMassSourceDefinition({
  components: [{ kind: 'self-weight' }, { kind: 'load-case', case: 'D', factor: 1 }],
});
assert.equal(withSelfWeight.includeSelfWeight, true);
const withoutSelfWeight = createMassSourceDefinition({
  components: [{ kind: 'load-case', case: 'D', factor: 1 }],
});
assert.equal(withoutSelfWeight.includeSelfWeight, false);

console.log(JSON.stringify({
  ok: true,
  baseline: {
    selfWeightDerivedFromSection: true,
    iterationCanChangeStiffness: true,
    iterationCanChangeSection: false,
    selfWeightRegeneratedInsideLoop: false,
    seismicMassRegeneratedInsideLoop: false,
  },
  brokenEdge: 'section -> self weight -> loads -> forces -> section, and section -> seismic mass -> base shear',
}, null, 2));
