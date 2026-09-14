import assert from 'node:assert/strict';
import { createModel } from '../src/core/modelFactory.js';
import { createSelfWeightLoads } from '../src/solver/linear3dPost.js';
import { GLOBAL_ITERATION_STATUS, judgeIteration } from '../src/compute/product/globalDesignIteration.js';
import { openGlobalIterationSession } from '../src/compute/product/globalIterationSession.js';
import { PRACTICAL_DESIGN_LIMITS } from '../src/metadata/practicalDesignLimits.js';

// Phase30 M6. The step-wise session, for callers that own the analysis
// lifecycle -- which the workflow service does, since evaluate() needs a
// completed analysis run id per combination.

const LADDER = ['rc3050', 'rc4060', 'rc5080'];
const CAPACITY = { rc3050: 0.8, rc4060: 1.3, rc5080: 2 };

function fixture(memberIds = ['M1']) {
  const model = createModel();
  model.nodes = [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 6, y: 0, z: 0 }];
  model.members = memberIds.map((id) => ({ id, n1: 'N1', n2: 'N2', secId: 'rc3050', matId: model.materials[0].id }));
  return model;
}

// Drive a session the way a caller would: submit, apply the commands it hands
// back, re-analyse, submit again.
function drive(model, session, { capacity = CAPACITY, maxSteps = 10 } = {}) {
  const steps = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const weight = createSelfWeightLoads(model)[0].w;
    const members = model.members.map((member) => {
      const ratio = (1 + (weight - 11.5) * 0.01) / (capacity[member.secId] ?? 0.1);
      return { memberId: member.id, secId: member.secId, governingRatio: ratio, status: ratio > 1 ? 'NG' : 'OK' };
    });
    const outcome = session.submit({ members });
    steps.push({ weight, outcome });
    if (outcome.status !== 'RUNNING') return { steps, final: outcome };
    for (const command of outcome.commands ?? []) {
      for (const id of command.memberIds) model.members.find((row) => row.id === id).secId = command.secId;
    }
  }
  return { steps, final: steps.at(-1).outcome };
}

// ---------------------------------------------------------------------------
// The contract mirrors plan -> start -> apply.
// ---------------------------------------------------------------------------
const model = fixture();
const session = openGlobalIterationSession(model, { resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: LADDER }] } });
assert.equal(session.ok, true);
assert.ok(session.sessionId);
assert.equal(session.requiredNext, 'submit-design-evaluation');
assert.equal(session.designTransferAllowed, false);
assert.equal(session.status().status, 'RUNNING');

const run = drive(model, session);
assert.equal(run.final.status, GLOBAL_ITERATION_STATUS.CONVERGED);
assert.equal(run.final.converged, true);
assert.equal(run.final.requiredNext, 'independent-review-and-artifacts');
assert.equal(run.final.blocksTransfer, false);
assert.equal(run.final.designTransferAllowed, false, 'convergence is not approval');

// The first submit asked for a resize and named the command; the caller is the
// one that applies it and re-analyses.
assert.equal(run.steps[0].outcome.status, 'RUNNING');
assert.equal(run.steps[0].outcome.requiredNext, 'apply-commands-then-new-analysis-and-design-evaluation');
assert.deepEqual(run.steps[0].outcome.commands, [{ type: 'member-assignment', memberIds: ['M1'], secId: 'rc4060' }]);
// The self weight followed the resize between submits: the closed edge again,
// this time across separate calls.
assert.ok(run.steps[1].weight > run.steps[0].weight, JSON.stringify(run.steps.map((row) => row.weight)));

// A settled session replays its verdict instead of continuing.
const replay = session.submit({ members: [{ memberId: 'M1', secId: 'rc4060', governingRatio: 0.1, status: 'OK' }] });
assert.equal(replay.status, GLOBAL_ITERATION_STATUS.CONVERGED);
assert.equal(replay.replayed, true);

// ---------------------------------------------------------------------------
// The judgement is shared with the autonomous loop, not reimplemented.
// ---------------------------------------------------------------------------
// Same inputs, same verdict: a session that judged convergence differently from
// the loop would be the drift phase 28 exists to prevent.
const seen = new Map([['same', 0]]);
const direct = judgeIteration({
  iteration: 1,
  forces: [1],
  designHash: 'same',
  previousForces: [1],
  previousDesignHash: 'same',
  seenDesigns: seen,
});
assert.equal(direct.status, GLOBAL_ITERATION_STATUS.CONVERGED);

// ---------------------------------------------------------------------------
// The same four outcomes, reached step-wise.
// ---------------------------------------------------------------------------
const cycling = fixture();
const cycleSession = openGlobalIterationSession(cycling, { resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: LADDER }] } });
// Alternate the reported section to force a revisit.
let flip = 0;
let cycleOutcome = null;
for (let step = 0; step < 6; step += 1) {
  cycleOutcome = cycleSession.submit({
    members: [{ memberId: 'M1', secId: (flip += 1) % 2 ? 'rc3050' : 'rc4060', governingRatio: 1.2, status: 'OK' }],
  });
  if (cycleOutcome.status !== 'RUNNING') break;
}
assert.equal(cycleOutcome.status, GLOBAL_ITERATION_STATUS.CYCLE_DETECTED);
assert.equal(cycleOutcome.requiredNext, 'resolve-design-state-cycle');
assert.ok(cycleOutcome.cycle.length >= 1);
assert.equal(cycleOutcome.blocksTransfer, true);

// Running out of ladder while still failing is not convergence.
const weak = { rc3050: 0.2, rc4060: 0.25, rc5080: 0.3 };
const stalling = fixture();
const stallSession = openGlobalIterationSession(stalling, { resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: LADDER }] } });
const stalled = drive(stalling, stallSession, { capacity: weak });
assert.equal(stalled.final.status, GLOBAL_ITERATION_STATUS.NOT_CHECKED);
assert.equal(stalled.final.reason, 'RESIZE_LADDER_EXHAUSTED_WHILE_FAILING');
assert.deepEqual(stalled.final.exhaustedMembers.map((row) => row.memberId), ['M1']);
assert.equal(stalled.final.blocksTransfer, true);

// A failing member outside the declared scope is a distinct answer.
const undeclaredModel = fixture(['M1', 'M2']);
const undeclared = openGlobalIterationSession(undeclaredModel, { resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: LADDER }] } });
const outOfScope = drive(undeclaredModel, undeclared, { capacity: weak });
assert.equal(outOfScope.final.status, GLOBAL_ITERATION_STATUS.NOT_CHECKED);
assert.ok(outOfScope.final.outOfScopeMembers.some((row) => row.memberId === 'M2'));
// M2 was never resized.
assert.equal(undeclaredModel.members.find((row) => row.id === 'M2').secId, 'rc3050');

// The bound terminates a session whose demand never settles. The design must
// reach a NEW state each time, or the cycle detector fires first -- which it
// should, and does.
const LONG_LADDER = ['rc3050', 'rc3060', 'rc4060', 'rc4070', 'rc5080'];
const endless = fixture(['M1', 'M2']);
const endlessSession = openGlobalIterationSession(endless, {
  resizeScope: { sets: [{ memberIds: ['M1', 'M2'], sectionLadder: LONG_LADDER }] },
});
let growing = 1;
let endlessOutcome = null;
for (let step = 0; step < PRACTICAL_DESIGN_LIMITS.maxGlobalIterations + 2; step += 1) {
  endlessOutcome = endlessSession.submit({
    members: [
      { memberId: 'M1', secId: LONG_LADDER[step % LONG_LADDER.length], governingRatio: (growing *= 2), status: 'OK' },
      { memberId: 'M2', secId: LONG_LADDER[Math.floor(step / LONG_LADDER.length) % LONG_LADDER.length], governingRatio: growing, status: 'OK' },
    ],
  });
  if (endlessOutcome.status !== 'RUNNING') break;
}
assert.equal(endlessOutcome.status, GLOBAL_ITERATION_STATUS.ITERATION_LIMIT_REACHED);
assert.equal(endlessOutcome.requiredNext, 'raise-iteration-bound-or-revise-design');
assert.equal(endlessOutcome.blocksTransfer, true);

// A design that keeps returning to a state it has held before is a cycle, and
// the detector reaches that verdict before the bound does.
const repeating = fixture();
const repeatSession = openGlobalIterationSession(repeating, { resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: LADDER }] } });
let repeatOutcome = null;
for (let step = 0; step < PRACTICAL_DESIGN_LIMITS.maxGlobalIterations + 2; step += 1) {
  repeatOutcome = repeatSession.submit({ members: [{ memberId: 'M1', secId: 'rc3050', governingRatio: 2 ** step, status: 'OK' }] });
  if (repeatOutcome.status !== 'RUNNING') break;
}
assert.equal(repeatOutcome.status, GLOBAL_ITERATION_STATUS.CYCLE_DETECTED);
assert.ok(repeatOutcome.iterations < PRACTICAL_DESIGN_LIMITS.maxGlobalIterations);

// ---------------------------------------------------------------------------
// Refusals.
// ---------------------------------------------------------------------------
const badScope = openGlobalIterationSession(fixture(), { resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: ['rc5080', 'rc3050'] }] } });
assert.equal(badScope.ok, false);
assert.equal(badScope.reason, 'RESIZE_SET_LADDER_NOT_INCREASING');
assert.equal(badScope.requiredNext, 'declare-a-valid-resize-scope');
assert.equal(badScope.blocksTransfer, true);
assert.equal(typeof badScope.submit, 'undefined', 'an unopened session offers no submit');

assert.throws(
  () => openGlobalIterationSession(fixture(), {
    resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: LADDER }] },
    maxGlobalIterations: 13,
  }),
  /GLOBAL_DESIGN_ITERATION_BOUND_INVALID/,
);

const incomplete = openGlobalIterationSession(fixture(), { resizeScope: { sets: [{ memberIds: ['M1'], sectionLadder: LADDER }] } });
assert.equal(incomplete.submit({}).reason, 'GLOBAL_ITERATION_EVALUATION_INCOMPLETE');

console.log(JSON.stringify({
  ok: true,
  converged: run.final.status,
  steps: run.steps.length,
  weights: run.steps.map((row) => Number(row.weight.toFixed(3))),
  cycle: cycleOutcome.status,
  stalled: stalled.final.reason,
}, null, 2));
