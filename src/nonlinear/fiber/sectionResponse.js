import { SECTION_ENVELOPE_VERSION, SECTION_RESPONSE_VERSION } from '../../metadata/numericVersions.js';
export { SECTION_ENVELOPE_VERSION, SECTION_RESPONSE_VERSION };
import * as sectionMeshApi from './sectionMesh.js';
import * as materialModels from './materialModels.js';



export const SECTION_STRAIN_CONVENTION = Object.freeze({
  formula: 'epsilon=epsilon0-kappaY*z+kappaZ*y',
  generalizedStrain: Object.freeze(['epsilon0', 'kappaY', 'kappaZ']),
  generalizedForce: Object.freeze(['N', 'My', 'Mz']),
});
export const SECTION_RESPONSE_UNITS = Object.freeze({
  fiber: Object.freeze({ area: 'm2', y: 'm', z: 'm', stress: 'Pa', tangent: 'Pa' }),
  generalizedStrain: Object.freeze({ epsilon0: '1', kappaY: '1/m', kappaZ: '1/m' }),
  generalizedForce: Object.freeze({ N: 'N', My: 'N-m', Mz: 'N-m' }),
  energy: 'J/m',
});

/**
 * Integrates a fiber section at one generalized strain state. The function is
 * deliberately pure: constitutive trial states are returned but never committed
 * into the input mesh or state object.
 */
export function evaluateSectionResponse(section, deformation = {}, options = {}) {
  const mesh = normalizeMesh(section, options);
  const generalizedStrain = normalizeDeformation(deformation);
  const committed = normalizeSectionState(options.committedState ?? section?.committedState);
  const force = [0, 0, 0];
  const tangent = zeroMatrix(3);
  const fibers = [];
  const fiberStates = {};
  const fiberTrials = {};
  const energy = { work: 0, recoverable: 0, dissipated: 0 };

  for (let index = 0; index < mesh.fibers.length; index += 1) {
    const fiber = normalizeFiber(mesh.fibers[index], index);
    const gradient = [1, -fiber.z, fiber.y];
    const strain = dot3(gradient, generalizedStrain.vector);
    const previousState = clone(committed.fiberStates[fiber.id] ?? fiber.committedState ?? null);
    const material = resolveFiberMaterial(fiber, mesh, options);
    const response = evaluateMaterialTrial(material, strain, previousState, {
      sectionId: mesh.id,
      fiberId: fiber.id,
      fiberIndex: index,
      ...options.context,
    });
    const stress = finite(response.stress, `fiber ${fiber.id} stress`);
    const modulus = finite(response.tangent, `fiber ${fiber.id} tangent`);
    const weightedStress = stress * fiber.area;
    const weightedTangent = modulus * fiber.area;

    for (let row = 0; row < 3; row += 1) {
      force[row] += weightedStress * gradient[row];
      for (let column = row; column < 3; column += 1) {
        const value = weightedTangent * gradient[row] * gradient[column];
        tangent[row][column] += value;
        if (column !== row) tangent[column][row] += value;
      }
    }

    const fiberEnergy = normalizeEnergy(response, previousState, strain, stress, modulus);
    energy.work += fiberEnergy.work * fiber.area;
    energy.recoverable += fiberEnergy.recoverable * fiber.area;
    energy.dissipated += fiberEnergy.dissipated * fiber.area;
    const trialState = clone(response.trialState ?? response.state ?? {
      strain,
      stress,
      tangent: modulus,
      energy: fiberEnergy,
    });
    fiberStates[fiber.id] = trialState;
    fiberTrials[fiber.id] = clone(response.materialTrial ?? null);
    fibers.push({
      id: fiber.id,
      materialId: fiber.materialId,
      area: fiber.area,
      y: fiber.y,
      z: fiber.z,
      strain,
      stress,
      tangent: modulus,
      force: weightedStress,
      My: -weightedStress * fiber.z,
      Mz: weightedStress * fiber.y,
      gradient,
      energy: scaleEnergy(fiberEnergy, fiber.area),
      committedState: previousState,
      trialState,
      materialTrial: clone(response.materialTrial ?? null),
      events: clone(response.events ?? []),
      diagnostics: clone(response.diagnostics ?? {}),
    });
  }

  const result = {
    version: SECTION_RESPONSE_VERSION,
    convention: SECTION_STRAIN_CONVENTION,
    units: SECTION_RESPONSE_UNITS,
    sectionId: mesh.id,
    meshVersion: mesh.version ?? null,
    generalizedStrain,
    force: { N: force[0], My: force[1], Mz: force[2], vector: force },
    N: force[0],
    My: force[1],
    Mz: force[2],
    tangent,
    fibers,
    energy,
    committedState: clone(committed),
    trialState: {
      version: SECTION_RESPONSE_VERSION,
      sectionId: mesh.id,
      generalizedStrain: { ...generalizedStrain },
      force: { N: force[0], My: force[1], Mz: force[2] },
      fiberStates,
      fiberTrials,
      energy: { ...energy },
      status: 'trial',
    },
    diagnostics: {
      fiberCount: fibers.length,
      tangentSymmetryError: matrixSymmetryError(tangent),
      finite: force.every(Number.isFinite) && tangent.flat().every(Number.isFinite),
    },
  };
  return result;
}

/**
 * Compiles a stateless monotonic-envelope evaluator for PMM preprocessing.
 * Actual member analysis continues to use evaluateSectionResponse so committed
 * history, energy, events, and rollback semantics are unchanged.
 */
export function createSectionEnvelopeEvaluator(section = {}, options = {}) {
  const mesh = normalizeMesh(section, options);
  const materials = options.materials ?? mesh.materials ?? {};
  const compiledMaterials = new Map();
  const fibers = mesh.fibers.map((value, index) => {
    const fiber = normalizeFiber(value, index);
    const material = resolveFiberMaterial(fiber, mesh, { ...options, materials });
    let evaluate = compiledMaterials.get(fiber.materialId);
    if (!evaluate) {
      evaluate = materialModels.createFiberMaterialEnvelopeEvaluator(material);
      compiledMaterials.set(fiber.materialId, evaluate);
    }
    return Object.freeze({ ...fiber, material, evaluate });
  });
  let evaluationCount = 0;

  return Object.freeze({
    version: SECTION_ENVELOPE_VERSION,
    sectionId: mesh.id,
    fiberCount: fibers.length,
    get evaluationCount() {
      return evaluationCount;
    },
    evaluate(deformation = {}) {
      evaluationCount += 1;
      const generalizedStrain = normalizeDeformation(deformation);
      const [epsilon0, kappaY, kappaZ] = generalizedStrain.vector;
      let N = 0;
      let My = 0;
      let Mz = 0;
      let k00 = 0;
      let k01 = 0;
      let k02 = 0;
      let k11 = 0;
      let k12 = 0;
      let k22 = 0;
      let limitState = null;
      let strengthLimitState = null;
      for (const fiber of fibers) {
        const strain = epsilon0 - kappaY * fiber.z + kappaZ * fiber.y;
        const response = fiber.evaluate(strain);
        const stressArea = response.stress * fiber.area;
        const tangentArea = response.tangent * fiber.area;
        const gy = -fiber.z;
        const gz = fiber.y;
        N += stressArea;
        My += stressArea * gy;
        Mz += stressArea * gz;
        k00 += tangentArea;
        k01 += tangentArea * gy;
        k02 += tangentArea * gz;
        k11 += tangentArea * gy * gy;
        k12 += tangentArea * gy * gz;
        k22 += tangentArea * gz * gz;
        if (!limitState && envelopePmmLimitReached(response)) {
          limitState = {
            reached: true,
            type: response.branch || 'fiber-material-limit',
            fiberId: fiber.id,
            materialId: fiber.materialId,
            strain,
          };
        }
        if (!strengthLimitState && envelopeStrengthLimitReached(fiber.material, strain, response)) {
          strengthLimitState = {
            reached: true,
            type: response.branch || 'fiber-material-strength-limit',
            fiberId: fiber.id,
            materialId: fiber.materialId,
            strain,
          };
        }
      }
      const tangent = [
        [k00, k01, k02],
        [k01, k11, k12],
        [k02, k12, k22],
      ];
      return {
        version: SECTION_ENVELOPE_VERSION,
        N,
        My,
        Mz,
        force: { N, My, Mz, vector: [N, My, Mz] },
        tangent,
        limitState: limitState || { reached: false, type: null, fiberId: null, materialId: null, strain: null },
        strengthLimitState: strengthLimitState || { reached: false, type: null, fiberId: null, materialId: null, strain: null },
        diagnostics: {
          fiberCount: fibers.length,
          finite: [N, My, Mz, ...tangent.flat()].every(Number.isFinite),
        },
      };
    },
  });
}

function envelopePmmLimitReached(response) {
  const branch = String(response?.branch || '');
  return branch.startsWith('plastic-')
    || branch.includes('compression-descending')
    || branch.includes('compression-residual');
}

function envelopeStrengthLimitReached(material, strain, response) {
  if (material.type === 'steel-bilinear-kinematic') {
    return response.branch?.startsWith('plastic-')
      || Math.abs(response.stress) >= material.parameters.Fy * (1 - 1e-10);
  }
  if (material.type === 'concrete-compression-tension-damage') {
    return strain <= -material.parameters.epsc0 * (1 - 1e-10)
      || response.branch?.includes('compression-descending')
      || response.branch?.includes('compression-residual');
  }
  return response.yielded === true;
}

export function commitSectionResponse(response) {
  requireResponse(response);
  const fiberStates = {};
  for (const fiber of response.fibers) {
    const trial = fiber.materialTrial;
    if (trial && typeof materialModels.commitFiberMaterialTrial === 'function') {
      fiberStates[fiber.id] = clone(materialModels.commitFiberMaterialTrial(trial));
    } else {
      fiberStates[fiber.id] = { ...clone(fiber.trialState), status: 'committed' };
    }
  }
  return deepFreeze({
    ...clone(response.trialState),
    fiberStates,
    fiberTrials: {},
    step: Number(response.committedState?.step ?? 0) + 1,
    status: 'committed',
    committedFrom: response.version,
  });
}

export function rollbackSectionResponse(response) {
  requireResponse(response);
  return deepFreeze(clone(response.committedState));
}

export function sectionStateSnapshot(state = {}) {
  return JSON.stringify(canonicalize(clone(state)));
}

export function finiteDifferenceSectionTangent(section, deformation = {}, options = {}) {
  const base = normalizeDeformation(deformation);
  const steps = options.steps || [1e-8, 1e-8, 1e-8];
  const tangent = zeroMatrix(3);
  for (let column = 0; column < 3; column += 1) {
    const h = positive(steps[column], `steps[${column}]`);
    const plus = base.vector.slice();
    const minus = base.vector.slice();
    plus[column] += h;
    minus[column] -= h;
    const plusResponse = evaluateSectionResponse(section, fromVector(plus), options).force.vector;
    const minusResponse = evaluateSectionResponse(section, fromVector(minus), options).force.vector;
    for (let row = 0; row < 3; row += 1) tangent[row][column] = (plusResponse[row] - minusResponse[row]) / (2 * h);
  }
  const analytic = evaluateSectionResponse(section, deformation, options).tangent;
  const denominator = Math.max(1, ...analytic.flat().map(Math.abs));
  const error = maxMatrixDifference(analytic, tangent);
  return {
    version: SECTION_RESPONSE_VERSION,
    analytic,
    finiteDifference: tangent,
    absoluteError: error,
    relativeError: error / denominator,
    symmetryError: matrixSymmetryError(analytic),
  };
}

function normalizeMesh(section, options) {
  const normalizer = sectionMeshApi.normalizeSectionMesh
    || sectionMeshApi.normalizeFiberSectionMesh;
  const candidate = typeof normalizer === 'function'
    ? normalizer(section, { strict: true, ...(options.meshOptions || {}) })
    : section;
  const mesh = candidate?.mesh ?? candidate;
  if (!mesh || !Array.isArray(mesh.fibers) || mesh.fibers.length === 0) {
    throw sectionError('SECTION_MESH_EMPTY', 'A section mesh with at least one fiber is required.');
  }
  const validator = sectionMeshApi.validateFiberSectionMesh || sectionMeshApi.validateSectionMesh;
  if (typeof validator === 'function' && mesh.version === sectionMeshApi.FIBER_SECTION_MESH_VERSION) {
    const validation = validator(mesh);
    if (validation && validation.ok === false) {
      throw sectionError('SECTION_MESH_INVALID', `Section mesh validation failed: ${(validation.errors || []).join(', ')}.`);
    }
  }
  return {
    ...mesh,
    id: String(mesh.id ?? mesh.sectionId ?? mesh.sourceSnapshot?.id ?? 'SECTION'),
    fibers: mesh.fibers,
  };
}

function normalizeFiber(value, index) {
  const area = positive(value?.area ?? value?.A ?? value?.weight, `fiber[${index}].area`);
  return {
    ...value,
    id: String(value?.id ?? `F${index + 1}`),
    materialId: String(value?.materialId ?? value?.material ?? value?.matId ?? 'default'),
    area,
    y: finite(value?.y ?? value?.centroid?.y ?? 0, `fiber[${index}].y`),
    z: finite(value?.z ?? value?.centroid?.z ?? 0, `fiber[${index}].z`),
  };
}

function resolveFiberMaterial(fiber, mesh, options) {
  if (fiber.materialModel && typeof fiber.materialModel === 'object') return fiber.materialModel;
  if (fiber.material && typeof fiber.material === 'object') return fiber.material;
  const source = options.materials ?? mesh.materials ?? {};
  let material = source instanceof Map ? source.get(fiber.materialId) : source[fiber.materialId];
  const resolver = materialModels.resolveMaterialModel || materialModels.getMaterialModel;
  if (!material && typeof resolver === 'function') {
    material = resolver(fiber.materialId, { fiber, mesh, materials: source });
  }
  if (!material) {
    throw sectionError('FIBER_MATERIAL_MISSING', `Material ${fiber.materialId} is not available for fiber ${fiber.id}.`);
  }
  return material;
}

function evaluateMaterialTrial(material, strain, committedState, context) {
  const input = { material, strain, committedState: clone(committedState), context };
  const productionEvaluator = materialModels.evaluateFiberMaterialTrial;
  const evaluator = materialModels.evaluateMaterialTrial
    || materialModels.evaluateUniaxialMaterial
    || materialModels.evaluateMaterialResponse;
  let response;
  if (typeof productionEvaluator === 'function' && isProductionMaterial(material)) {
    response = productionEvaluator(material, clone(committedState), strain);
  }
  else if (typeof evaluator === 'function') response = evaluator(input);
  else if (typeof material.evaluateTrial === 'function') response = material.evaluateTrial(input);
  else if (typeof material.trial === 'function') response = material.trial(input);
  else if (typeof material.evaluate === 'function') response = material.evaluate(input);
  else response = evaluateFallbackMaterial(material, strain, committedState);
  if (!response || typeof response !== 'object') {
    throw sectionError('MATERIAL_RESPONSE_INVALID', 'The material trial evaluator must return an object.');
  }
  const core = response.response ?? response;
  return {
    stress: core.stress,
    tangent: core.tangent,
    energy: core.energy ?? response.energy ?? response.state?.energy,
    trialState: response.state ?? response.trialState,
    materialTrial: response.response && response.state && response.baseState ? response : null,
    events: response.events ?? (core.yielded ? [{ type: 'material-yield', branch: core.branch }] : []),
    diagnostics: response.diagnostics ?? {},
  };
}

function isProductionMaterial(material) {
  return material?.version === materialModels.FIBER_MATERIAL_MODEL_VERSION
    || ['steel-bilinear-kinematic', 'concrete-compression-tension-damage'].includes(material?.type);
}

function evaluateFallbackMaterial(material, strain, committedState) {
  const E = positive(material.E ?? material.elasticModulus ?? material.initialTangent, 'material.E');
  const fy = Number(material.fy ?? material.Fy ?? Infinity);
  let stress = E * strain;
  let tangent = E;
  if (Number.isFinite(fy) && fy > 0 && Math.abs(stress) > fy) {
    const ratio = nonnegative(material.hardeningRatio ?? material.b ?? 0, 'material.hardeningRatio');
    const yieldStrain = fy / E;
    stress = Math.sign(strain) * (fy + E * ratio * Math.max(0, Math.abs(strain) - yieldStrain));
    tangent = E * ratio;
  }
  const previousStrain = Number(committedState?.strain ?? 0);
  const previousStress = Number(committedState?.stress ?? 0);
  const previousWork = Number(committedState?.energy?.work ?? 0);
  const work = previousWork + 0.5 * (previousStress + stress) * (strain - previousStrain);
  const recoverable = tangent > 0 ? 0.5 * stress * stress / Math.max(tangent, E * 1e-12) : 0;
  const energy = { work, recoverable, dissipated: Math.max(0, work - recoverable) };
  return { stress, tangent, energy, trialState: { strain, stress, tangent, energy } };
}

function normalizeEnergy(response, previousState, strain, stress, tangent) {
  const value = response.energy ?? response.trialState?.energy ?? {};
  const previousStrain = Number(previousState?.strain ?? 0);
  const previousStress = Number(previousState?.stress ?? 0);
  const previousWork = Number(previousState?.energy?.work ?? 0);
  const work = finiteOr(value.work, previousWork + 0.5 * (previousStress + stress) * (strain - previousStrain));
  const recoverable = finiteOr(value.recoverable, tangent > 0 ? 0.5 * stress * stress / tangent : 0);
  return {
    work,
    recoverable,
    dissipated: Math.max(0, finiteOr(value.dissipated, work - recoverable)),
  };
}

function normalizeSectionState(value) {
  if (!value) return { version: SECTION_RESPONSE_VERSION, fiberStates: {}, energy: zeroEnergy(), status: 'committed' };
  if (typeof value !== 'object' || Array.isArray(value)) throw sectionError('SECTION_STATE_INVALID', 'Section state must be an object.');
  return {
    ...clone(value),
    fiberStates: clone(value.fiberStates ?? {}),
    energy: { ...zeroEnergy(), ...(clone(value.energy) ?? {}) },
  };
}

function normalizeDeformation(value) {
  const epsilon0 = finite(value.epsilon0 ?? value.axialStrain ?? value.vector?.[0] ?? 0, 'epsilon0');
  const kappaY = finite(value.kappaY ?? value.curvatureY ?? value.vector?.[1] ?? 0, 'kappaY');
  const kappaZ = finite(value.kappaZ ?? value.curvatureZ ?? value.curvature ?? value.vector?.[2] ?? 0, 'kappaZ');
  return { epsilon0, kappaY, kappaZ, vector: [epsilon0, kappaY, kappaZ] };
}

function fromVector(vector) {
  return { epsilon0: vector[0], kappaY: vector[1], kappaZ: vector[2] };
}

function scaleEnergy(value, factor) {
  return {
    work: value.work * factor,
    recoverable: value.recoverable * factor,
    dissipated: value.dissipated * factor,
  };
}

function zeroEnergy() {
  return { work: 0, recoverable: 0, dissipated: 0 };
}

function zeroMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function dot3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function matrixSymmetryError(matrix) {
  let error = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      error = Math.max(error, Math.abs(matrix[row][column] - matrix[column][row]));
    }
  }
  return error;
}

function maxMatrixDifference(left, right) {
  let error = 0;
  for (let row = 0; row < left.length; row += 1) {
    for (let column = 0; column < left[row].length; column += 1) {
      error = Math.max(error, Math.abs(left[row][column] - right[row][column]));
    }
  }
  return error;
}

function requireResponse(value) {
  if (!value?.trialState || !value?.committedState) {
    throw sectionError('SECTION_RESPONSE_REQUIRED', 'A section response with trial and committed states is required.');
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw sectionError('SECTION_VALUE_NONFINITE', `${label} must be finite.`);
  return number;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw sectionError('SECTION_VALUE_NONPOSITIVE', `${label} must be greater than zero.`);
  return number;
}

function nonnegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw sectionError('SECTION_VALUE_NEGATIVE', `${label} must not be negative.`);
  return number;
}

function sectionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
