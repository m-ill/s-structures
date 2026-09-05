import { buildBaseShearScaleTrace } from './rsa/baseShearScale.js';
import { buildDirectionalCombinationTrace } from './rsa/directional.js';
import { buildMassParticipationTrace } from './rsa/massParticipation.js';
import { buildSignedResponseStrategy } from './rsa/signedResponse.js';
import { buildStoryCentersTrace } from './story/centers.js';
import { buildStoryDriftTrace } from './story/drift.js';
import { buildStoryOverturningTrace } from './story/overturning.js';
import { buildStoryShearTrace } from './story/shear.js';
import { buildDiaphragmLoadPathForces } from './diaphragm/forces.js';

export const PHASE6_M4_RESULT_TRACE_VERSION = 'p6-m4-rsa-diaphragm-story-trace-v1';

export function buildPhase6M4ResultTrace(model = {}, analysis = {}, options = {}) {
  const dynamics = analysis?.dynamics || {};
  const rsa = dynamics.rsa || null;
  const analysisCaseId = options.analysisCaseId || rsa?.provenance?.analysisCaseId || null;
  const massParticipation = buildMassParticipationTrace(dynamics, model);
  const hasExplicitScalingInput = options.directionMinima != null
    || options.minimumBaseShear != null
    || Object.hasOwn(options, 'designBaseShear');
  const hasEmbeddedScaling = Boolean(rsa?.baseShearScaling);
  const scalingOverrideConflict = hasExplicitScalingInput && hasEmbeddedScaling;
  const baseShearScaling = scalingOverrideConflict
    ? withScalingOverrideConflict(rsa.baseShearScaling)
    : !hasExplicitScalingInput && rsa?.baseShearScaling
      ? rsa.baseShearScaling
      : buildBaseShearScaleTrace({
          rsa: hasExplicitScalingInput ? withUnscaledBaseShear(rsa) : rsa,
          directionMinima: options.directionMinima || options.minimumBaseShear || {},
          designBaseShear: options.designBaseShear,
          analysisCaseId,
        });
  const scalingEnabled = baseShearScaling.application?.enabled !== false;
  const rsaScaleFactors = Object.fromEntries(baseShearScaling.rows
    .map((row) => [
      row.direction,
      Number.isFinite(Number(row.appliedScaleFactor)) && Number(row.appliedScaleFactor) > 0
        ? Number(row.appliedScaleFactor)
        : scalingEnabled && Number.isFinite(Number(row.scaleFactor)) && Number(row.scaleFactor) > 0
          ? Number(row.scaleFactor)
          : 1,
    ]));
  const directional = buildDirectionalCombinationTrace({
    method: options.directionalMethod || '100-30',
    criteriaModel: model,
    responses: directionalResponses(rsa),
    dimension: 'length',
    unit: rsa?.units?.length || rsa?.units?.displacement || model?.units?.length || 'm',
    source: 'rsa-combined-nodal-displacement',
    analysisCaseId,
    responseMethod: rsa?.method || null,
  });
  const signedResponse = buildSignedResponseStrategy({
    method: rsa?.method || 'SRSS',
    rsa,
    analysisCaseId,
    lateralCases: options.lateralCases || lateralCaseIds(model),
    accidentalBaseCases: options.accidentalBaseCases || [],
  });
  const storyOptions = {
    ...options,
    analysisCaseId,
    baseShearScaling,
    rsaScaleFactors,
  };
  const story = {
    drift: buildStoryDriftTrace(model, analysis, { ...storyOptions, ...(options.serviceability || {}) }),
    shear: buildStoryShearTrace(model, analysis, storyOptions),
    overturning: buildStoryOverturningTrace(model, analysis, storyOptions),
    centers: buildStoryCentersTrace(model),
  };
  const diaphragm = buildDiaphragmLoadPathForces(model, analysis);
  const memberForces = rsa?.memberForces || {
    status: 'unsupported',
    designBlocked: true,
    reason: 'RSA_MEMBER_FORCE_RECOVERY_UNAVAILABLE',
    rows: [],
  };
  const designBlocked = Boolean(
    memberForces.designBlocked
    || baseShearScaling.designBlocked
    || story.drift.designBlocked
    || story.shear.designBlocked
    || story.overturning.designBlocked,
  );
  return {
    version: PHASE6_M4_RESULT_TRACE_VERSION,
    correctnessVersion: 'p7-m9-modal-rsa-story-correctness-v1',
    status: designBlocked ? 'review-required' : 'available',
    designBlocked,
    dimensions: {
      modalTranslationVector: 'inverse-square-root-mass',
      modalRotationVector: 'inverse-length-square-root-mass',
      nodalDisplacement: 'length',
      nodalInertiaForce: 'force',
      baseShear: 'force',
      memberAxialShear: 'force',
      memberTorsionMoment: 'moment',
      storyDrift: 'length',
      storyShear: 'force',
      storyTorsion: 'moment',
      overturning: 'moment',
    },
    provenance: {
      source: 'analysis.dynamics.rsa',
      analysisCaseId,
      responseMethod: rsa?.method || null,
      staticCaseReferences: [],
    },
    modal: {
      massParticipation,
    },
    rsa: {
      baseShearScaling,
      directional,
      signedResponse,
      nodalRecovery: rsa?.nodalRecovery || null,
      memberForces,
      designTransferQualification: rsa?.designTransferQualification || memberForces.designTransferQualification || null,
    },
    story,
    diaphragm,
    warnings: collectWarnings(
      massParticipation,
      baseShearScaling,
      directional,
      signedResponse,
      memberForces,
      story.drift,
      story.shear,
      story.overturning,
      story.centers,
      diaphragm,
    ),
    summary: {
      modalStatus: massParticipation.status,
      rsaScaleMax: baseShearScaling.summary.maxScaleFactor,
      storyRowCount: story.shear.summary.rowCount,
      diaphragmForceRows: diaphragm.summary.rowCount,
      memberForceStatus: memberForces.status,
      memberForceDesignTransferEligible: memberForces.designTransferQualification?.eligible === true,
      staticStoryReferenceCount: story.shear.summary.staticReferenceCount,
      designBlocked,
      status: designBlocked
        ? 'review-required'
        : traceStatus([massParticipation.status, baseShearScaling.summary.status, story.shear.status]),
    },
  };
}

function directionalResponses(rsa) {
  const combined = rsa?.combined || {};
  const method = String(rsa?.method || 'SRSS').toUpperCase();
  return {
    x: selectedDisplacement(combined.x, method),
    y: selectedDisplacement(combined.y, method),
    z: selectedDisplacement(combined.z, method),
  };
}

function selectedDisplacement(row, method) {
  if (Number.isFinite(Number(row?.displacement))) return Number(row.displacement);
  const key = {
    CQC: 'cqcDisplacement',
    ABS: 'absDisplacement',
    NRC10: 'nrc10Displacement',
    SRSS: 'srssDisplacement',
  }[method] || 'srssDisplacement';
  const selected = row?.[key];
  if (Number.isFinite(Number(selected))) return Number(selected);
  return Number(row?.maxModalDisplacement) || 0;
}

function lateralCaseIds(model = {}) {
  return (model.loadCases || [])
    .filter((item) => /wind|seismic|earthquake|lateral/i.test(String(item.type || item.name || item.id || '')))
    .map((item) => item.id);
}

function collectWarnings(...blocks) {
  return [...new Set(blocks.flatMap((block) => {
    if (!block) return [];
    if (Array.isArray(block.warnings)) return block.warnings;
    if (block.warning) return [block.warning];
    return [];
  }).filter(Boolean))];
}

function traceStatus(statuses) {
  if (statuses.includes('unsupported') || statuses.includes('NG') || statuses.includes('STRONG_WARNING')) return 'review-required';
  if (statuses.includes('partial')) return 'review-required';
  if (statuses.includes('WARNING')) return 'warning';
  return 'available';
}

function withUnscaledBaseShear(rsa) {
  if (!rsa?.baseShearScaling?.rows?.length) return rsa;
  const beforeByDirection = Object.fromEntries(rsa.baseShearScaling.rows.map((row) => [
    row.direction,
    row.beforeBaseShear,
  ]));
  return {
    ...rsa,
    combined: Object.fromEntries(Object.entries(rsa.combined || {}).map(([direction, row]) => {
      const before = beforeByDirection[direction];
      if (!Number.isFinite(Number(before))) return [direction, row];
      return [direction, {
        ...row,
        baseShear: Number(before),
        rsaBaseShear: Number(before),
      }];
    })),
  };
}

function withScalingOverrideConflict(trace) {
  const warning = 'RSA_SCALING_OVERRIDE_CONFLICT';
  return {
    ...trace,
    warnings: [...new Set([...(trace?.warnings || []), warning])],
    override: {
      requested: true,
      applied: false,
      reason: warning,
    },
  };
}
