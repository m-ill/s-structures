import { materialOf, sectionOf } from '../core/catalogs.js';
import { buildMassSourceTrace } from '../loads/loadsV2.js';
import { assembleStiffness3D, solveLinear } from '../solver/linear3d.js';
import { effectiveSectionMaterial } from '../solver/linear3dPost.js';
import { DYNAMIC_COMPLETENESS_VERSION } from './elasticCompleteness.js';
import {
  combineRsaMemberForces,
  createRsaMemberRecoveryContext,
  recoverModalMemberForces,
  summarizeRsaMemberForces,
} from '../results/rsa/memberForces.js';
import { buildModalConstraintDomain } from './modalDiaphragm.js';
import { buildCanonicalAnalysisDomain } from '../solver/domain/canonicalDomain.js';
import { buildDomainAdapterIdentity } from '../solver/domain/compatibility.js';

const DOF_DIR = ['x', 'y', 'z'];

export const MODAL_RSA_RECOVERY_VERSION = 'p7-m9-modal-rsa-recovery-v1';

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
  if (!domain.ok) return { ok: false, reason: domain.reason || 'CANONICAL_DOMAIN_INVALID', analysisDomain: domainIdentity };
  model = domain.solverModel;
  const settings = { ...(model.analysisSettings || {}), ...(options || {}) };
  const modeCount = Math.max(1, settings.modalModeCount | 0 || 6);
  const system = assembleStiffness3D(model.nodes || [], model.members || [], {
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
  });
  if (!system.ok) return { ok: false, reason: system.reason || 'NO_STIFFNESS', analysisDomain: domainIdentity };

  const massSourceSpec = settings.massSource || null;
  const massSourceTrace = massSourceSpec ? buildMassSourceTrace(model, massSourceSpec) : null;
  const mass = buildLumpedMass(model, system, massSourceSpec, massSourceTrace);
  const constraintDomain = buildModalConstraintDomain(model, system, mass);
  const modalSystem = constraintDomain.system;
  const physicalModalDofs = system.free.filter((dof) => dof % 6 < 3 && mass[dof] > 0);
  const modalDofs = modalSystem.free.filter((dof) => (
    constraintDomain.applied ? constraintDomain.massMatrix[dof]?.[dof] > 0 : mass[dof] > 0
  ));
  if (!modalDofs.length) return { ok: false, reason: 'NO_MASS', modes: [], rsa: null, analysisDomain: domainIdentity };

  const residualDofs = modalSystem.free.filter((dof) => !modalDofs.includes(dof));
  const condensation = condenseToModalDofs(modalSystem.K, modalDofs, residualDofs);
  if (condensation.status !== 'available') {
    return failedModalAnalysis({
      model,
      system,
      mass,
      massSourceTrace,
      condensation,
      modes: [],
      reason: condensation.reason || 'RESIDUAL_DOF_CONDENSATION_FAILED',
      analysisDomain: domainIdentity,
    });
  }
  const K = condensation.K;
  const M = constraintDomain.applied
    ? submatrix(constraintDomain.massMatrix, modalDofs, modalDofs)
    : modalDofs.map((dof, row) => modalDofs.map((_item, column) => (row === column ? mass[dof] : 0)));
  const eig = solveGeneralizedSymmetricEigen(K, M);
  if (!eig.ok) {
    return failedModalAnalysis({
      model,
      system,
      mass,
      massSourceTrace,
      condensation,
      modes: [],
      reason: eig.reason,
      analysisDomain: domainIdentity,
    });
  }
  const modes = eig.values
    .map((value, i) => modeFromEigen({
      lambda: value,
      eigenvector: eig.vectors.map((row) => row[i]),
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
        source: 'symmetric-generalized-eigen-solution',
        modeId: `MODE${index + 1}`,
        normalization: 'mass-normalized',
        staticCaseReferences: [],
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

  const rsa = settings.responseSpectrum?.enabled === false
    ? null
    : runResponseSpectrum(modes, physicalModalDofs, mass, totalMass, settings.responseSpectrum || {}, {
      nodes: model.nodes || [],
      units: model.units || {},
      modalAnalysisType: 'modal_lumped_mass',
      model,
      system,
      diaphragmAssembly: constraintDomain.summary,
      members: model.members || [],
      stationCount: Math.max(21, settings.memberStations | 0 || settings.rsaMemberStations | 0 || 21),
    });

  return {
    version: MODAL_RSA_RECOVERY_VERSION,
    ok: modes.length > 0,
    type: 'modal_lumped_mass',
    dimensions: MODAL_DIMENSIONS,
    units: modalUnits(model.units),
    provenance: {
      source: 'assembled-elastic-stiffness-and-lumped-mass',
      normalization: 'mass-normalized',
      staticCaseReferences: [],
      diaphragmAssembly: constraintDomain.summary,
      analysisDomain: domainIdentity,
    },
    condensation: condensationReport,
    diaphragmAssembly: constraintDomain.summary,
    analysisDomain: domainIdentity,
    modes,
    mass: {
      total: totalMass,
      modalDofCount: modalDofs.length,
      freeDofCount: modalSystem.free.length,
      fullFreeDofCount: system.free.length,
      source: massSourceTrace ? 'analysisSettings.massSource' : 'node-and-member-mass',
      massSource: massSourceTrace,
      dimension: 'mass',
      unit: modalUnits(model.units).mass,
    },
    rsa,
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
}) {
  const report = condensationReport || condensationSummary(condensation, modes);
  return {
    version: MODAL_RSA_RECOVERY_VERSION,
    ok: false,
    status: 'failed',
    reason,
    analysisDomain,
    designBlocked: true,
    designBlockers: [reason],
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
    const trace = preparedTrace || buildMassSourceTrace(model, massSource);
    for (const row of trace.rows || []) {
      const base = idx[row.node] * 6;
      if (!Number.isFinite(base)) continue;
      const vector = Array.isArray(row.massVector)
        ? row.massVector
        : [row.mass, row.mass, row.mass];
      for (let i = 0; i < 3; i += 1) mass[base + i] += Math.max(0, Number(vector[i]) || 0);
    }
  } else {
    for (const member of model.members || []) {
      if (member.generated === true || member.massless === true) continue;
      const md = system.memData?.[member.id];
      if (!md) continue;
      const { section, material } = effectiveSectionMaterial((id) => sectionOf(model, id), (id) => materialOf(model, id), member);
      const m = Math.max(0, Number(material.density || 0) * Number(section.A || 0) * Number(md.ax.L || 0));
      if (!(m > 0)) continue;
      for (const nodeId of [member.n1, member.n2]) {
        const base = idx[nodeId] * 6;
        for (let i = 0; i < 3; i += 1) mass[base + i] += m / 2;
      }
    }
    for (const node of model.nodes || []) {
      const base = idx[node.id] * 6;
      if (Number(node.mass) > 0) {
        for (let i = 0; i < 3; i += 1) mass[base + i] += Number(node.mass);
      } else if (Array.isArray(node.mass)) {
        for (let i = 0; i < 3; i += 1) mass[base + i] += Math.max(0, Number(node.mass[i]) || 0);
      }
    }
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
    staticCaseReferences: [],
  };
  const memberRecoveryContext = createRsaMemberRecoveryContext(context);
  const modal = [];
  const combined = {};

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
  const designBlocked = !nodalAvailable || memberForces.designBlocked;

  return {
    version: DYNAMIC_COMPLETENESS_VERSION,
    recoveryVersion: MODAL_RSA_RECOVERY_VERSION,
    contract: buildResponseSpectrumContract(),
    status: designBlocked ? (nodalAvailable ? 'preliminary' : 'unsupported') : 'candidate',
    designBlocked,
    designBlockers: [...new Set([
      ...(!nodalAvailable ? ['RSA_NODAL_RECOVERY_UNSUPPORTED'] : []),
      ...(memberForces.designBlocked ? memberForces.blockers.map((item) => item.code) : []),
    ])],
    designTransferQualification: memberForces.designTransferQualification,
    method,
    dimensions: RSA_DIMENSIONS,
    units,
    provenance,
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
    modal,
    combined,
  };
}

export function combineModalResponseValues(responses = [], valueOf = 'displacement', method = 'SRSS', dampingRatio = 0.05) {
  const getter = typeof valueOf === 'function' ? valueOf : (row) => row?.[valueOf];
  const rows = (responses || [])
    .map((row, index) => ({
      mode: row?.mode,
      period: Number(row?.period),
      displacement: Number(getter(row, index)),
    }))
    .filter((row) => row.period > 0 && Number.isFinite(row.displacement));
  if (normalizedCombinationMethod(method) === 'CQC') return combineCqcValues(rows, dampingRatio);
  return Math.sqrt(rows.reduce((sum, row) => sum + row.displacement ** 2, 0));
}

function combineCqcValues(rows, dampingRatio) {
  let sum = 0;
  for (const first of rows) {
    for (const second of rows) {
      sum += cqcCorrelation(first.period, second.period, dampingRatio)
        * first.displacement
        * second.displacement;
    }
  }
  return Math.sqrt(Math.max(0, sum));
}

function cqcCorrelation(firstPeriod, secondPeriod, dampingRatio) {
  const first = Number(firstPeriod);
  const second = Number(secondPeriod);
  const damping = Math.max(0, Number(dampingRatio) || 0);
  if (!(first > 0) || !(second > 0)) return 0;
  if (Math.abs(first - second) <= 1e-12 * Math.max(first, second)) return 1;
  if (!(damping > 0)) return 0;
  const ratio = Math.max(first, second) / Math.min(first, second);
  const numerator = 8 * damping ** 2 * (1 + ratio) * ratio ** 1.5;
  const denominator = (1 - ratio ** 2) ** 2 + 4 * damping ** 2 * ratio * (1 + ratio) ** 2;
  return denominator > 0 ? numerator / denominator : 0;
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
      dof % 6 < 3
        ? finiteNumber(mass?.[dof], 0) * finiteNumber(mode.vector[dof], 0) * gamma * sa
        : 0
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
    responseProvenance,
  );
  const nodalInertiaForces = nodalVectorRows(
    nodes,
    inertiaForceVector,
    'force',
    units.force,
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
    inertiaForceVector,
    nodalInertiaForces,
    inertiaForces: nodalInertiaForces,
    nodalInertiaForceByNode: vectorRowsByNode(nodalInertiaForces),
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
  const srssInertiaForceVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'inertiaForceVector', 'SRSS', dampingRatio)
    : [];
  const cqcInertiaForceVector = hasVectorRecovery
    ? combineResponseVectors(responses, 'inertiaForceVector', 'CQC', dampingRatio)
    : [];
  const directionalDofs = (modalDofs || []).filter((dof) => dof % 6 === dirIndex);
  const srssDisplacement = hasVectorRecovery
    ? Math.max(0, ...directionalDofs.map((dof) => Math.abs(srssDisplacementVector[dof] || 0)))
    : combineModalResponseValues(responses, 'displacement', 'SRSS', dampingRatio);
  const cqcDisplacement = hasVectorRecovery
    ? Math.max(0, ...directionalDofs.map((dof) => Math.abs(cqcDisplacementVector[dof] || 0)))
    : combineModalResponseValues(responses, 'displacement', 'CQC', dampingRatio);
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
  const srssBaseShearComponents = combineComponentResponses(responses, 'baseShearComponents', 'SRSS', dampingRatio);
  const cqcBaseShearComponents = combineComponentResponses(responses, 'baseShearComponents', 'CQC', dampingRatio);
  const selectedDisplacementVector = method === 'CQC' ? cqcDisplacementVector : srssDisplacementVector;
  const selectedInertiaForceVector = method === 'CQC' ? cqcInertiaForceVector : srssInertiaForceVector;
  const selectedDisplacement = method === 'CQC' ? cqcDisplacement : srssDisplacement;
  const selectedBaseShear = method === 'CQC' ? cqcBaseShear : srssBaseShear;
  const selectedBaseShearComponents = method === 'CQC' ? cqcBaseShearComponents : srssBaseShearComponents;
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
    SRSS: nodalVectorRows(nodes, srssDisplacementVector, 'length', units.length, { ...combinedProvenance, responseMethod: 'SRSS' }),
    CQC: nodalVectorRows(nodes, cqcDisplacementVector, 'length', units.length, { ...combinedProvenance, responseMethod: 'CQC' }),
  };
  const nodalInertiaForcesByMethod = {
    SRSS: nodalVectorRows(nodes, srssInertiaForceVector, 'force', units.force, { ...combinedProvenance, responseMethod: 'SRSS' }),
    CQC: nodalVectorRows(nodes, cqcInertiaForceVector, 'force', units.force, { ...combinedProvenance, responseMethod: 'CQC' }),
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
    displacementVector: selectedDisplacementVector,
    nodalDisplacements,
    nodalDisplacementsByMethod,
    nodeDisplacements: vectorRowsByNode(nodalDisplacements),
    inertiaForceVector: selectedInertiaForceVector,
    nodalInertiaForces,
    inertiaForces: nodalInertiaForces,
    nodalInertiaForcesByMethod,
    nodeInertiaForces: vectorRowsByNode(nodalInertiaForces),
    baseShear: selectedBaseShear,
    rsaBaseShear: selectedBaseShear,
    srssBaseShear,
    cqcBaseShear,
    baseShearComponents: selectedBaseShearComponents,
    srssBaseShearComponents,
    cqcBaseShearComponents,
    baseShearDimension: 'force',
    baseShearRecoveryStatus: hasBaseShearRecovery ? 'available' : 'unsupported',
    memberForces,
    memberForceRecoveryStatus: memberForces.status,
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

function nodalVectorRows(nodes, vector, dimension, unit, provenance) {
  if (!Array.isArray(nodes) || !nodes.length || !Array.isArray(vector) || !vector.length) return [];
  return nodes.map((node, index) => {
    const values = [0, 1, 2].map((offset) => finiteNumber(vector[index * 6 + offset], 0));
    return {
      nodeId: node.id,
      vector: values,
      x: values[0],
      y: values[1],
      z: values[2],
      dimension,
      unit,
      provenance,
    };
  });
}

function vectorRowsByNode(rows) {
  return Object.fromEntries((rows || []).map((row) => [row.nodeId, row.vector]));
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
  return String(value || 'SRSS').toUpperCase() === 'CQC' ? 'CQC' : 'SRSS';
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

function condenseToModalDofs(K, modalDofs, residualDofs) {
  const Ktt = submatrix(K, modalDofs, modalDofs);
  if (!residualDofs.length) {
    return {
      K: Ktt,
      status: 'available',
      method: 'no-residual-dofs',
      modalDofs: modalDofs.slice(),
      residualDofs: [],
      residualSolutions: [],
      reason: null,
    };
  }
  const Ktr = submatrix(K, modalDofs, residualDofs);
  const Krt = submatrix(K, residualDofs, modalDofs);
  const Krr = submatrix(K, residualDofs, residualDofs);
  const solved = [];
  for (let j = 0; j < modalDofs.length; j += 1) {
    const rhs = Krt.map((row) => row[j]);
    const x = solveLinear(Krr.map((row) => row.slice()), rhs);
    if (!x) {
      return {
        K: Ktt,
        status: 'failed',
        method: 'schur-complement-back-substitution',
        modalDofs: modalDofs.slice(),
        residualDofs: residualDofs.slice(),
        residualSolutions: [],
        reason: 'RESIDUAL_DOF_BACK_SUBSTITUTION_FAILED',
      };
    }
    solved.push(x);
  }
  const out = Ktt.map((row) => row.slice());
  for (let i = 0; i < modalDofs.length; i += 1) {
    for (let j = 0; j < modalDofs.length; j += 1) {
      let correction = 0;
      for (let r = 0; r < residualDofs.length; r += 1) correction += Ktr[i][r] * solved[j][r];
      out[i][j] -= correction;
    }
  }
  return {
    K: symmetrize(out),
    status: 'available',
    method: 'schur-complement-back-substitution',
    modalDofs: modalDofs.slice(),
    residualDofs: residualDofs.slice(),
    residualSolutions: solved,
    reason: null,
  };
}

function solveGeneralizedSymmetricEigen(K, M) {
  if (!K.length || K.length !== M.length) return { ok: false, reason: 'MASS_MATRIX_DIMENSION_MISMATCH' };
  const L = choleskyLower(symmetrize(M));
  if (!L) return { ok: false, reason: 'MASS_MATRIX_NOT_POSITIVE_DEFINITE' };
  const inverseL = inverseLowerTriangular(L);
  const normalized = symmetrize(multiplyMatrices(multiplyMatrices(inverseL, K), transpose(inverseL)));
  const eig = jacobiEigen(normalized);
  const vectors = Array.from({ length: K.length }, () => new Array(K.length).fill(0));
  for (let column = 0; column < K.length; column += 1) {
    const normalizedVector = eig.vectors.map((row) => row[column]);
    const vector = solveLowerTranspose(L, normalizedVector);
    const generalizedMass = quadraticForm(vector, M);
    if (!(generalizedMass > 0) || !Number.isFinite(generalizedMass)) {
      return { ok: false, reason: 'MASS_NORMALIZATION_FAILED' };
    }
    const scale = 1 / Math.sqrt(generalizedMass);
    for (let row = 0; row < K.length; row += 1) vectors[row][column] = vector[row] * scale;
  }
  return { ok: true, values: eig.values, vectors };
}

function modeFromEigen({
  lambda,
  eigenvector,
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
  for (let i = 0; i < modalDofs.length; i += 1) {
    coordinateVector[modalDofs[i]] = eigenvector[i];
  }
  if (condensation.status === 'available' && condensation.residualDofs.length) {
    for (let residualIndex = 0; residualIndex < condensation.residualDofs.length; residualIndex += 1) {
      coordinateVector[condensation.residualDofs[residualIndex]] = -modalDofs.reduce((sum, _dof, modalIndex) => (
        sum + condensation.residualSolutions[modalIndex][residualIndex] * coordinateVector[modalDofs[modalIndex]]
      ), 0);
    }
  }
  const residualCheck = residualEquilibriumCheck(coordinateStiffness, coordinateVector, condensation);
  const vector = expandVector(coordinateVector);
  const initialModalMass = physicalModalDofs.reduce(
    (sum, dof) => sum + physicalMass[dof] * vector[dof] ** 2,
    0,
  );
  if (!(initialModalMass > 0)) return null;
  const massScale = 1 / Math.sqrt(initialModalMass);
  for (let i = 0; i < vector.length; i += 1) vector[i] *= massScale;
  orientModeVector(vector, physicalModalDofs);
  const generalizedMass = physicalModalDofs.reduce(
    (sum, dof) => sum + physicalMass[dof] * vector[dof] ** 2,
    0,
  );
  const massNormalizedShape = shapeFromVector(nodes, vector);
  const displayScale = 1 / Math.max(1e-12, ...physicalModalDofs.map((dof) => Math.abs(vector[dof])));
  const displayVector = vector.map((value) => value * displayScale);
  const displayShape = shapeFromVector(nodes, displayVector);
  return {
    eigenvalue: lambda,
    omega,
    frequencyHz: omega / (2 * Math.PI),
    period: (2 * Math.PI) / omega,
    vector,
    massNormalizedShape,
    displayVector,
    displayShape,
    shape: displayShape,
    normalization: {
      analysis: 'mass-normalized',
      generalizedMass,
      massNormalizationResidual: Math.abs(1 - generalizedMass),
      coordinateMassNormalization: 'generalized-symmetric-mass-matrix',
      display: 'max-absolute-translational-component',
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
    equation: 'u_residual=-inverse(Krr)*Krt*u_modal',
    modalDofCount: condensation.modalDofs.length,
    residualDofCount: condensation.residualDofs.length,
    transformationPreserved: condensation.status === 'available',
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

function choleskyLower(matrix) {
  const n = matrix.length;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  const scale = Math.max(1, ...matrix.map((row, index) => Math.abs(row[index] || 0)));
  const tolerance = scale * 1e-12;
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row][column];
      for (let k = 0; k < column; k += 1) value -= out[row][k] * out[column][k];
      if (row === column) {
        if (!(value > tolerance)) return null;
        out[row][column] = Math.sqrt(value);
      } else {
        out[row][column] = value / out[column][column];
      }
    }
  }
  return out;
}

function inverseLowerTriangular(matrix) {
  const n = matrix.length;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let column = 0; column < n; column += 1) {
    const rhs = new Array(n).fill(0);
    rhs[column] = 1;
    const solution = solveLower(matrix, rhs);
    for (let row = 0; row < n; row += 1) out[row][column] = solution[row];
  }
  return out;
}

function solveLower(matrix, rhs) {
  const out = new Array(rhs.length).fill(0);
  for (let row = 0; row < rhs.length; row += 1) {
    let value = rhs[row];
    for (let column = 0; column < row; column += 1) value -= matrix[row][column] * out[column];
    out[row] = value / matrix[row][row];
  }
  return out;
}

function solveLowerTranspose(matrix, rhs) {
  const out = new Array(rhs.length).fill(0);
  for (let row = rhs.length - 1; row >= 0; row -= 1) {
    let value = rhs[row];
    for (let column = row + 1; column < rhs.length; column += 1) value -= matrix[column][row] * out[column];
    out[row] = value / matrix[row][row];
  }
  return out;
}

function multiplyMatrices(left, right) {
  const rows = left.length;
  const columns = right[0]?.length || 0;
  const inner = right.length;
  const out = Array.from({ length: rows }, () => new Array(columns).fill(0));
  for (let row = 0; row < rows; row += 1) {
    for (let k = 0; k < inner; k += 1) {
      const value = left[row][k];
      if (!value) continue;
      for (let column = 0; column < columns; column += 1) out[row][column] += value * right[k][column];
    }
  }
  return out;
}

function transpose(matrix) {
  return matrix[0].map((_value, column) => matrix.map((row) => row[column]));
}

function quadraticForm(vector, matrix) {
  let total = 0;
  for (let row = 0; row < vector.length; row += 1) {
    for (let column = 0; column < vector.length; column += 1) {
      total += vector[row] * matrix[row][column] * vector[column];
    }
  }
  return total;
}

function jacobiEigen(A) {
  const n = A.length;
  const a = A.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  const maxIter = Math.max(50, n * n * 50);
  for (let iter = 0; iter < maxIter; iter += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(a[i][j]) > max) {
          max = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
      }
    }
    if (max < 1e-8) break;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    a[p][p] = app - t * apq;
    a[q][q] = aqq + t * apq;
    a[p][q] = 0;
    a[q][p] = 0;
    for (let k = 0; k < n; k += 1) {
      if (k === p || k === q) continue;
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[p][k] = a[k][p];
      a[k][q] = s * akp + c * akq;
      a[q][k] = a[k][q];
    }
    for (let k = 0; k < n; k += 1) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

function submatrix(A, rows, cols) {
  return rows.map((row) => cols.map((col) => A[row][col]));
}

function symmetrize(A) {
  const out = A.map((row) => row.slice());
  for (let i = 0; i < out.length; i += 1) {
    for (let j = i + 1; j < out.length; j += 1) {
      const value = (out[i][j] + out[j][i]) / 2;
      out[i][j] = value;
      out[j][i] = value;
    }
  }
  return out;
}

function orientModeVector(vector, modalDofs) {
  const pivot = (modalDofs || []).reduce((best, dof) => (
    best == null || Math.abs(vector[dof]) > Math.abs(vector[best]) ? dof : best
  ), null);
  if (pivot != null && vector[pivot] < 0) {
    for (let i = 0; i < vector.length; i += 1) vector[i] *= -1;
  }
}

function shapeFromVector(nodes, vector) {
  return Object.fromEntries(nodes.map((node, i) => [node.id, vector.slice(i * 6, i * 6 + 3)]));
}
