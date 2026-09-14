import { stableHash } from '../../core/stableHash.js';
import { workflowModelInput } from '../../core/workflowIdentity.js';
import { PRACTICAL_DESIGN_LIMITS } from '../../metadata/practicalDesignLimits.js';

export const GLOBAL_DESIGN_ITERATION_VERSION = 'p30-global-design-iteration-v1';

// Phase30 M2~M4. The outer loop.
//
// The inner loop (runFlexuralIteration) pins its source model by hash and
// refuses a section change, which is right: a stiffness iteration must not
// have the structure move underneath it. So the outer loop does not loosen
// that pin. It re-enters with a regenerated model, and each re-entry is a
// fresh inner run against a new hash.
//
//   model -> evaluate (analysis + checks) -> applyDesign -> model' -> ...
//
// Self weight needs no special handling: createSelfWeightLoads takes the gross
// area off the section every time the analysis network is built, so a resized
// member carries its own new weight on the next entry. Seismic mass follows
// when the mass source declares includeSelfWeight. What the loop must do is
// re-enter, not recompute those by hand.
//
// Convergence takes BOTH judgements and reports them separately:
//
//   force residual within tolerance   the demand has stopped moving
//   design state unchanged            the chosen sections have stopped moving
//
// Neither alone is enough. The residual alone reads a design chattering
// between two bar sizes as converged, because the forces barely move while the
// choice flips. An unchanged design alone calls the first pass converged when
// nothing was resized at all. They are reported separately because "the forces
// converged but the sections are still oscillating" is itself the answer a
// designer needs.

export const GLOBAL_ITERATION_STATUS = Object.freeze({
  CONVERGED: 'CONVERGED',
  FORCE_CONVERGED_SECTION_OSCILLATING: 'FORCE_CONVERGED_SECTION_OSCILLATING',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  ITERATION_LIMIT_REACHED: 'ITERATION_LIMIT_REACHED',
  NOT_CHECKED: 'NOT_CHECKED',
});

const DEFAULT_FORCE_TOLERANCE = 1e-3;

/**
 * The judgement for one iteration, shared by the autonomous loop and the
 * step-wise session.
 *
 * Extracted so the two callers cannot drift: a session that judged convergence
 * differently from the loop would be the same defect phase 28 found between the
 * clause map and the modules.
 */
export function judgeIteration({
  iteration,
  forces,
  designHash,
  previousForces = null,
  previousDesignHash = null,
  seenDesigns,
  forceTolerance = DEFAULT_FORCE_TOLERANCE,
}) {
  const forceResidual = previousForces === null ? null : relativeDifference(previousForces, forces);
  const designChanged = previousDesignHash === null ? null : designHash !== previousDesignHash;
  const firstSeenAt = seenDesigns?.get(designHash);
  const revisited = firstSeenAt !== undefined;

  const row = {
    iteration,
    designHash,
    forceResidual,
    designChanged,
    forceConverged: forceResidual !== null && forceResidual <= forceTolerance,
    revisitedDesignFromIteration: revisited ? firstSeenAt : null,
  };

  let status = null;
  if (row.forceConverged && designChanged === false) status = GLOBAL_ITERATION_STATUS.CONVERGED;
  else if (revisited) status = GLOBAL_ITERATION_STATUS.CYCLE_DETECTED;

  return {
    row,
    status,
    revisited,
    cycle: revisited ? { firstSeenAt, revisitedAt: iteration, length: iteration - firstSeenAt } : null,
  };
}

/**
 * Run the global design loop until it converges, cycles, or hits its bound.
 *
 * `evaluate({ model, iteration })` analyses and checks; it returns
 * `{ forces, designState }`, where `forces` is a flat numeric vector of the
 * demands to compare and `designState` is whatever identifies the current
 * design choice (sections, bar selections).
 *
 * `applyDesign({ model, evaluation, iteration })` returns the next model, or
 * the same one when it has nothing to change.
 *
 * Reaching the bound is not a failure. It is reported as not converged, with
 * the trace, because a design problem that does not converge is a real thing
 * and saying so is the correct answer.
 */
export async function runGlobalDesignIteration(source, options = {}) {
  const {
    evaluate,
    applyDesign,
    maxGlobalIterations = PRACTICAL_DESIGN_LIMITS.maxGlobalIterations,
    forceTolerance = DEFAULT_FORCE_TOLERANCE,
    signal,
    now = () => Date.now(),
    timeBudgetMillis = PRACTICAL_DESIGN_LIMITS.maxEvaluationMillis,
  } = options;

  if (typeof evaluate !== 'function' || typeof applyDesign !== 'function') {
    throw new Error('GLOBAL_DESIGN_ITERATION_CALLBACKS_REQUIRED');
  }
  if (!Number.isInteger(maxGlobalIterations)
    || maxGlobalIterations < 1
    || maxGlobalIterations > PRACTICAL_DESIGN_LIMITS.maxGlobalIterationsHardCap) {
    throw new Error('GLOBAL_DESIGN_ITERATION_BOUND_INVALID');
  }
  if (!Number.isFinite(forceTolerance) || forceTolerance <= 0 || forceTolerance > 1e-1) {
    throw new Error('GLOBAL_DESIGN_ITERATION_TOLERANCE_INVALID');
  }

  const started = now();
  const trace = [];
  // Design states already visited. A revisit is a cycle: the loop has returned
  // to a design it has been in before and will now repeat itself forever.
  // Detected by identity, not guessed from residual size.
  const seenDesigns = new Map();

  let model = structuredClone(source);
  let previousForces = null;
  let previousDesignHash = null;

  const base = () => ({
    version: GLOBAL_DESIGN_ITERATION_VERSION,
    bounds: { maxGlobalIterations, hardCap: PRACTICAL_DESIGN_LIMITS.maxGlobalIterationsHardCap, forceTolerance, timeBudgetMillis },
    // Convergence is a judgement about this iteration, never an approval.
    designTransferAllowed: false,
    qualification: 'global-iteration-judgement-not-design-approval',
  });

  for (let iteration = 0; iteration < maxGlobalIterations; iteration += 1) {
    if (signal?.aborted) throw new Error('GLOBAL_DESIGN_ITERATION_CANCELLED');
    if (now() - started > timeBudgetMillis) {
      return finish(GLOBAL_ITERATION_STATUS.ITERATION_LIMIT_REACHED, 'GLOBAL_ITERATION_TIME_BUDGET_EXCEEDED');
    }

    const modelHash = stableHash(workflowModelInput(model));
    const evaluation = await evaluate({ model, iteration, modelHash });
    if (!evaluation || !Array.isArray(evaluation.forces) || evaluation.designState === undefined) {
      return finish(GLOBAL_ITERATION_STATUS.NOT_CHECKED, 'GLOBAL_ITERATION_EVALUATION_INCOMPLETE');
    }

    // The same judgement the step-wise session uses, so the two cannot drift.
    const judged = judgeIteration({
      iteration,
      forces: evaluation.forces,
      designHash: stableHash(evaluation.designState),
      previousForces,
      previousDesignHash,
      seenDesigns,
      forceTolerance,
    });
    if (!judged.revisited) seenDesigns.set(judged.row.designHash, iteration);
    const row = { ...judged.row, modelHash };
    trace.push(row);

    if (judged.status === GLOBAL_ITERATION_STATUS.CONVERGED) {
      return finish(GLOBAL_ITERATION_STATUS.CONVERGED, null, { model, evaluation });
    }
    if (judged.status === GLOBAL_ITERATION_STATUS.CYCLE_DETECTED) {
      return finish(GLOBAL_ITERATION_STATUS.CYCLE_DETECTED, 'GLOBAL_ITERATION_DESIGN_STATE_REVISITED', {
        model,
        evaluation,
        cycle: judged.cycle,
      });
    }

    previousForces = evaluation.forces;
    previousDesignHash = judged.row.designHash;

    const next = await applyDesign({ model, evaluation, iteration });
    if (!next || typeof next !== 'object') {
      return finish(GLOBAL_ITERATION_STATUS.NOT_CHECKED, 'GLOBAL_ITERATION_APPLY_DESIGN_INCOMPLETE');
    }
    model = next;
  }

  // The bound was reached. Whether the forces had settled is still worth
  // saying: a design that oscillates between sizes while the demand is stable
  // is a different situation from one where nothing has settled at all.
  const last = trace.at(-1);
  const status = last?.forceConverged
    ? GLOBAL_ITERATION_STATUS.FORCE_CONVERGED_SECTION_OSCILLATING
    : GLOBAL_ITERATION_STATUS.ITERATION_LIMIT_REACHED;
  return finish(status, status === GLOBAL_ITERATION_STATUS.FORCE_CONVERGED_SECTION_OSCILLATING
    ? 'GLOBAL_ITERATION_SECTIONS_STILL_CHANGING'
    : 'GLOBAL_ITERATION_LIMIT_REACHED', { model });

  function finish(status, reason, extra = {}) {
    const last = trace.at(-1) ?? null;
    return {
      ...base(),
      status,
      converged: status === GLOBAL_ITERATION_STATUS.CONVERGED,
      reason,
      iterations: trace.length,
      // Reported separately, always, so a caller never has to infer which of
      // the two judgements failed.
      forceConverged: last?.forceConverged ?? null,
      designStable: last === null ? null : last.designChanged === false,
      finalForceResidual: last?.forceResidual ?? null,
      elapsedMillis: now() - started,
      trace,
      ...extra,
    };
  }
}

/** Whether a status may be carried into design transfer. None of them may. */
export function globalIterationBlocksTransfer(result) {
  return !result || result.status !== GLOBAL_ITERATION_STATUS.CONVERGED;
}

export { DEFAULT_FORCE_TOLERANCE };

// Relative change between two demand vectors, normalised on the larger
// magnitude so a member carrying almost nothing cannot dominate the residual.
function relativeDifference(previous, current) {
  if (previous.length !== current.length) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (let index = 0; index < current.length; index += 1) {
    const a = previous[index];
    const b = current[index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
    const scale = Math.max(Math.abs(a), Math.abs(b));
    if (scale < 1e-12) continue;
    worst = Math.max(worst, Math.abs(a - b) / scale);
  }
  return worst;
}
