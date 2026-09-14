import { stableHash } from '../../core/stableHash.js';
import {
  GLOBAL_ITERATION_STATUS,
  globalIterationBlocksTransfer,
  judgeIteration,
} from './globalDesignIteration.js';
import { declareResizeScope, nextSectionUp, resizeCommands } from './globalResizeScope.js';
import { REQUIRED_NEXT } from './globalDesignDriver.js';
import { PRACTICAL_DESIGN_LIMITS } from '../../metadata/practicalDesignLimits.js';

export const GLOBAL_ITERATION_SESSION_VERSION = 'p30-global-iteration-session-v1';

// Phase30 M6. The step-wise form, for callers that own the analysis lifecycle.
//
// runGlobalDesignDriver turns the loop itself, which needs a callback that can
// analyse on demand. The workflow service cannot offer one: evaluate() requires
// a completed analysis run id per combination, and the service deliberately
// does not own analysis execution -- which is exactly why
// applyCandidateAndReview answers 'new-analysis-and-design-evaluation' instead
// of running it.
//
// So the session holds the loop state between calls and the caller runs the
// analysis in between, the same shape as plan -> start -> apply:
//
//   open(scope)  ->  submit(evaluation)  ->  apply commands, re-analyse  ->  submit ...
//
// The judgement is judgeIteration, shared with the autonomous loop, so a design
// cannot be converged by one and unconverged by the other.

const MAX_RETAINED_TRACE = PRACTICAL_DESIGN_LIMITS.maxGlobalIterationsHardCap;

/**
 * Open a global iteration session over a declared resize scope.
 *
 * Returns a refusal object rather than throwing when the scope is invalid, so
 * a caller gets the same shaped answer whether the scope or the design is the
 * problem.
 */
export function openGlobalIterationSession(model, options = {}) {
  const {
    resizeScope,
    maxGlobalIterations = PRACTICAL_DESIGN_LIMITS.maxGlobalIterations,
    forceTolerance,
  } = options;

  const scope = resizeScope?.version ? resizeScope : declareResizeScope(model, resizeScope ?? {});
  if (!scope.ok) {
    return Object.freeze({
      version: GLOBAL_ITERATION_SESSION_VERSION,
      ok: false,
      reason: scope.reason,
      scope,
      requiredNext: 'declare-a-valid-resize-scope',
      designTransferAllowed: false,
      blocksTransfer: true,
    });
  }
  if (!Number.isInteger(maxGlobalIterations)
    || maxGlobalIterations < 1
    || maxGlobalIterations > PRACTICAL_DESIGN_LIMITS.maxGlobalIterationsHardCap) {
    throw new Error('GLOBAL_DESIGN_ITERATION_BOUND_INVALID');
  }

  const state = {
    iteration: 0,
    previousForces: null,
    previousDesignHash: null,
    seenDesigns: new Map(),
    trace: [],
    exhausted: new Map(),
    outOfScope: new Map(),
    settled: false,
  };

  const bounds = {
    maxGlobalIterations,
    hardCap: PRACTICAL_DESIGN_LIMITS.maxGlobalIterationsHardCap,
    forceTolerance: forceTolerance ?? undefined,
  };

  return Object.freeze({
    version: GLOBAL_ITERATION_SESSION_VERSION,
    ok: true,
    reason: null,
    sessionId: stableHash({ scope: scope.scopeHash, bounds }),
    scope: { scopeHash: scope.scopeHash, memberCount: scope.memberCount, sets: scope.sets.length },
    bounds,
    requiredNext: 'submit-design-evaluation',
    designTransferAllowed: false,

    /**
     * Submit the evaluation of the current model and get the next step.
     *
     * `members` is `[{ memberId, secId, governingRatio, status }]`, the same
     * shape the driver consumes. Returns the judgement plus, when the loop
     * should continue, the section assignment commands to apply before
     * re-analysing.
     */
    submit(evaluation = {}) {
      if (state.settled) {
        return result(state.settled.status, state.settled.reason, { replayed: true });
      }
      const members = Array.isArray(evaluation.members) ? evaluation.members : null;
      if (!members) return settle(GLOBAL_ITERATION_STATUS.NOT_CHECKED, 'GLOBAL_ITERATION_EVALUATION_INCOMPLETE');

      const ordered = [...members].sort((left, right) => String(left.memberId).localeCompare(String(right.memberId)));
      if (ordered.some((row) => !Number.isFinite(Number(row.governingRatio)) || typeof row.secId !== 'string')) {
        return settle(GLOBAL_ITERATION_STATUS.NOT_CHECKED, 'GLOBAL_ITERATION_EVALUATION_INCOMPLETE');
      }

      const judged = judgeIteration({
        iteration: state.iteration,
        forces: ordered.map((row) => Number(row.governingRatio)),
        // The design state is the chosen sections. The ratios are demand, not
        // choice, and must not enter this hash.
        designHash: stableHash(ordered.map((row) => [row.memberId, row.secId])),
        previousForces: state.previousForces,
        previousDesignHash: state.previousDesignHash,
        seenDesigns: state.seenDesigns,
        ...(forceTolerance === undefined ? {} : { forceTolerance }),
      });
      if (!judged.revisited) state.seenDesigns.set(judged.row.designHash, state.iteration);
      if (state.trace.length < MAX_RETAINED_TRACE) state.trace.push(judged.row);

      if (judged.status === GLOBAL_ITERATION_STATUS.CONVERGED) {
        return settle(GLOBAL_ITERATION_STATUS.CONVERGED, null);
      }
      if (judged.status === GLOBAL_ITERATION_STATUS.CYCLE_DETECTED) {
        return settle(GLOBAL_ITERATION_STATUS.CYCLE_DETECTED, 'GLOBAL_ITERATION_DESIGN_STATE_REVISITED', { cycle: judged.cycle });
      }

      state.previousForces = judged.row.forceResidual === null
        ? ordered.map((row) => Number(row.governingRatio))
        : ordered.map((row) => Number(row.governingRatio));
      state.previousDesignHash = judged.row.designHash;
      state.iteration += 1;

      if (state.iteration >= bounds.maxGlobalIterations) {
        return settle(
          judged.row.forceConverged
            ? GLOBAL_ITERATION_STATUS.FORCE_CONVERGED_SECTION_OSCILLATING
            : GLOBAL_ITERATION_STATUS.ITERATION_LIMIT_REACHED,
          judged.row.forceConverged
            ? 'GLOBAL_ITERATION_SECTIONS_STILL_CHANGING'
            : 'GLOBAL_ITERATION_LIMIT_REACHED',
        );
      }

      // Build the next step. A member that has run out of ladder, or that the
      // user never declared, is recorded rather than silently skipped: a run
      // that stops changing for either reason has not solved anything.
      const failing = ordered.filter((row) => row.status === 'NG');
      const assignments = [];
      for (const row of failing) {
        const step = nextSectionUp(scopeOf(), row.memberId, row.secId);
        if (!step.ok) { state.outOfScope.set(row.memberId, step.reason); continue; }
        if (step.exhausted) { state.exhausted.set(row.memberId, row.secId); continue; }
        assignments.push({ memberId: row.memberId, secId: step.secId });
      }

      if (!failing.length) {
        // Nothing failing, but the design or the demand is still moving. Ask
        // for another turn rather than declaring it done.
        return result(null, null, { commands: [], requiredNext: 'submit-design-evaluation' });
      }
      if (!assignments.length) {
        return settle(
          GLOBAL_ITERATION_STATUS.NOT_CHECKED,
          state.exhausted.size ? 'RESIZE_LADDER_EXHAUSTED_WHILE_FAILING' : 'FAILING_MEMBER_OUTSIDE_RESIZE_SCOPE',
        );
      }

      const built = resizeCommands(scopeOf(), assignments);
      if (!built.ok) return settle(GLOBAL_ITERATION_STATUS.NOT_CHECKED, built.reason);
      return result(null, null, {
        commands: built.commands,
        requiredNext: 'apply-commands-then-new-analysis-and-design-evaluation',
      });
    },

    /** The judgement so far, without submitting anything. */
    status() {
      return state.settled
        ? result(state.settled.status, state.settled.reason)
        : result(null, null, { requiredNext: 'submit-design-evaluation' });
    },
  });

  function scopeOf() { return scope; }

  function settle(status, reason, extra = {}) {
    state.settled = { status, reason };
    return result(status, reason, extra);
  }

  function result(status, reason, extra = {}) {
    const last = state.trace.at(-1) ?? null;
    return {
      version: GLOBAL_ITERATION_SESSION_VERSION,
      status: status ?? 'RUNNING',
      converged: status === GLOBAL_ITERATION_STATUS.CONVERGED,
      reason,
      iteration: state.iteration,
      iterations: state.trace.length,
      forceConverged: last?.forceConverged ?? null,
      designStable: last === null ? null : last.designChanged === false,
      finalForceResidual: last?.forceResidual ?? null,
      trace: state.trace.slice(),
      exhaustedMembers: [...state.exhausted].map(([memberId, secId]) => ({ memberId, secId, reason: 'LADDER_EXHAUSTED' })),
      outOfScopeMembers: [...state.outOfScope].map(([memberId, why]) => ({ memberId, reason: why })),
      bounds,
      // Never approval, in any status.
      designTransferAllowed: false,
      blocksTransfer: status === null ? true : globalIterationBlocksTransfer({ status }),
      requiredNext: status === null
        ? (extra.requiredNext ?? 'submit-design-evaluation')
        : (REQUIRED_NEXT[status] ?? 'resolve-remaining-design-checks'),
      ...extra,
    };
  }
}

export { MAX_RETAINED_TRACE };
