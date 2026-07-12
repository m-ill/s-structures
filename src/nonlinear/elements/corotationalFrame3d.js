import {
  localK12,
  localTrussK12,
  solveLinear,
} from '../../solver/linear3dElement.js';
import { collectMemberSpanLoads, recoverMemberStations } from '../../solver/linear3dRecovery.js';
import { CANONICAL_ELEMENT_DESCRIPTOR_VERSION } from '../../solver/domain/elementDescriptor.js';
import { createNonlinearElementContract } from '../core/elementContract.js';
import {
  SECOND_ORDER_JET_VERSION,
  jetAdd,
  jetAtan2,
  jetConstant,
  jetCos,
  jetDiv,
  jetMul,
  jetScale,
  jetSin,
  jetSqrt,
  jetSub,
  jetVariable,
} from '../math/secondOrderJet.js';
import {
  ROTATION_VECTOR_LIMIT,
  pushForwardGeneralizedMoment,
  requirePrincipalRotationVector,
  rotationCoordinateIncrementToSpatial,
  spatialRotationIncrementToCoordinates,
} from '../math/rotationCoordinates.js';

export const COROTATIONAL_FRAME_3D_VERSION = 'p8-m3-corotational-frame-3d-v2';
export const COROTATIONAL_FRAME_3D_STATE_VERSION = 'p8-m3-corotational-frame-state-v2';

const DOF_COUNT = 12;
const ROTATION_LOG_LIMIT = ROTATION_VECTOR_LIMIT;

export function createCorotationalFrame3dKernel(descriptor, options = {}) {
  const prepared = prepareDescriptor(descriptor, options);
  return createNonlinearElementContract({
    type: prepared.behavior === 'truss' ? 'corotational-truss-3d' : 'corotational-frame-3d',
    stateVersion: COROTATIONAL_FRAME_3D_STATE_VERSION,
    dofCount: DOF_COUNT,
    evaluate(input = {}) {
      const mode = input.mode || 'static';
      if (prepared.releases.length > 0 && mode !== 'static') {
        throw elementError(
          'COROTATIONAL_RELEASE_ENERGY_MODE_UNSUPPORTED',
          `Element ${descriptor.id} finite release is static-only and cannot run in ${mode} mode.`,
        );
      }
      if (input.elementLoads?.trace?.some((row) => row?.source?.follower === true)) {
        throw elementError('FOLLOWER_LOAD_UNSUPPORTED', `Element ${descriptor.id} contains a follower load.`);
      }
      if (prepared.behavior === 'truss') validateTrussMemberLoads(input.elementLoads?.trace, descriptor.id);
      const u = finiteVector(input?.trialKinematics?.uGlobal, DOF_COUNT, 'trialKinematics.uGlobal');
      if (prepared.behavior === 'frame' || prepared.offsets.i !== 0) {
        requirePrincipalRotationVector(u.slice(3, 6), `${descriptor.id}.rotationI`);
      }
      if (prepared.behavior === 'frame' || prepared.offsets.j !== 0) {
        requirePrincipalRotationVector(u.slice(9, 12), `${descriptor.id}.rotationJ`);
      }
      const loadFactor = input?.trialKinematics?.lambda ?? 0;
      const originalFixedEndForce = originalFixedEndFromTrace(
        input.elementLoads?.trace,
        loadFactor,
        DOF_COUNT,
      );
      const initialStrainForce = initialStrainFixedEndFromTrace(
        input.elementLoads?.trace,
        loadFactor,
        DOF_COUNT,
      );
      const mechanicalFixedEndForce = mechanicalOriginalFixedEndFromTrace(
        input.elementLoads?.trace,
        loadFactor,
        DOF_COUNT,
      );
      const condensedMechanicalFixedEndForce = mechanicalRecoveryFixedEndFromTrace(
        input.elementLoads?.trace,
        loadFactor,
        DOF_COUNT,
      );
      const mechanicalReferenceJointForce = numericTransposeMatrixVector(
        prepared.referenceTransform,
        mechanicalFixedEndForce,
      );
      const condensed = evaluateCondensedElement(
        prepared,
        u,
        initialStrainForce,
        mechanicalReferenceJointForce,
        input.committedState,
      );
      const response = condensed.response;
      const tangentGlobal = condensed.tangentGlobal;
      const resistingForceGlobal = condensed.resistingForceGlobal;
      const rawTangentSymmetryError = condensed.rawTangentSymmetryError;
      if (
        prepared.releases.length === 0
        && mechanicalFixedEndForce.every((value) => value === 0)
        && rawTangentSymmetryError > prepared.tangentSymmetryTolerance
      ) {
        throw elementError(
          'COROTATIONAL_TANGENT_NOT_SYMMETRIC',
          `Element ${descriptor.id} raw energy Hessian symmetry error is ${rawTangentSymmetryError}.`,
        );
      }
      const spatialResistingForceGlobal = resistingForceGlobal.slice();
      if (prepared.behavior === 'frame' || prepared.offsets.i !== 0) {
        spatialResistingForceGlobal.splice(3, 3, ...pushForwardGeneralizedMoment(u.slice(3, 6), resistingForceGlobal.slice(3, 6)));
      }
      if (prepared.behavior === 'frame' || prepared.offsets.j !== 0) {
        spatialResistingForceGlobal.splice(9, 3, ...pushForwardGeneralizedMoment(u.slice(9, 12), resistingForceGlobal.slice(9, 12)));
      }
      requireFiniteVector(resistingForceGlobal, 'resistingForceGlobal');
      requireFiniteMatrix(tangentGlobal, 'tangentGlobal');

      const deformation = response.deformation.map((value) => value.value);
      const generalizedElasticEndForce = numericMatrixVector(prepared.localStiffness, deformation);
      const elasticEndForce = response.physicalElasticEndForce.map((value) => value.value);
      const internalEndForce = response.physicalInternalEndForce.map((value) => value.value);
      const fixedEndForce = originalFixedEndForce;
      const currentAxes = response.currentAxes.map((axis) => axis.map((value) => value.value));
      const currentInternalEndForce = internalEndForce;
      const recoveredEndForce = response.physicalTotalEndForce.map((value) => value.value);
      const referenceInternalEndForce = transformLocalEndForce(
        currentInternalEndForce,
        currentAxes,
        prepared.referenceAxes,
      );
      const referenceRecoveredEndForce = transformLocalEndForce(
        recoveredEndForce,
        currentAxes,
        prepared.referenceAxes,
      );
      const effectiveDeformation = deformation;
      const inactiveModesGlobal = buildReleaseNullModes(prepared, u, condensed.releaseRotations);
      const basicRotationI = response.rotationI.map((value) => value.value);
      const basicRotationJ = response.rotationJ.map((value) => value.value);
      const currentLength = response.currentLength.value;
      const strainEnergy = response.elasticEnergy.value;
      const initialStrainPotential = response.initialStrainPotential.value;
      const elementPotential = response.energy.value;
      if (strainEnergy < -1e-8 * Math.max(1, Math.abs(strainEnergy))) {
        throw elementError('COROTATIONAL_ENERGY_NEGATIVE', `Element ${descriptor.id} produced negative strain energy.`);
      }

      const trialState = {
        version: COROTATIONAL_FRAME_3D_STATE_VERSION,
        elementId: descriptor.id,
        descriptorHash: descriptor.descriptorHash || null,
        currentLength,
        lengthRatio: currentLength / prepared.referenceLength,
        currentAxes,
        basicDeformation: effectiveDeformation,
        localEndForce: recoveredEndForce,
        axialForce: 0.5 * (recoveredEndForce[6] - recoveredEndForce[0]),
        strainEnergy,
        initialStrainPotential,
        elementPotential: prepared.releases.length ? null : elementPotential,
        energyConservative: prepared.releases.length === 0,
        releaseRotations: condensed.releaseRotations,
        releaseResidual: condensed.releaseResidual,
      };
      const scaledLoads = scaleMemberLoads(input.elementLoads?.trace, response.lambda ?? input?.trialKinematics?.lambda ?? 0);
      const stationLoads = collectMemberSpanLoads(descriptor.id, scaledLoads, {
        L: prepared.referenceLength,
        x: prepared.referenceAxes[0],
        y: prepared.referenceAxes[1],
        z: prepared.referenceAxes[2],
      });
      const stations = recoverMemberStations(
        referenceRecoveredEndForce,
        stationLoads,
        prepared.referenceLength,
        prepared.stationCount,
      );
      return {
        version: COROTATIONAL_FRAME_3D_VERSION,
        resistingForceGlobal,
        tangentGlobal,
        Pint: resistingForceGlobal.slice(),
        Kt: tangentGlobal.map((row) => row.slice()),
        inactiveModesGlobal,
        trialState,
        energies: {
          strain: strainEnergy,
          initialStrainPotential,
          ...(prepared.releases.length ? {} : { elementPotential }),
        },
        globalResponse: {
          generalizedResistingForce: resistingForceGlobal.slice(),
          resistingForce: spatialResistingForceGlobal,
        },
        localResponse: {
          deformation: effectiveDeformation,
          nodalBasicDeformation: condensed.nodalDeformation,
          basicRotationI,
          basicRotationJ,
          generalizedElasticResistingForce: generalizedElasticEndForce,
          elasticResistingForce: elasticEndForce,
          internalResistingForce: internalEndForce,
          fixedEndForce,
          condensedMechanicalFixedEndForce,
          resistingForce: recoveredEndForce,
          currentInternalResistingForce: currentInternalEndForce,
          referenceInternalResistingForce: referenceInternalEndForce,
          referenceResistingForce: referenceRecoveredEndForce,
          recoveryCoordinate: 'reference',
          currentLength,
          referenceLength: prepared.referenceLength,
          currentAxes,
          referenceAxes: prepared.referenceAxes.map((axis) => axis.slice()),
          releases: prepared.releases.slice(),
          stations,
          stationLoadIssues: stationLoads.issues || [],
        },
        diagnostics: {
          version: COROTATIONAL_FRAME_3D_VERSION,
          formulation: 'objective-energy-corotational-3d',
          tangent: 'exact-second-order-automatic-differentiation',
          rawTangentSymmetryError,
          jetVersion: SECOND_ORDER_JET_VERSION,
          behavior: prepared.behavior,
          finiteRotationCoordinates: 'total-global-rotation-vector-principal-branch',
          rotationLogLimit: ROTATION_LOG_LIMIT,
          followerLoads: 'unsupported-fail-closed',
          rigidOffsets: prepared.offsets.i !== 0 || prepared.offsets.j !== 0,
          released: prepared.releases.length > 0,
          releaseIterations: condensed.releaseIterations,
          releaseResidual: condensed.releaseResidual,
          energyConservative: prepared.releases.length === 0,
          releaseFormulation: prepared.releases.length
            ? 'physical-current-axis-zero-moment-internal-newton'
            : null,
        },
      };
    },
  });
}

export function buildCorotationalFrame3dEntries(domain, options = {}) {
  if (!domain?.ok || !Array.isArray(domain.elements)) {
    throw elementError('COROTATIONAL_DOMAIN_INVALID', 'A valid canonical analysis domain is required.');
  }
  return domain.elements.map((descriptor) => Object.freeze({
    id: descriptor.id,
    dofs: Int32Array.from(descriptor.fullDofs),
    descriptor,
    handlesMemberPrestress: true,
    handlesMechanicalMemberLoads: true,
    usesFiniteRotationCoordinates: true,
    kernel: createCorotationalFrame3dKernel(descriptor, options),
  }));
}

function evaluateEnergy(
  prepared,
  q,
  initialStrainForce = new Array(DOF_COUNT).fill(0),
  mechanicalReferenceJointForce = new Array(DOF_COUNT).fill(0),
) {
  const n = q[0].size;
  const zero = () => jetConstant(0, n);
  const one = () => jetConstant(1, n);
  const rotationI = rotationMatrix(q.slice(3, 6));
  const rotationJ = rotationMatrix(q.slice(9, 12));
  const baseOrientationI = matrixMultiplyConstantRight(rotationI, prepared.referenceMatrix);
  const baseOrientationJ = matrixMultiplyConstantRight(rotationJ, prepared.referenceMatrix);
  const hingeRotationI = [zero(), zero(), zero()];
  const hingeRotationJ = [zero(), zero(), zero()];
  for (const release of prepared.releaseVariables) {
    const value = q[release.variableIndex] || zero();
    (release.end === 'i' ? hingeRotationI : hingeRotationJ)[release.axis] = value;
  }
  const orientationI = matrixMultiply(baseOrientationI, rotationMatrix(hingeRotationI));
  const orientationJ = matrixMultiply(baseOrientationJ, rotationMatrix(hingeRotationJ));

  const endpointI = vectorAdd(
    [q[0], q[1], q[2]],
    matrixVector(rotationI, prepared.offsetVectorI.map((value) => jetConstant(value, n))),
  );
  const referenceJointJ = prepared.referenceJointJ.map((value) => jetConstant(value, n));
  const endpointJ = vectorAdd(
    vectorAdd(referenceJointJ, [q[6], q[7], q[8]]),
    matrixVector(rotationJ, prepared.offsetVectorJ.map((value) => jetConstant(value, n))),
  );
  const chord = vectorSub(endpointJ, endpointI);
  const currentLength = vectorNorm(chord);
  if (!(currentLength.value > prepared.minimumLength)) {
    throw elementError('COROTATIONAL_LENGTH_COLLAPSE', `Element ${prepared.id} current length is below the admissible limit.`);
  }
  const e1 = vectorScale(chord, jetDiv(one(), currentLength));
  let e2;
  let e3;
  let localRotationI;
  let localRotationJ;
  if (prepared.behavior === 'truss') {
    const referenceY = prepared.referenceAxes[1].map((value) => jetConstant(value, n));
    const projectedY = vectorSub(referenceY, vectorScale(e1, vectorDot(e1, referenceY)));
    if (vectorNormValue(projectedY) > 1e-8) {
      e2 = vectorNormalize(projectedY);
      e3 = vectorNormalize(vectorCross(e1, e2));
      e2 = vectorNormalize(vectorCross(e3, e1));
    } else {
      const referenceZ = prepared.referenceAxes[2].map((value) => jetConstant(value, n));
      const projectedZ = vectorSub(referenceZ, vectorScale(e1, vectorDot(e1, referenceZ)));
      if (!(vectorNormValue(projectedZ) > 1e-8)) {
        throw elementError('COROTATIONAL_TRIAD_DEGENERATE', `Element ${prepared.id} cannot form a current local triad.`);
      }
      e3 = vectorNormalize(projectedZ);
      e2 = vectorNormalize(vectorCross(e3, e1));
      e3 = vectorNormalize(vectorCross(e1, e2));
    }
    localRotationI = [zero(), zero(), zero()];
    localRotationJ = [zero(), zero(), zero()];
  } else {
    const averageY = vectorAdd(matrixColumn(orientationI, 1), matrixColumn(orientationJ, 1));
    const projectedY = vectorSub(averageY, vectorScale(e1, vectorDot(e1, averageY)));
    if (vectorNormValue(projectedY) > 1e-8) {
      e2 = vectorNormalize(projectedY);
      e3 = vectorNormalize(vectorCross(e1, e2));
      e2 = vectorNormalize(vectorCross(e3, e1));
    } else {
      const averageZ = vectorAdd(matrixColumn(orientationI, 2), matrixColumn(orientationJ, 2));
      const projectedZ = vectorSub(averageZ, vectorScale(e1, vectorDot(e1, averageZ)));
      if (!(vectorNormValue(projectedZ) > 1e-8)) {
        throw elementError('COROTATIONAL_TRIAD_DEGENERATE', `Element ${prepared.id} cannot form a current local triad.`);
      }
      e3 = vectorNormalize(projectedZ);
      e2 = vectorNormalize(vectorCross(e3, e1));
      e3 = vectorNormalize(vectorCross(e1, e2));
    }
    const currentMatrix = matrixFromColumns(e1, e2, e3);
    const relativeI = matrixMultiply(matrixTranspose(currentMatrix), orientationI);
    const relativeJ = matrixMultiply(matrixTranspose(currentMatrix), orientationJ);
    localRotationI = rotationLog(relativeI);
    localRotationJ = rotationLog(relativeJ);
  }
  const currentMatrix = matrixFromColumns(e1, e2, e3);
  const extension = jetSub(currentLength, jetConstant(prepared.referenceLength, n));
  const deformation = [
    zero(), zero(), zero(),
    ...localRotationI,
    extension, zero(), zero(),
    ...localRotationJ,
  ];
  const localForce = constantMatrixVector(prepared.localStiffness, deformation);
  const generalizedInternalForce = localForce.map((value, index) => jetAdd(
    value,
    jetConstant(Number(initialStrainForce[index] || 0), n),
  ));
  const physicalElasticEndForce = physicalLocalEndForceJets(localForce, localRotationI, localRotationJ);
  const physicalInternalEndForce = physicalLocalEndForceJets(generalizedInternalForce, localRotationI, localRotationJ);
  const physicalMechanicalEndForce = mechanicalJointToCurrentFaceJets(
    prepared,
    q,
    [e1, e2, e3],
    mechanicalReferenceJointForce,
  );
  const physicalTotalEndForce = physicalInternalEndForce.map((value, index) => (
    jetAdd(value, physicalMechanicalEndForce[index])
  ));
  let elasticEnergy = zero();
  let initialStrainPotential = zero();
  for (let index = 0; index < DOF_COUNT; index += 1) {
    elasticEnergy = jetAdd(elasticEnergy, jetScale(jetMul(deformation[index], localForce[index]), 0.5));
    initialStrainPotential = jetAdd(
      initialStrainPotential,
      jetScale(deformation[index], Number(initialStrainForce[index] || 0)),
    );
  }
  const energy = jetAdd(elasticEnergy, initialStrainPotential);
  const releaseResiduals = prepared.releaseVariables.map((release) => physicalTotalEndForce[release.dof]);
  return {
    coordinates: q,
    energy,
    elasticEnergy,
    initialStrainPotential,
    physicalElasticEndForce,
    physicalInternalEndForce,
    physicalMechanicalEndForce,
    physicalTotalEndForce,
    releaseResiduals,
    deformation,
    currentLength,
    currentAxes: [e1, e2, e3],
    rotationI: localRotationI,
    rotationJ: localRotationJ,
  };
}

function evaluateCondensedElement(
  prepared,
  u,
  initialStrainForce,
  mechanicalReferenceJointForce,
  committedState,
) {
  const releaseCount = prepared.releaseVariables.length;
  if (releaseCount === 0) {
    const variables = u.map((value, index) => jetVariable(value, index, DOF_COUNT));
    const response = evaluateEnergy(prepared, variables, initialStrainForce, mechanicalReferenceJointForce);
    const mechanicalJets = mechanicalJointGeneralizedJets(variables, mechanicalReferenceJointForce);
    const tangentGlobal = hessianMatrix(response.energy.hessian, DOF_COUNT);
    for (let row = 0; row < DOF_COUNT; row += 1) {
      for (let column = 0; column < DOF_COUNT; column += 1) {
        tangentGlobal[row][column] += mechanicalJets[row].gradient[column];
      }
    }
    return {
      response,
      resistingForceGlobal: Array.from(response.energy.gradient, (value, index) => value + mechanicalJets[index].value),
      tangentGlobal,
      rawTangentSymmetryError: mechanicalReferenceJointForce.every((value) => value === 0)
        ? flatHessianSymmetryError(response.energy.hessian, DOF_COUNT)
        : matrixSymmetryError(tangentGlobal),
      releaseRotations: [],
      releaseResidual: 0,
      releaseIterations: 0,
      nodalDeformation: response.deformation.map((value) => value.value),
    };
  }

  let releases = optionalReleaseState(committedState?.releaseRotations, releaseCount);
  let evaluated;
  let residualNorm = Infinity;
  let iteration = 0;
  for (; iteration < prepared.releaseMaxIterations; iteration += 1) {
    evaluated = evaluateReleaseJets(prepared, u, releases, initialStrainForce, mechanicalReferenceJointForce);
    const releaseIndices = prepared.releaseVariables.map((item) => item.variableIndex);
    const residual = evaluated.releaseResiduals.map((value) => value.value);
    residualNorm = Math.max(0, ...residual.map((value) => Math.abs(Number(value))));
    const internalScaleVector = numericMatrixVector(
      prepared.localStiffness,
      evaluated.deformation.map((value) => value.value),
    );
    const momentScale = Math.max(
      1,
      ...[3, 4, 5, 9, 10, 11].map((index) => Math.abs(internalScaleVector[index])),
      ...[3, 4, 5, 9, 10, 11].map((index) => Math.abs(initialStrainForce[index])),
      ...[3, 4, 5, 9, 10, 11].map((index) => Math.abs(evaluated.physicalMechanicalEndForce[index].value)),
    );
    if (residualNorm <= prepared.releaseAbsoluteTolerance + prepared.releaseTolerance * momentScale) break;
    const hessian = evaluated.releaseResiduals.map((residualJet) => (
      releaseIndices.map((column) => residualJet.gradient[column])
    ));
    const correction = solveLinear(hessian.map((row) => row.slice()), residual.map((value) => -value));
    if (!correction || correction.some((value) => !Number.isFinite(value))) {
      throw elementError('COROTATIONAL_RELEASE_INTERNAL_SINGULAR', `Element ${prepared.id} release internal tangent is singular.`);
    }
    let accepted = null;
    for (const alpha of [1, 0.5, 0.25, 0.125, 0.0625, 0.03125]) {
      const candidate = releases.map((value, index) => value + alpha * correction[index]);
      const trial = evaluateReleaseJets(prepared, u, candidate, initialStrainForce, mechanicalReferenceJointForce);
      const norm = Math.max(0, ...trial.releaseResiduals.map((value) => Math.abs(value.value)));
      if (!accepted || norm < accepted.norm) accepted = { values: candidate, response: trial, norm };
      if (norm < residualNorm) break;
    }
    if (!accepted || !(accepted.norm < residualNorm)) {
      throw elementError('COROTATIONAL_RELEASE_INTERNAL_LINE_SEARCH', `Element ${prepared.id} release equilibrium did not improve.`);
    }
    releases = accepted.values;
    evaluated = accepted.response;
  }
  if (!evaluated || iteration >= prepared.releaseMaxIterations) {
    throw elementError('COROTATIONAL_RELEASE_INTERNAL_NONCONVERGENCE', `Element ${prepared.id} release equilibrium did not converge.`);
  }

  const forceJets = releasedGlobalInternalForceJets(prepared, evaluated);
  const resistingForceGlobal = forceJets.map((value) => value.value);
  const releaseIndices = prepared.releaseVariables.map((item) => item.variableIndex);
  const releaseJacobian = evaluated.releaseResiduals.map((residualJet) => (
    releaseIndices.map((column) => residualJet.gradient[column])
  ));
  const tangentGlobal = forceJets.map((forceJet) => Array.from(forceJet.gradient.slice(0, DOF_COUNT)));
  for (let column = 0; column < DOF_COUNT; column += 1) {
    const coupling = evaluated.releaseResiduals.map((residualJet) => residualJet.gradient[column]);
    const releaseDerivative = solveLinear(releaseJacobian.map((row) => row.slice()), coupling);
    if (!releaseDerivative) {
      throw elementError('COROTATIONAL_RELEASE_INTERNAL_SINGULAR', `Element ${prepared.id} release tangent condensation failed.`);
    }
    for (let row = 0; row < DOF_COUNT; row += 1) {
      for (let release = 0; release < releaseCount; release += 1) {
        tangentGlobal[row][column] -= forceJets[row].gradient[releaseIndices[release]] * releaseDerivative[release];
      }
    }
  }
  const nodalVariables = u.map((value, index) => jetVariable(value, index, DOF_COUNT));
  const nodalDeformation = evaluateEnergy(
    prepared,
    nodalVariables,
    initialStrainForce,
    mechanicalReferenceJointForce,
  ).deformation.map((value) => value.value);
  return {
    response: evaluated,
    resistingForceGlobal,
    tangentGlobal,
    rawTangentSymmetryError: matrixSymmetryError(tangentGlobal),
    releaseRotations: releases,
    releaseResidual: residualNorm,
    releaseIterations: iteration,
    nodalDeformation,
  };
}

function evaluateReleaseJets(prepared, u, releases, initialStrainForce, mechanicalReferenceJointForce) {
  const values = [...u, ...releases];
  const variables = values.map((value, index) => jetVariable(value, index, values.length));
  return evaluateEnergy(prepared, variables, initialStrainForce, mechanicalReferenceJointForce);
}

function mechanicalJointGeneralizedJets(coordinates, jointForce) {
  const size = coordinates[0].size;
  const output = Array.from({ length: DOF_COUNT }, () => jetConstant(0, size));
  for (const base of [0, 6]) {
    output.splice(base, 3, ...jointForce.slice(base, base + 3).map((value) => jetConstant(value, size)));
    const spatialMoment = jointForce.slice(base + 3, base + 6).map((value) => jetConstant(value, size));
    output.splice(
      base + 3,
      3,
      ...pullBackSpatialMomentJets(coordinates.slice(base + 3, base + 6), spatialMoment),
    );
  }
  return output;
}

function mechanicalJointToCurrentFaceJets(prepared, coordinates, axes, jointForce) {
  const size = coordinates[0].size;
  const output = Array.from({ length: DOF_COUNT }, () => jetConstant(0, size));
  for (const end of [0, 1]) {
    const base = end * 6;
    const forceGlobal = jointForce.slice(base, base + 3).map((value) => jetConstant(value, size));
    const momentJoint = jointForce.slice(base + 3, base + 6).map((value) => jetConstant(value, size));
    const offsetReference = end === 0 ? prepared.offsetVectorI : prepared.offsetVectorJ;
    const offset = matrixVector(
      rotationMatrix(coordinates.slice(base + 3, base + 6)),
      offsetReference.map((value) => jetConstant(value, size)),
    );
    const momentFace = vectorSub(momentJoint, vectorCross(offset, forceGlobal));
    output.splice(base, 3, ...globalToLocalVectorJets(axes, forceGlobal));
    output.splice(base + 3, 3, ...globalToLocalVectorJets(axes, momentFace));
  }
  return output;
}

function releasedGlobalInternalForceJets(prepared, response) {
  const coordinates = response.coordinates;
  const size = coordinates[0].size;
  const axes = response.currentAxes;
  const local = response.physicalTotalEndForce;
  const output = Array.from({ length: DOF_COUNT }, () => jetConstant(0, size));
  for (const end of [0, 1]) {
    const localBase = end * 6;
    const globalBase = end * 6;
    const force = localToGlobalVectorJets(axes, local.slice(localBase, localBase + 3));
    const momentAtFace = localToGlobalVectorJets(axes, local.slice(localBase + 3, localBase + 6));
    const nodalRotation = coordinates.slice(globalBase + 3, globalBase + 6);
    const offsetReference = end === 0 ? prepared.offsetVectorI : prepared.offsetVectorJ;
    const offset = matrixVector(
      rotationMatrix(nodalRotation),
      offsetReference.map((value) => jetConstant(value, size)),
    );
    const momentAtJoint = vectorAdd(momentAtFace, vectorCross(offset, force));
    output.splice(globalBase, 3, ...force);
    output.splice(globalBase + 3, 3, ...pullBackSpatialMomentJets(nodalRotation, momentAtJoint));
  }
  return output;
}

function localToGlobalVectorJets(axes, local) {
  const size = local[0].size;
  return [0, 1, 2].map((globalAxis) => (
    [0, 1, 2].reduce(
      (sum, localAxis) => jetAdd(sum, jetMul(axes[localAxis][globalAxis], local[localAxis])),
      jetConstant(0, size),
    )
  ));
}

function globalToLocalVectorJets(axes, global) {
  return axes.map((axis) => vectorDot(axis, global));
}

function pullBackSpatialMomentJets(rotation, spatialMoment) {
  const size = rotation[0].size;
  const zero = jetConstant(0, size);
  const one = jetConstant(1, size);
  const angle2 = vectorDot(rotation, rotation);
  let a;
  let b;
  if (angle2.value < 1e-8) {
    const angle4 = jetMul(angle2, angle2);
    const angle6 = jetMul(angle4, angle2);
    a = jetAdd(
      jetAdd(jetConstant(0.5, size), jetScale(angle2, -1 / 24)),
      jetAdd(jetScale(angle4, 1 / 720), jetScale(angle6, -1 / 40320)),
    );
    b = jetAdd(
      jetAdd(jetConstant(1 / 6, size), jetScale(angle2, -1 / 120)),
      jetAdd(jetScale(angle4, 1 / 5040), jetScale(angle6, -1 / 362880)),
    );
  } else {
    const angle = jetSqrt(angle2);
    a = jetDiv(jetSub(one, jetCos(angle)), angle2);
    b = jetDiv(jetSub(angle, jetSin(angle)), jetMul(angle2, angle));
  }
  const [x, y, z] = rotation;
  const skewJets = [
    [zero, jetScale(z, -1), y],
    [z, zero, jetScale(x, -1)],
    [jetScale(y, -1), x, zero],
  ];
  const skew2 = matrixMultiply(skewJets, skewJets);
  const transposeJacobian = identityMatrix(size).map((row, i) => row.map((value, j) => jetAdd(
    value,
    jetAdd(jetScale(jetMul(a, skewJets[i][j]), -1), jetMul(b, skew2[i][j])),
  )));
  return matrixVector(transposeJacobian, spatialMoment);
}

function optionalReleaseState(values, length) {
  if (values == null) return new Array(length).fill(0);
  return finiteVector(values, length, 'committedState.releaseRotations');
}

function prepareDescriptor(descriptor, options) {
  if (
    !descriptor
    || descriptor.version !== CANONICAL_ELEMENT_DESCRIPTOR_VERSION
    || descriptor.fullDofs?.length !== DOF_COUNT
  ) {
    throw elementError('COROTATIONAL_DESCRIPTOR_INVALID', 'A canonical 12-DOF element descriptor is required.');
  }
  const referenceLength = positive(descriptor.geometry?.length, 'geometry.length');
  const grossLength = positive(descriptor.geometry?.grossLength ?? referenceLength, 'geometry.grossLength');
  const axes = descriptor.geometry?.axes;
  const referenceAxes = ['x', 'y', 'z'].map((key) => finiteVector(axes?.[key], 3, `geometry.axes.${key}`));
  validateOrthonormal(referenceAxes);
  const referenceMatrix = matrixFromNumericColumns(...referenceAxes);
  const referenceTransform = descriptor.geometry?.transform?.map((row) => Array.from(row, Number));
  requireFiniteMatrix(referenceTransform, 'geometry.transform');
  if (referenceTransform.length !== DOF_COUNT || referenceTransform.some((row) => row.length !== DOF_COUNT)) {
    throw elementError('COROTATIONAL_REFERENCE_TRANSFORM_INVALID', 'Reference transform must be 12 by 12.');
  }
  const offsets = {
    i: nonnegative(descriptor.geometry?.offsets?.i ?? 0, 'geometry.offsets.i'),
    j: nonnegative(descriptor.geometry?.offsets?.j ?? 0, 'geometry.offsets.j'),
    rigidFactor: finite(descriptor.geometry?.offsets?.rigidFactor ?? 1, 'geometry.offsets.rigidFactor'),
  };
  if (Math.abs(offsets.rigidFactor - 1) > 1e-12) {
    throw elementError('COROTATIONAL_OFFSET_RIGID_FACTOR_UNSUPPORTED', 'Corotational rigid offsets require rigidFactor=1.');
  }
  if (Math.abs(grossLength - offsets.i - offsets.j - referenceLength) > 1e-8 * Math.max(1, grossLength)) {
    throw elementError('COROTATIONAL_OFFSET_LENGTH_INCONSISTENT', 'Gross length, offsets, and clear length are inconsistent.');
  }
  const material = descriptor.propertySnapshot?.effectiveMaterial || descriptor.propertySnapshot?.material || {};
  const section = descriptor.propertySnapshot?.effectiveSection || descriptor.propertySnapshot?.section || {};
  const E = positive(material.E, 'material.E');
  const A = positive(section.A, 'section.A');
  const sourceBehavior = descriptor.behavior || descriptor.type;
  if (!['frame', 'truss', 'tensionOnly', 'compressionOnly'].includes(sourceBehavior)) {
    throw elementError(
      'COROTATIONAL_BEHAVIOR_UNSUPPORTED',
      `Element ${descriptor.id} behavior ${sourceBehavior || '(missing)'} is unsupported.`,
    );
  }
  if (['tensionOnly', 'compressionOnly'].includes(sourceBehavior)) {
    throw elementError(
      'COROTATIONAL_UNILATERAL_UNSUPPORTED',
      `Element ${descriptor.id} requires an active-set unilateral formulation that is not available in P8-M3.`,
    );
  }
  const behavior = sourceBehavior === 'truss' ? 'truss' : 'frame';
  let localStiffness;
  if (behavior === 'truss') {
    localStiffness = localTrussK12(E, A, referenceLength);
  } else {
    const G = positive(material.G, 'material.G');
    const Iy = nonnegative(section.Iy, 'section.Iy');
    const Iz = nonnegative(section.Iz, 'section.Iz');
    const J = nonnegative(section.J, 'section.J');
    localStiffness = localK12(E, G, A, Iy, Iz, J, referenceLength);
  }
  const releases = normalizeReleases(descriptor.releases?.localDofs, descriptor.id);
  validateReleaseContract(descriptor.releases?.contract, releases, descriptor.id);
  if (behavior === 'truss' && releases.length) {
    throw elementError('COROTATIONAL_TRUSS_RELEASE_REDUNDANT', `Truss element ${descriptor.id} cannot carry frame end releases.`);
  }
  if (releases.some((dof) => ![3, 4, 5, 9, 10, 11].includes(dof))) {
    throw elementError('COROTATIONAL_RELEASE_TRANSLATION_UNSUPPORTED', `Element ${descriptor.id} contains a non-rotational release.`);
  }
  requireFiniteMatrix(localStiffness, 'localStiffness');
  const releaseVariables = releases.map((dof, index) => Object.freeze({
    dof,
    variableIndex: DOF_COUNT + index,
    end: dof < 6 ? 'i' : 'j',
    axis: dof % 6 - 3,
  }));
  const referenceX = referenceAxes[0];
  return Object.freeze({
    id: descriptor.id,
    behavior,
    referenceLength,
    grossLength,
    referenceAxes,
    referenceMatrix,
    referenceTransform,
    referenceJointJ: referenceX.map((value) => value * grossLength),
    offsetVectorI: referenceX.map((value) => value * offsets.i),
    offsetVectorJ: referenceX.map((value) => -value * offsets.j),
    offsets,
    releases,
    releaseVariables,
    localStiffness,
    minimumLength: positive(options.minimumLength, Math.max(1e-10, referenceLength * 1e-9)),
    stationCount: Math.max(21, Math.trunc(positive(options.stationCount, 21))),
    tangentSymmetryTolerance: nonnegative(options.tangentSymmetryTolerance ?? 1e-12, 'tangentSymmetryTolerance'),
    releaseTolerance: positive(options.releaseTolerance, 1e-11),
    releaseAbsoluteTolerance: positive(options.releaseAbsoluteTolerance, 1e-8),
    releaseMaxIterations: Math.max(4, Math.trunc(positive(options.releaseMaxIterations, 24))),
  });
}

function scaleMemberLoads(trace, lambda) {
  const scaleKeys = new Set(['P', 'M', 'w', 'w1', 'w2', 'dT', 'dTtop', 'dTbot']);
  return (Array.isArray(trace) ? trace : []).flatMap((row) => {
    if (!row?.source || row.status === 'failed') return [];
    const factor = row.role === 'constant' ? 1 : Number(lambda);
    if (!Number.isFinite(factor)) throw elementError('COROTATIONAL_LOAD_FACTOR_NONFINITE', 'Member-load factor must be finite.');
    const load = structuredCloneSafe(row.source);
    for (const key of scaleKeys) {
      if (load[key] == null) continue;
      const value = Number(load[key]);
      if (!Number.isFinite(value)) throw elementError('COROTATIONAL_MEMBER_LOAD_NONFINITE', `${load.id || load.type}.${key} must be finite.`);
      load[key] = value * factor;
    }
    return [load];
  });
}

function originalFixedEndFromTrace(trace, lambda, length) {
  const output = new Array(length).fill(0);
  for (const row of Array.isArray(trace) ? trace : []) {
    const values = row?.fixedEnd?.q0;
    if (values == null || values.length !== length) continue;
    const factor = row.role === 'constant' ? 1 : Number(lambda);
    if (!Number.isFinite(factor)) throw elementError('COROTATIONAL_LOAD_FACTOR_NONFINITE', 'Member-load factor must be finite.');
    values.forEach((value, index) => {
      const number = Number(value);
      if (!Number.isFinite(number)) throw elementError('COROTATIONAL_MEMBER_LOAD_NONFINITE', 'Original fixed-end force must be finite.');
      output[index] += factor * number;
    });
  }
  return output;
}

function mechanicalRecoveryFixedEndFromTrace(trace, lambda, length) {
  const output = new Array(length).fill(0);
  for (const row of Array.isArray(trace) ? trace : []) {
    if (['temperature', 'tgradient'].includes(row?.source?.type)) continue;
    const values = row?.condensedFixedEnd || row?.fixedEnd?.q0;
    if (values == null || values.length !== length) continue;
    const factor = row.role === 'constant' ? 1 : Number(lambda);
    if (!Number.isFinite(factor)) throw elementError('COROTATIONAL_LOAD_FACTOR_NONFINITE', 'Mechanical member-load factor must be finite.');
    values.forEach((value, index) => {
      const number = Number(value);
      if (!Number.isFinite(number)) throw elementError('COROTATIONAL_MEMBER_LOAD_NONFINITE', 'Condensed mechanical fixed-end force must be finite.');
      output[index] += factor * number;
    });
  }
  return output;
}

function mechanicalOriginalFixedEndFromTrace(trace, lambda, length) {
  const output = new Array(length).fill(0);
  for (const row of Array.isArray(trace) ? trace : []) {
    if (['temperature', 'tgradient'].includes(row?.source?.type)) continue;
    const values = row?.fixedEnd?.q0;
    if (values == null || values.length !== length) continue;
    const factor = row.role === 'constant' ? 1 : Number(lambda);
    if (!Number.isFinite(factor)) throw elementError('COROTATIONAL_LOAD_FACTOR_NONFINITE', 'Mechanical member-load factor must be finite.');
    values.forEach((value, index) => {
      const number = Number(value);
      if (!Number.isFinite(number)) throw elementError('COROTATIONAL_MEMBER_LOAD_NONFINITE', 'Original mechanical fixed-end force must be finite.');
      output[index] += factor * number;
    });
  }
  return output;
}

function initialStrainFixedEndFromTrace(trace, lambda, length) {
  const output = new Array(length).fill(0);
  for (const row of Array.isArray(trace) ? trace : []) {
    if (!['temperature', 'tgradient'].includes(row?.source?.type)) continue;
    const values = row?.fixedEnd?.q0;
    if (values == null || values.length !== length) continue;
    const factor = row.role === 'constant' ? 1 : Number(lambda);
    if (!Number.isFinite(factor)) throw elementError('COROTATIONAL_LOAD_FACTOR_NONFINITE', 'Initial-strain load factor must be finite.');
    values.forEach((value, index) => {
      const number = Number(value);
      if (!Number.isFinite(number)) throw elementError('COROTATIONAL_MEMBER_LOAD_NONFINITE', 'Initial-strain fixed-end force must be finite.');
      output[index] += factor * number;
    });
  }
  return output;
}

function validateTrussMemberLoads(trace, id) {
  for (const row of Array.isArray(trace) ? trace : []) {
    const values = row?.fixedEnd?.q0;
    if (values == null || values.length !== DOF_COUNT) continue;
    const scale = Math.max(1, ...Array.from(values, (value) => Math.abs(Number(value))));
    const transverse = values.some((value, index) => ![0, 6].includes(index) && Math.abs(Number(value)) > 1e-12 * scale);
    if (transverse) {
      throw elementError(
        'COROTATIONAL_TRUSS_TRANSVERSE_MEMBER_LOAD_UNSUPPORTED',
        `Truss element ${id} contains a transverse member load that requires a frame formulation.`,
      );
    }
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function rotationMatrix(vector) {
  const n = vector[0].size;
  const one = jetConstant(1, n);
  const zero = jetConstant(0, n);
  const [x, y, z] = vector;
  const skew = [
    [zero, jetScale(z, -1), y],
    [z, zero, jetScale(x, -1)],
    [jetScale(y, -1), x, zero],
  ];
  const angle2 = vectorDot(vector, vector);
  let a;
  let b;
  if (angle2.value < 1e-8) {
    const angle4 = jetMul(angle2, angle2);
    const angle6 = jetMul(angle4, angle2);
    a = jetAdd(
      jetAdd(one, jetScale(angle2, -1 / 6)),
      jetAdd(jetScale(angle4, 1 / 120), jetScale(angle6, -1 / 5040)),
    );
    b = jetAdd(
      jetAdd(jetConstant(0.5, n), jetScale(angle2, -1 / 24)),
      jetAdd(jetScale(angle4, 1 / 720), jetScale(angle6, -1 / 40320)),
    );
  } else {
    const angle = jetSqrt(angle2);
    a = jetDiv(jetSin(angle), angle);
    b = jetDiv(jetSub(one, jetCos(angle)), angle2);
  }
  const skew2 = matrixMultiply(skew, skew);
  const identity = identityMatrix(n);
  return identity.map((row, i) => row.map((value, j) => (
    jetAdd(value, jetAdd(jetMul(a, skew[i][j]), jetMul(b, skew2[i][j])))
  )));
}

function rotationLog(matrix) {
  const n = matrix[0][0].size;
  const trace = jetAdd(matrix[0][0], jetAdd(matrix[1][1], matrix[2][2]));
  const wArgument = jetAdd(jetConstant(1, n), trace);
  if (!(wArgument.value > 1e-8)) {
    throw elementError('COROTATIONAL_RELATIVE_ROTATION_LIMIT', 'Relative element rotation reached the principal-log branch limit.');
  }
  const w = jetScale(jetSqrt(wArgument), 0.5);
  const denominator = jetScale(w, 4);
  const quaternion = [
    jetDiv(jetSub(matrix[2][1], matrix[1][2]), denominator),
    jetDiv(jetSub(matrix[0][2], matrix[2][0]), denominator),
    jetDiv(jetSub(matrix[1][0], matrix[0][1]), denominator),
  ];
  const vector2 = vectorDot(quaternion, quaternion);
  let factor;
  if (vector2.value < 1e-10) {
    const vector4 = jetMul(vector2, vector2);
    factor = jetAdd(
      jetConstant(2, n),
      jetAdd(jetScale(vector2, 1 / 3), jetScale(vector4, 3 / 20)),
    );
  } else {
    const vectorNorm = jetSqrt(vector2);
    const angle = jetScale(jetAtan2(vectorNorm, w), 2);
    if (Math.abs(angle.value) >= ROTATION_LOG_LIMIT) {
      throw elementError('COROTATIONAL_RELATIVE_ROTATION_LIMIT', 'Relative element rotation reached the principal-log branch limit.');
    }
    factor = jetDiv(angle, vectorNorm);
  }
  return vectorScale(quaternion, factor);
}

function identityMatrix(size) {
  return Array.from({ length: 3 }, (_row, i) => (
    Array.from({ length: 3 }, (_column, j) => jetConstant(i === j ? 1 : 0, size))
  ));
}

function matrixMultiply(left, right) {
  return left.map((row, i) => right[0].map((_value, j) => {
    let value = jetConstant(0, left[0][0].size);
    for (let k = 0; k < right.length; k += 1) value = jetAdd(value, jetMul(left[i][k], right[k][j]));
    return value;
  }));
}

function matrixMultiplyConstantRight(left, right) {
  return left.map((row, i) => right[0].map((_value, j) => {
    let value = jetConstant(0, left[0][0].size);
    for (let k = 0; k < right.length; k += 1) value = jetAdd(value, jetScale(left[i][k], right[k][j]));
    return value;
  }));
}

function matrixTranspose(matrix) {
  return matrix[0].map((_value, column) => matrix.map((row) => row[column]));
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce(
    (sum, value, index) => jetAdd(sum, jetMul(value, vector[index])),
    jetConstant(0, matrix[0][0].size),
  ));
}

function constantMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce(
    (sum, value, index) => jetAdd(sum, jetScale(vector[index], value)),
    jetConstant(0, vector[0].size),
  ));
}

function vectorAdd(left, right) {
  return left.map((value, index) => jetAdd(value, right[index]));
}

function vectorSub(left, right) {
  return left.map((value, index) => jetSub(value, right[index]));
}

function vectorScale(vector, scalar) {
  return vector.map((value) => jetMul(value, scalar));
}

function vectorDot(left, right) {
  let value = jetConstant(0, left[0].size);
  for (let index = 0; index < left.length; index += 1) value = jetAdd(value, jetMul(left[index], right[index]));
  return value;
}

function vectorCross(left, right) {
  return [
    jetSub(jetMul(left[1], right[2]), jetMul(left[2], right[1])),
    jetSub(jetMul(left[2], right[0]), jetMul(left[0], right[2])),
    jetSub(jetMul(left[0], right[1]), jetMul(left[1], right[0])),
  ];
}

function vectorNorm(vector) {
  return jetSqrt(vectorDot(vector, vector));
}

function vectorNormValue(vector) {
  return Math.hypot(...vector.map((value) => value.value));
}

function vectorNormalize(vector) {
  const norm = vectorNorm(vector);
  return vectorScale(vector, jetDiv(jetConstant(1, norm.size), norm));
}

function matrixColumn(matrix, column) {
  return matrix.map((row) => row[column]);
}

function matrixFromColumns(...columns) {
  return columns[0].map((_value, row) => columns.map((column) => column[row]));
}

function matrixFromNumericColumns(...columns) {
  return columns[0].map((_value, row) => columns.map((column) => column[row]));
}

function hessianMatrix(values, size) {
  const output = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      output[row][column] = 0.5 * (values[row * size + column] + values[column * size + row]);
    }
  }
  return output;
}

function matrixSymmetryError(matrix) {
  let scale = 0;
  for (const row of matrix) for (const value of row) scale = Math.max(scale, Math.abs(Number(value)));
  if (scale === 0) return 0;
  let norm = 0;
  let difference = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      const value = Number(matrix[row][column]) / scale;
      const transpose = Number(matrix[column][row]) / scale;
      norm += value * value;
      difference += (value - transpose) ** 2;
    }
  }
  return norm === 0 ? 0 : Math.sqrt(difference / norm);
}

function flatHessianSymmetryError(values, size) {
  let scale = 0;
  for (const value of values) scale = Math.max(scale, Math.abs(Number(value)));
  if (scale === 0) return 0;
  let norm = 0;
  let difference = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const value = Number(values[row * size + column]) / scale;
      const transpose = Number(values[column * size + row]) / scale;
      norm += value * value;
      difference += (value - transpose) ** 2;
    }
  }
  return norm === 0 ? 0 : Math.sqrt(difference / norm);
}

function numericMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + Number(value) * Number(vector[index]), 0));
}

function numericTransposeMatrixVector(matrix, vector) {
  return matrix[0].map((_value, column) => matrix.reduce(
    (sum, row, index) => sum + Number(row[column]) * Number(vector[index]),
    0,
  ));
}

function transformLocalEndForce(values, fromAxes, toAxes) {
  const output = new Array(DOF_COUNT).fill(0);
  for (const base of [0, 6]) {
    for (const component of [0, 3]) {
      const local = values.slice(base + component, base + component + 3);
      const global = [0, 1, 2].map((globalAxis) => fromAxes.reduce(
        (sum, axis, localAxis) => sum + Number(axis[globalAxis]) * Number(local[localAxis]),
        0,
      ));
      const transformed = toAxes.map((axis) => axis.reduce(
        (sum, value, globalAxis) => sum + Number(value) * global[globalAxis],
        0,
      ));
      output.splice(base + component, 3, ...transformed);
    }
  }
  return output;
}

function physicalLocalEndForceJets(generalized, rotationI, rotationJ) {
  const output = generalized.slice();
  output.splice(3, 3, ...pushForwardGeneralizedMomentJets(rotationI, generalized.slice(3, 6)));
  output.splice(9, 3, ...pushForwardGeneralizedMomentJets(rotationJ, generalized.slice(9, 12)));
  return output;
}

function buildReleaseNullModes(prepared, u, releaseRotations) {
  const modes = [];
  const hingeRotations = { i: [0, 0, 0], j: [0, 0, 0] };
  prepared.releaseVariables.forEach((release, index) => {
    hingeRotations[release.end][release.axis] = Number(releaseRotations[index] || 0);
  });
  for (const release of prepared.releaseVariables) {
    const base = release.end === 'i' ? 0 : 6;
    const nodalRotation = u.slice(base + 3, base + 6);
    const unitIncrement = [0, 0, 0];
    unitIncrement[release.axis] = 1;
    const hingeSpatialIncrement = rotationCoordinateIncrementToSpatial(
      hingeRotations[release.end],
      unitIncrement,
    );
    const referenceSpatialIncrement = numericMatrixVector(prepared.referenceMatrix, hingeSpatialIncrement);
    const globalSpatialIncrement = numericMatrixVector(
      numericRotationMatrix(nodalRotation),
      referenceSpatialIncrement,
    ).map((value) => -value);
    const offsetReference = release.end === 'i' ? prepared.offsetVectorI : prepared.offsetVectorJ;
    const currentOffset = numericMatrixVector(numericRotationMatrix(nodalRotation), offsetReference);
    const translationIncrement = numericCross(globalSpatialIncrement, currentOffset).map((value) => -value);
    const coordinates = spatialRotationIncrementToCoordinates(
      nodalRotation,
      globalSpatialIncrement,
    );
    const mode = new Array(DOF_COUNT).fill(0);
    mode.splice(base, 3, ...translationIncrement);
    mode.splice(base + 3, 3, ...coordinates);
    modes.push(mode);
  }
  return modes;
}

function numericRotationMatrix(vector) {
  return rotationMatrix(vector.map((value) => jetConstant(Number(value), 1)))
    .map((row) => row.map((value) => value.value));
}

function numericCross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function pushForwardGeneralizedMomentJets(rotation, generalized) {
  const size = rotation[0].size;
  const zero = jetConstant(0, size);
  const angle2 = vectorDot(rotation, rotation);
  let coefficient;
  if (angle2.value < 1e-8) {
    const angle4 = jetMul(angle2, angle2);
    const angle6 = jetMul(angle4, angle2);
    coefficient = jetAdd(
      jetAdd(jetConstant(1 / 12, size), jetScale(angle2, 1 / 720)),
      jetAdd(jetScale(angle4, 1 / 30240), jetScale(angle6, 1 / 1209600)),
    );
  } else {
    const angle = jetSqrt(angle2);
    const numerator = jetAdd(jetConstant(1, size), jetCos(angle));
    const denominator = jetMul(jetScale(angle, 2), jetSin(angle));
    coefficient = jetSub(jetDiv(jetConstant(1, size), angle2), jetDiv(numerator, denominator));
  }
  const [x, y, z] = rotation;
  const skew = [
    [zero, jetScale(z, -1), y],
    [z, zero, jetScale(x, -1)],
    [jetScale(y, -1), x, zero],
  ];
  const skew2 = matrixMultiply(skew, skew);
  const inverseTranspose = identityMatrix(size).map((row, i) => row.map((value, j) => jetAdd(
    value,
    jetAdd(jetScale(skew[i][j], 0.5), jetMul(coefficient, skew2[i][j])),
  )));
  return matrixVector(inverseTranspose, generalized);
}

function normalizeReleases(values, id) {
  if (values == null) return [];
  if (!Array.isArray(values) || values.some((value) => !Number.isInteger(value) || value < 0 || value >= DOF_COUNT)) {
    throw elementError('COROTATIONAL_RELEASE_INVALID', `Element ${id} contains invalid release DOFs.`);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function validateReleaseContract(contract, releases, id) {
  if (contract == null) return;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw elementError('COROTATIONAL_RELEASE_CONTRACT_INVALID', `Element ${id} release contract must be an object.`);
  }
  const keys = Object.keys(contract);
  if (keys.some((key) => !['i', 'j'].includes(key))) {
    throw elementError('COROTATIONAL_RELEASE_CONTRACT_INVALID', `Element ${id} release contract contains unsupported fields.`);
  }
  for (const end of ['i', 'j']) {
    if (contract[end] != null && !['rigid', 'pin'].includes(contract[end])) {
      throw elementError('COROTATIONAL_RELEASE_CONTRACT_INVALID', `Element ${id}.${end} release must be rigid or pin.`);
    }
  }
  const expected = [];
  if (contract.i === 'pin') expected.push(4, 5);
  if (contract.j === 'pin') expected.push(10, 11);
  if (expected.length !== releases.length || expected.some((value, index) => value !== releases[index])) {
    throw elementError('COROTATIONAL_RELEASE_CONTRACT_MISMATCH', `Element ${id} release contract and local DOFs disagree.`);
  }
}

function validateOrthonormal(axes) {
  const tolerance = 1e-9;
  for (const axis of axes) {
    if (Math.abs(Math.hypot(...axis) - 1) > tolerance) throw elementError('COROTATIONAL_REFERENCE_TRIAD_INVALID', 'Reference axes must be unit vectors.');
  }
  for (let i = 0; i < axes.length; i += 1) {
    for (let j = i + 1; j < axes.length; j += 1) {
      const dot = axes[i].reduce((sum, value, index) => sum + value * axes[j][index], 0);
      if (Math.abs(dot) > tolerance) throw elementError('COROTATIONAL_REFERENCE_TRIAD_INVALID', 'Reference axes must be orthogonal.');
    }
  }
}

function finiteVector(values, length, name) {
  if (values == null || values.length !== length) throw elementError('COROTATIONAL_VECTOR_SIZE', `${name} must contain ${length} values.`);
  return Array.from(values, (value, index) => finite(value, `${name}[${index}]`));
}

function requireFiniteVector(values, name) {
  if (!values.every(Number.isFinite)) throw elementError('COROTATIONAL_RESPONSE_NONFINITE', `${name} contains a non-finite value.`);
}

function requireFiniteMatrix(matrix, name) {
  if (!Array.isArray(matrix) || matrix.some((row) => !Array.isArray(row) || row.some((value) => !Number.isFinite(Number(value))))) {
    throw elementError('COROTATIONAL_RESPONSE_NONFINITE', `${name} contains a non-finite value.`);
  }
}

function positive(value, nameOrFallback) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  if (typeof nameOrFallback === 'number' && Number.isFinite(nameOrFallback) && nameOrFallback > 0) return nameOrFallback;
  throw elementError('COROTATIONAL_PROPERTY_INVALID', `${nameOrFallback} must be positive and finite.`);
}

function nonnegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw elementError('COROTATIONAL_PROPERTY_INVALID', `${name} must be nonnegative and finite.`);
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw elementError('COROTATIONAL_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function elementError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
