import { analyzeDynamics } from '../../dynamics/modal.js';
import { runDesignChecks } from '../../design/steel.js';
import { makeEnvelope } from '../../solver/linear3dPost.js';
import { summarizeShellNumericalQualification } from '../../solver/linear3dFirstOrder.js';
import { prepareElasticAnalysis, solveElasticCombination } from '../../solver/elastic/stages.js';
import { validateDirectPDeltaOverride, withAudit, buildCombinationCompleteness, firstOrderPDeltaDesignInputs, envelopeCompleteFor, blockedDesignResultSet } from '../../solver/elastic/resultContracts.js';
import { analyzePDeltaCombinations, buildPDeltaDesignSummary } from '../../solver/pdelta/combinations.js';

export function analyzeModel(inputModel, options = {}) {
  const prepared = prepareElasticAnalysis(inputModel);
  if (prepared.terminal) return finalizeElasticAnalysis(prepared, {});
  const byCombo = {};
  for (const combo of prepared.combos) {
    byCombo[combo.id] = solveElasticCombination(prepared, combo, options);
  }
  return finalizeElasticAnalysis(prepared, byCombo);
}


export function finalizeElasticAnalysis(prepared, byCombo = {}, options = {}) {
  const { output, model, validation, pDeltaMethod, combos } = prepared;
  if (prepared.terminal) return withAudit(output);
  output.byCombo = byCombo;
  output.envelope = options.envelopeOverride || makeEnvelope(output.byCombo, combos);
  if (options.combinationStorage) output.combinationStorage = options.combinationStorage;
  output.combinationCompleteness = buildCombinationCompleteness(output.byCombo, combos, output.envelope);
  if (pDeltaMethod !== 'off') {
    output.pDelta = options.pDeltaOverride
      ? validateDirectPDeltaOverride(options.pDeltaOverride, pDeltaMethod, combos)
      : analyzePDeltaCombinations(model, combos, { pDeltaMethod });
  }
  if (model.analysisSettings?.responseSpectrum?.enabled !== false) {
    output.dynamics = analyzeDynamics(model);
  }
  if (pDeltaMethod === 'off') {
    output.pDeltaDesignScreening = buildPDeltaDesignSummary(
      model,
      combos,
      firstOrderPDeltaDesignInputs(options.pDeltaScreeningByCombo || byCombo),
      { ...(model.analysisSettings || {}), pDeltaMethod: 'off' },
    );
  }
  const femQualification = summarizeShellNumericalQualification(output.byCombo);
  const equivalentShellCount = Number(prepared.canonicalBase?.shellAssembly?.equivalentShellCount) || 0;
  const shellBlockers = [...new Set([
    ...femQualification.blockers,
    ...(equivalentShellCount > 0 ? ['EQUIVALENT_SHELL_PRELIMINARY_ONLY'] : []),
  ])];
  const shellNumericalQualification = {
    ...femQualification,
    status: shellBlockers.length ? 'blocked' : 'qualified',
    designTransferAllowed: shellBlockers.length === 0,
    blockers: shellBlockers,
    equivalentShellCount,
  };
  output.shellFemQualification = shellNumericalQualification;
  output.equivalentShellScope = prepared.canonicalBase?.shellAssembly?.equivalentShellScope || null;
  const shellDesignEligible = shellNumericalQualification.designTransferAllowed === true;
  const directAnalysisQualified = output.pDelta?.method === 'direct'
    && output.pDelta?.ok === true
    && output.combinationCompleteness.allComplete
    && (output.pDelta?.summary?.envelope?.complete
      ?? envelopeCompleteFor(output.pDelta.envelope, combos).complete);
  const directDesignEligible = directAnalysisQualified
    && output.pDelta?.designEligibility?.eligible === true
    && shellDesignEligible;
  const linearDesignEligible = output.combinationCompleteness.allComplete
    && output.pDeltaDesignScreening?.designEligibility?.eligible !== false
    && shellDesignEligible;
  const designEligible = pDeltaMethod === 'direct'
    ? directDesignEligible
    : pDeltaMethod === 'off'
      ? linearDesignEligible
      : false;
  const designLimitationCodes = pDeltaMethod === 'direct'
    ? Array.from(new Set(output.pDelta?.designEligibility?.limitationCodes || []))
    : [];
  const designResultSet = directDesignEligible
    ? output.pDelta.envelope
    : pDeltaMethod === 'off' && designEligible
      ? output.envelope
      : blockedDesignResultSet();
  output.design = runDesignChecks(model, output, {
    resultSet: designResultSet,
  });
  output.design.analysisSource = directAnalysisQualified
    ? directDesignEligible
      ? 'direct-pdelta-envelope'
      : 'blocked-direct-pdelta-design-gate'
    : pDeltaMethod === 'off' && output.combinationCompleteness.allComplete
      ? designEligible
        ? 'linear-static-envelope'
        : 'blocked-first-order-pdelta-screening'
      : pDeltaMethod === 'legacy'
        ? 'blocked-legacy-pdelta-comparison-only'
        : 'blocked-incomplete-analysis';
  output.design.pDeltaTransfer = output.pDelta
    ? output.pDelta.designEligibility
    : { eligible: false, status: 'not-requested', reason: 'PDELTA_OFF' };
  output.designEligibility = designEligible
    ? {
        eligible: true,
        status: designLimitationCodes.length ? 'qualified-with-limitation' : 'qualified',
        reason: null,
        limitationCodes: designLimitationCodes,
        source: output.design.analysisSource,
      }
    : {
        eligible: false,
        status: 'blocked',
        source: output.design.analysisSource,
        reason: !shellDesignEligible
          ? shellNumericalQualification.blockers[0]
          : pDeltaMethod === 'direct' && !directDesignEligible
          ? output.pDelta?.designEligibility?.reason || 'DIRECT_PDELTA_COMBINATIONS_INCOMPLETE'
          : pDeltaMethod === 'legacy'
            ? output.pDelta?.designEligibility?.reason || 'LEGACY_PDELTA_DESIGN_BLOCKED'
            : output.pDeltaDesignScreening?.designEligibility?.reason || 'STATIC_COMBINATIONS_INCOMPLETE',
      };
  output.design.eligibility = output.designEligibility;
  output.design.designBlocked = !designEligible;
  output.design.designQualified = designEligible;
  output.design.comparisonOnly = pDeltaMethod === 'legacy';
  if (!designEligible) {
    output.design.ok = false;
    output.design.summary.ok = false;
  }

  if (!output.combinationCompleteness.allComplete) {
    validation.errors.push({
      code: 'INCOMPLETE_LOAD_COMBINATIONS',
      message: `Not every requested load combination produced a complete qualified result: ${output.combinationCompleteness.failedComboIds.join(', ')}.`,
      target: output.combinationCompleteness.failedComboIds.join(','),
    });
    output.ok = false;
  }

  if (pDeltaMethod === 'direct' && !output.pDelta?.ok) {
    validation.errors.push({
      code: output.pDelta?.reason || 'DIRECT_PDELTA_FAILED',
      message: 'The requested Direct P-Delta analysis did not produce a qualified converged result.',
      target: 'analysisSettings.pDeltaMethod',
    });
    output.ok = false;
  }

  output.analysisEligibility = {
    eligible: output.ok && (pDeltaMethod !== 'direct' || directAnalysisQualified),
    status: output.ok && (pDeltaMethod !== 'direct' || directAnalysisQualified) ? 'qualified' : 'blocked',
    reason: output.ok
      ? null
      : pDeltaMethod === 'direct' && !directAnalysisQualified
        ? output.pDelta?.designEligibility?.reason || 'DIRECT_PDELTA_COMBINATIONS_INCOMPLETE'
        : output.combinationCompleteness.allComplete
          ? validation.errors.at(-1)?.code || 'ANALYSIS_NOT_QUALIFIED'
          : 'INCOMPLETE_LOAD_COMBINATIONS',
  };

  return withAudit(output);
}

