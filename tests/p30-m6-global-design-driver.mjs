import assert from 'node:assert/strict';
import { createModel } from '../src/core/modelFactory.js';
import { createSelfWeightLoads } from '../src/solver/linear3dPost.js';
import { GLOBAL_ITERATION_STATUS } from '../src/compute/product/globalDesignIteration.js';
import { REQUIRED_NEXT, runGlobalDesignDriver } from '../src/compute/product/globalDesignDriver.js';
import {
  declareResizeScope,
  nextSectionUp,
  resizeCommands,
} from '../src/compute/product/globalResizeScope.js';

// Phase30 M6. The producer that turns the loop, and the scope that bounds what
// it may touch.

const LADDER = ['rc3050', 'rc4060', 'rc5080'];
// Gross areas 0.15 / 0.24 / 0.40 m2, so the ladder is increasing and the self
// weight rises with each rung.
const CAPACITY = { rc3050: 0.8, rc4060: 1.3, rc5080: 2 };

function fixture(memberIds = ['M1']) {
  const model = createModel();
  model.nodes = [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 6, y: 0, z: 0 }];
  model.members = memberIds.map((id) => ({ id, n1: 'N1', n2: 'N2', secId: 'rc3050', matId: model.materials[0].id }));
  return model;
}

// ---------------------------------------------------------------------------
// The scope: a member outside it is never resizable, by any route.
// ---------------------------------------------------------------------------
const model = fixture(['M1', 'M2']);
const scope = declareResizeScope(model, {
  sets: [{ label: 'girders', memberIds: ['M1'], sectionLadder: LADDER }],
});
assert.equal(scope.ok, true);
assert.equal(scope.memberCount, 1);
assert.ok(scope.scopeHash);

assert.equal(nextSectionUp(scope, 'M1', 'rc3050').secId, 'rc4060');
assert.equal(nextSectionUp(scope, 'M1', 'rc5080').exhausted, true);
assert.equal(nextSectionUp(scope, 'M2', 'rc3050').reason, 'MEMBER_NOT_IN_RESIZE_SCOPE');
// A member carrying a section the ladder does not list has no defined step.
assert.equal(nextSectionUp(scope, 'M1', 'rc4070').reason, 'CURRENT_SECTION_NOT_ON_LADDER');

// The command builder re-checks the scope, so a caller that assembled its list
// elsewhere still cannot reach an undeclared member or an off-ladder section.
assert.equal(resizeCommands(scope, [{ memberId: 'M2', secId: 'rc4060' }]).reason, 'MEMBER_NOT_IN_RESIZE_SCOPE');
assert.equal(resizeCommands(scope, [{ memberId: 'M1', secId: 'rc4070' }]).reason, 'SECTION_NOT_ON_LADDER');
const built = resizeCommands(scope, [{ memberId: 'M1', secId: 'rc4060' }]);
assert.equal(built.ok, true);
assert.deepEqual(built.commands, [{ type: 'member-assignment', memberIds: ['M1'], secId: 'rc4060' }]);

// Scope declaration refuses what would make a step ambiguous.
assert.equal(declareResizeScope(model, { sets: [] }).reason, 'RESIZE_SCOPE_EMPTY');
assert.equal(declareResizeScope(model, { sets: [{ memberIds: ['M1'], sectionLadder: ['rc3050'] }] }).reason, 'RESIZE_SET_LADDER_REQUIRES_TWO_SECTIONS');
assert.equal(declareResizeScope(model, { sets: [{ memberIds: ['M1'], sectionLadder: ['rc5080', 'rc3050'] }] }).reason, 'RESIZE_SET_LADDER_NOT_INCREASING');
assert.equal(declareResizeScope(model, { sets: [{ memberIds: ['M9'], sectionLadder: LADDER }] }).reason, 'RESIZE_SET_MEMBER_NOT_IN_MODEL');
assert.equal(declareResizeScope(model, { sets: [{ memberIds: ['M1'], sectionLadder: ['rc3050', 'nope'] }] }).reason, 'RESIZE_SET_SECTION_NOT_RESOLVABLE');
assert.equal(declareResizeScope(model, {
  sets: [{ memberIds: ['M1'], sectionLadder: LADDER }, { memberIds: ['M1'], sectionLadder: LADDER }],
}).reason, 'RESIZE_SET_MEMBER_CLAIMED_TWICE');

// ---------------------------------------------------------------------------
// The loop, on the real self weight generator.
// ---------------------------------------------------------------------------
function harness(memberIds, { capacity = CAPACITY, ladder = LADDER, scopeMembers = memberIds } = {}) {
  const base = fixture(memberIds);
  const declared = declareResizeScope(base, { sets: [{ memberIds: scopeMembers, sectionLadder: ladder }] });
  let current = base;
  const weights = [];
  return {
    model: base,
    resizeScope: declared,
    weights,
    evaluateDesign: ({ model: m }) => {
      const weight = createSelfWeightLoads(m)[0].w;
      weights.push(weight);
      return {
        members: m.members.map((member) => {
          // The demand rises with the self weight: this is the feedback edge.
          const ratio = (1 + (weight - 11.5) * 0.01) / (capacity[member.secId] ?? 0.1);
          return { memberId: member.id, secId: member.secId, governingRatio: ratio, status: ratio > 1 ? 'NG' : 'OK' };
        }),
      };
    },
    applyCommands: ({ commands }) => {
      const next = structuredClone(current);
      for (const command of commands) {
        for (const id of command.memberIds) next.members.find((row) => row.id === id).secId = command.secId;
      }
      current = next;
      return next;
    },
  };
}

// A member that fails at rc3050 is stepped up until it passes, and the self
// weight follows the section with no help from the driver.
const converging = harness(['M1']);
const converged = await runGlobalDesignDriver(converging.model, converging);
assert.equal(converged.status, GLOBAL_ITERATION_STATUS.CONVERGED);
assert.equal(converged.converged, true);
assert.equal(converged.blocksTransfer, false);
assert.equal(converged.designTransferAllowed, false, 'convergence is not approval');
assert.deepEqual(converged.exhaustedMembers, []);
// The weight actually moved between iterations: the edge is closed.
assert.ok(converging.weights.length >= 2);
assert.ok(converging.weights[1] > converging.weights[0], JSON.stringify(converging.weights));
// The design settled and the demand stopped moving, both.
assert.equal(converged.forceConverged, true);
assert.equal(converged.designStable, true);
// Only a converged run reaches the artifact step, and it answers in the
// vocabulary applyCandidateAndReview already uses rather than a second one.
assert.equal(converged.requiredNext, 'independent-review-and-artifacts');
assert.equal(REQUIRED_NEXT.CONVERGED, 'independent-review-and-artifacts');
for (const [status, next] of Object.entries(REQUIRED_NEXT)) {
  if (status === 'CONVERGED') continue;
  assert.notEqual(next, 'independent-review-and-artifacts', status);
}

// ---------------------------------------------------------------------------
// Running out of ladder while still failing is not convergence.
// ---------------------------------------------------------------------------
// Capacity below the demand at every rung, so the member is stepped to the top
// and still fails. The design then stops changing, which the raw judgement
// would read as settled; the driver refuses to call that converged.
const weak = { rc3050: 0.2, rc4060: 0.25, rc5080: 0.3 };
const stalled = harness(['M1'], { capacity: weak });
const exhaustedRun = await runGlobalDesignDriver(stalled.model, stalled);
assert.equal(exhaustedRun.status, GLOBAL_ITERATION_STATUS.NOT_CHECKED);
assert.equal(exhaustedRun.reason, 'RESIZE_LADDER_EXHAUSTED_WHILE_FAILING');
assert.equal(exhaustedRun.converged, false);
assert.equal(exhaustedRun.blocksTransfer, true);
assert.deepEqual(exhaustedRun.exhaustedMembers.map((row) => row.memberId), ['M1']);
assert.equal(exhaustedRun.exhaustedMembers[0].secId, 'rc5080');
assert.equal(exhaustedRun.requiredNext, 'resolve-remaining-design-checks');

// A failing member the user never declared is a different answer again: not
// exhausted, simply not permitted.
const undeclared = harness(['M1', 'M2'], { capacity: weak, scopeMembers: ['M1'] });
const outOfScopeRun = await runGlobalDesignDriver(undeclared.model, undeclared);
assert.equal(outOfScopeRun.status, GLOBAL_ITERATION_STATUS.NOT_CHECKED);
assert.ok(outOfScopeRun.outOfScopeMembers.some((row) => row.memberId === 'M2'));
assert.equal(outOfScopeRun.blocksTransfer, true);

// ---------------------------------------------------------------------------
// A member outside the scope is never resized, even while others are.
// ---------------------------------------------------------------------------
const mixed = harness(['M1', 'M2'], { scopeMembers: ['M1'] });
await runGlobalDesignDriver(mixed.model, mixed);
// M2 is still on the section it started with.
assert.equal(mixed.model.members.find((row) => row.id === 'M2').secId, 'rc3050');

// ---------------------------------------------------------------------------
// An invalid scope is refused before any analysis is run.
// ---------------------------------------------------------------------------
let evaluated = 0;
const refused = await runGlobalDesignDriver(fixture(['M1']), {
  resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: ['rc5080', 'rc3050'] }] },
  evaluateDesign: () => { evaluated += 1; return { members: [] }; },
  applyCommands: ({ commands }) => ({ commands }),
});
assert.equal(refused.status, GLOBAL_ITERATION_STATUS.NOT_CHECKED);
assert.equal(refused.reason, 'RESIZE_SET_LADDER_NOT_INCREASING');
assert.equal(refused.blocksTransfer, true);
assert.equal(refused.requiredNext, 'declare-a-valid-resize-scope');
assert.equal(evaluated, 0, 'an invalid scope must not reach the analysis');

await assert.rejects(() => runGlobalDesignDriver(fixture(['M1']), {}), /GLOBAL_DESIGN_DRIVER_CALLBACKS_REQUIRED/);

console.log(JSON.stringify({
  ok: true,
  converged: converged.status,
  iterations: converged.iterations,
  selfWeightPerIteration: converging.weights.map((value) => Number(value.toFixed(3))),
  exhausted: exhaustedRun.reason,
}, null, 2));
