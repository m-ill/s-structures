import {
  matMul,
  matTrans,
  matVec,
  transform12,
} from '../../solver/linear3dElement.js';
import { createNonlinearElementContract } from '../core/elementContract.js';
import { commitSectionResponse, evaluateSectionResponse } from '../fiber/sectionResponse.js';
import { createCorotationalFrame3dKernel } from './corotationalFrame3d.js';

export const DISTRIBUTED_FIBER_FRAME_3D_VERSION = 'p8-m6-distributed-fiber-frame-3d-v1';
export const DISTRIBUTED_FIBER_FRAME_3D_STATE_VERSION = 'p8-m6-distributed-fiber-frame-state-v1';

export function createDistributedFiberFrame3dKernel(descriptor, fiberSection, options = {}) {
  validateInputs(descriptor, fiberSection);
  const base = createCorotationalFrame3dKernel(descriptor, options);
  const length = positive(descriptor.geometry?.length, 'geometry.length');
  const material = descriptor.propertySnapshot?.effectiveMaterial || descriptor.propertySnapshot?.material || {};
  const section = descriptor.propertySnapshot?.effectiveSection || descriptor.propertySnapshot?.section || {};
  const elastic = [
    positive(material.E, 'material.E') * positive(section.A, 'section.A'),
    positive(material.E, 'material.E') * nonnegative(section.Iy, 'section.Iy'),
    positive(material.E, 'material.E') * nonnegative(section.Iz, 'section.Iz'),
  ];
  const gauss = gaussLegendre(options.integrationPoints ?? 5);

  return createNonlinearElementContract({
    type: 'distributed-fiber-corotational-frame-3d',
    stateVersion: DISTRIBUTED_FIBER_FRAME_3D_STATE_VERSION,
    dofCount: 12,
    evaluate(input = {}) {
      const elasticResponse = base.evaluate(input);
      const kinematicDeformation = finiteVector(elasticResponse.localResponse?.deformation, 12, 'localResponse.deformation');
      const localCorrection = new Array(12).fill(0);
      const localTangentCorrection = zeroMatrix(12);
      const fiberSections = {};
      const sectionPoints = [];
      let elasticSectionEnergy = 0;
      let fiberRecoverableEnergy = 0;
      let fiberDissipatedEnergy = 0;
      let fiberWork = 0;

      for (let index = 0; index < gauss.length; index += 1) {
        const point = gauss[index];
        const station = 0.5 * (point.xi + 1);
        const integrationWeight = 0.5 * length * point.weight;
        const B = sectionBMatrix(station, length);
        const generalizedStrain = sectionStrainAtStation(
          elasticResponse.localResponse?.stations,
          station,
          elastic,
        );
        const id = `GP${index + 1}`;
        const response = evaluateSectionResponse(fiberSection.mesh, {
          epsilon0: generalizedStrain[0],
          kappaY: generalizedStrain[1],
          kappaZ: generalizedStrain[2],
        }, {
          materials: fiberSection.materials,
          committedState: input.committedState?.fiberSections?.[id],
          context: { elementId: descriptor.id, integrationPoint: id, station },
        });
        const sectionForce = [response.N, response.My, response.Mz].map((value) => value / 1000);
        const sectionTangent = response.tangent.map((row) => row.map((value) => value / 1000));
        const elasticForce = generalizedStrain.map((value, row) => elastic[row] * value);
        const correctionForce = sectionForce.map((value, row) => value - elasticForce[row]);
        const correctionTangent = sectionTangent.map((row, i) => (
          row.map((value, j) => value - (i === j ? elastic[i] : 0))
        ));
        addVector(localCorrection, matVec(matTrans(B), correctionForce), integrationWeight);
        addMatrix(localTangentCorrection, matMul(matMul(matTrans(B), correctionTangent), B), integrationWeight);
        const kinematicStrain = matVec(B, kinematicDeformation);
        const kinematicElasticForce = kinematicStrain.map((value, row) => elastic[row] * value);
        elasticSectionEnergy += 0.5 * dot(kinematicStrain, kinematicElasticForce) * integrationWeight;
        fiberRecoverableEnergy += Number(response.energy?.recoverable || 0) / 1000 * integrationWeight;
        fiberDissipatedEnergy += Number(response.energy?.dissipated || 0) / 1000 * integrationWeight;
        fiberWork += Number(response.energy?.work || 0) / 1000 * integrationWeight;
        fiberSections[id] = commitSectionResponse(response);
        sectionPoints.push({
          id,
          station,
          weight: integrationWeight,
          generalizedStrain: response.generalizedStrain,
          force: response.force,
          energy: response.energy,
          yieldedFiberCount: response.fibers.filter((fiber) => strengthLimitReached(fiber)).length,
          fiberCount: response.fibers.length,
        });
      }

      const axes = elasticResponse.localResponse.currentAxes;
      const transform = transform12({ x: axes[0], y: axes[1], z: axes[2] });
      const correctionGlobal = matVec(matTrans(transform), localCorrection);
      const tangentCorrectionGlobal = maxAbs(localCorrection) <= 1e-10 && maxAbs(localTangentCorrection.flat()) <= 1e-8
        ? matMul(matMul(matTrans(transform), localTangentCorrection), transform)
        : finiteDifferenceCorrectionTangent({
          base,
          input,
          fiberSection,
          elastic,
          gauss,
          length,
          descriptor,
          options,
        });
      const resistingForceGlobal = elasticResponse.resistingForceGlobal.map((value, index) => value + correctionGlobal[index]);
      const tangentGlobal = elasticResponse.tangentGlobal.map((row, i) => (
        row.map((value, j) => value + tangentCorrectionGlobal[i][j])
      ));
      const localResistingForce = elasticResponse.localResponse.resistingForce
        .map((value, index) => value + localCorrection[index]);
      const strainEnergy = Number(elasticResponse.energies?.strain || 0)
        - elasticSectionEnergy
        + fiberRecoverableEnergy;
      if (strainEnergy < -1e-8 * Math.max(1, Math.abs(elasticResponse.energies?.strain || 0))) {
        throw elementError('DISTRIBUTED_FIBER_ENERGY_NEGATIVE', `Element ${descriptor.id} produced negative recoverable energy.`);
      }
      const trialState = {
        ...elasticResponse.trialState,
        version: DISTRIBUTED_FIBER_FRAME_3D_STATE_VERSION,
        formulation: 'distributed-plasticity',
        localEndForce: localResistingForce,
        axialForce: 0.5 * (localResistingForce[6] - localResistingForce[0]),
        strainEnergy,
        fiberSections,
        fiberSectionHash: fiberSection.contentHash || fiberSection.mesh?.geometryHash || null,
        integrationPointCount: gauss.length,
      };
      return {
        ...elasticResponse,
        version: DISTRIBUTED_FIBER_FRAME_3D_VERSION,
        resistingForceGlobal,
        tangentGlobal,
        Pint: resistingForceGlobal.slice(),
        Kt: tangentGlobal.map((row) => row.slice()),
        trialState,
        energies: {
          ...elasticResponse.energies,
          strain: Math.max(0, strainEnergy),
          fiberRecoverable: fiberRecoverableEnergy,
          fiberDissipated: fiberDissipatedEnergy,
          fiberWork,
        },
        globalResponse: {
          ...elasticResponse.globalResponse,
          generalizedResistingForce: resistingForceGlobal.slice(),
        },
        localResponse: {
          ...elasticResponse.localResponse,
          resistingForce: localResistingForce,
          distributedFiber: {
            sectionId: fiberSection.mesh?.id || null,
            integrationRule: `gauss-legendre-${gauss.length}`,
            points: sectionPoints,
          },
        },
        diagnostics: {
          ...elasticResponse.diagnostics,
          formulation: 'distributed-plasticity',
          distributedFiberIntegrationPointCount: gauss.length,
          distributedFiberYieldedPointCount: sectionPoints.filter((point) => point.yieldedFiberCount > 0).length,
          localCorrectionNorm: maxAbs(localCorrection),
          tangentCorrectionSymmetryError: symmetryError(localTangentCorrection),
          tangentLinearization: 'global-central-difference-of-fiber-correction',
        },
      };
    },
  });
}

function finiteDifferenceCorrectionTangent(input) {
  const u = finiteVector(input.input?.trialKinematics?.uGlobal, 12, 'trialKinematics.uGlobal');
  const matrix = zeroMatrix(12);
  const baseStep = positive(input.options.tangentDifferenceStep ?? 1e-7, 'tangentDifferenceStep');
  for (let column = 0; column < 12; column += 1) {
    const scale = column % 6 < 3 ? Math.max(1, input.length, Math.abs(u[column])) : Math.max(1, Math.abs(u[column]));
    const h = baseStep * scale;
    const plus = u.slice();
    const minus = u.slice();
    plus[column] += h;
    minus[column] -= h;
    const upper = correctionGlobalAt(input, plus);
    const lower = correctionGlobalAt(input, minus);
    for (let row = 0; row < 12; row += 1) matrix[row][column] = (upper[row] - lower[row]) / (2 * h);
  }
  return matrix;
}

function correctionGlobalAt(input, uGlobal) {
  const response = input.base.evaluate({
    ...input.input,
    trialKinematics: {
      ...input.input.trialKinematics,
      uGlobal,
    },
  });
  const local = new Array(12).fill(0);
  for (let index = 0; index < input.gauss.length; index += 1) {
    const point = input.gauss[index];
    const station = 0.5 * (point.xi + 1);
    const weight = 0.5 * input.length * point.weight;
    const B = sectionBMatrix(station, input.length);
    const strain = sectionStrainAtStation(response.localResponse?.stations, station, input.elastic);
    const id = `GP${index + 1}`;
    const section = evaluateSectionResponse(input.fiberSection.mesh, {
      epsilon0: strain[0],
      kappaY: strain[1],
      kappaZ: strain[2],
    }, {
      materials: input.fiberSection.materials,
      committedState: input.input.committedState?.fiberSections?.[id],
      context: { elementId: input.descriptor.id, integrationPoint: id, station, tangentProbe: true },
    });
    const force = [section.N, section.My, section.Mz].map((value) => value / 1000);
    const elasticForce = strain.map((value, row) => input.elastic[row] * value);
    addVector(local, matVec(matTrans(B), force.map((value, row) => value - elasticForce[row])), weight);
  }
  const axes = response.localResponse.currentAxes;
  const transform = transform12({ x: axes[0], y: axes[1], z: axes[2] });
  return matVec(matTrans(transform), local);
}

function sectionStrainAtStation(stations, station, elastic) {
  if (!stations?.xs?.length) throw elementError('DISTRIBUTED_FIBER_STATION_RESPONSE_REQUIRED', 'Elastic station response is required for fiber integration.');
  const x = Number(station) * Number(stations.xs.at(-1));
  return ['N', 'My', 'Mz'].map((key, index) => interpolateStation(stations.xs, stations[key], x) / elastic[index]);
}

function interpolateStation(xs, values, x) {
  if (x <= xs[0]) return Number(values[0]);
  if (x >= xs.at(-1)) return Number(values.at(-1));
  let right = 1;
  while (right < xs.length && Number(xs[right]) < x) right += 1;
  const left = right - 1;
  const span = Number(xs[right]) - Number(xs[left]);
  const ratio = span > 0 ? (x - Number(xs[left])) / span : 0;
  return Number(values[left]) + ratio * (Number(values[right]) - Number(values[left]));
}

function validateInputs(descriptor, fiberSection) {
  if (descriptor?.behavior !== 'frame' && descriptor?.type !== 'frame') {
    throw elementError('DISTRIBUTED_FIBER_FRAME_BEHAVIOR_REQUIRED', 'Distributed fiber integration requires a frame member.');
  }
  if ((descriptor?.releases?.localDofs || []).length) {
    throw elementError('DISTRIBUTED_FIBER_RELEASE_UNSUPPORTED', 'Distributed fiber members with end releases are not supported.');
  }
  if (!fiberSection?.mesh?.fibers?.length || !fiberSection?.materials) {
    throw elementError('DISTRIBUTED_FIBER_SECTION_REQUIRED', `Element ${descriptor?.id || '(missing)'} requires a fiber mesh and material map.`);
  }
}

function sectionBMatrix(station, length) {
  const s = Number(station);
  const n1 = (-6 + 12 * s) / length ** 2;
  const n2 = (-4 + 6 * s) / length;
  const n3 = (6 - 12 * s) / length ** 2;
  const n4 = (-2 + 6 * s) / length;
  const B = Array.from({ length: 3 }, () => new Array(12).fill(0));
  B[0][0] = -1 / length;
  B[0][6] = 1 / length;
  B[1][2] = n1;
  B[1][4] = -n2;
  B[1][8] = n3;
  B[1][10] = -n4;
  B[2][1] = n1;
  B[2][5] = n2;
  B[2][7] = n3;
  B[2][11] = n4;
  return B;
}

function gaussLegendre(orderInput) {
  const order = Math.trunc(Number(orderInput));
  const rules = {
    2: [[-0.5773502691896257, 1], [0.5773502691896257, 1]],
    3: [[-0.7745966692414834, 0.5555555555555556], [0, 0.8888888888888888], [0.7745966692414834, 0.5555555555555556]],
    4: [[-0.8611363115940526, 0.3478548451374538], [-0.3399810435848563, 0.6521451548625461], [0.3399810435848563, 0.6521451548625461], [0.8611363115940526, 0.3478548451374538]],
    5: [[-0.906179845938664, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665], [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.906179845938664, 0.2369268850561891]],
  };
  if (!rules[order]) throw elementError('DISTRIBUTED_FIBER_INTEGRATION_ORDER_INVALID', 'integrationPoints must be 2, 3, 4, or 5.');
  return rules[order].map(([xi, weight]) => Object.freeze({ xi, weight }));
}

function strengthLimitReached(fiber) {
  const branch = String(fiber?.trialState?.branch || '');
  return branch.startsWith('plastic-') || branch.includes('compression-descending') || branch.includes('compression-residual');
}

function addVector(target, source, factor) {
  for (let index = 0; index < target.length; index += 1) target[index] += factor * source[index];
}

function addMatrix(target, source, factor) {
  for (let i = 0; i < target.length; i += 1) {
    for (let j = 0; j < target[i].length; j += 1) target[i][j] += factor * source[i][j];
  }
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function zeroMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function maxAbs(values) {
  return Math.max(0, ...values.map((value) => Math.abs(Number(value))));
}

function symmetryError(matrix) {
  let error = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < matrix.length; j += 1) error = Math.max(error, Math.abs(matrix[i][j] - matrix[j][i]));
  }
  return error;
}

function finiteVector(value, size, path) {
  const vector = Array.from(value || [], Number);
  if (vector.length !== size || vector.some((item) => !Number.isFinite(item))) {
    throw elementError('DISTRIBUTED_FIBER_VECTOR_INVALID', `${path} must contain ${size} finite values.`);
  }
  return vector;
}

function positive(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw elementError('DISTRIBUTED_FIBER_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function nonnegative(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw elementError('DISTRIBUTED_FIBER_VALUE_INVALID', `${path} must be nonnegative.`);
  return number;
}

function elementError(code, message) {
  const error = new Error(message);
  error.name = 'DistributedFiberFrame3dError';
  error.code = code;
  return error;
}
