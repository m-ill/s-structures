import { stableHash } from '../../core/stableHash.js';
import { createElasticFactorSession } from '../../compute/elastic/factorSession.js';
import { createSymmetricSparseOperatorFromDense } from '../../compute/eigen/sparseOperator.js';
import { solveRequestedGeneralizedEigen } from '../../compute/eigen/requestedModes.js';
import { denseToCsc } from '../../compute/sparse/matrix.js';
import { buildLumpedMass } from '../../dynamics/modal.js';
import { assembleStiffness3D } from '../linear3dAssembly.js';
import {
  buildUnsupportedRotationFloorPlan,
  modalAssuranceCriterion,
  SHELL_STABILIZATION_POLICY,
} from './shellStabilization.js';

export const REAL_SHELL_STABILIZATION_QUALIFICATION_VERSION = 'p15-m6-real-shell-stabilization-v1';

export const REAL_SHELL_STABILIZATION_DEFAULTS = Object.freeze({
  alphas: Object.freeze([1e-6, 1e-5, 1e-4]),
  floorRatios: Object.freeze([1e-12, 1e-9, 1e-6]),
  meshMultipliers: Object.freeze([1, 2, 4]),
  baselineAlpha: 1e-5,
  baselineFloorRatio: 1e-9,
  modeCount: 3,
});

/** Build the deterministic three-storey wall fixture used by P15-M6. */
export function createThreeStoryWallStabilizationFixture(options = {}) {
  const meshMultiplier = positiveInteger(options.meshMultiplier, 1);
  const storyCount = positiveInteger(options.storyCount, 3);
  const baseHorizontalDivisions = positiveInteger(options.baseHorizontalDivisions, 1);
  const horizontalDivisions = positiveInteger(options.horizontalDivisions, baseHorizontalDivisions * meshMultiplier);
  // The 1x production fixture starts with two elements per storey so the
  // published 1x -> 2x -> 4x audit compares retained physical modes rather
  // than a known one-element-per-storey coarse discretization artifact.
  const baseVerticalDivisionsPerStory = positiveInteger(options.baseVerticalDivisionsPerStory, 2);
  const verticalDivisionsPerStory = positiveInteger(
    options.verticalDivisionsPerStory,
    baseVerticalDivisionsPerStory * meshMultiplier,
  );
  const width = positive(options.width, 4);
  const storyHeight = positive(options.storyHeight, 3);
  const thickness = positive(options.thickness, 0.2);
  const material = Object.freeze({
    id: 'P15-M6-CONCRETE',
    E: positive(options.E, 30e9),
    G: positive(options.G, 12.5e9),
    nu: finiteInRange(options.nu, 0.2, 0, 0.499999),
    density: positive(options.density, 2400),
  });
  const verticalDivisions = storyCount * verticalDivisionsPerStory;
  const nodes = [];
  for (let iz = 0; iz <= verticalDivisions; iz += 1) {
    const z = storyCount * storyHeight * iz / verticalDivisions;
    for (let ix = 0; ix <= horizontalDivisions; ix += 1) {
      const x = width * ix / horizontalDivisions;
      nodes.push({
        id: `W-N-${ix}-${iz}`,
        x,
        y: 0,
        z,
        ...(iz === 0 ? { support: 'fixed' } : {}),
      });
    }
  }
  const shells = [];
  for (let iz = 0; iz < verticalDivisions; iz += 1) {
    for (let ix = 0; ix < horizontalDivisions; ix += 1) {
      shells.push({
        id: `W-E-${ix}-${iz}`,
        nodeIds: [
          `W-N-${ix}-${iz}`,
          `W-N-${ix + 1}-${iz}`,
          `W-N-${ix + 1}-${iz + 1}`,
          `W-N-${ix}-${iz + 1}`,
        ],
        formulation: 'membrane',
        matId: material.id,
        thickness,
      });
    }
  }
  const topNodeIds = nodes.filter((node) => Math.abs(node.z - storyCount * storyHeight) <= 1e-12).map((node) => node.id);
  const totalLateralLoad = positive(options.totalLateralLoad, 1e6);
  const core = {
    version: REAL_SHELL_STABILIZATION_QUALIFICATION_VERSION,
    id: 'P15-M6-THREE-STORY-WALL',
    meshMultiplier,
    storyCount,
    horizontalDivisions,
    verticalDivisionsPerStory,
    width,
    storyHeight,
    thickness,
    material,
    nodes,
    shells,
    topNodeIds,
    totalLateralLoad,
    coordinateSystem: 'global-x lateral, global-z vertical, wall plane x-z',
    massModel: 'production lumped shell translational mass',
    supportModel: 'all six global DOFs fixed at base edge',
  };
  return deepFreeze({ ...core, fixtureHash: stableHash(core) });
}

/**
 * Run actual assembly, static factorization and generalized-eigen solves for
 * every alpha/floor point.  This is a custom S-Structures qualification; it
 * deliberately does not claim identity with STRIX P3S2.
 */
export function runRealShellStabilizationQualification(input = {}, options = {}) {
  const policy = Object.freeze({ ...SHELL_STABILIZATION_POLICY, ...(options.policy || {}) });
  const alphaContract = buildParameterContract(
    input.alphas || REAL_SHELL_STABILIZATION_DEFAULTS.alphas,
    {
      id: 'drilling-alpha',
      range: policy.drillingAlphaRange,
      baseline: input.baselineAlpha ?? REAL_SHELL_STABILIZATION_DEFAULTS.baselineAlpha,
      requiredLogSpan: 2,
    },
  );
  const floorContract = buildParameterContract(
    input.floorRatios || REAL_SHELL_STABILIZATION_DEFAULTS.floorRatios,
    {
      id: 'unsupported-rotation-floor-ratio',
      range: policy.unsupportedRotationFloorRatioRange,
      baseline: input.baselineFloorRatio ?? REAL_SHELL_STABILIZATION_DEFAULTS.baselineFloorRatio,
      requiredLogSpan: 6,
    },
  );
  const modeCount = positiveInteger(input.modeCount, REAL_SHELL_STABILIZATION_DEFAULTS.modeCount);
  const baseFixture = createThreeStoryWallStabilizationFixture({ ...(input.fixture || {}), meshMultiplier: 1 });
  const requestedPoints = [];
  for (const alpha of alphaContract.rows) for (const floor of floorContract.rows) {
    requestedPoints.push({ alpha, floor });
  }
  const rows = requestedPoints.map((point, index) => solveQualificationPoint({
    fixture: baseFixture,
    alpha: point.alpha.effective,
    floorRatio: point.floor.effective,
    requestedAlpha: point.alpha.requested,
    requestedFloorRatio: point.floor.requested,
    modeCount,
    pointId: `P15-M6-SWEEP-${index + 1}`,
  }));
  const baselineIndex = rows.findIndex((row) => (
    row.parameters.effectiveAlpha === alphaContract.baseline
    && row.parameters.effectiveFloorRatio === floorContract.baseline
  ));
  const baseline = rows[baselineIndex >= 0 ? baselineIndex : 0] || null;
  const comparisons = rows.map((row) => comparePointToBaseline(row, baseline));
  const maximumStaticShift = Math.max(0, ...comparisons.map((row) => row.staticResponseShift));
  const maximumPeriodShift = Math.max(0, ...comparisons.flatMap((row) => row.modeMatches.map((mode) => mode.periodShift)));
  const minimumMac = Math.min(1, ...comparisons.flatMap((row) => row.modeMatches.map((mode) => mode.mac)));
  const maximumStaticStabilizationEnergyRatio = Math.max(0, ...rows.map((row) => row.static.energy.stabilizationToPhysicalRatio));
  const maximumModalStabilizationEnergyRatio = Math.max(0, ...rows.flatMap((row) => row.modal.modes.map((mode) => mode.energy.stabilizationToPhysicalRatio)));

  const meshMultipliers = Array.from(input.meshMultipliers || REAL_SHELL_STABILIZATION_DEFAULTS.meshMultipliers, Number);
  const meshRows = meshMultipliers.map((meshMultiplier) => {
    if (meshMultiplier === 1 && baseline) return meshEvidenceRow(1, baseline);
    const fixture = createThreeStoryWallStabilizationFixture({ ...(input.fixture || {}), meshMultiplier });
    return meshEvidenceRow(meshMultiplier, solveQualificationPoint({
      fixture,
      alpha: alphaContract.baseline,
      floorRatio: floorContract.baseline,
      requestedAlpha: alphaContract.baseline,
      requestedFloorRatio: floorContract.baseline,
      modeCount,
      pointId: `P15-M6-MESH-${meshMultiplier}X`,
    }));
  });
  const meshPeriodChanges = meshRows.slice(1).map((row, index) => relativeDifference(
    row.periods[0],
    meshRows[index].periods[0],
  ));
  const meshLastPeriodChange = meshPeriodChanges.at(-1) ?? 0;
  const allSolveRows = [...rows, ...meshRows.filter((row) => row.meshMultiplier !== 1).map((row) => row.solve)];
  const solveFailures = allSolveRows.filter((row) => !row?.ok).map((row) => ({ pointId: row?.pointId || null, reason: row?.reason || 'UNKNOWN' }));
  const nullParity = rows.every((row) => row.nullModes.denseSparseParity && row.nullModes.productionPlanParity);
  const spuriousRemoved = rows.every((row) => row.nullModes.spuriousAfter === 0 && row.nullModes.spuriousBefore > 0);
  const physicalOrRigidMasked = rows.reduce((sum, row) => sum + row.nullModes.physicalMasked + row.nullModes.rigidMechanismMasked, 0);
  const sweepSolveArtifactCount = rows.filter((row) => row.solveArtifactHash).length;
  const gates = Object.freeze({
    parameterContract: alphaContract.ok && floorContract.ok,
    actualSolveCount: sweepSolveArtifactCount === requestedPoints.length
      && rows.every((row) => row.static.actualSolve && row.modal.actualSolve),
    staticSensitivity: maximumStaticShift < policy.drillingPhysicalResponseVariationMax,
    modalSensitivity: maximumPeriodShift < policy.drillingPhysicalResponseVariationMax && minimumMac >= policy.physicalModeMacMin,
    stabilizationEnergy: maximumStaticStabilizationEnergyRatio <= policy.stabilizationEnergyRatioMax
      && maximumModalStabilizationEnergyRatio <= policy.physicalModeStabilizationEnergyRatioMax,
    nullModeClassification: nullParity && spuriousRemoved && physicalOrRigidMasked === 0,
    meshConvergence: meshMultipliers.length === 3
      && meshMultipliers.join(',') === '1,2,4'
      && meshLastPeriodChange <= 5e-3,
    solveCompleteness: solveFailures.length === 0,
    claimLabel: true,
  });
  const blockers = Object.entries(gates).filter(([, pass]) => !pass).map(([gate]) => `P15_M6_${gate.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_FAILED`);
  const core = {
    version: REAL_SHELL_STABILIZATION_QUALIFICATION_VERSION,
    id: 'P15-M6-REAL-STABILIZATION-QUALIFICATION',
    status: blockers.length ? 'blocked' : 'pass',
    qualificationKind: 'S-Structures custom actual-solve stabilization qualification',
    selfTest: false,
    qualificationExecuted: true,
    benchmarkExecuted: false,
    designTransferAllowed: false,
    blockers,
    policy,
    parameterContracts: { alpha: alphaContract, floor: floorContract },
    fixture: fixtureSummary(baseFixture),
    sweep: {
      requestedPointCount: requestedPoints.length,
      solveArtifactCount: sweepSolveArtifactCount,
      actualStaticSolveCount: rows.filter((row) => row.static.actualSolve).length,
      actualModalSolveCount: rows.filter((row) => row.modal.actualSolve).length,
      baselinePointId: baseline?.pointId || null,
      rows,
      comparisons,
    },
    sensitivity: {
      maximumStaticShift,
      maximumPeriodShift,
      minimumMassWeightedMac: minimumMac,
      maximumStaticStabilizationEnergyRatio,
      maximumModalStabilizationEnergyRatio,
    },
    nullModeQualification: {
      denseSparseParity: nullParity,
      expectedSpuriousModesRemoved: spuriousRemoved,
      physicalOrRigidMasked,
    },
    meshConvergence: {
      requiredMultipliers: [1, 2, 4],
      rows: meshRows.map(({ solve, ...row }) => row),
      periodChanges: meshPeriodChanges,
      lastPeriodChange: meshLastPeriodChange,
    },
    solveFailures,
    gates,
    claim: {
      id: 'P3S2-SS',
      kind: 'S-Structures custom stabilization criterion',
      identicalToStrixP3S2: false,
      crossSolverEquivalent: false,
    },
  };
  return deepFreeze({ ...core, qualificationHash: stableHash(core) });
}

export function buildStabilizationParameterContract(input = {}) {
  return buildParameterContract(input.values || [], input);
}

function solveQualificationPoint({ fixture, alpha, floorRatio, requestedAlpha, requestedFloorRatio, modeCount, pointId }) {
  const model = { nodes: fixture.nodes, members: [], constraints: [], diaphragms: [] };
  const system = assembleStiffness3D(fixture.nodes, [], {
    model,
    shells: fixture.shells,
    mat: () => fixture.material,
    sec: () => ({ A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 }),
    shellCriteria: {
      drillingAlpha: alpha,
      drillingStiffnessRatioMax: SHELL_STABILIZATION_POLICY.drillingAlphaRange[1],
      unsupportedRotationFloorRatio: floorRatio,
    },
  });
  if (!system.ok) return failedPoint(pointId, system.reason || 'SHELL_ASSEMBLY_FAILED', { alpha, floorRatio });
  const decomposition = assembleStiffnessChannels(system);
  const fixedBase = new Set();
  fixture.nodes.forEach((node, index) => {
    if (node.support === 'fixed') for (let component = 0; component < 6; component += 1) fixedBase.add(index * 6 + component);
  });
  const densePlan = buildUnsupportedRotationFloorPlan({
    matrix: decomposition.raw,
    nodes: fixture.nodes,
    fixedDofs: fixedBase,
    requestedRatio: floorRatio,
  });
  const sparsePlan = buildUnsupportedRotationFloorPlan({
    matrix: denseToCsc(decomposition.raw),
    nodes: fixture.nodes,
    fixedDofs: fixedBase,
    requestedRatio: floorRatio,
  });
  const actualFloorDofs = [];
  const actualFloorValues = [];
  for (let dof = 0; dof < system.ndof; dof += 1) {
    const delta = Number(system.K[dof][dof]) - Number(decomposition.raw[dof][dof]);
    if (dof % 6 >= 3 && !fixedBase.has(dof) && Math.abs(delta) > Math.max(1e-30, densePlan.floorStiffness * 1e-10)) {
      actualFloorDofs.push(dof);
      actualFloorValues.push({ dof, value: delta });
    }
  }
  const denseSparseParity = densePlan.canonicalPlanHash === sparsePlan.canonicalPlanHash;
  const productionPlanParity = sameNumberArray(densePlan.affectedDofs, actualFloorDofs)
    && densePlan.diagonalAdditions.every((entry, index) => relativeDifference(entry.value, actualFloorValues[index]?.value) <= 1e-12);

  const load = new Array(system.ndof).fill(0);
  const topShare = fixture.totalLateralLoad / fixture.topNodeIds.length;
  fixture.topNodeIds.forEach((nodeId) => { load[system.idx[nodeId] * 6] += topShare; });
  const free = system.free;
  const reducedK = submatrix(system.K, free);
  const reducedLoad = free.map((dof) => load[dof]);
  const session = createElasticFactorSession({ trueResidualTolerance: 1e-10 });
  const staticSolve = session.solve(reducedK, reducedLoad, {
    groupKey: pointId,
    componentKey: 'static-lateral-x',
    matrixClass: 'spd',
    trueResidualTolerance: 1e-10,
  });
  const staticSession = session.dispose();
  if (!staticSolve.ok) return failedPoint(pointId, staticSolve.reason || 'STATIC_SOLVE_FAILED', { alpha, floorRatio });
  const displacement = new Array(system.ndof).fill(0);
  free.forEach((dof, index) => { displacement[dof] = staticSolve.x[index]; });
  const topResponse = fixture.topNodeIds.reduce((sum, nodeId) => sum + displacement[system.idx[nodeId] * 6], 0) / fixture.topNodeIds.length;
  const residual = relativeResidual(reducedK, staticSolve.x, reducedLoad);
  const physicalStaticEnergy = 0.5 * quadratic(displacement, decomposition.physical);
  const drillingStaticEnergy = 0.5 * quadratic(displacement, decomposition.drilling);
  const floorStaticEnergy = 0.5 * quadratic(displacement, subtractMatrices(system.K, decomposition.raw));
  const staticStabilizationEnergy = drillingStaticEnergy + floorStaticEnergy;

  const mass = buildLumpedMass(model, system);
  const reducedMass = free.map((dof) => mass[dof]);
  const massMatrix = diagonalMatrix(reducedMass);
  const modalSolve = solveRequestedGeneralizedEigen({
    primary: createSymmetricSparseOperatorFromDense(reducedK, { id: `${pointId}-K`, matrixClass: 'spd' }),
    secondary: createSymmetricSparseOperatorFromDense(massMatrix, { id: `${pointId}-M`, matrixClass: 'positive-semidefinite' }),
    modeCount: Math.min(modeCount, reducedK.length),
    residualTolerance: 1e-8,
    maximumProjectionDimension: Math.min(32, reducedK.length),
    maxIterations: 80,
  });
  if (!modalSolve.ok) return failedPoint(pointId, modalSolve.reason || 'MODAL_SOLVE_FAILED', { alpha, floorRatio });
  const modalModes = modalSolve.modes.map((mode, index) => {
    const fullVector = new Array(system.ndof).fill(0);
    free.forEach((dof, local) => { fullVector[dof] = mode.vector[local]; });
    const physicalEnergy = 0.5 * quadratic(fullVector, decomposition.physical);
    const drillingEnergy = 0.5 * quadratic(fullVector, decomposition.drilling);
    const floorEnergy = 0.5 * quadratic(fullVector, subtractMatrices(system.K, decomposition.raw));
    const stabilizationEnergy = drillingEnergy + floorEnergy;
    return {
      id: `MODE-${index + 1}`,
      eigenvalue: mode.eigenvalue,
      period: 2 * Math.PI / Math.sqrt(mode.eigenvalue),
      residual: mode.residual,
      vector: fullVector,
      participationX: modalParticipation(fullVector, mass, 0),
      energy: {
        physical: physicalEnergy,
        drilling: drillingEnergy,
        rotationFloor: floorEnergy,
        stabilization: stabilizationEnergy,
        stabilizationToPhysicalRatio: stabilizationEnergy / Math.max(1e-30, physicalEnergy),
      },
    };
  });
  const nullModes = {
    expectedUnsupportedRotationDofs: densePlan.affectedDofs,
    spuriousBefore: densePlan.affectedDofs.length,
    spuriousAfter: densePlan.affectedDofs.filter((dof) => Math.abs(system.K[dof][dof]) <= densePlan.nullThreshold).length,
    physicalMasked: densePlan.affectedDofs.filter((dof) => densePlan.physicalRotationDofs.includes(dof)).length,
    rigidMechanismMasked: densePlan.affectedDofs.filter((dof) => densePlan.rejectedRigidMechanismDofs.includes(dof)).length,
    denseSparseParity,
    productionPlanParity,
    densePlanHash: densePlan.canonicalPlanHash,
    sparsePlanHash: sparsePlan.canonicalPlanHash,
    actualAffectedDofs: actualFloorDofs,
  };
  const staticCore = {
    actualSolve: true,
    response: topResponse,
    trueResidual: residual,
    loadResultant: fixture.totalLateralLoad,
    factorDiagnostics: deterministicDiagnostics(staticSolve.diagnostics),
    factorSession: staticSession,
    energy: {
      physical: physicalStaticEnergy,
      drilling: drillingStaticEnergy,
      rotationFloor: floorStaticEnergy,
      stabilization: staticStabilizationEnergy,
      stabilizationToPhysicalRatio: staticStabilizationEnergy / Math.max(1e-30, physicalStaticEnergy),
    },
  };
  const modalCore = {
    actualSolve: true,
    modes: modalModes,
    massMetric: mass,
    diagnostics: deterministicDiagnostics(modalSolve.diagnostics),
  };
  const core = {
    version: REAL_SHELL_STABILIZATION_QUALIFICATION_VERSION,
    ok: true,
    pointId,
    fixtureHash: fixture.fixtureHash,
    parameters: {
      requestedAlpha: finiteOrNull(requestedAlpha),
      effectiveAlpha: alpha,
      requestedFloorRatio: finiteOrNull(requestedFloorRatio),
      effectiveFloorRatio: floorRatio,
    },
    matrix: {
      dimension: system.ndof,
      freeDofCount: free.length,
      shellElementCount: system.shellData.length,
      stiffnessHash: stableHash(system.K),
      massHash: stableHash(mass),
      loadHash: stableHash(load),
    },
    static: staticCore,
    modal: modalCore,
    nullModes,
  };
  return deepFreeze({ ...core, solveArtifactHash: stableHash(core) });
}

function assembleStiffnessChannels(system) {
  const physical = zeroMatrix(system.ndof);
  const drilling = zeroMatrix(system.ndof);
  for (const shell of system.shellData) {
    addBlock(physical, shell.built.compatibleMatrix, shell.dof);
    addBlock(drilling, shell.built.drillingMatrix, shell.dof);
  }
  return { physical, drilling, raw: addMatrices(physical, drilling) };
}

function comparePointToBaseline(row, baseline) {
  if (!row?.ok || !baseline?.ok) return { pointId: row?.pointId || null, staticResponseShift: Infinity, modeMatches: [] };
  const available = new Set(row.modal.modes.map((_mode, index) => index));
  const modeMatches = baseline.modal.modes.map((reference) => {
    let best = null;
    for (const index of available) {
      const candidate = row.modal.modes[index];
      const mac = modalAssuranceCriterion(reference.vector, candidate.vector, diagonalMatrixFromVector(massMetric(row, baseline)));
      const participationSimilarity = scalarSimilarity(reference.participationX, candidate.participationX);
      const score = mac * (0.75 + 0.25 * participationSimilarity);
      if (!best || score > best.score) best = { index, candidate, mac, participationSimilarity, score };
    }
    if (!best) return { referenceModeId: reference.id, candidateModeId: null, mac: 0, participationSimilarity: 0, periodShift: Infinity };
    available.delete(best.index);
    return {
      referenceModeId: reference.id,
      candidateModeId: best.candidate.id,
      mac: best.mac,
      participationSimilarity: best.participationSimilarity,
      periodShift: relativeDifference(best.candidate.period, reference.period),
    };
  });
  return {
    pointId: row.pointId,
    baselinePointId: baseline.pointId,
    staticResponseShift: relativeDifference(row.static.response, baseline.static.response),
    modeMatches,
  };
}

function massMetric(row, baseline) {
  const length = row.modal.modes[0]?.vector.length || baseline.modal.modes[0]?.vector.length || 0;
  const metric = row.modal.massMetric || baseline.modal.massMetric;
  return Array.isArray(metric) && metric.length === length ? metric : new Array(length).fill(1);
}

function meshEvidenceRow(meshMultiplier, solve) {
  return {
    meshMultiplier,
    ok: solve.ok,
    pointId: solve.pointId,
    fixtureHash: solve.fixtureHash,
    elementCount: solve.matrix?.shellElementCount || 0,
    freeDofCount: solve.matrix?.freeDofCount || 0,
    periods: solve.modal?.modes?.map((mode) => mode.period) || [],
    solveArtifactHash: solve.solveArtifactHash || null,
    solve,
  };
}

function buildParameterContract(valuesInput, { id = 'parameter', range = [0, Infinity], baseline, requiredLogSpan = 0 } = {}) {
  const values = Array.from(valuesInput || []);
  const [minimum, maximum] = range.map(Number);
  const baselineNumber = Number(baseline);
  const rows = values.map((requested, index) => {
    const numeric = Number(requested);
    const valid = Number.isFinite(numeric) && numeric > 0;
    const effective = valid ? Math.min(maximum, Math.max(minimum, numeric)) : baselineNumber;
    const inRange = valid && numeric >= minimum && numeric <= maximum;
    return {
      index,
      requested: valid ? numeric : String(requested),
      effective,
      valid,
      inRange,
      clamped: !inRange || numeric !== effective,
    };
  });
  const uniqueEffectiveCount = new Set(rows.map((row) => row.effective)).size;
  const effectiveValues = rows.map((row) => row.effective);
  const logSpan = effectiveValues.length && effectiveValues.every((value) => value > 0)
    ? Math.log10(Math.max(...effectiveValues) / Math.min(...effectiveValues))
    : 0;
  const includesBaseline = effectiveValues.includes(baselineNumber);
  const includesRangeEndpoints = effectiveValues.includes(minimum) && effectiveValues.includes(maximum);
  const gates = {
    nonempty: rows.length > 0,
    finitePositive: rows.every((row) => row.valid),
    inRange: rows.every((row) => row.inRange),
    unclamped: rows.every((row) => !row.clamped),
    uniqueEffective: uniqueEffectiveCount === rows.length,
    includesBaseline,
    includesRangeEndpoints,
    logSpan: logSpan + 1e-12 >= requiredLogSpan,
  };
  const core = {
    version: REAL_SHELL_STABILIZATION_QUALIFICATION_VERSION,
    id,
    ok: Object.values(gates).every(Boolean),
    range: [minimum, maximum],
    baseline: baselineNumber,
    requestedCount: rows.length,
    uniqueEffectiveCount,
    logSpan,
    requiredLogSpan,
    rows,
    gates,
  };
  return deepFreeze({ ...core, contractHash: stableHash(core) });
}

function fixtureSummary(fixture) {
  return {
    id: fixture.id,
    fixtureHash: fixture.fixtureHash,
    storyCount: fixture.storyCount,
    width: fixture.width,
    storyHeight: fixture.storyHeight,
    thickness: fixture.thickness,
    nodeCount: fixture.nodes.length,
    shellElementCount: fixture.shells.length,
    material: fixture.material,
    coordinateSystem: fixture.coordinateSystem,
    supportModel: fixture.supportModel,
    massModel: fixture.massModel,
  };
}

function failedPoint(pointId, reason, parameters) {
  const core = {
    version: REAL_SHELL_STABILIZATION_QUALIFICATION_VERSION,
    ok: false,
    pointId,
    reason,
    parameters,
    static: { actualSolve: false, energy: { stabilizationToPhysicalRatio: Infinity } },
    modal: { actualSolve: false, modes: [] },
    nullModes: {
      denseSparseParity: false,
      productionPlanParity: false,
      spuriousBefore: 0,
      spuriousAfter: 0,
      physicalMasked: 0,
      rigidMechanismMasked: 0,
    },
  };
  return deepFreeze({ ...core, solveArtifactHash: stableHash(core) });
}

function modalParticipation(vector, mass, component) {
  let numerator = 0;
  let modalMass = 0;
  let totalMass = 0;
  for (let dof = component; dof < vector.length; dof += 6) {
    const m = Number(mass[dof]) || 0;
    numerator += m * vector[dof];
    modalMass += m * vector[dof] * vector[dof];
    totalMass += m;
  }
  return modalMass > 0 && totalMass > 0 ? (numerator * numerator) / (modalMass * totalMass) : 0;
}

function relativeResidual(matrix, vector, rhs) {
  const residual = matrixVector(matrix, vector).map((value, index) => value - rhs[index]);
  return norm(residual) / Math.max(1, norm(rhs));
}

function submatrix(matrix, indices) { return indices.map((row) => indices.map((column) => matrix[row][column])); }
function zeroMatrix(size) { return Array.from({ length: size }, () => new Array(size).fill(0)); }
function diagonalMatrix(values) { return values.map((value, row) => values.map((_item, column) => (row === column ? value : 0))); }
function diagonalMatrixFromVector(values) { return diagonalMatrix(values); }
function addBlock(target, block, dofs) { for (let i = 0; i < dofs.length; i += 1) for (let j = 0; j < dofs.length; j += 1) target[dofs[i]][dofs[j]] += block[i][j]; }
function addMatrices(left, right) { return left.map((row, i) => row.map((value, j) => value + right[i][j])); }
function subtractMatrices(left, right) { return left.map((row, i) => row.map((value, j) => value - right[i][j])); }
function matrixVector(matrix, vector) { return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0)); }
function quadratic(vector, matrix) { const product = matrixVector(matrix, vector); return vector.reduce((sum, value, index) => sum + value * product[index], 0); }
function norm(vector) { return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)); }
function relativeDifference(value, reference) { return Math.abs(Number(value) - Number(reference)) / Math.max(1e-30, Math.abs(Number(reference))); }
function scalarSimilarity(left, right) { return 1 - Math.min(1, relativeDifference(left, right)); }
function sameNumberArray(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function deterministicDiagnostics(value) {
  if (Array.isArray(value)) return value.map(deterministicDiagnostics);
  if (!value || typeof value !== 'object') return value;
  const omitted = new Set(['durationMs', 'solveMs', 'handleId', 'startedAt', 'endedAt', 'timestamp']);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !omitted.has(key))
    .map(([key, child]) => [key, deterministicDiagnostics(child)]));
}
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function finiteInRange(value, fallback, minimum, maximum) { const number = Number(value); return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
