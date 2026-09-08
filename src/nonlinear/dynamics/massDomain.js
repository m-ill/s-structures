import { MDOF_MASS_DOMAIN_VERSION } from '../../metadata/numericVersions.js';
export { MDOF_MASS_DOMAIN_VERSION };
import { buildMassSourceTrace } from '../../loads/loadsV2.js';
import { stableHash } from '../../core/stableHash.js';
import { normalizeNodeMass6Dof } from '../../core/massSchema.js';
import {
  createCscFromTriplets,
  cscDiagonal,
  cscMatVec,
  cscRowNorms,
  cscSymmetryError,
} from './sparseMatrix.js';


export const MDOF_MASS_FORMULATIONS = Object.freeze(['lumped', 'consistent']);

export function buildMdofMassDomain(model = {}, domain, options = {}) {
  requireDomain(domain);
  const formulation = normalizeFormulation(options.formulation || options.massFormulation || 'lumped');
  const massSource = resolveMassSource(model, options.massSource ?? options.massSourceId ?? domain.analysisCase?.inputRefs?.massSourceId);
  validateExplicitMasses(model);
  const originalTrace = massSource ? buildMassSourceTrace(model, massSource) : null;
  const fullTriplets = [];
  const ownership = [];
  const nodeIndex = new Map(domain.nodes.map((node, index) => [node.id, index]));
  let consistentMemberCount = 0;
  let lumpedMemberCount = 0;

  if (formulation === 'lumped') {
    if (originalTrace) {
      addTraceMass(originalTrace, nodeIndex, fullTriplets, ownership, 'mass-source');
      addDirectNodeMass(model, nodeIndex, fullTriplets, ownership, false);
    } else {
      addDirectNodeMass(model, nodeIndex, fullTriplets, ownership, true);
      for (const descriptor of physicalMassDescriptors(domain)) {
        const memberMass = descriptorMass(descriptor);
        addLumpedMemberMass(descriptor, memberMass, fullTriplets);
        ownership.push(ownershipRow(descriptor.id, 'member-physical-mass', memberMass, 'lumped'));
        lumpedMemberCount += 1;
      }
    }
  } else {
    const released = physicalMassDescriptors(domain).filter((descriptor) => descriptor.releases?.localDofs?.length);
    if (released.length) {
      throw massError(
        'DYNAMIC_CONSISTENT_MASS_RELEASE_UNSUPPORTED',
        'Consistent mass is blocked for members with end releases until release condensation is qualified.',
        { memberIds: released.map((row) => row.id) },
      );
    }
    if (massSource) {
      const includePhysicalMemberMass = massSource.includeMemberMass === true || massSource.includeSelfWeight === true;
      const residualSource = residualMassSource(model, massSource, includePhysicalMemberMass);
      const residualTrace = buildMassSourceTrace(model, residualSource);
      addTraceMass(residualTrace, nodeIndex, fullTriplets, ownership, 'mass-source-residual');
      if (includePhysicalMemberMass) {
        for (const descriptor of physicalMassDescriptors(domain)) {
          const memberMass = descriptorMass(descriptor);
          addConsistentMemberMass(descriptor, memberMass, fullTriplets);
          ownership.push(ownershipRow(descriptor.id, 'member-physical-mass', memberMass, 'consistent'));
          consistentMemberCount += 1;
        }
      }
      addDirectNodeMass(model, nodeIndex, fullTriplets, ownership, false);
    } else {
      addDirectNodeMass(model, nodeIndex, fullTriplets, ownership, true);
      for (const descriptor of physicalMassDescriptors(domain)) {
        const memberMass = descriptorMass(descriptor);
        addConsistentMemberMass(descriptor, memberMass, fullTriplets);
        ownership.push(ownershipRow(descriptor.id, 'member-physical-mass', memberMass, 'consistent'));
        consistentMemberCount += 1;
      }
    }
  }

  const fullDofCount = domain.constraint.fullDofCount;
  const reducedDofCount = domain.constraint.reducedDofCount;
  const fullMatrix = createCscFromTriplets(fullDofCount, fullDofCount, fullTriplets, { tolerance: options.zeroTolerance });
  const reducedTriplets = reduceMassTriplets(fullMatrix, domain.constraint.rows);
  const matrix = createCscFromTriplets(reducedDofCount, reducedDofCount, reducedTriplets, { tolerance: options.zeroTolerance });
  const influenceByAxis = buildInfluenceByAxis(fullMatrix, domain.constraint.rows, fullDofCount, reducedDofCount);
  const physicalMassByAxis = directionalMass(fullMatrix, fullDofCount);
  const activeMassByAxis = influenceByAxis.map((vector) => sum(vector));
  const rowNorms = cscRowNorms(matrix);
  const scale = Array.from(rowNorms).reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 1);
  const activeDofs = Array.from(rowNorms.entries())
    .filter(([, value]) => value > scale * 1e-14)
    .map(([index]) => index);
  const diagonal = cscDiagonal(matrix);
  const minimumDiagonal = diagonal.length
    ? Array.from(diagonal).reduce((minimum, value) => Math.min(minimum, value), Infinity)
    : 0;
  const totalActiveMass = Math.max(...activeMassByAxis.map(Math.abs));
  if (!(totalActiveMass > positive(options.minimumTotalMass, 1e-12))) {
    throw massError('DYNAMIC_MASS_REQUIRED', 'The canonical dynamic domain has no active translational mass.');
  }
  if (minimumDiagonal < -scale * 1e-12) {
    throw massError('DYNAMIC_MASS_NEGATIVE_DIAGONAL', 'The reduced mass matrix contains a negative diagonal term.', { minimumDiagonal });
  }
  const symmetryError = cscSymmetryError(matrix);
  if (symmetryError > positive(options.symmetryTolerance, 1e-12)) {
    throw massError('DYNAMIC_MASS_NONSYMMETRIC', 'The reduced mass matrix failed symmetry validation.', { symmetryError });
  }
  const sourceSnapshot = {
    sourceId: massSource?.id || null,
    sourceVersion: massSource?.version || null,
    sourceTraceVersion: originalTrace?.version || null,
    sourceHash: massSource ? stableHash(massSource).slice(0, 24) : null,
    traceHash: originalTrace ? stableHash(originalTrace).slice(0, 24) : null,
    physicalOwnershipStrategy: massSource?.deduplication?.strategy || 'canonical-member-and-node-once',
  };
  const core = {
    version: MDOF_MASS_DOMAIN_VERSION,
    ok: true,
    formulation,
    matrix,
    fullMatrix,
    influenceByAxis: influenceByAxis.map((row) => Object.freeze(Array.from(row))),
    physicalMassByAxis: Object.freeze(physicalMassByAxis),
    activeMassByAxis: Object.freeze(activeMassByAxis),
    activeDofs: Object.freeze(activeDofs),
    fullDofCount,
    reducedDofCount,
    nodeCount: domain.nodes.length,
    physicalMemberCount: physicalMassDescriptors(domain).length,
    consistentMemberCount,
    lumpedMemberCount,
    minimumDiagonal,
    symmetryError,
    massSource: originalTrace,
    sourceSnapshot: Object.freeze(sourceSnapshot),
    ownership: Object.freeze(ownership),
    dimensions: Object.freeze({ matrix: 'mass', influence: 'mass', acceleration: 'length/time^2' }),
  };
  const identity = {
    version: core.version,
    formulation,
    domainMassHash: domain.identity?.massHash || domain.hashes?.massHash || null,
    constraintHash: domain.identity?.constraintHash || domain.hashes?.constraintHash || null,
    matrixPatternHash: matrix.patternHash,
    matrixValueHash: matrix.valueHash,
    sourceSnapshot,
  };
  return Object.freeze({
    ...core,
    massHash: stableHash(identity).slice(0, 24),
    memoryBytes: matrix.colPtr.byteLength + matrix.rowIdx.byteLength + matrix.values.byteLength
      + fullMatrix.colPtr.byteLength + fullMatrix.rowIdx.byteLength + fullMatrix.values.byteLength,
  });
}

export function combineGroundInfluence(massDomain, directionInput = 'x') {
  requireMassDomain(massDomain);
  const direction = normalizeDirection(directionInput);
  const output = new Float64Array(massDomain.reducedDofCount);
  for (let axis = 0; axis < 3; axis += 1) {
    const influence = massDomain.influenceByAxis[axis];
    for (let dof = 0; dof < output.length; dof += 1) output[dof] += direction[axis] * Number(influence[dof]);
  }
  return Object.freeze({
    version: MDOF_MASS_DOMAIN_VERSION,
    direction: Object.freeze(direction),
    vector: output,
    resultantMass: direction.reduce((value, component, axis) => (
      value + component ** 2 * Number(massDomain.activeMassByAxis[axis] || 0)
    ), 0),
  });
}

export function expandReducedKinematics(constraint, reducedInput = [], options = {}) {
  if (!constraint?.ok || reducedInput.length !== constraint.reducedDofCount) {
    throw massError('DYNAMIC_KINEMATIC_VECTOR_INVALID', 'Reduced dynamic kinematics do not match the canonical constraint.');
  }
  const reduced = Array.from(reducedInput, Number);
  const includePrescribed = options.includePrescribed === true;
  return Float64Array.from(constraint.rows, (row, fullDof) => (
    row.reduce((sumValue, [column, coefficient]) => sumValue + coefficient * reduced[column], 0)
      + (includePrescribed ? Number(constraint.prescribed?.[fullDof] || 0) : 0)
  ));
}

export function recoverDynamicInertia(massDomain, domain, relativeAcceleration, groundAcceleration = [0, 0, 0]) {
  requireMassDomain(massDomain);
  requireDomain(domain);
  const fullRelative = expandReducedKinematics(domain.constraint, relativeAcceleration);
  const ground = normalizeGroundVector(groundAcceleration);
  const absolute = Float64Array.from(fullRelative, (value, fullDof) => (
    value + (fullDof % 6 < 3 ? ground[fullDof % 6] : 0)
  ));
  const inertiaFull = cscMatVec(massDomain.fullMatrix, absolute);
  const force = [0, 0, 0];
  const moment = [0, 0, 0];
  const baseElevation = domain.nodes.reduce((minimum, node) => Math.min(minimum, Number(node.z || 0)), Infinity);
  domain.nodes.forEach((node, nodeIndex) => {
    const f = [0, 1, 2].map((axis) => Number(inertiaFull[nodeIndex * 6 + axis] || 0));
    const nodalInertiaMoment = [3, 4, 5].map((dof) => Number(inertiaFull[nodeIndex * 6 + dof] || 0));
    for (let axis = 0; axis < 3; axis += 1) force[axis] -= f[axis];
    const r = [Number(node.x || 0), Number(node.y || 0), Number(node.z || 0) - baseElevation];
    const cross = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    for (let axis = 0; axis < 3; axis += 1) moment[axis] -= cross[axis] + nodalInertiaMoment[axis];
  });
  return Object.freeze({
    relativeAccelerationFull: fullRelative,
    absoluteAccelerationFull: absolute,
    inertiaFull,
    baseReactionForce: Object.freeze(force),
    baseReactionMoment: Object.freeze(moment),
  });
}

function addTraceMass(trace, nodeIndex, triplets, ownership, sourceType) {
  for (const row of trace.rows || []) {
    const index = nodeIndex.get(row.node);
    if (index == null) continue;
    const vector = Array.isArray(row.massVector) ? row.massVector : [row.mass, row.mass, row.mass];
    for (let axis = 0; axis < 3; axis += 1) addTriplet(triplets, index * 6 + axis, index * 6 + axis, nonnegativeFinite(vector[axis], `${row.node}.mass[${axis}]`));
    ownership.push(Object.freeze({
      entityId: row.node,
      source: sourceType,
      formulation: 'lumped',
      massVector: Object.freeze(vector.map(Number)),
      sourceRefs: Object.freeze([...(row.sources || [])]),
    }));
  }
}

function addDirectNodeMass(model, nodeIndex, triplets, ownership, includeTranslations) {
  for (const node of model.nodes || []) {
    const index = nodeIndex.get(node.id);
    if (index == null || node.mass == null) continue;
    const values = normalizeNodeMass6Dof(node.mass, { label: `${node.id}.mass` });
    const start = includeTranslations ? 0 : 3;
    for (let dof = start; dof < 6; dof += 1) addTriplet(triplets, index * 6 + dof, index * 6 + dof, values[dof]);
    const recorded = includeTranslations ? values : [0, 0, 0, values[3], values[4], values[5]];
    if (recorded.some((value) => value > 0)) ownership.push(Object.freeze({
      entityId: node.id,
      source: 'node.mass',
      formulation: 'lumped',
      massVector: Object.freeze(recorded),
      sourceRefs: Object.freeze(['node.mass']),
    }));
  }
}

function addLumpedMemberMass(descriptor, memberMass, triplets) {
  for (const nodeOffset of [0, 6]) {
    for (let axis = 0; axis < 3; axis += 1) {
      const dof = descriptor.fullDofs[nodeOffset + axis];
      addTriplet(triplets, dof, dof, memberMass / 2);
    }
  }
}

function addConsistentMemberMass(descriptor, memberMass, triplets) {
  const length = positive(descriptor.geometry?.grossLength || descriptor.geometry?.length, null);
  if (!(length > 0) || !(memberMass > 0)) return;
  const local = isTruss(descriptor)
    ? localTranslationalConsistentMass(memberMass)
    : localFrameConsistentMass(memberMass, length, descriptor);
  const transform = descriptor.geometry?.transform;
  if (!Array.isArray(transform) || transform.length !== 12) {
    throw massError('DYNAMIC_MEMBER_TRANSFORM_INVALID', `Member ${descriptor.id} has no 12x12 transformation.`);
  }
  const global = transposeMultiply(local, transform);
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      addTriplet(triplets, descriptor.fullDofs[row], descriptor.fullDofs[column], global[row][column]);
    }
  }
}

function localTranslationalConsistentMass(mass) {
  const matrix = zeros(12);
  for (let axis = 0; axis < 3; axis += 1) {
    matrix[axis][axis] = mass / 3;
    matrix[axis][axis + 6] = mass / 6;
    matrix[axis + 6][axis] = mass / 6;
    matrix[axis + 6][axis + 6] = mass / 3;
  }
  return matrix;
}

function localFrameConsistentMass(mass, length, descriptor) {
  const matrix = zeros(12);
  const axial = mass / 6;
  assignSymmetric(matrix, [0, 6], [[2 * axial, axial], [axial, 2 * axial]]);
  const coefficient = mass / 420;
  assignSymmetric(matrix, [1, 5, 7, 11], scaleMatrix([
    [156, 22 * length, 54, -13 * length],
    [22 * length, 4 * length ** 2, 13 * length, -3 * length ** 2],
    [54, 13 * length, 156, -22 * length],
    [-13 * length, -3 * length ** 2, -22 * length, 4 * length ** 2],
  ], coefficient));
  assignSymmetric(matrix, [2, 4, 8, 10], scaleMatrix([
    [156, -22 * length, 54, 13 * length],
    [-22 * length, 4 * length ** 2, -13 * length, -3 * length ** 2],
    [54, -13 * length, 156, 22 * length],
    [13 * length, -3 * length ** 2, 22 * length, 4 * length ** 2],
  ], coefficient));
  const density = descriptorDensity(descriptor);
  const torsionalMass = Math.max(0, density * descriptorSection(descriptor, 'J') * length);
  if (torsionalMass > 0) assignSymmetric(matrix, [3, 9], [
    [torsionalMass / 3, torsionalMass / 6],
    [torsionalMass / 6, torsionalMass / 3],
  ]);
  return matrix;
}

function transposeMultiply(local, transform) {
  const temp = zeros(12);
  const output = zeros(12);
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      for (let inner = 0; inner < 12; inner += 1) temp[row][column] += local[row][inner] * Number(transform[inner][column]);
    }
  }
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      for (let inner = 0; inner < 12; inner += 1) output[row][column] += Number(transform[inner][row]) * temp[inner][column];
    }
  }
  return output;
}

function reduceMassTriplets(fullMatrix, rows) {
  const triplets = [];
  for (let fullColumn = 0; fullColumn < fullMatrix.colCount; fullColumn += 1) {
    for (let offset = fullMatrix.colPtr[fullColumn]; offset < fullMatrix.colPtr[fullColumn + 1]; offset += 1) {
      const fullRow = fullMatrix.rowIdx[offset];
      const value = fullMatrix.values[offset];
      for (const [reducedRow, rowCoefficient] of rows[fullRow] || []) {
        for (const [reducedColumn, columnCoefficient] of rows[fullColumn] || []) {
          triplets.push({ row: reducedRow, column: reducedColumn, value: rowCoefficient * value * columnCoefficient });
        }
      }
    }
  }
  return triplets;
}

function buildInfluenceByAxis(fullMatrix, rows, fullDofCount, reducedDofCount) {
  const output = Array.from({ length: 3 }, () => new Float64Array(reducedDofCount));
  for (let fullColumn = 0; fullColumn < fullDofCount; fullColumn += 1) {
    const axis = fullColumn % 6;
    if (axis >= 3) continue;
    for (let offset = fullMatrix.colPtr[fullColumn]; offset < fullMatrix.colPtr[fullColumn + 1]; offset += 1) {
      const fullRow = fullMatrix.rowIdx[offset];
      const value = fullMatrix.values[offset];
      for (const [reducedRow, coefficient] of rows[fullRow] || []) output[axis][reducedRow] += coefficient * value;
    }
  }
  return output;
}

function directionalMass(matrix, fullDofCount) {
  return [0, 1, 2].map((axis) => {
    const influence = new Float64Array(fullDofCount);
    for (let dof = axis; dof < fullDofCount; dof += 6) influence[dof] = 1;
    return sum(cscMatVec(matrix, influence).filter((_value, dof) => dof % 6 === axis));
  });
}

function residualMassSource(model, source, physicalMemberMass) {
  if (!physicalMemberMass) return { ...source, includeMemberMass: false, includeSelfWeight: false };
  const selfWeightCases = new Set((model.loadCases || []).filter((row) => {
    const id = String(row.id || '').toUpperCase();
    const variant = String(row.variant || '').toLowerCase();
    return id === 'D-SW' || ['selfweight', 'self-weight', 'self_weight'].includes(variant);
  }).map((row) => row.id));
  return {
    ...source,
    includeMemberMass: false,
    includeSelfWeight: false,
    combos: (source.combos || source.entries || []).filter((row) => !selfWeightCases.has(row.case || row.caseId)),
  };
}

function resolveMassSource(model, value) {
  if (value == null || value === '') return model.analysisSettings?.massSource || null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  const id = String(value);
  const source = (model.massSources || []).find((row) => String(row.id) === id);
  if (!source) throw massError('DYNAMIC_MASS_SOURCE_NOT_FOUND', `Mass source ${id} was not found.`);
  return source;
}

function physicalMassDescriptors(domain) {
  return domain.elements.filter((descriptor) => !descriptor.generated && !descriptor.massless && descriptorMass(descriptor) > 0);
}

function descriptorMass(descriptor) {
  return descriptorDensity(descriptor) * descriptorSection(descriptor, 'A')
    * positive(descriptor.geometry?.grossLength || descriptor.geometry?.length, 0);
}

function descriptorDensity(descriptor) {
  const material = descriptor.propertySnapshot?.effectiveMaterial || descriptor.propertySnapshot?.material || {};
  return nonnegativeFinite(material.density ?? material.rho ?? 0, `${descriptor.id}.density`);
}

function descriptorSection(descriptor, key) {
  const section = descriptor.propertySnapshot?.effectiveSection || descriptor.propertySnapshot?.section || {};
  return nonnegativeFinite(section[key] ?? 0, `${descriptor.id}.${key}`);
}

function isTruss(descriptor) {
  return ['truss', 'brace', 'axial'].includes(String(descriptor.behavior || descriptor.type || '').toLowerCase());
}

function normalizeFormulation(value) {
  const formulation = String(value || '').trim().toLowerCase();
  if (!MDOF_MASS_FORMULATIONS.includes(formulation)) throw massError('DYNAMIC_MASS_FORMULATION_INVALID', `Unsupported mass formulation: ${formulation}.`);
  return formulation;
}

function normalizeDirection(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length !== 3) throw massError('DYNAMIC_DIRECTION_INVALID', 'Ground-motion direction requires three components.');
    const direction = Array.from(value, Number);
    if (direction.some((item) => !Number.isFinite(item))) throw massError('DYNAMIC_DIRECTION_INVALID', 'Ground-motion direction must be finite.');
    const norm = Math.hypot(...direction);
    if (!(norm > 0)) throw massError('DYNAMIC_DIRECTION_INVALID', 'Ground-motion direction must be nonzero.');
    return direction.map((item) => item / norm);
  }
  const key = String(value || 'x').trim().toLowerCase().replace(/^\+/, '');
  const signValue = key.startsWith('-') ? -1 : 1;
  const axis = key.replace(/^-/, '');
  const index = ['x', 'y', 'z'].indexOf(axis);
  if (index < 0) throw massError('DYNAMIC_DIRECTION_INVALID', `Unsupported ground-motion direction: ${value}.`);
  const direction = [0, 0, 0];
  direction[index] = signValue;
  return direction;
}

function normalizeGroundVector(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length !== 3) throw massError('DYNAMIC_GROUND_ACCELERATION_INVALID', 'Ground acceleration requires three components.');
    return Array.from(value, (item, index) => finite(item, `groundAcceleration[${index}]`));
  }
  return [finite(value, 'groundAcceleration'), 0, 0];
}

function validateExplicitMasses(model) {
  for (const node of model.nodes || []) {
    try {
      normalizeNodeMass6Dof(node.mass, { label: `${node.id}.mass` });
    } catch (error) {
      throw massError('DYNAMIC_NODE_MASS_INVALID', error.message);
    }
  }
}

function assignSymmetric(target, indices, source) {
  indices.forEach((row, i) => indices.forEach((column, j) => { target[row][column] = Number(source[i][j]); }));
}

function scaleMatrix(matrix, factor) {
  return matrix.map((row) => row.map((value) => value * factor));
}

function zeros(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function ownershipRow(entityId, source, mass, formulation) {
  return Object.freeze({ entityId, source, formulation, mass, sourceRefs: Object.freeze([source]) });
}

function addTriplet(target, row, column, value) {
  if (value !== 0) target.push({ row, column, value });
}

function sum(values) {
  return Array.from(values || []).reduce((total, value) => total + Number(value || 0), 0);
}

function requireDomain(domain) {
  if (!domain?.ok || !domain.constraint?.ok) throw massError('DYNAMIC_DOMAIN_INVALID', 'A valid canonical analysis domain is required.');
}

function requireMassDomain(value) {
  if (value?.version !== MDOF_MASS_DOMAIN_VERSION || value.ok !== true) throw massError('DYNAMIC_MASS_DOMAIN_INVALID', 'A valid MDOF mass domain is required.');
}

function nonnegativeFinite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw massError('DYNAMIC_MASS_VALUE_INVALID', `${name} must be finite and nonnegative.`);
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw massError('DYNAMIC_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function massError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'MdofMassDomainError';
  error.code = code;
  error.details = details;
  return error;
}
