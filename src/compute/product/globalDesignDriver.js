import {
  GLOBAL_ITERATION_STATUS,
  globalIterationBlocksTransfer,
  runGlobalDesignIteration,
} from './globalDesignIteration.js';
import { declareResizeScope, nextSectionUp, resizeCommands } from './globalResizeScope.js';
import { PRACTICAL_DESIGN_LIMITS } from '../../metadata/practicalDesignLimits.js';

export const GLOBAL_DESIGN_DRIVER_VERSION = 'p30-global-design-driver-v1';

// Phase30 M6. The producer: what actually turns the loop.
//
// One turn of the fixed point already exists in the workflow service as
// applyCandidateAndReview -- update design variables, re-analyse, re-evaluate.
// This drives that turn repeatedly under runGlobalDesignIteration's judgement,
// and supplies the one design variable the candidate search does not propose:
// the member section.
//
// Explicitly invoked, not implicit in an evaluation. One global iteration is a
// whole analysis cycle, so an evaluation that silently became six of them
// would change the latency contract of every design run.

const DEMAND_SOURCE = 'governing check ratio per member';

// The workflow service already says what has to happen next in this vocabulary
// (applyCandidateAndReview.requiredNext), so the driver answers in the same
// terms rather than inventing a second one. Only a converged run reaches the
// artifact step; every other outcome names what is unresolved.
const REQUIRED_NEXT = Object.freeze({
  [GLOBAL_ITERATION_STATUS.CONVERGED]: 'independent-review-and-artifacts',
  [GLOBAL_ITERATION_STATUS.CYCLE_DETECTED]: 'resolve-design-state-cycle',
  [GLOBAL_ITERATION_STATUS.ITERATION_LIMIT_REACHED]: 'raise-iteration-bound-or-revise-design',
  // The demand settled but the section choice did not. Structurally either rung
  // may stand; which one was adopted is undecided, so this is a decision to
  // make rather than a result to carry forward.
  [GLOBAL_ITERATION_STATUS.FORCE_CONVERGED_SECTION_OSCILLATING]: 'choose-between-oscillating-sections',
  [GLOBAL_ITERATION_STATUS.NOT_CHECKED]: 'resolve-remaining-design-checks',
});

/**
 * Drive the global design loop over a declared resize scope.
 *
 * `evaluateDesign({ model, iteration })` must return the practical evaluation
 * for the current model: `{ members: [{ memberId, secId, governingRatio,
 * status }] }`. Whatever the caller uses to analyse and check goes here; the
 * driver does not reach into the workflow service itself, so it stays testable
 * without a session.
 *
 * `applyCommands({ commands, iteration })` applies the section assignments and
 * returns the new model. In the service this is the design input command path
 * that applyCandidate already uses.
 */
export async function runGlobalDesignDriver(model, options = {}) {
  const {
    resizeScope,
    evaluateDesign,
    applyCommands,
    maxGlobalIterations = PRACTICAL_DESIGN_LIMITS.maxGlobalIterations,
    forceTolerance,
    signal,
    now,
  } = options;

  if (typeof evaluateDesign !== 'function' || typeof applyCommands !== 'function') {
    throw new Error('GLOBAL_DESIGN_DRIVER_CALLBACKS_REQUIRED');
  }

  const scope = resizeScope?.version ? resizeScope : declareResizeScope(model, resizeScope ?? {});
  if (!scope.ok) {
    return {
      version: GLOBAL_DESIGN_DRIVER_VERSION,
      status: GLOBAL_ITERATION_STATUS.NOT_CHECKED,
      reason: scope.reason,
      scope,
      designTransferAllowed: false,
      blocksTransfer: true,
      requiredNext: 'declare-a-valid-resize-scope',
    };
  }

  // Members that ran out of ladder while still failing. Collected rather than
  // thrown: the loop can converge on everything else, and "this member needs a
  // section the scope does not contain" is a specific, actionable answer.
  const exhausted = new Map();
  const outOfScope = new Map();

  const iteration = await runGlobalDesignIteration(model, {
    maxGlobalIterations,
    forceTolerance,
    signal,
    now,
    evaluate: async ({ model: current, iteration: index }) => {
      const evaluation = await evaluateDesign({ model: current, iteration: index });
      const members = Array.isArray(evaluation?.members) ? evaluation.members : null;
      if (!members) return { forces: null, designState: undefined };
      // The demand vector is the governing ratio per member, ordered by id so
      // the comparison between iterations is positional and stable.
      const ordered = [...members].sort((left, right) => String(left.memberId).localeCompare(String(right.memberId)));
      return {
        forces: ordered.map((row) => Number(row.governingRatio)),
        // The design state is what the loop is choosing: the sections. The
        // ratios are demand, not choice, and must not enter this hash or a
        // settled design would look unsettled forever.
        designState: ordered.map((row) => [row.memberId, row.secId]),
        members: ordered,
        evaluation,
      };
    },
    applyDesign: async ({ model: current, evaluation, iteration: index }) => {
      const failing = (evaluation.members || []).filter((row) => row.status === 'NG');
      if (!failing.length) return current;

      const assignments = [];
      for (const row of failing) {
        const step = nextSectionUp(scope, row.memberId, row.secId);
        if (!step.ok) {
          outOfScope.set(row.memberId, step.reason);
          continue;
        }
        if (step.exhausted) {
          exhausted.set(row.memberId, row.secId);
          continue;
        }
        assignments.push({ memberId: row.memberId, secId: step.secId });
      }
      // Nothing left to try: returning the model unchanged makes the next
      // evaluation see an unchanged design, which the judgement reads as a
      // settled design rather than pretending progress was made.
      if (!assignments.length) return current;

      const built = resizeCommands(scope, assignments);
      if (!built.ok) throw new Error(`GLOBAL_DESIGN_DRIVER_RESIZE_REFUSED_${built.reason}`);
      const next = await applyCommands({ commands: built.commands, iteration: index });
      if (!next || typeof next !== 'object') throw new Error('GLOBAL_DESIGN_DRIVER_APPLY_FAILED');
      return next;
    },
  });

  // A run that converged only because every failing member ran out of ladder
  // has not solved anything, and must not read as converged.
  const stalled = exhausted.size > 0 || outOfScope.size > 0;
  const status = iteration.status === GLOBAL_ITERATION_STATUS.CONVERGED && stalled
    ? GLOBAL_ITERATION_STATUS.NOT_CHECKED
    : iteration.status;
  const reason = status === GLOBAL_ITERATION_STATUS.NOT_CHECKED && stalled
    ? (exhausted.size ? 'RESIZE_LADDER_EXHAUSTED_WHILE_FAILING' : 'FAILING_MEMBER_OUTSIDE_RESIZE_SCOPE')
    : iteration.reason;

  return {
    ...iteration,
    version: GLOBAL_DESIGN_DRIVER_VERSION,
    iterationVersion: iteration.version,
    status,
    converged: status === GLOBAL_ITERATION_STATUS.CONVERGED,
    reason,
    scope: { scopeHash: scope.scopeHash, memberCount: scope.memberCount, sets: scope.sets.length },
    exhaustedMembers: [...exhausted].map(([memberId, secId]) => ({ memberId, secId, reason: 'LADDER_EXHAUSTED' })),
    outOfScopeMembers: [...outOfScope].map(([memberId, why]) => ({ memberId, reason: why })),
    demandSource: DEMAND_SOURCE,
    designTransferAllowed: false,
    blocksTransfer: globalIterationBlocksTransfer({ status }),
    requiredNext: REQUIRED_NEXT[status] ?? 'resolve-remaining-design-checks',
  };
}

export { DEMAND_SOURCE, REQUIRED_NEXT };
