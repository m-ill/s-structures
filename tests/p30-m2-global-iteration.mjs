import assert from 'node:assert/strict';
import {
  GLOBAL_ITERATION_STATUS,
  globalIterationBlocksTransfer,
  runGlobalDesignIteration,
} from '../src/compute/product/globalDesignIteration.js';
import { PRACTICAL_DESIGN_LIMITS } from '../src/metadata/practicalDesignLimits.js';
import { createModel } from '../src/core/modelFactory.js';
import { createSelfWeightLoads } from '../src/solver/linear3dPost.js';

// Phase30 M2~M4. The outer loop: closing the section -> self weight -> forces
// -> section edge, judging convergence on both criteria, and reporting the
// four outcomes apart from each other.

const shell = { nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }], members: [], sections: [], materials: [] };
const keepModel = ({ model }) => structuredClone(model);

// ---------------------------------------------------------------------------
// The bound comes from the same place every other bound does.
// ---------------------------------------------------------------------------
assert.equal(PRACTICAL_DESIGN_LIMITS.maxGlobalIterations, 6);
assert.equal(PRACTICAL_DESIGN_LIMITS.maxGlobalIterationsHardCap, 12);

// ---------------------------------------------------------------------------
// 1. CONVERGED needs BOTH judgements.
// ---------------------------------------------------------------------------
const converged = await runGlobalDesignIteration(shell, {
  evaluate: ({ iteration }) => ({
    forces: [100 + 10 / 10 ** iteration],
    designState: { size: iteration < 2 ? 300 + iteration * 50 : 400 },
  }),
  applyDesign: keepModel,
});
assert.equal(converged.status, GLOBAL_ITERATION_STATUS.CONVERGED);
assert.equal(converged.converged, true);
assert.equal(converged.forceConverged, true);
assert.equal(converged.designStable, true);
assert.equal(converged.designTransferAllowed, false, 'convergence is not approval');

// A settled design with forces still moving is NOT converged: the demand has
// not stopped, so the design that answers it cannot be final.
const forcesStillMoving = await runGlobalDesignIteration(shell, {
  evaluate: ({ iteration }) => ({ forces: [100 * (1 + iteration)], designState: { size: 400 } }),
  applyDesign: keepModel,
});
assert.notEqual(forcesStillMoving.status, GLOBAL_ITERATION_STATUS.CONVERGED);
assert.equal(forcesStillMoving.forceConverged, false);
// It is a cycle, because the design state repeats immediately.
assert.equal(forcesStillMoving.status, GLOBAL_ITERATION_STATUS.CYCLE_DETECTED);

// Settled forces with the design still changing is not converged either, and
// this is the case a force-only criterion would have called converged.
const sectionsStillMoving = await runGlobalDesignIteration(shell, {
  evaluate: ({ iteration }) => ({ forces: [100], designState: { size: 300 + iteration * 25 } }),
  applyDesign: keepModel,
});
assert.equal(sectionsStillMoving.status, GLOBAL_ITERATION_STATUS.FORCE_CONVERGED_SECTION_OSCILLATING);
assert.equal(sectionsStillMoving.forceConverged, true);
assert.equal(sectionsStillMoving.designStable, false);
assert.equal(sectionsStillMoving.converged, false);
assert.equal(sectionsStillMoving.reason, 'GLOBAL_ITERATION_SECTIONS_STILL_CHANGING');

// ---------------------------------------------------------------------------
// 2. A cycle is detected by identity, not guessed from the residual.
// ---------------------------------------------------------------------------
const oscillating = await runGlobalDesignIteration(shell, {
  evaluate: ({ iteration }) => ({ forces: [100], designState: { bar: iteration % 2 ? 'D22' : 'D25' } }),
  applyDesign: keepModel,
});
assert.equal(oscillating.status, GLOBAL_ITERATION_STATUS.CYCLE_DETECTED);
assert.equal(oscillating.reason, 'GLOBAL_ITERATION_DESIGN_STATE_REVISITED');
assert.deepEqual(oscillating.cycle, { firstSeenAt: 0, revisitedAt: 2, length: 2 });
// It stops as soon as the repeat is proved rather than running out the bound.
assert.ok(oscillating.iterations < PRACTICAL_DESIGN_LIMITS.maxGlobalIterations);
// No relaxation factor was applied to force it together: the cycle is reported.
assert.equal(oscillating.converged, false);

// ---------------------------------------------------------------------------
// 3. The bound guarantees termination, and reaching it is a report.
// ---------------------------------------------------------------------------
const unbounded = await runGlobalDesignIteration(shell, {
  evaluate: ({ iteration }) => ({ forces: [100 * (1 + iteration)], designState: { size: iteration } }),
  applyDesign: keepModel,
});
assert.equal(unbounded.status, GLOBAL_ITERATION_STATUS.ITERATION_LIMIT_REACHED);
assert.equal(unbounded.iterations, PRACTICAL_DESIGN_LIMITS.maxGlobalIterations);
assert.equal(unbounded.converged, false);
assert.equal(unbounded.trace.length, PRACTICAL_DESIGN_LIMITS.maxGlobalIterations);

// A lower bound is honoured; above the hard cap is refused outright.
const tight = await runGlobalDesignIteration(shell, {
  maxGlobalIterations: 2,
  evaluate: ({ iteration }) => ({ forces: [100 * (1 + iteration)], designState: { size: iteration } }),
  applyDesign: keepModel,
});
assert.equal(tight.iterations, 2);
await assert.rejects(
  () => runGlobalDesignIteration(shell, { maxGlobalIterations: 13, evaluate: () => ({ forces: [], designState: {} }), applyDesign: keepModel }),
  /GLOBAL_DESIGN_ITERATION_BOUND_INVALID/,
);
await assert.rejects(
  () => runGlobalDesignIteration(shell, { forceTolerance: 0, evaluate: () => ({ forces: [], designState: {} }), applyDesign: keepModel }),
  /GLOBAL_DESIGN_ITERATION_TOLERANCE_INVALID/,
);
await assert.rejects(() => runGlobalDesignIteration(shell, {}), /GLOBAL_DESIGN_ITERATION_CALLBACKS_REQUIRED/);

// The time budget terminates a loop whose iterations are individually cheap
// enough to keep going forever.
let clock = 0;
const timedOut = await runGlobalDesignIteration(shell, {
  now: () => (clock += 60_000),
  evaluate: ({ iteration }) => ({ forces: [100 * (1 + iteration)], designState: { size: iteration } }),
  applyDesign: keepModel,
});
assert.equal(timedOut.status, GLOBAL_ITERATION_STATUS.ITERATION_LIMIT_REACHED);
assert.equal(timedOut.reason, 'GLOBAL_ITERATION_TIME_BUDGET_EXCEEDED');

// ---------------------------------------------------------------------------
// 4. Nothing but CONVERGED may be carried into design transfer.
// ---------------------------------------------------------------------------
assert.equal(globalIterationBlocksTransfer(converged), false);
for (const result of [oscillating, unbounded, sectionsStillMoving, timedOut, null]) {
  assert.equal(globalIterationBlocksTransfer(result), true);
}
for (const result of [converged, oscillating, unbounded, sectionsStillMoving]) {
  assert.equal(result.designTransferAllowed, false);
}

// An incomplete evaluation is NOT_CHECKED, distinct from a failure to converge.
const incomplete = await runGlobalDesignIteration(shell, {
  evaluate: () => ({ designState: {} }),
  applyDesign: keepModel,
});
assert.equal(incomplete.status, GLOBAL_ITERATION_STATUS.NOT_CHECKED);
assert.equal(incomplete.reason, 'GLOBAL_ITERATION_EVALUATION_INCOMPLETE');

// ---------------------------------------------------------------------------
// 5. The closed edge, on the real self weight generator.
// ---------------------------------------------------------------------------
// This is what M2 is for. The loop resizes the member; self weight is taken off
// the new section on the next entry with no special handling, because
// createSelfWeightLoads reads the gross area every time.
const model = createModel();
model.nodes = [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 6, y: 0, z: 0 }];
model.members = [{ id: 'M1', n1: 'N1', n2: 'N2', secId: 'rc3050', matId: model.materials[0].id }];

const sizes = ['rc3050', 'rc4060', 'rc5080', 'rc5080'];
const weights = [];
const resized = await runGlobalDesignIteration(model, {
  evaluate: ({ model: current }) => {
    const weight = createSelfWeightLoads(current)[0].w;
    weights.push(weight);
    // The demand follows the weight, which is the feedback being closed.
    return { forces: [weight * 10], designState: { secId: current.members[0].secId } };
  },
  applyDesign: ({ model: current, iteration }) => {
    const next = structuredClone(current);
    next.members[0].secId = sizes[Math.min(iteration + 1, sizes.length - 1)];
    return next;
  },
});

// Each resize produced a different self weight without the loop computing one.
assert.ok(weights.length >= 3, JSON.stringify(weights));
assert.ok(weights[1] > weights[0], `${weights[1]} should exceed ${weights[0]}`);
assert.ok(weights[2] > weights[1], `${weights[2]} should exceed ${weights[1]}`);
// rc3050 is 0.15 m2 and rc5080 is 0.40 m2, so the weight follows the area.
assert.ok(Math.abs(weights[2] / weights[0] - 0.4 / 0.15) < 1e-9);
// Holding the section still then converges both judgements.
assert.equal(resized.status, GLOBAL_ITERATION_STATUS.CONVERGED);
assert.equal(resized.forceConverged, true);
assert.equal(resized.designStable, true);

// Every entry carried its own model hash: the inner pin is re-entered, not
// loosened.
const hashes = new Set(resized.trace.map((row) => row.modelHash));
assert.ok(hashes.size >= 3, `expected distinct model hashes, got ${hashes.size}`);

console.log(JSON.stringify({
  ok: true,
  statuses: {
    converged: converged.status,
    oscillating: oscillating.status,
    sectionsMoving: sectionsStillMoving.status,
    unbounded: unbounded.status,
  },
  selfWeightAcrossResizes: weights.map((value) => Number(value.toFixed(3))),
}, null, 2));
