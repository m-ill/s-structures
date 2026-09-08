import { LINEAR_ELASTIC_ELEMENT_VERSION } from '../../metadata/numericVersions.js';
export { LINEAR_ELASTIC_ELEMENT_VERSION };
import {
  condenseReleasedDofs,
  localK12,
  localTrussK12,
  matMul,
  matTrans,
  matVec,
} from '../../solver/linear3dElement.js';
import { CANONICAL_ELEMENT_DESCRIPTOR_VERSION } from '../../solver/domain/elementDescriptor.js';
import { CANONICAL_ANALYSIS_DOMAIN_VERSION } from '../../solver/domain/canonicalDomain.js';
import { createNonlinearElementContract } from '../core/elementContract.js';


export const LINEAR_ELASTIC_ELEMENT_STATE_VERSION = 'p8-m2-linear-elastic-element-state-v1';

export function createLinearElasticElementKernel(descriptor) {
  const prepared = prepareDescriptor(descriptor);
  const trialState = Object.freeze({
    version: LINEAR_ELASTIC_ELEMENT_STATE_VERSION,
    elementId: descriptor.id,
    descriptorHash: descriptor.descriptorHash || null,
    stateIndependent: true,
  });
  const elementType = prepared.behavior === 'frame' ? 'linear-elastic-frame' : 'linear-elastic-truss';
  return createNonlinearElementContract({
    type: elementType,
    stateVersion: LINEAR_ELASTIC_ELEMENT_STATE_VERSION,
    dofCount: 12,
    evaluate(input = {}) {
      const uGlobal = finiteElementVector(input?.trialKinematics?.uGlobal, 'trialKinematics.uGlobal');
      const uLocal = matVec(prepared.transform, uGlobal);
      const elasticResistingForceLocal = matVec(prepared.localStiffness, uLocal);
      const fixedEndForceLocal = optionalFiniteElementVector(
        input?.trialKinematics?.memberFixedEndLocal,
        'trialKinematics.memberFixedEndLocal',
      );
      const resistingForceLocal = elasticResistingForceLocal.map(
        (value, index) => value + fixedEndForceLocal[index],
      );
      const resistingForceGlobal = matVec(prepared.globalStiffness, uGlobal);
      const strainEnergy = 0.5 * dot(uGlobal, resistingForceGlobal);
      if (!Number.isFinite(strainEnergy)) {
        throw elementError('LINEAR_ELASTIC_ENERGY_NONFINITE', `Element ${descriptor.id} produced non-finite strain energy.`);
      }
      const tangentGlobal = cloneMatrix(prepared.globalStiffness);
      const pint = resistingForceGlobal.slice();
      const energies = { strainEnergy };
      return {
        version: LINEAR_ELASTIC_ELEMENT_VERSION,
        resistingForceGlobal: pint,
        tangentGlobal,
        Pint: pint,
        Kt: tangentGlobal,
        trialState: { ...trialState },
        energies,
        energy: strainEnergy,
        localResponse: {
          displacement: uLocal,
          elasticResistingForce: elasticResistingForceLocal,
          fixedEndForce: fixedEndForceLocal,
          resistingForce: resistingForceLocal,
          tangent: cloneMatrix(prepared.localStiffness),
          releaseDofs: prepared.releases.slice(),
        },
        diagnostics: {
          version: LINEAR_ELASTIC_ELEMENT_VERSION,
          stateIndependent: true,
          behavior: prepared.behavior,
          released: prepared.releases.length > 0,
          offset: prepared.offset,
        },
      };
    },
  });
}

export function buildLinearElasticElementEntries(domain) {
  if (
    !domain?.ok
    || domain.version !== CANONICAL_ANALYSIS_DOMAIN_VERSION
    || !Array.isArray(domain.elements)
  ) {
    throw elementError('LINEAR_ELASTIC_DOMAIN_INVALID', 'A valid M1 canonical analysis domain is required.');
  }
  return domain.elements.map((descriptor) => Object.freeze({
    id: descriptor.id,
    dofs: Int32Array.from(descriptor.fullDofs),
    descriptor,
    kernel: createLinearElasticElementKernel(descriptor),
  }));
}

function prepareDescriptor(descriptor) {
  if (
    !descriptor
    || descriptor.version !== CANONICAL_ELEMENT_DESCRIPTOR_VERSION
    || descriptor.id == null
    || !finiteDofs(descriptor.fullDofs)
  ) {
    throw elementError('LINEAR_ELASTIC_DESCRIPTOR_INVALID', 'A valid M1 element descriptor with 12 full DOFs is required.');
  }
  if (descriptor.partialFixity?.enabled) {
    throw elementError(
      'NONLINEAR_PARTIAL_FIXITY_UNSUPPORTED',
      `Element ${descriptor.id} uses rotational connection springs outside the nonlinear element contract.`,
    );
  }
  const length = Number(descriptor.geometry?.length);
  const transform = descriptor.geometry?.transform;
  if (!(length > 0) || !finiteMatrix(transform, 12)) {
    throw elementError('LINEAR_ELASTIC_GEOMETRY_INVALID', `Element ${descriptor.id} has invalid geometry or transform.`);
  }
  const material = descriptor.propertySnapshot?.effectiveMaterial || descriptor.propertySnapshot?.material || {};
  const section = descriptor.propertySnapshot?.effectiveSection || descriptor.propertySnapshot?.section || {};
  const E = positive(material.E);
  const A = positive(section.A);
  if (E == null || A == null) {
    throw elementError('LINEAR_ELASTIC_PROPERTY_INVALID', `Element ${descriptor.id} requires positive finite E and A.`);
  }
  const sourceBehavior = descriptor.behavior || descriptor.type;
  const behavior = ['truss', 'tensionOnly', 'compressionOnly'].includes(sourceBehavior) ? 'truss' : 'frame';
  let localStiffness;
  if (behavior === 'truss') {
    localStiffness = localTrussK12(E, A, length);
  } else {
    const G = positive(material.G);
    const Iy = nonnegative(section.Iy);
    const Iz = nonnegative(section.Iz);
    const J = nonnegative(section.J);
    if (G == null || Iy == null || Iz == null || J == null) {
      throw elementError('LINEAR_ELASTIC_PROPERTY_INVALID', `Element ${descriptor.id} requires finite G, Iy, Iz, and J.`);
    }
    const shear = descriptor.formulation?.shearDeformation || {};
    localStiffness = localK12(E, G, A, Iy, Iz, J, length, shear.phiY, shear.phiZ);
  }
  const releases = normalizeReleases(descriptor.releases?.localDofs, descriptor.id);
  if (releases.length) {
    const condensed = condenseReleasedDofs(localStiffness, new Array(12).fill(0), releases);
    if (condensed) localStiffness = condensed.klC;
    else if (!releasedRowsAreZero(localStiffness, releases)) {
      throw elementError('LINEAR_ELASTIC_RELEASE_CONDENSATION_FAILED', `Element ${descriptor.id} release condensation failed.`);
    }
  }
  if (!finiteMatrix(localStiffness, 12)) {
    throw elementError('LINEAR_ELASTIC_LOCAL_STIFFNESS_NONFINITE', `Element ${descriptor.id} local stiffness is non-finite.`);
  }
  const numericTransform = transform.map((row) => row.map(Number));
  const globalStiffness = matMul(matTrans(numericTransform), matMul(localStiffness, numericTransform));
  if (!finiteMatrix(globalStiffness, 12)) {
    throw elementError('LINEAR_ELASTIC_GLOBAL_STIFFNESS_NONFINITE', `Element ${descriptor.id} global stiffness is non-finite.`);
  }
  return {
    behavior,
    releases,
    localStiffness,
    transform: numericTransform,
    globalStiffness,
    offset: {
      i: Number(descriptor.geometry?.offsets?.i || 0),
      j: Number(descriptor.geometry?.offsets?.j || 0),
      rigidFactor: Number(descriptor.geometry?.offsets?.rigidFactor ?? 1),
    },
  };
}

function normalizeReleases(input, elementId) {
  if (input == null) return [];
  if (
    !Array.isArray(input)
    || input.some((value) => !Number.isInteger(value) || value < 0 || value >= 12)
    || new Set(input).size !== input.length
  ) {
    throw elementError('LINEAR_ELASTIC_RELEASE_INVALID', `Element ${elementId} contains invalid release DOFs.`);
  }
  return input.slice().sort((a, b) => a - b);
}

function releasedRowsAreZero(matrix, releases) {
  return releases.every((row) => matrix[row].every((value) => Math.abs(Number(value)) <= 1e-14));
}

function finiteElementVector(values, name) {
  if (values == null || values.length !== 12) {
    throw elementError('LINEAR_ELASTIC_KINEMATICS_SIZE', `${name} must contain 12 values.`);
  }
  return Array.from(values, (value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw elementError('LINEAR_ELASTIC_KINEMATICS_NONFINITE', `${name}[${index}] must be finite.`);
    }
    return number;
  });
}

function optionalFiniteElementVector(values, name) {
  if (values == null) return new Array(12).fill(0);
  return finiteElementVector(values, name);
}

function finiteDofs(values) {
  return values != null
    && values.length === 12
    && Array.from(values).every((value) => Number.isInteger(Number(value)) && Number(value) >= 0)
    && new Set(Array.from(values, Number)).size === 12;
}

function finiteMatrix(matrix, size) {
  return Array.isArray(matrix)
    && matrix.length === size
    && matrix.every((row) => (
      (Array.isArray(row) || ArrayBuffer.isView(row))
      && row.length === size
      && Array.from(row).every((value) => Number.isFinite(Number(value)))
    ));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function dot(a, b) {
  let value = 0;
  for (let index = 0; index < a.length; index += 1) value += a[index] * b[index];
  return value;
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function elementError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
