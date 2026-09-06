import { materialOf, sectionOf } from '../core/catalogs.js';
import { resolveCriterion } from '../core/analysisCriteria.js';
import { buildMassSourceTrace } from '../loads/loadsV2.js';
import { assembleStiffness3D } from '../solver/linear3dAssembly.js';
import { effectiveSectionMaterial } from '../solver/linear3dPost.js';
import { taperedMemberMass } from '../solver/taperedMember.js';
import { DYNAMIC_COMPLETENESS_VERSION } from './elasticCompleteness.js';
import {
  combineRsaMemberForces,
  createRsaMemberRecoveryContext,
  recoverModalMemberForces,
  summarizeRsaMemberForces,
} from '../results/rsa/memberForces.js';
import { applyBaseShearScaling } from '../results/rsa/baseShearScale.js';
import { buildModalConstraintDomain } from './modalDiaphragm.js';
import { buildCanonicalAnalysisDomain } from '../solver/domain/canonicalDomain.js';
import { buildDomainAdapterIdentity } from '../solver/domain/compatibility.js';
import { createCscFromTriplets } from '../compute/sparse/matrix.js';
import {
  createSymmetricSparseOperator,
  createSymmetricSparseOperatorFromDense,
} from '../compute/eigen/sparseOperator.js';
import { solveRequestedGeneralizedEigen } from '../compute/eigen/requestedModes.js';
import { condenseMasslessDynamicDofs } from './dynamicCondensation.js';
import { combineModalResponseValues, combineModalScalars, normalizeModalCombinationMethod } from './modalCombination.js';

export { combineModalResponseValues } from './modalCombination.js';
import {
  addDirectNodeMass6Dof,
  buildSixDofMassAudit,
} from './mass6dof.js';

const DOF_DIR = ['x', 'y', 'z'];

export const MODAL_RSA_RECOVERY_VERSION = 'p7-m9-modal-rsa-recovery-v1';
export const PRESTRESSED_MODAL_VERSION = 'p10-m7-prestressed-modal-v1';

const MODAL_DIMENSIONS = Object.freeze({
  eigenvalue: 'inverse-time-squared',
  omega: 'inverse-time',
  frequency: 'inverse-time',
  period: 'time',
  mass: 'mass',
  modeVector: 'inverse-square-root-mass',
  modeVectorTranslation: 'inverse-square-root-mass',
  modeVectorRotation: 'inverse-length-square-root-mass',
  displayVector: 'dimensionless',
  participationFactor: 'square-root-mass',
  massRatio: 'dimensionless',
});

const RSA_DIMENSIONS = Object.freeze({
  spectralAcceleration: 'acceleration',
  generalizedDisplacement: 'length-square-root-mass',
  nodalDisplacement: 'length',
  nodalInertiaForce: 'force',
  baseShear: 'force',
  memberAxialForce: 'force',
  memberShearForce: 'force',
  memberTorsion: 'moment',
  memberBendingMoment: 'moment',
  scaleFactor: 'dimensionless',
});

export function analyzeDynamics(model, options = {}) {
  const domain = buildCanonicalAnalysisDomain(model, {
    analysisCase: options.analysisCase || null,
    strictCapabilities: false,
  });
  const domainIdentity = buildDomainAdapterIdentity(domain, 'modal');
  if (!domain.ok) return blockedModalResult(domain.reason || 'CANONICAL_DOMAIN_INVALID', {
    analysisDomain: domainIdentity,
  });
  model = domain.solverModel;
  const settings = { ...(model.analysisSettings || {}), ...(options || {}) };
  const modeCount = Math.max(1, settings.modalModeCount | 0 || 6);
  const elasticSystem = assembleStiffness3D(model.nodes || [], model.members || [], {
    model,
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
    shells: domain.shellAssembly?.femElements || [],
    shellCriteria: {
      drillingAlpha: resolveCriterion(model, 'shell.drillingAlpha', 1e-5),
      drillingStiffnessRatioMax: resolveCriterion(model, 'shell.drillingStiffnessRatioMax', 1e-4),
      warpTol: resolveCriterion(model, 'shell.warpTol', 1e-2),
    },
  });
  if (!elasticSystem.ok) return blockedModalResult(elasticSystem.reason || 'NO_STIFFNESS', {
    analysisDomain: domainIdentity,
  });
  const shellFemQualification = summarizeModalShellQualification(elasticSystem.shellData || []);
  const stiffnessBasis = settings.stiffnessBasis || (settings.prestressed ? null : 'elastic-Ke');
  const prestressRequested = settings.prestressed === true || settings.tangentStiffness != null || settings.gravityCombinationId != null;
  if (prestressRequested && stiffnessBasis !== 'gravity-tangent-Kt') {
    return {
      version: PRESTRESSED_MODAL_VERSION,
      ok: false,
      status: 'blocked',
      reason: 'PRESTRESSED_STIFFNESS_BASIS_REQUIRED',
      designBlocked: true,
      designBlockers: ['PRESTRESSED_STIFFNESS_BASIS_REQUIRED'],
      provenance: { stiffnessBasis: stiffnessBasis || null, gravityCombinationId: settings.gravityCombinationId || null },
      modes: [],
      rsa: null,
      analysisDomain: domainIdentity,
    };
  }
  const tangentStiffness = settings.tangentStiffness;
  if (prestressRequested && (!Array.isArray(tangentStiffness) || tangentStiffness.length !== elasticSystem.ndof)) {
    return {
      version: PRESTRESSED_MODAL_VERSION,
      ok: false,
      status: 'blocked',
      reason: 'PRESTRESSED_TANGENT_STIFFNESS_REQUIRED',
      designBlocked: true,
      designBlockers: ['PRESTRESSED_TANGENT_STIFFNESS_REQUIRED'],
      provenance: { stiffnessBasis, gravityCombinationId: settings.gravityCombinationId || null },
      modes: [],
      rsa: null,
      analysisDomain: domainIdentity,
    };
  }
  const system = tangentStiffness ? { ...elasticSystem, K: tangentStiffness } : elasticSystem;

  const massSourceSpec = settings.massSource || null;
  const massSourceTrace = massSourceSpec
    ? buildMassSourceTrace(model, massSourceSpec, { shellData: elasticSystem.shellData || [] })
    : null;
  const mass = buildLumpedMass(model, system, massSourceSpec, massSourceTrace);
  const constraintDomain = buildModalConstraintDomain(model, system, mass);
  const modalSystem = constraintDomain.system;
  const physicalModalDofs = system.free.filter((dof) => mass[dof] > 0);
  const modalDofs = modalSystem.free.filter((dof) => (
    constraintDomain.applied ? constraintDomain.massMatrix[dof]?.[dof] > 0 : mass[dof] > 0
  ));
  if (!modalDofs.length) return blockedModalResult('NO_MASS', {
    analysisDomain: domainIdentity,
    shellFemQualification,
  });

  const coordinateDofs = modalSystem.free.slice();
  const residualDofs = coordinateDofs.filter((dof) => !modalDofs.includes(dof));
  let condensation = implicitSparseCondensation(modalDofs, residualDofs);
  let stiffnessOperator;
  let massOperator;
  try {
    stiffnessOperator = createSymmetricSparseOperatorFromDense(modalSystem.K, {
      id: 'modal-elastic-stiffness',
      matrixClass: 'spd',
      indices: coordinateDofs,
    });
    massOperator = constraintDomain.applied
      ? createSymmetricSparseOperatorFromDense(constraintDomain.massMatrix, {
          id: 'modal-generalized-mass',
          matrixClass: 'positive-semidefinite',
          indices: coordinateDofs,
        })
      : diagonalMassOperator(coordinateDofs.map((dof) => mass[dof]));
  } catch (error) {
    return failedModalAnalysis({
      model,
      system: elasticSystem,
      mass,
      massSourceTrace,
      condensation: { ...condensation, status: 'failed', reason: error.code || 'MODAL_OPERATOR_ASSEMBLY_FAILED' },
      modes: [],
      reason: error.code || 'MODAL_OPERATOR_ASSEMBLY_FAILED',
      analysisDomain: domainIdentity,
    });
  }
  const eig = solveRequestedGeneralizedEigen({
    primary: stiffnessOperator,
    secondary: massOperator,
    modeCount: Math.min(modeCount, modalDofs.length),
    residualTolerance: settings.modalResidualTolerance || settings.eigenResidualTolerance || 1e-8,
    eigenTolerance: settings.modalEigenTolerance || settings.eigenTolerance,
    maxIterations: settings.modalMaxIterations || settings.eigenMaxIterations,
    maximumProjectionDimension: settings.modalProjectionDimension,
    signal: settings.signal,
    onProgress: settings.onEigenProgress,
  });
  if (!eig.ok) {
    const singularResidualDomain = eig.reason === 'PRIMARY_OPERATOR_NOT_POSITIVE_DEFINITE' && residualDofs.length > 0;
    const reason = singularResidualDomain ? 'RESIDUAL_DOF_BACK_SUBSTITUTION_FAILED' : eig.reason;
    condensation = {
      ...condensation,
      status: 'failed',
      reason,
      transformationPreserved: false,
    };
    return failedModalAnalysis({
      model,
      system,
      mass,
      massSourceTrace,
      condensation,
      modes: [],
      reason,
      analysisDomain: domainIdentity,
      eigen: eigenSummary(eig),
    });
  }
  const modes = eig.modes
    .map((eigenMode) => modeFromEigen({
      lambda: eigenMode.eigenvalue,
      eigenvector: eigenMode.vector,
      coordinateDofs,
      modalDofs,
      physicalModalDofs,
      physicalMass: mass,
      nodes: model.nodes || [],
      coordinateStiffness: modalSystem.K,
      condensation,
      coordinateDofCount: modalSystem.ndof,
      expandVector: constraintDomain.expandVector,
    }))
    .filter((mode) => mode && Number.isFinite(mode.frequencyHz) && mode.frequencyHz > 0)
    .sort((a, b) => a.omega - b.omega)
    .slice(0, modeCount)
    .map((mode, index) => ({
      ...mode,
      id: `MODE${index + 1}`,
      index: index + 1,
      units: modalUnits(model.units),
      provenance: {
        source: 'sparse-requested-mode-generalized-eigen-solution',
        modeId: `MODE${index + 1}`,
        normalization: 'mass-normalized',
        stiffnessBasis: prestressRequested ? 'gravity-tangent-Kt' : 'elastic-Ke',
        staticCaseReferences: prestressRequested && settings.gravityCombinationId ? [settings.gravityCombinationId] : [],
      },
    }));

  const totalMass = totalDirectionalMass(mass, system.free);
  for (const mode of modes) {
    mode.participation = participation(mode.vector, physicalModalDofs, mass, totalMass);
  }

  const condensationReport = condensationSummary(condensation, modes);
  if (modes.length > 0 && condensationReport.status !== 'available') {
    return failedModalAnalysis({
      model,
      system,
      mass,
      massSourceTrace,
      condensation,
      condensationReport,
      modes,
      reason: condensationReport.reason || 'RESIDUAL_DOF_RECOVERY_FAILED',
      analysisDomain: domainIdentity,
    });
  }

  const rsaScalingPolicy = {
    enabled: resolveCriterion(model, 'rsa.applyBaseShearScaling', true),
    minimumBaseShear: settings.rsa?.minimumBaseShear
      ?? settings.responseSpectrum?.minimumBaseShear
      ?? {},
  };
  const rsa = settings.responseSpectrum?.enabled === false
    ? null
    : runResponseSpectrum(modes, physicalModalDofs, mass, totalMass, settings.responseSpectrum || {}, {
      nodes: model.nodes || [],
      units: model.units || {},
      modalAnalysisType: prestressRequested ? 'prestressed_modal_lumped_mass' : 'modal_lumped_mass',
      model,
      system,
      diaphragmAssembly: constraintDomain.summary,
      members: model.members || [],
      stationCount: Math.max(21, settings.memberStations | 0 || settings.rsaMemberStations | 0 || 21),
      baseShearScaling: rsaScalingPolicy,
      stiffnessBasis: prestressRequested ? 'gravity-tangent-Kt' : 'elastic-Ke',
      gravityCombinationId: prestressRequested ? settings.gravityCombinationId || null : null,
    });

  const result = {
    version: prestressRequested ? PRESTRESSED_MODAL_VERSION : MODAL_RSA_RECOVERY_VERSION,
    ok: modes.length > 0,
    type: prestressRequested ? 'prestressed_modal_lumped_mass' : 'modal_lumped_mass',
    dimensions: MODAL_DIMENSIONS,
    units: modalUnits(model.units),
    provenance: {
      source: prestressRequested ? 'direct-pdelta-gravity-tangent-and-lumped-mass' : 'assembled-elastic-stiffness-and-lumped-mass',
      stiffnessBasis: prestressRequested ? 'gravity-tangent-Kt' : 'elastic-Ke',
      gravityCombinationId: prestressRequested ? settings.gravityCombinationId || null : null,
      normalization: 'mass-normalized',
      staticCaseReferences: prestressRequested && settings.gravityCombinationId ? [settings.gravityCombinationId] : [],
      diaphragmAssembly: constraintDomain.summary,
      analysisDomain: domainIdentity,
    },
    condensation: condensationReport,
    diaphragmAssembly: constraintDomain.summary,
    analysisDomain: domainIdentity,
    eigen: eigenSummary(eig),
    shellFemQualification,
    qualification: shellFemQualification?.designTransferAllowed === false ? 'blocked' : 'candidate',
    designBlocked: shellFemQualification?.designTransferAllowed === false,
    designBlockReason: shellFemQualification?.blockers?.[0] || null,
    designBlockers: shellFemQualification?.blockers || [],
    modes,
    mass: {
      total: totalMass,
      modalDofCount: modalDofs.length,
      freeDofCount: modalSystem.free.length,
      fullFreeDofCount: system.free.length,
      source: massSourceTrace ? 'analysisSettings.massSource' : 'node-member-and-shell-mass',
      massSource: massSourceTrace,
      dimension: 'mass',
      unit: modalUnits(model.units).mass,
      sixDof: buildSixDofMassAudit(model, mass, { massSourceUsed: Boolean(massSourceSpec) }),
      diaphragm: constraintDomain.massAudit,
    },
    rsa,
    prestress: prestressRequested ? settings.prestressTrace || null : null,
  };
  Object.defineProperty(result, 'dynamicSystem', {
    enumerable: false,
    value: buildDirectDynamicSystem(model, elasticSystem, modalSystem, constraintDomain, mass, modalDofs, residualDofs),
  });
  return result;
}

function summarizeModalShellQualification(shellData = []) {
  if (!shellData.length) return null;
  const numericalBlockers = [];
  const designBlockers = [];
  const failedElementIds = [];
  for (const item of shellData) {
    const qualification = item.built?.qualification || {};
    const status = String(qualification.status || '').toLowerCase();
    const explicit = Array.isArray(item.built?.designEligibility?.reasonCodes)
      ? item.built.designEligibility.reasonCodes.filter(Boolean)
      : [];
    if (status !== 'pass') {
      failedElementIds.push(item.id);
      numericalBlockers.push(qualification.reason || 'SHELL_NUMERICAL_QUALIFICATION_REQUIRED');
    }
    if (item.built?.designEligibility?.allowed !== true || explicit.length > 0) {
      designBlockers.push(...(explicit.length
        ? explicit
        : [qualification.reason || 'SHELL_DESIGN_TRANSFER_QUALIFICATION_REQUIRED']));
    }
  }
  const blockers = [...new Set([...numericalBlockers, ...designBlockers])];
  return {
    version: 'p10-m9-modal-shell-qualification-v1',
    elementCount: shellData.length,
    formulations: [...new Set(shellData.map((item) => item.formulation))],
    numericalQualificationStatus: numericalBlockers.length ? 'BLOCKED' : 'PASS',
    designTransferAllowed: blockers.length === 0,
    failedElementIds,
    blockers,
  };
}

function blockedModalResult(reason, extras = {}) {
  return {
    version: MODAL_RSA_RECOVERY_VERSION,
    ok: false,
    status: 'blocked',
    reason,
    qualification: 'blocked',
    designBlocked: true,
    designBlockReason: reason,
    designBlockers: [reason],
    modes: [],
    rsa: null,
    ...extras,
  };
}

function buildDirectDynamicSystem(model, elasticSystem, modalSystem, constraintDomain, physicalMass, modalDofs, residualDofs) {
  const free = modalSystem.free.slice();
  const stiffness = free.map((row) => free.map((column) => modalSystem.K[row][column]));
  const fullMass = constraintDomain.applied
    ? constraintDomain.massMatrix
    : physicalMass.map((value, index) => physicalMass.map((_other, column) => index === column ? value : 0));
  const mass = free.map((row) => free.map((column) => fullMass[row][column]));
  const condensation = condenseMasslessDynamicDofs({
    stiffness: modalSystem.K,
    mass: fullMass,
    activeDofs: modalDofs,
    residualDofs,
  });
  const forces = {};
  for (let direction = 0; direction < 3; direction += 1) {
    const physicalForce = physicalMass.map((value, dof) => dof % 6 === direction ? value : 0);
    const reducedForce = constraintDomain.applied
      ? Array.from({ length: modalSystem.ndof }, (_, column) => constraintDomain.map.rows.reduce(
          (sum, entries, fullDof) => sum + (entries.find(([item]) => item === column)?.[1] || 0) * physicalForce[fullDof],
          0,
        ))
      : physicalForce;
    forces[DOF_DIR[direction]] = free.map((dof) => reducedForce[dof] || 0);
  }
  return {
    stiffness,
    mass,
    freeDofs: free,
    forceVectors: forces,
    expandVector: (values) => {
      const coordinate = new Array(modalSystem.ndof).fill(0);
      free.forEach((dof, index) => { coordinate[dof] = Number(values[index]) || 0; });
      return constraintDomain.expandVector(coordinate);
    },
    fullDofCount: elasticSystem.ndof,
    reducedDofCount: free.length,
    projectModeVector: (mode) => free.map((dof) => Number(mode?.coordinateVector?.[dof]) || 0),
    integration: {
      stiffness: condensation.stiffness,
      mass: condensation.mass,
      forceVectors: Object.fromEntries(Object.entries(forces).map(([direction, values]) => {
        const coordinate = new Array(modalSystem.ndof).fill(0);
        free.forEach((dof, index) => { coordinate[dof] = Number(values[index]) || 0; });
        return [direction, condensation.reduceForce(coordinate)];
      })),
      expandVector: (values) => constraintDomain.expandVector(condensation.expandVector(values)),
      projectModeVector: (mode) => condensation.projectCoordinateVector(mode?.coordinateVector),
      reducedDofCount: modalDofs.length,
    },
    condensation: {
      version: condensation.version,
      method: condensation.method,
      activeDofCount: modalDofs.length,
      residualDofCount: residualDofs.length,
      condensationHash: condensation.condensationHash,
    },
    units: modalUnits(model.units),
  };
}

function failedModalAnalysis({
  model,
  system,
  mass,
  massSourceTrace,
  condensation,
  condensationReport = null,
  modes = [],
  reason,
  analysisDomain = null,
  eigen = null,
}) {
  const report = condensationReport || condensationSummary(condensation, modes);
  return {
    version: MODAL_RSA_RECOVERY_VERSION,
    ok: false,
    status: 'failed',
    reason,
    analysisDomain,
    eigen,
    designBlocked: true,
    designBlockReason: reason,
    designBlockers: [reason],
    qualification: 'blocked',
    type: 'modal_lumped_mass',
    dimensions: MODAL_DIMENSIONS,
    units: modalUnits(model.units),
    provenance: {
      source: 'assembled-elastic-stiffness-and-lumped-mass',
      normalization: 'mass-normalized',
      staticCaseReferences: [],
      analysisDomain,
    },
    condensation: report,
    modes,
    mass: {
      total: totalDirectionalMass(mass, system.free),
      modalDofCount: condensation.modalDofs.length,
      freeDofCount: system.free.length,
      source: massSourceTrace ? 'analysisSettings.massSource' : 'node-and-member-mass',
      massSource: massSourceTrace,
      dimension: 'mass',
      unit: modalUnits(model.units).mass,
    },
    rsa: null,
  };
}

export function buildLumpedMass(model, system, massSource = null, preparedTrace = null) {
  const mass = new Array(system.ndof || (model.nodes || []).length * 6).fill(0);
  const idx = system.idx || Object.fromEntries((model.nodes || []).map((node, i) => [node.id, i]));

  if (massSource) {
    const trace = preparedTrace || buildMassSourceTrace(model, massSource, { shellData: system.shellData || [] });
    for (const row of trace.rows || []) {
      const base = idx[row.node] * 6;
      if (!Number.isFinite(base)) continue;
      const vector = Array.isArray(row.massVector)
        ? row.massVector
        : [row.mass, row.mass, row.mass];
      for (let i = 0; i < 3; i += 1) mass[base + i] += Math.max(0, Number(vector[i]) || 0);
    }
    addDirectNodeMass6Dof(mass, model.nodes || [], idx, { translationOwnedElsewhere: true });
  } else {
    for (const member of model.members || []) {
      if (member.generated === true || member.massless === true) continue;
      const md = system.memData?.[member.id];
      if (!md) continue;
      const { section, material } = effectiveSectionMaterial((id) => sectionOf(model, id), (id) => materialOf(model, id), member);
      const m = md.taper
        ? taperedMemberMass(material, md.taper, md.ax.L)
        : Math.max(0, Number(material.density || 0) * Number(section.A || 0) * Number(md.ax.L || 0));
      if (!(m > 0)) continue;
      for (const nodeId of [member.n1, member.n2]) {
        const base = idx[nodeId] * 6;
        for (let i = 0; i < 3; i += 1) mass[base + i] += m / 2;
      }
    }
    for (const shell of system.shellData || []) {
      const density = Math.max(0, Number(shell.built?.material?.density) || 0);
      const thickness = Math.max(0, Number(shell.built?.thickness) || 0);
      const area = Math.max(0, Number(shell.built?.area) || 0);
      const elementMass = density * thickness * area;
      if (!(elementMass > 0)) continue;
      const perNode = elementMass / shell.nodeIds.length;
      for (const nodeId of shell.nodeIds) {
        const base = idx[nodeId] * 6;
        if (!Number.isFinite(base)) continue;
        for (let i = 0; i < 3; i += 1) mass[base + i] += perNode;
      }
    }
    addDirectNodeMass6Dof(mass, model.nodes || [], idx);
  }
  return mass;
}

export function runResponseSpectrum(modes, modalDofs, mass, totalMass, spectrum = {}, context = {}) {
  const directions = [...new Set((spectrum.directions || ['x', 'y'])
    .map((value) => String(value).toLowerCase())
    .filter((value) => DOF_DIR.includes(value)))];
  const method = normalizedCombinationMethod(spectrum.method);
  const dampingRatio = finiteNumber(spectrum.dampingRatio, 0.05);
  const nodes = context.nodes || spectrum.nodes || [];
  const units = rsaUnits(context.units || spectrum.units);
  const provenance = {
    source: 'modal-response-spectrum-recovery',
    analysisCaseId: context.analysisCaseId || spectrum.analysisCaseId || spectrum.caseId || null,
    analysisCaseKind: 'responseSpectrum',
    resultPath: context.resultPath || 'analysis.dynamics.rsa',
    modalAnalysisType: context.modalAnalysisType || 'modal_lumped_mass',
    modalNormalization: 'mass-normalized',
    responseMethod: method,
    modeIds: (modes || []).map((mode) => mode.id),
    stiffnessBasis: context.stiffnessBasis || 'elastic-Ke',
    gravityCombinationId: context.gravityCombinationId || null,
    staticCaseReferences: context.gravityCombinationId ? [context.gravityCombinationId] : [],
  };
  const memberRecoveryContext = createRsaMemberRecoveryContext(context);
  const modal = [];
  let combined = {};

  for (const direction of directions) {
    const dirIndex = DOF_DIR.indexOf(direction);
    const responses = (modes || []).map((mode) => recoverModalResponse({
      mode,
      direction,
      dirIndex,
      modalDofs,
      mass,
      totalDirectionalMass: totalMass[dirIndex] || 0,
      spectrum,
      nodes,
      units,
      provenance,
      memberRecoveryContext,
    }));
    modal.push({
      direction,
      method: 'per-mode-signed-response',
      responses,
      dimensions: RSA_DIMENSIONS,
      units,
      provenance: { ...provenance, direction, responseMethod: 'per-mode' },
    });
    combined[direction] = combineDirectionResponses({
      direction,
      dirIndex,
      responses,
      modalDofs,
      totalDirectionalMass: totalMass[dirIndex] || 0,
      method,
      dampingRatio,
      nodes,
      units,
      provenance,
      memberRecoveryContext,
    });
  }

  const scalingPolicy = context.baseShearScaling || {
    enabled: spectrum.applyBaseShearScaling !== false,
    minimumBaseShear: spectrum.minimumBaseShear || {},
  };
  const scaling = applyBaseShearScaling({
    method,
    units,
    provenance,
    spectrum: { dampingRatio },
    modal,
    combined,
  }, {
    enabled: scalingPolicy.enabled,
    directionMinima: scalingPolicy.minimumBaseShear,
    analysisCaseId: provenance.analysisCaseId,
  });
  combined = scaling.combined;

  const nodalAvailable = modal.length > 0 && modal.every((row) => (
    row.responses.length > 0
    && row.responses.every((response) => response.recoveryStatus === 'available')
  ));
  const nodalRecovery = {
    status: nodalAvailable ? 'available' : 'unsupported',
    designBlocked: !nodalAvailable,
    reason: nodalAvailable ? null : 'RSA_NODAL_RECOVERY_REQUIRES_MASS_NORMALIZED_MODE_VECTORS',
    scope: 'translational nodal displacement and inertia-force recovery',
    dimensions: {
      displacement: 'length',
      inertiaForce: 'force',
      baseShear: 'force',
    },
  };
  const memberForces = summarizeRsaMemberForces({
    combined,
    modal,
    recoveryContext: memberRecoveryContext,
    provenance,
    units,
  });
  const designBlocked = !nodalAvailable || memberForces.designBlocked || scaling.trace.designBlocked;
  const scalingBlocker = scaling.trace.rows.find((row) => row.designBlocked)?.reason || null;
  const designTransferQualification = {
    ...(memberForces.designTransferQualification || {}),
    status: designBlocked ? 'blocked' : 'qualified',
    eligible: !designBlocked && memberForces.designTransferQualification?.eligible === true,
    reason: !nodalAvailable
      ? nodalRecovery.reason
      : memberForces.designBlocked
        ? memberForces.designTransferQualification?.reason || 'RSA_MEMBER_FORCE_RECOVERY_UNQUALIFIED'
        : scalingBlocker,
  };

  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    recoveryVersion: MODAL_RSA_RECOVERY_VERSION,
    contract: buildResponseSpectrumContract(),
    status: designBlocked ? (nodalAvailable ? 'preliminary' : 'unsupported') : 'candidate',
    designBlocked,
    designBlockers: [...new Set([
      ...(!nodalAvailable ? ['RSA_NODAL_RECOVERY_UNSUPPORTED'] : []),
      ...(memberForces.designBlocked ? memberForces.blockers.map((item) => item.code) : []),
      ...(scaling.trace.designBlocked
        ? scaling.trace.rows.filter((row) => row.designBlocked).map((row) => row.reason)
        : []),
    ])],
    designTransferQualification,
    method,
    dimensions: RSA_DIMENSIONS,
    units,
    provenance: {
      ...provenance,
      baseShearScaling: scaling.trace.application,
    },
    review: buildResponseSpectrumReview({ method, modal, combined }),
    spectrum: {
      dampingRatio,
      scale: finiteNumber(spectrum.scale, 9.80665),
      points: spectrum.points || [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
      dimensions: { period: 'time', sa: 'acceleration-ratio', scale: 'acceleration' },
      units: { period: 's', sa: 'g-ratio', scale: units.acceleration },
    },
    nodalRecovery,
    memberForces,
    baseShearScaling: scaling.trace,
    modal,
    combined,
  };
}

function recoverModalResponse({
  mode,
  direction,
  dirIndex,
  modalDofs,
  mass,
  totalDirectionalMass: directionMass,
  spectrum,
  nodes,
  units,
  provenance,
  memberRecoveryContext,
}) {
  const participationItem = mode?.participation?.[direction] || {};
  const gamma = finiteNumber(participationItem.gamma, 0);
  const sa = spectralAcceleration(mode?.period, spectrum);
  const generalizedDisplacement = mode?.omega > 0 ? gamma * sa / (mode.omega ** 2) : 0;
  const hasModeVector = Array.isArray(mode?.vector) && mode.vector.length > 0;
  const vectorLength = Math.max(mass?.length || 0, hasModeVector ? mode.vector.length : 0);
  const displacementVector = hasModeVector
    ? Array.from({ length: vectorLength }, (_, dof) => finiteNumber(mode.vector[dof], 0) * generalizedDisplacement)
    : [];
  const inertiaForceVector = hasModeVector
    ? Array.from({ length: vectorLength }, (_, dof) => (
      finiteNumber(mass?.[dof], 0) * finiteNumber(mode.vector[dof], 0) * gamma * sa
    ))
    : [];
  const directionalDofs = (modalDofs || []).filter((dof) => dof % 6 === dirIndex);
  const displacement = hasModeVector
    ? Math.max(0, ...directionalDofs.map((dof) => Math.abs(displacementVector[dof] || 0)))
    : Math.abs(generalizedDisplacement);
  const baseShearComponentsVector = hasModeVector
    ? sumTranslationalComponents(inertiaForceVector)
    : [0, 0, 0];
  let baseShear = hasModeVector ? Math.abs(baseShearComponentsVector[dirIndex]) : null;
  let baseShearSource = hasModeVector ? 'sum-of-modal-nodal-inertia-forces' : null;
  if (!hasModeVector) {
    const effectiveMass = effectiveModalMass(participationItem, directionMass);
    if (effectiveMass != null) {
      baseShear = Math.abs(effectiveMass * sa);
      baseShearComponentsVector[dirIndex] = baseShear;
      baseShearSource = 'effective-modal-mass-times-spectral-acceleration';
    }
  }
  const responseProvenance = {
    ...provenance,
    direction,
    modeId: mode?.id || null,
    responseMethod: 'per-mode',
    spectrumPeriod: mode?.period ?? null,
    staticCaseReferences: [],
  };
  const nodalDisplacements = nodalVectorRows(
    nodes,
    displacementVector,
    'length',
    units.length,
    units.angle,
    responseProvenance,
  );
  const nodalInertiaForces = nodalVectorRows(
    nodes,
    inertiaForceVector,
    'force',
    units.force,
    units.moment,
    responseProvenance,
  );
  const memberForceRecovery = recoverModalMemberForces({
    mode,
    displacementVector,
    direction,
    provenance: responseProvenance,
    units,
    recoveryContext: memberRecoveryContext,
  });

  return {
    mode: mode?.id,
    modeIndex: mode?.index ?? null,
    period: mode?.period,
    omega: mode?.omega,
    gamma,
    sa,
    generalizedDisplacement,
    displacement,
    displacementVector,
    nodalDisplacements,
    nodalDisplacementByNode: vectorRowsByNode(nodalDisplacements),
    nodalRotationByNode: vectorRowsByNode(nodalDisplacements, 'rotation'),
    inertiaForceVector,
    nodalInertiaForces,
    inertiaForces: nodalInertiaForces,
    nodalInertiaForceByNode: vectorRowsByNode(nodalInertiaForces),
    nodalInertiaMomentByNode: vectorRowsByNode(nodalInertiaForces, 'rotation'),
    baseShear,
    baseShearComponents: directionComponents(baseShearComponentsVector),
    baseShearSource,
    memberForceRecovery,
    memberForces: memberForceRecovery.rows,
    massRatio: finiteNumber(participationItem.massRatio, 0),
    effectiveModalMass: effectiveModalMass(participationItem, directionMass),
    recoveryStatus: hasModeVector && nodes.length > 0 && vectorLength >= nodes.length * 6
      ? 'available'
      : 'unsupported',
    dimensions: RSA_DIMENSIONS,
    units,
    provenance: responseProvenance,
  };
}

function combineDirectionResponses({
  direction,
  dirIndex,
  responses,
  modalDofs,
  totalDirectionalMass: directionMass,
  method,
  dampingRatio,
  nodes,
  units,
  provenance,
}) {
  const hasVectorRecovery = responses.every((response) => response.displacementVector.length > 0);
  const srssDisplacementVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'displacementVector', 'SRSS', dampingRatio)
    : [];
  const cqcDisplacementVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'displacementVector', 'CQC', dampingRatio)
    : [];
  const absDisplacementVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'displacementVector', 'ABS', dampingRatio)
    : [];
  const nrc10DisplacementVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'displacementVector', 'NRC10', dampingRatio)
    : [];
  const srssInertiaForceVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'inertiaForceVector', 'SRSS', dampingRatio)
    : [];
  const cqcInertiaForceVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'inertiaForceVector', 'CQC', dampingRatio)
    : [];
  const absInertiaForceVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'inertiaForceVector', 'ABS', dampingRatio)
    : [];
  const nrc10InertiaForceVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'inertiaForceVector', 'NRC10', dampingRatio)
    : [];
  const directionalDofs = (modalDofs || []).filter((dof) => dof % 6 === dirIndex);
  const srssDisplacement = hasVectorRecovery
    ? Math.max(0, ...directionalDofs.map((dof) => Math.abs(srssDisplacementVector[dof] || 0)))
    : combineModalResponseValues(responses, 'displacement', 'SRSS', dampingRatio);
  const cqcDisplacement = hasVectorRecovery
    ? Math.max(0, ...directionalDofs.map((dof) => Math.abs(cqcDisplacementVector[dof] || 0)))
    : combineModalResponseValues(responses, 'displacement', 'CQC', dampingRatio);
  const absDisplacement = hasVectorRecovery
    ? Math.max(0, ...directionalDofs.map((dof) => Math.abs(absDisplacementVector[dof] || 0)))
    : combineModalResponseValues(responses, 'displacement', 'ABS', dampingRatio);
  const nrc10Displacement = hasVectorRecovery
    ? Math.max(0, ...directionalDofs.map((dof) => Math.abs(nrc10DisplacementVector[dof] || 0)))
    : combineModalResponseValues(responses, 'displacement', 'NRC10', dampingRatio);
  const forceResponses = responses.filter((response) => (
    response.baseShear != null
    && response.baseShear !== ''
    && Number.isFinite(Number(response.baseShear))
  ));
  const hasBaseShearRecovery = responses.length > 0 && forceResponses.length === responses.length;
  const srssBaseShear = hasBaseShearRecovery
    ? combineModalResponseValues(forceResponses, 'baseShear', 'SRSS', dampingRatio)
    : null;
  const cqcBaseShear = hasBaseShearRecovery
    ? combineModalResponseValues(forceResponses, 'baseShear', 'CQC', dampingRatio)
    : null;
  const absBaseShear = hasBaseShearRecovery
    ? combineModalResponseValues(forceResponses, 'baseShear', 'ABS', dampingRatio)
    : null;
  const nrc10BaseShear = hasBaseShearRecovery
    ? combineModalResponseValues(forceResponses, 'baseShear', 'NRC10', dampingRatio)
    : null;
  const srssBaseShearComponents = combineComponentResponses(responses, 'baseShearComponents', 'SRSS', dampingRatio);
  const cqcBaseShearComponents = combineComponentResponses(responses, 'baseShearComponents', 'CQC', dampingRatio);
  const absBaseShearComponents = combineComponentResponses(responses, 'baseShearComponents', 'ABS', dampingRatio);
  const nrc10BaseShearComponents = combineComponentResponses(responses, 'baseShearComponents', 'NRC10', dampingRatio);
  const displacementVectors = { SRSS: srssDisplacementVector, CQC: cqcDisplacementVector, ABS: absDisplacementVector, NRC10: nrc10DisplacementVector };
  const inertiaVectors = { SRSS: srssInertiaForceVector, CQC: cqcInertiaForceVector, ABS: absInertiaForceVector, NRC10: nrc10InertiaForceVector };
  const displacements = { SRSS: srssDisplacement, CQC: cqcDisplacement, ABS: absDisplacement, NRC10: nrc10Displacement };
  const baseShears = { SRSS: srssBaseShear, CQC: cqcBaseShear, ABS: absBaseShear, NRC10: nrc10BaseShear };
  const baseShearComponentSets = { SRSS: srssBaseShearComponents, CQC: cqcBaseShearComponents, ABS: absBaseShearComponents, NRC10: nrc10BaseShearComponents };
  const selectedDisplacementVector = displacementVectors[method] || srssDisplacementVector;
  const selectedInertiaForceVector = inertiaVectors[method] || srssInertiaForceVector;
  const selectedDisplacement = displacements[method] ?? srssDisplacement;
  const selectedBaseShear = baseShears[method] ?? srssBaseShear;
  const selectedBaseShearComponents = baseShearComponentSets[method] || srssBaseShearComponents;
  const displacementCombinationTrace = combineModalScalars(responses.map((response) => ({
    modeId: response.mode,
    period: response.period,
    omega: response.omega,
    value: response.displacement,
  })), { method, dampingRatio });
  const baseShearCombinationTrace = hasBaseShearRecovery
    ? combineModalScalars(forceResponses.map((response) => ({
        modeId: response.mode,
        period: response.period,
        omega: response.omega,
        value: response.baseShear,
      })), { method, dampingRatio })
    : null;
  const combinedProvenance = {
    ...provenance,
    direction,
    responseMethod: method,
    modalCombination: method,
    dampingRatio,
    modeIds: responses.map((response) => response.mode),
    baseShearSource: 'modal-combination-of-modal-base-shear',
    scaling: { applied: false, factor: 1 },
    staticCaseReferences: [],
  };
  const memberForces = combineRsaMemberForces({
    responses,
    direction,
    method,
    dampingRatio,
    provenance: combinedProvenance,
    units,
    combineValues: combineModalResponseValues,
  });
  const nodalDisplacementsByMethod = {
    SRSS: nodalVectorRows(nodes, srssDisplacementVector, 'length', units.length, units.angle, { ...combinedProvenance, responseMethod: 'SRSS' }),
    CQC: nodalVectorRows(nodes, cqcDisplacementVector, 'length', units.length, units.angle, { ...combinedProvenance, responseMethod: 'CQC' }),
    ABS: nodalVectorRows(nodes, absDisplacementVector, 'length', units.length, units.angle, { ...combinedProvenance, responseMethod: 'ABS' }),
    NRC10: nodalVectorRows(nodes, nrc10DisplacementVector, 'length', units.length, units.angle, { ...combinedProvenance, responseMethod: 'NRC10' }),
  };
  const nodalInertiaForcesByMethod = {
    SRSS: nodalVectorRows(nodes, srssInertiaForceVector, 'force', units.force, units.moment, { ...combinedProvenance, responseMethod: 'SRSS' }),
    CQC: nodalVectorRows(nodes, cqcInertiaForceVector, 'force', units.force, units.moment, { ...combinedProvenance, responseMethod: 'CQC' }),
    ABS: nodalVectorRows(nodes, absInertiaForceVector, 'force', units.force, units.moment, { ...combinedProvenance, responseMethod: 'ABS' }),
    NRC10: nodalVectorRows(nodes, nrc10InertiaForceVector, 'force', units.force, units.moment, { ...combinedProvenance, responseMethod: 'NRC10' }),
  };
  const nodalDisplacements = nodalDisplacementsByMethod[method];
  const nodalInertiaForces = nodalInertiaForcesByMethod[method];

  return {
    method,
    responseMethod: method,
    displacement: selectedDisplacement,
    combinedDisplacement: selectedDisplacement,
    maxModalDisplacement: Math.max(0, ...responses.map((item) => item.displacement)),
    srssDisplacement,
    cqcDisplacement,
    absDisplacement,
    nrc10Displacement,
    displacementVector: selectedDisplacementVector,
    nodalDisplacements,
    nodalDisplacementsByMethod,
    nodeDisplacements: vectorRowsByNode(nodalDisplacements),
    nodeRotations: vectorRowsByNode(nodalDisplacements, 'rotation'),
    inertiaForceVector: selectedInertiaForceVector,
    nodalInertiaForces,
    inertiaForces: nodalInertiaForces,
    nodalInertiaForcesByMethod,
    nodeInertiaForces: vectorRowsByNode(nodalInertiaForces),
    nodeInertiaMoments: vectorRowsByNode(nodalInertiaForces, 'rotation'),
    baseShear: selectedBaseShear,
    rsaBaseShear: selectedBaseShear,
    srssBaseShear,
    cqcBaseShear,
    absBaseShear,
    nrc10BaseShear,
    baseShearComponents: selectedBaseShearComponents,
    srssBaseShearComponents,
    cqcBaseShearComponents,
    absBaseShearComponents,
    nrc10BaseShearComponents,
    baseShearDimension: 'force',
    baseShearRecoveryStatus: hasBaseShearRecovery ? 'available' : 'unsupported',
    memberForces,
    memberForceRecoveryStatus: memberForces.status,
    combinationTrace: {
      version: displacementCombinationTrace.version,
      method,
      dampingRatio,
      displacement: displacementCombinationTrace,
      baseShear: baseShearCombinationTrace,
      responseFamilies: ['nodal-displacement', 'nodal-inertia-force', 'base-shear', 'member-force'],
    },
    participatingMassRatio: Math.min(1, responses.reduce((sum, item) => sum + item.massRatio, 0)),
    totalMass: directionMass,
    dimensions: RSA_DIMENSIONS,
    units,
    provenance: combinedProvenance,
  };
}

function combineResponseVectors(responses, key, method, dampingRatio) {
  const length = Math.max(0, ...responses.map((response) => response?.[key]?.length || 0));
  return Array.from({ length }, (_, index) => combineModalResponseValues(
    responses,
    (response) => response?.[key]?.[index] || 0,
    method,
    dampingRatio,
  ));
}

function combineComponentResponses(responses, key, method, dampingRatio) {
  return Object.fromEntries(DOF_DIR.map((direction) => [
    direction,
    combineModalResponseValues(responses, (response) => response?.[key]?.[direction] || 0, method, dampingRatio),
  ]));
}

function nodalVectorRows(nodes, vector, dimension, unit, rotationalUnit, provenance) {
  if (!Array.isArray(nodes) || !nodes.length || !Array.isArray(vector) || !vector.length) return [];
  return nodes.map((node, index) => {
    const values = [0, 1, 2].map((offset) => finiteNumber(vector[index * 6 + offset], 0));
    const rotations = [3, 4, 5].map((offset) => finiteNumber(vector[index * 6 + offset], 0));
    const rotationalDimension = dimension === 'force' ? 'moment' : 'angle';
    return {
      nodeId: node.id,
      vector: values,
      x: values[0],
      y: values[1],
      z: values[2],
      rotation: rotations,
      rx: rotations[0],
      ry: rotations[1],
      rz: rotations[2],
      dimension,
      unit,
      rotationalDimension,
      rotationalUnit,
      provenance,
    };
  });
}

function vectorRowsByNode(rows, key = 'vector') {
  return Object.fromEntries((rows || []).map((row) => [row.nodeId, row[key]]));
}

function directionComponents(values) {
  return Object.fromEntries(DOF_DIR.map((direction, index) => [direction, finiteNumber(values?.[index], 0)]));
}

function sumTranslationalComponents(vector) {
  const values = [0, 0, 0];
  for (let dof = 0; dof < (vector?.length || 0); dof += 1) {
    if (dof % 6 < 3) values[dof % 6] += finiteNumber(vector[dof], 0);
  }
  return values;
}

function effectiveModalMass(participationItem, directionMass) {
  const explicit = Number(participationItem?.effectiveMass ?? participationItem?.effectiveModalMass);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const massRatio = Number(participationItem?.massRatio);
  if (Number.isFinite(massRatio) && massRatio >= 0 && Number.isFinite(directionMass)) return massRatio * directionMass;
  const gamma = Number(participationItem?.gamma);
  const modalMass = Number(participationItem?.modalMass ?? participationItem?.generalizedMass);
  if (Number.isFinite(gamma) && Number.isFinite(modalMass) && modalMass > 0) return gamma ** 2 * modalMass;
  return null;
}

function normalizedCombinationMethod(value) {
  return normalizeModalCombinationMethod(value);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function modalUnits(modelUnits = {}) {
  const length = modelUnits.length || 'm';
  const mass = modelUnits.mass || 't';
  return {
    length,
    force: modelUnits.force || 'kN',
    moment: modelUnits.moment || `${modelUnits.force || 'kN'}.${length}`,
    mass,
    period: 's',
    frequency: 'Hz',
    omega: 'rad/s',
    eigenvalue: '1/s2',
    modeVector: `1/sqrt(${mass})`,
    modeVectorTranslation: `1/sqrt(${mass})`,
    modeVectorRotation: `1/(${length}.sqrt(${mass}))`,
    displayVector: '1',
    angle: 'rad',
  };
}

function rsaUnits(modelUnits = {}) {
  const modal = modalUnits(modelUnits);
  return {
    ...modal,
    acceleration: `${modal.length}/s2`,
    generalizedDisplacement: `${modal.length}.sqrt(${modal.mass})`,
    displacement: modal.length,
    inertiaForce: modal.force,
    baseShear: modal.force,
    scaleFactor: '1',
  };
}

function buildResponseSpectrumContract() {
  return {
    milestone: 'P3-M13/P7-M9',
    tickets: ['P3-T77', 'P3-T79'],
    scope: 'Elastic response-spectrum recovery of translational nodal displacement, nodal inertia force, and base shear.',
    reviewFields: ['method', 'combined', 'modal', 'nodalRecovery', 'memberForces', 'review'],
    limitations: [
      'RSA translational nodal recovery is preliminary and does not replace project-specific seismic code review.',
      'CQC review requires at least two modal responses in every requested direction.',
      'Member-force design transfer is qualified only when residual back-substitution, assembly-force, release, and station checks pass.',
      'Rigid diaphragm constraints use exact stiffness and mass transformation; generated semi-rigid members, unilateral active sets, and equivalent shell domains remain blocked when absent from modal assembly.',
      'Static member results and fixed-end loads are never substituted into RSA member demand.',
    ],
  };
}

function buildResponseSpectrumReview({ method, modal, combined }) {
  const normalizedMethod = String(method || 'SRSS').toUpperCase();
  const directionRows = Object.entries(combined || {}).map(([direction, row]) => ({
    direction,
    responseCount: (modal.find((item) => item.direction === direction)?.responses || []).length,
    participatingMassRatio: row.participatingMassRatio || 0,
  }));
  const missing = [];
  if (!directionRows.length) missing.push('rsa-directions');
  if (normalizedMethod === 'CQC' && directionRows.some((row) => row.responseCount < 2)) missing.push('cqc-modal-response-count');
  if (directionRows.some((row) => !(row.participatingMassRatio > 0))) missing.push('participating-mass-ratio');
  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    type: 'response-spectrum',
    status: missing.length ? 'review-required' : 'available',
    method: normalizedMethod,
    directionRows,
    missing,
    productionReady: false,
    agentDecision: missing.length
      ? 'review-response-spectrum-inputs'
      : 'response-spectrum-trace-ready-for-review',
  };
}

function implicitSparseCondensation(modalDofs, residualDofs) {
  return {
    status: 'available',
    method: residualDofs.length
      ? 'implicit-sparse-shift-invert-no-dense-schur'
      : 'no-residual-dofs',
    modalDofs: modalDofs.slice(),
    residualDofs: residualDofs.slice(),
    residualSolutions: [],
    reason: null,
    transformationPreserved: true,
  };
}

function diagonalMassOperator(values) {
  const triplets = values
    .map((value, index) => ({ row: index, column: index, value: Number(value) || 0 }))
    .filter((entry) => entry.value > 0);
  return createSymmetricSparseOperator(
    createCscFromTriplets(values.length, values.length, triplets),
    { id: 'modal-lumped-mass', matrixClass: 'positive-semidefinite' },
  );
}

function eigenSummary(result) {
  return {
    version: result?.version || null,
    status: result?.ok ? 'available' : 'failed',
    reason: result?.reason || null,
    method: result?.diagnostics?.algorithm || 'sparse-shift-invert-block-subspace-rayleigh-ritz',
    requestedModeCount: result?.requestedModeCount || 0,
    availableModeCount: result?.availableModeCount || 0,
    convergenceTrace: result?.convergenceTrace || [],
    diagnostics: result?.diagnostics || null,
  };
}

function modeFromEigen({
  lambda,
  eigenvector,
  coordinateDofs,
  modalDofs,
  physicalModalDofs,
  physicalMass,
  nodes,
  coordinateStiffness,
  condensation,
  coordinateDofCount,
  expandVector,
}) {
  if (!(lambda > 1e-9)) return null;
  const omega = Math.sqrt(lambda);
  const coordinateVector = new Array(coordinateDofCount).fill(0);
  for (let i = 0; i < coordinateDofs.length; i += 1) coordinateVector[coordinateDofs[i]] = eigenvector[i];
  const residualCheck = residualEquilibriumCheck(coordinateStiffness, coordinateVector, condensation);
  const vector = expandVector(coordinateVector);
  const initialModalMass = physicalModalDofs.reduce(
    (sum, dof) => sum + physicalMass[dof] * vector[dof] ** 2,
    0,
  );
  if (!(initialModalMass > 0)) return null;
  const massScale = 1 / Math.sqrt(initialModalMass);
  for (let i = 0; i < vector.length; i += 1) vector[i] *= massScale;
  for (let i = 0; i < coordinateVector.length; i += 1) coordinateVector[i] *= massScale;
  const orientation = orientModeVector(vector, physicalModalDofs);
  if (orientation < 0) {
    for (let i = 0; i < coordinateVector.length; i += 1) coordinateVector[i] *= -1;
  }
  const generalizedMass = physicalModalDofs.reduce(
    (sum, dof) => sum + physicalMass[dof] * vector[dof] ** 2,
    0,
  );
  const massNormalizedShape = shapeFromVector(nodes, vector);
  const massNormalizedRotationShape = rotationShapeFromVector(nodes, vector);
  const translationalDisplayDofs = physicalModalDofs.filter((dof) => dof % 6 < 3);
  const displayDofs = translationalDisplayDofs.length ? translationalDisplayDofs : physicalModalDofs;
  const displayScale = 1 / Math.max(1e-12, ...displayDofs.map((dof) => Math.abs(vector[dof])));
  const displayVector = vector.map((value) => value * displayScale);
  const displayShape = shapeFromVector(nodes, displayVector);
  const displayRotationShape = rotationShapeFromVector(nodes, displayVector);
  return {
    eigenvalue: lambda,
    omega,
    frequencyHz: omega / (2 * Math.PI),
    period: (2 * Math.PI) / omega,
    vector,
    coordinateVector,
    massNormalizedShape,
    massNormalizedRotationShape,
    displayVector,
    displayShape,
    displayRotationShape,
    shape: displayShape,
    normalization: {
      analysis: 'mass-normalized',
      generalizedMass,
      massNormalizationResidual: Math.abs(1 - generalizedMass),
      coordinateMassNormalization: 'generalized-symmetric-mass-matrix',
      display: translationalDisplayDofs.length
        ? 'max-absolute-translational-component'
        : 'max-absolute-rotational-component',
      displayScale,
    },
    residualRecovery: {
      status: condensation.status === 'available' && residualCheck.passed ? 'available' : 'failed',
      method: condensation.method,
      residualDofCount: condensation.residualDofs.length,
      reconstructedDofCount: condensation.status === 'available' ? condensation.residualDofs.length : 0,
      maxAbsoluteEquilibriumResidual: residualCheck.maxAbsolute,
      maxRelativeEquilibriumResidual: residualCheck.maxRelative,
      tolerance: residualCheck.tolerance,
      passed: condensation.status === 'available' && residualCheck.passed,
      reason: condensation.reason || residualCheck.reason,
    },
    dimensions: MODAL_DIMENSIONS,
  };
}

function residualEquilibriumCheck(K, vector, condensation) {
  const tolerance = 1e-8;
  if (condensation.status !== 'available') {
    return {
      passed: false,
      maxAbsolute: null,
      maxRelative: null,
      tolerance,
      reason: condensation.reason || 'RESIDUAL_DOF_RECOVERY_UNAVAILABLE',
    };
  }
  if (!condensation.residualDofs.length) {
    return { passed: true, maxAbsolute: 0, maxRelative: 0, tolerance, reason: null };
  }
  let maxAbsolute = 0;
  let maxRelative = 0;
  for (const dof of condensation.residualDofs) {
    let residual = 0;
    let scale = 0;
    for (let column = 0; column < vector.length; column += 1) {
      const term = finiteNumber(K?.[dof]?.[column], 0) * finiteNumber(vector[column], 0);
      residual += term;
      scale += Math.abs(term);
    }
    const absolute = Math.abs(residual);
    const relative = absolute / Math.max(1e-12, scale);
    maxAbsolute = Math.max(maxAbsolute, absolute);
    maxRelative = Math.max(maxRelative, relative);
  }
  const passed = maxAbsolute <= 1e-9 || maxRelative <= tolerance;
  return {
    passed,
    maxAbsolute,
    maxRelative,
    tolerance,
    reason: passed ? null : 'MASSLESS_DOF_EQUILIBRIUM_RESIDUAL_EXCEEDED',
  };
}

function condensationSummary(condensation, modes) {
  const modeChecksPassed = modes.length > 0 && modes.every((mode) => mode.residualRecovery?.passed);
  return {
    status: condensation.status === 'available' && modeChecksPassed ? 'available' : 'failed',
    method: condensation.method,
    equation: condensation.method === 'implicit-sparse-shift-invert-no-dense-schur'
      ? 'K*u=lambda*M*u; massless residual rows are satisfied in the shared sparse solve'
      : 'no residual-dof transformation required',
    modalDofCount: condensation.modalDofs.length,
    residualDofCount: condensation.residualDofs.length,
    transformationPreserved: condensation.status === 'available' && condensation.transformationPreserved !== false,
    modeChecksPassed,
    maxAbsoluteEquilibriumResidual: Math.max(0, ...modes.map((mode) => (
      finiteNumber(mode.residualRecovery?.maxAbsoluteEquilibriumResidual, 0)
    ))),
    maxRelativeEquilibriumResidual: Math.max(0, ...modes.map((mode) => (
      finiteNumber(mode.residualRecovery?.maxRelativeEquilibriumResidual, 0)
    ))),
    reason: condensation.reason || (modeChecksPassed ? null : 'ONE_OR_MORE_MODE_BACK_SUBSTITUTION_CHECKS_FAILED'),
  };
}

function participation(vector, modalDofs, mass, totalMass) {
  const out = {};
  for (let dir = 0; dir < 3; dir += 1) {
    let numerator = 0;
    let modalMass = 0;
    for (const dof of modalDofs) {
      const value = vector[dof];
      modalMass += mass[dof] * value * value;
      if (dof % 6 === dir) numerator += mass[dof] * value;
    }
    const gamma = modalMass > 0 ? numerator / modalMass : 0;
    const effectiveMass = modalMass > 0 ? (numerator * numerator) / modalMass : 0;
    const massRatio = totalMass[dir] > 0 ? effectiveMass / totalMass[dir] : 0;
    out[DOF_DIR[dir]] = {
      gamma,
      modalMass,
      generalizedMass: modalMass,
      effectiveMass,
      effectiveModalMass: effectiveMass,
      massRatio,
      dimensions: {
        gamma: 'square-root-mass',
        modalMass: 'dimensionless',
        effectiveMass: 'mass',
        massRatio: 'dimensionless',
      },
    };
  }
  return out;
}

function totalDirectionalMass(mass, free) {
  const total = [0, 0, 0];
  for (const dof of free) {
    if (dof % 6 < 3) total[dof % 6] += mass[dof] || 0;
  }
  return total;
}

function spectralAcceleration(period, spectrum = {}) {
  const scale = Number(spectrum.scale ?? 9.80665);
  const points = (spectrum.points || [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }])
    .map((point) => ({ period: Number(point.period), sa: Number(point.sa) }))
    .filter((point) => Number.isFinite(point.period) && Number.isFinite(point.sa))
    .sort((a, b) => a.period - b.period);
  if (!points.length) return 0;
  if (period <= points[0].period) return points[0].sa * scale;
  if (period >= points.at(-1).period) return points.at(-1).sa * scale;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a.period <= period && period <= b.period) {
      const t = (period - a.period) / Math.max(1e-12, b.period - a.period);
      return (a.sa * (1 - t) + b.sa * t) * scale;
    }
  }
  return points[0].sa * scale;
}

function orientModeVector(vector, modalDofs) {
  const pivot = (modalDofs || []).reduce((best, dof) => (
    best == null || Math.abs(vector[dof]) > Math.abs(vector[best]) ? dof : best
  ), null);
  if (pivot != null && vector[pivot] < 0) {
    for (let i = 0; i < vector.length; i += 1) vector[i] *= -1;
    return -1;
  }
  return 1;
}

function shapeFromVector(nodes, vector) {
  return Object.fromEntries(nodes.map((node, i) => [node.id, vector.slice(i * 6, i * 6 + 3)]));
}

function rotationShapeFromVector(nodes, vector) {
  return Object.fromEntries(nodes.map((node, i) => [node.id, vector.slice(i * 6 + 3, i * 6 + 6)]));
}
