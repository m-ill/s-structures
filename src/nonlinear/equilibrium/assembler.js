import { stableHash } from '../../core/stableHash.js';
import {
  expandConstraintDisplacements,
  reduceConstraintVector,
} from '../../solver/domain/constraintSystem.js';
import { validateNonlinearElementResponse } from '../core/elementContract.js';
import { buildNonlinearEquilibriumAudit } from './audit.js';
import { buildNonlinearLoadPattern } from './externalLoads.js';
import {
  assembleReducedTangent,
  buildReducedSparsePattern,
} from './typedSparse.js';
import {
  pullBackSpatialMoment,
  pushForwardGeneralizedMoment,
} from '../math/rotationCoordinates.js';

export const MDOF_EQUILIBRIUM_ASSEMBLER_VERSION = 'p8-m4-mdof-equilibrium-assembler-v3';

export function createEquilibriumAssembler(input = {}) {
  const domain = requireDomain(input.domain);
  const elements = normalizeEntries(input.elements || []);
  const loadPattern = normalizeLoadPattern(
    input.loadPattern || buildNonlinearLoadPattern(domain, input.loadOptions),
    domain.constraint,
  );
  const memberLoadTraces = indexMemberLoadTraces(loadPattern.trace);
  const handledPrestress = buildHandledPrestressPattern(loadPattern.trace, elements, domain.constraint.fullDofCount);
  const physicalLoadPattern = subtractLoadPatterns(loadPattern, handledPrestress);
  const handledMechanical = buildHandledMechanicalPattern(loadPattern.trace, elements, domain.constraint.fullDofCount);
  const usesFiniteRotationCoordinates = elements.some((entry) => entry.usesFiniteRotationCoordinates === true);
  const characteristicLength = inferCharacteristicLength(domain, elements);
  const allowedInactiveReducedDofs = inferAllowedInactiveReducedDofs(domain, elements);
  const externalMomentBlocks = domain.nodes.map((_node, index) => ({
    id: `external-moment-${index}`,
    dofs: [index * 6 + 3, index * 6 + 4, index * 6 + 5],
  }));
  const assemblyDofLists = [
    ...elements.map((entry) => entry.dofs),
    ...externalMomentBlocks,
  ];
  const pattern = input.pattern || buildReducedSparsePattern(
    domain.constraint,
    assemblyDofLists,
  );
  if (pattern.elementCount !== assemblyDofLists.length) {
    const error = new TypeError('Custom tangent pattern does not contain the external moment blocks.');
    error.code = 'MDOF_PATTERN_EXTERNAL_MOMENT_BLOCKS_REQUIRED';
    throw error;
  }
  const netLoadPattern = subtractLoadPatterns(physicalLoadPattern, handledMechanical);
  const hasReleasedElement = elements.some((entry) => (entry?.descriptor?.releases?.localDofs || []).length > 0);
  const hasGeneralElement = elements.some((entry) => entry.requiredMatrixClass === 'general');
  const requiredMatrixClass = (
    hasReleasedElement
    || hasGeneralElement
    || (usesFiniteRotationCoordinates && loadPatternHasPhysicalMoment(physicalLoadPattern, domain.nodes.length))
  ) ? 'general' : 'spd';
  let evaluationCount = 0;
  let tangentAssemblyCount = 0;

  return {
    version: MDOF_EQUILIBRIUM_ASSEMBLER_VERSION,
    domain,
    elements,
    loadPattern,
    pattern,
    characteristicLength,
    allowedInactiveReducedDofs,
    requiredMatrixClass,
    usesFiniteRotationCoordinates,
    get telemetry() {
      return Object.freeze({ evaluationCount, tangentAssemblyCount, patternHash: pattern.patternHash });
    },
    async evaluate(options = {}) {
      const q = finiteVector(options.q, domain.constraint.reducedDofCount, 'q');
      const lambda = finite(options.lambda, 0, 'lambda');
      const u = Float64Array.from(expandConstraintDisplacements(domain.constraint, q));
      const pInternalFull = new Float64Array(domain.constraint.fullDofCount);
      const elementMatrices = [];
      const elementStates = {};
      const elementResponses = {};
      const diagnostics = [];
      const energies = {};
      const inactiveModeGroupsFull = [];
      const committedElementStates = options.committedElementStates || {};

      for (const entry of elements) {
        const uElement = Array.from(entry.dofs, (dof) => u[dof]);
        const memberLoad = resolveMemberLoadState(memberLoadTraces.get(entry.id), entry.id, lambda, entry.dofs.length);
        let response;
        try {
          response = await entry.kernel.evaluate({
            element: entry.descriptor || entry.element || { id: entry.id },
            committedState: clone(committedElementStates[entry.id]?.data ?? committedElementStates[entry.id] ?? {}),
            elementLoads: memberLoad,
            trialKinematics: {
              uGlobal: uElement,
              fullDisplacement: u,
              reducedDisplacement: q,
              lambda,
              memberFixedEndLocal: memberLoad.fixedEndLocal,
            },
            dt: options.dt ?? null,
            mode: options.mode || 'static',
          });
        } catch (error) {
          return failedEvaluation('ELEMENT_EVALUATION_FAILED', entry.id, error);
        }
        const validation = validateNonlinearElementResponse(response, entry.dofs.length);
        if (!validation.ok) {
          return failedEvaluation('ELEMENT_RESPONSE_INVALID', entry.id, null, validation.errors);
        }
        response.resistingForceGlobal.forEach((value, index) => {
          pInternalFull[entry.dofs[index]] += Number(value);
        });
        const inactiveModeGroup = [];
        for (const localMode of Array.isArray(response.inactiveModesGlobal) ? response.inactiveModesGlobal : []) {
          if (localMode?.length !== entry.dofs.length) continue;
          const fullMode = new Float64Array(domain.constraint.fullDofCount);
          entry.dofs.forEach((fullDof, index) => { fullMode[fullDof] += Number(localMode[index]); });
          inactiveModeGroup.push(fullMode);
        }
        if (inactiveModeGroup.length) inactiveModeGroupsFull.push(inactiveModeGroup);
        elementMatrices.push(response.tangentGlobal);
        elementStates[entry.id] = clone(response.trialState);
        elementResponses[entry.id] = {
          globalResponse: clone(response.globalResponse || {
            resistingForce: response.resistingForceGlobal,
          }),
          localResponse: clone(response.localResponse || null),
          diagnostics: clone(response.diagnostics || null),
          energies: clone(response.energies || {}),
        };
        diagnostics.push({ elementId: entry.id, diagnostics: clone(response.diagnostics || null) });
        for (const [key, value] of Object.entries(response.energies || {})) {
          const number = Number(value);
          if (!Number.isFinite(number)) return failedEvaluation('ELEMENT_ENERGY_NONFINITE', entry.id);
          energies[key] = Number(energies[key] || 0) + number;
        }
      }
      evaluationCount += elements.length;
      const pExternalPhysicalFull = combineLoads(physicalLoadPattern.constantFull, physicalLoadPattern.referenceFull, lambda);
      const pEffectiveExternalPhysicalFull = combineLoads(netLoadPattern.constantFull, netLoadPattern.referenceFull, lambda);
      const external = usesFiniteRotationCoordinates
        ? pullBackExternalMoments(pEffectiveExternalPhysicalFull, u, domain.nodes.length)
        : unchangedExternalMoments(pEffectiveExternalPhysicalFull, domain.nodes.length);
      external.tangents.forEach((matrix) => elementMatrices.push(matrix.map((row) => row.map((value) => -value))));
      const tangentReduced = assembleReducedTangent(pattern, elementMatrices);
      tangentAssemblyCount += 1;
      const pInternalGeneralizedFull = pInternalFull;
      const pInternalPhysicalFull = usesFiniteRotationCoordinates
        ? pushForwardInternalMoments(pInternalGeneralizedFull, u, domain.nodes.length)
        : Float64Array.from(pInternalGeneralizedFull);
      const pInternalReduced = Float64Array.from(reduceConstraintVector(domain.constraint, pInternalGeneralizedFull));
      const pExternalGeneralizedFull = external.generalized;
      const pExternalReduced = Float64Array.from(reduceConstraintVector(domain.constraint, pExternalGeneralizedFull));
      const residualFull = subtract(pEffectiveExternalPhysicalFull, pInternalPhysicalFull);
      const residualReduced = subtract(pExternalReduced, pInternalReduced);
      const reactionsFull = Float64Array.from(residualFull, (value) => -value);
      const audit = buildNonlinearEquilibriumAudit(domain.nodes || [], pExternalPhysicalFull, reactionsFull, options.auditOptions);
      const inactiveModeGroupsReduced = inactiveModeGroupsFull
        .map((group) => group.map((mode) => reduceDisplacementMode(domain.constraint, mode)).filter(Boolean))
        .filter((group) => group.length > 0);
      const inactiveModesReduced = inactiveModeGroupsReduced.flat();
      const response = {
        version: MDOF_EQUILIBRIUM_ASSEMBLER_VERSION,
        ok: true,
        lambda,
        q,
        u,
        pExternalFull: pExternalPhysicalFull,
        pEffectiveExternalFull: pEffectiveExternalPhysicalFull,
        pExternalGeneralizedFull,
        pExternalReduced,
        pInternalFull: pInternalPhysicalFull,
        pInternalGeneralizedFull,
        pInternalReduced,
        residualFull,
        residualReduced,
        reactionsFull,
        tangentReduced,
        inactiveModesReduced,
        inactiveModeGroupsReduced,
        elementStates,
        elementResponses,
        energies,
        audit,
        diagnostics: {
          elementDiagnostics: diagnostics,
          elementEvaluationCount: elements.length,
          cumulativeElementEvaluationCount: evaluationCount,
          tangentAssemblyCount,
          tangentPatternHash: pattern.patternHash,
          tangentValueHash: stableHash(Array.from(tangentReduced.values)).slice(0, 24),
          tangentSymmetryError: typedSymmetryError(tangentReduced),
          externalMomentPullbackCount: external.activeCount,
          inactiveModeCount: inactiveModesReduced.length,
          inactiveModeGroupCount: inactiveModeGroupsReduced.length,
        },
      };
      response.responseHash = stableHash({
        lambda,
        q: Array.from(q),
        residual: Array.from(residualReduced),
        tangent: Array.from(tangentReduced.values),
        elementStates,
      }).slice(0, 24);
      return response;
    },
  };
}

function normalizeEntries(entries) {
  return entries.map((entry, index) => {
    const id = String(entry?.id || entry?.descriptor?.id || `element-${index + 1}`);
    const dofs = Int32Array.from(entry?.dofs || entry?.descriptor?.fullDofs || []);
    if (!dofs.length || !entry?.kernel || typeof entry.kernel.evaluate !== 'function') {
      const error = new TypeError(`Element entry ${id} requires DOFs and a kernel.`);
      error.code = 'MDOF_ELEMENT_ENTRY_INVALID';
      throw error;
    }
    if ([...dofs].some((value) => !Number.isInteger(value) || value < 0)) {
      const error = new TypeError(`Element entry ${id} contains an invalid DOF.`);
      error.code = 'MDOF_ELEMENT_DOF_INVALID';
      throw error;
    }
    return Object.freeze({ ...entry, id, dofs });
  });
}

function normalizeLoadPattern(pattern, constraint) {
  if (pattern?.ok === false) {
    const error = new Error(pattern.message || pattern.reason || 'External load assembly failed.');
    error.code = pattern.reason || 'EXTERNAL_LOAD_ASSEMBLY_FAILED';
    error.details = pattern;
    throw error;
  }
  const constantFull = finiteVector(pattern?.constantFull || new Float64Array(constraint.fullDofCount), constraint.fullDofCount, 'constantFull');
  const referenceFull = finiteVector(pattern?.referenceFull || pattern?.full || new Float64Array(constraint.fullDofCount), constraint.fullDofCount, 'referenceFull');
  const constantReduced = pattern?.constantReduced
    ? finiteVector(pattern.constantReduced, constraint.reducedDofCount, 'constantReduced')
    : Float64Array.from(reduceConstraintVector(constraint, constantFull));
  const referenceReduced = pattern?.referenceReduced
    ? finiteVector(pattern.referenceReduced, constraint.reducedDofCount, 'referenceReduced')
    : Float64Array.from(reduceConstraintVector(constraint, referenceFull));
  return Object.freeze({
    ...pattern,
    ok: true,
    constantFull,
    referenceFull,
    constantReduced,
    referenceReduced,
  });
}

function requireDomain(domain) {
  if (!domain?.constraint?.ok || !Number.isInteger(domain.constraint.fullDofCount)) {
    const error = new TypeError('A canonical domain with a valid constraint contract is required.');
    error.code = 'MDOF_CANONICAL_DOMAIN_REQUIRED';
    throw error;
  }
  return domain;
}

function combineLoads(constant, reference, lambda) {
  return Float64Array.from(constant, (value, index) => Number(value) + lambda * Number(reference[index]));
}

function buildHandledPrestressPattern(trace, elements, fullDofCount) {
  const handled = new Set(elements.filter((entry) => entry.handlesMemberPrestress === true).map((entry) => entry.id));
  const constantFull = new Float64Array(fullDofCount);
  const referenceFull = new Float64Array(fullDofCount);
  for (const row of Array.isArray(trace) ? trace : []) {
    if (!handled.has(row?.target?.memberId) || !['temperature', 'tgradient'].includes(row?.source?.type)) continue;
    const destination = row.role === 'constant' ? constantFull : referenceFull;
    if (row.dofs?.length !== row.values?.length) continue;
    row.dofs.forEach((dof, index) => { destination[dof] += Number(row.values[index]); });
  }
  return { constantFull, referenceFull };
}

function buildHandledMechanicalPattern(trace, elements, fullDofCount) {
  const handled = new Set(elements.filter((entry) => entry.handlesMechanicalMemberLoads === true).map((entry) => entry.id));
  const constantFull = new Float64Array(fullDofCount);
  const referenceFull = new Float64Array(fullDofCount);
  for (const row of Array.isArray(trace) ? trace : []) {
    if (!handled.has(row?.target?.memberId) || ['temperature', 'tgradient'].includes(row?.source?.type)) continue;
    const destination = row.role === 'constant' ? constantFull : referenceFull;
    if (row.dofs?.length !== row.values?.length) continue;
    row.dofs.forEach((dof, index) => { destination[dof] += Number(row.values[index]); });
  }
  return { constantFull, referenceFull };
}

function subtractLoadPatterns(pattern, removed) {
  return {
    constantFull: Float64Array.from(pattern.constantFull, (value, index) => Number(value) - Number(removed.constantFull[index])),
    referenceFull: Float64Array.from(pattern.referenceFull, (value, index) => Number(value) - Number(removed.referenceFull[index])),
  };
}

function pullBackExternalMoments(physicalFull, u, nodeCount) {
  const generalized = Float64Array.from(physicalFull);
  const tangents = [];
  let activeCount = 0;
  for (let node = 0; node < nodeCount; node += 1) {
    const base = node * 6 + 3;
    const moment = Array.from(physicalFull.slice(base, base + 3));
    if (moment.every((value) => value === 0)) {
      tangents.push(Array.from({ length: 3 }, () => new Array(3).fill(0)));
      continue;
    }
    const pulled = pullBackSpatialMoment(u.slice(base, base + 3), moment);
    generalized.set(pulled.generalized, base);
    tangents.push(pulled.tangent);
    activeCount += 1;
  }
  return { generalized, tangents, activeCount };
}

function unchangedExternalMoments(physicalFull, nodeCount) {
  return {
    generalized: Float64Array.from(physicalFull),
    tangents: Array.from({ length: nodeCount }, () => Array.from({ length: 3 }, () => new Array(3).fill(0))),
    activeCount: 0,
  };
}

function pushForwardInternalMoments(generalizedFull, u, nodeCount) {
  const physical = Float64Array.from(generalizedFull);
  for (let node = 0; node < nodeCount; node += 1) {
    const base = node * 6 + 3;
    const moment = Array.from(generalizedFull.slice(base, base + 3));
    if (moment.every((value) => value === 0)) continue;
    physical.set(pushForwardGeneralizedMoment(u.slice(base, base + 3), moment), base);
  }
  return physical;
}

function loadPatternHasPhysicalMoment(pattern, nodeCount) {
  for (let node = 0; node < nodeCount; node += 1) {
    const base = node * 6 + 3;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Number(pattern.constantFull[base + axis]) !== 0 || Number(pattern.referenceFull[base + axis]) !== 0) return true;
    }
  }
  return false;
}

function inferCharacteristicLength(domain, elements) {
  const nodes = Array.isArray(domain.nodes) ? domain.nodes : [];
  if (nodes.length > 1) {
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (const node of nodes) {
      ['x', 'y', 'z'].forEach((key, axis) => {
        const value = Number(node[key] || 0);
        if (!Number.isFinite(value)) return;
        minimum[axis] = Math.min(minimum[axis], value);
        maximum[axis] = Math.max(maximum[axis], value);
      });
    }
    const diagonal = Math.hypot(...minimum.map((value, axis) => maximum[axis] - value));
    if (Number.isFinite(diagonal) && diagonal > 0) return diagonal;
  }
  let maximumLength = 0;
  for (const entry of elements) {
    const length = Number(entry?.descriptor?.geometry?.length ?? entry?.element?.geometry?.length);
    if (Number.isFinite(length) && length > maximumLength) maximumLength = length;
  }
  if (maximumLength > 0) return maximumLength;
  return 1;
}

function inferAllowedInactiveReducedDofs(domain, elements) {
  const fullCount = domain.constraint.fullDofCount;
  const reducedCount = domain.constraint.reducedDofCount;
  const incidence = new Uint32Array(fullCount);
  const inactiveIncidence = new Uint32Array(fullCount);
  for (const entry of elements) {
    const localInactive = explicitInactiveLocalDofs(entry);
    entry.dofs.forEach((fullDof, localDof) => {
      incidence[fullDof] += 1;
      if (localInactive.has(localDof)) inactiveIncidence[fullDof] += 1;
    });
  }
  const explicitFull = new Uint8Array(fullCount);
  for (let fullDof = 0; fullDof < fullCount; fullDof += 1) {
    if (incidence[fullDof] > 0 && inactiveIncidence[fullDof] === incidence[fullDof]) explicitFull[fullDof] = 1;
  }
  const mapped = new Uint8Array(reducedCount);
  const allowed = new Uint8Array(reducedCount).fill(1);
  domain.constraint.rows.forEach((row, fullDof) => {
    for (const term of row) {
      const reducedDof = Number(term[0]);
      mapped[reducedDof] = 1;
      if (row.length !== 1 || explicitFull[fullDof] !== 1) allowed[reducedDof] = 0;
    }
  });
  return Int32Array.from(
    Array.from({ length: reducedCount }, (_value, reducedDof) => reducedDof)
      .filter((reducedDof) => mapped[reducedDof] === 1 && allowed[reducedDof] === 1),
  );
}

function reduceDisplacementMode(constraint, fullMode) {
  const reduced = new Float64Array(constraint.reducedDofCount);
  const assigned = new Uint8Array(constraint.reducedDofCount);
  for (let fullDof = 0; fullDof < constraint.fullDofCount; fullDof += 1) {
    const value = Number(fullMode[fullDof]);
    if (value === 0) continue;
    const row = constraint.rows[fullDof];
    if (row.length !== 1) return null;
    const [column, coefficient] = row[0];
    const candidate = value / coefficient;
    if (assigned[column] && Math.abs(reduced[column] - candidate) > 1e-9 * Math.max(1, Math.abs(candidate))) return null;
    reduced[column] = candidate;
    assigned[column] = 1;
  }
  const expanded = expandConstraintDisplacements(constraint, reduced);
  let error = 0;
  let scale = 0;
  for (let index = 0; index < fullMode.length; index += 1) {
    error = Math.max(error, Math.abs(Number(expanded[index]) - Number(fullMode[index])));
    scale = Math.max(scale, Math.abs(Number(fullMode[index])));
  }
  let squaredNorm = 0;
  for (const value of reduced) squaredNorm += value * value;
  const norm = Math.sqrt(squaredNorm);
  if (!(norm > 0) || error > 1e-9 * Math.max(1, scale)) return null;
  return Float64Array.from(reduced, (value) => value / norm);
}

function explicitInactiveLocalDofs(entry) {
  const explicit = new Set(Array.from(entry?.inactiveLocalDofs || [], Number));
  const descriptor = entry?.descriptor || entry?.element || {};
  const behavior = descriptor.behavior || descriptor.type;
  const offsets = descriptor.geometry?.offsets || {};
  const hasOffsets = Number(offsets.i || 0) !== 0 || Number(offsets.j || 0) !== 0;
  if (['truss', 'tensionOnly', 'compressionOnly'].includes(behavior) && !hasOffsets) {
    [3, 4, 5, 9, 10, 11].forEach((dof) => explicit.add(dof));
  }
  const releases = new Set(descriptor.releases?.localDofs || []);
  const axes = descriptor.geometry?.axes || {};
  for (const [endIndex, end] of [[0, [3, 4, 5]], [1, [9, 10, 11]]]) {
    const offset = Number(endIndex === 0 ? offsets.i || 0 : offsets.j || 0);
    if (offset !== 0) continue;
    if (end.every((dof) => releases.has(dof))) {
      end.forEach((dof) => explicit.add(dof));
      continue;
    }
    end.forEach((dof, localAxis) => {
      if (!releases.has(dof)) return;
      const axis = axes[['x', 'y', 'z'][localAxis]];
      const globalAxis = axisAlignedGlobalIndex(axis);
      if (globalAxis >= 0) explicit.add(end[0] + globalAxis);
    });
  }
  return explicit;
}

function axisAlignedGlobalIndex(axis) {
  if (!Array.isArray(axis) || axis.length !== 3) return -1;
  for (let index = 0; index < 3; index += 1) {
    if (Math.abs(Math.abs(Number(axis[index])) - 1) > 1e-10) continue;
    if (axis.every((value, other) => other === index || Math.abs(Number(value)) <= 1e-10)) return index;
  }
  return -1;
}

function indexMemberLoadTraces(trace) {
  const index = new Map();
  for (const row of Array.isArray(trace) ? trace : []) {
    const elementId = row?.target?.memberId;
    if (elementId == null || row.status === 'failed') continue;
    if (!index.has(elementId)) index.set(elementId, []);
    index.get(elementId).push(clone(row));
  }
  for (const [elementId, rows] of index) index.set(elementId, Object.freeze(rows));
  return index;
}

function resolveMemberLoadState(rows = [], elementId, lambda, dofCount) {
  const fixedEndLocal = new Float64Array(dofCount);
  for (const row of rows) {
    const values = row.condensedFixedEnd;
    if (values == null || values.length !== dofCount) continue;
    const scale = row.role === 'constant' ? 1 : lambda;
    for (let index = 0; index < dofCount; index += 1) {
      const value = Number(values[index]);
      if (!Number.isFinite(value)) {
        const error = new TypeError(`Member-load fixed-end force ${elementId}[${index}] must be finite.`);
        error.code = 'MEMBER_FIXED_END_FORCE_NONFINITE';
        throw error;
      }
      fixedEndLocal[index] += scale * value;
    }
  }
  return Object.freeze({
    elementId,
    lambda,
    fixedEndLocal,
    trace: rows,
  });
}

function subtract(a, b) {
  return Float64Array.from(a, (value, index) => Number(value) - Number(b[index]));
}

function finiteVector(values, length, name) {
  if (values == null || values.length !== length) {
    const error = new RangeError(`${name} must contain ${length} values.`);
    error.code = 'MDOF_VECTOR_SIZE_INVALID';
    throw error;
  }
  return Float64Array.from(values, (value, index) => finite(value, 0, `${name}[${index}]`));
}

function finite(value, fallback, name) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new TypeError(`${name} must be finite.`);
    error.code = 'MDOF_VALUE_NONFINITE';
    throw error;
  }
  return number;
}

function failedEvaluation(reason, elementId, error = null, errors = []) {
  return {
    version: MDOF_EQUILIBRIUM_ASSEMBLER_VERSION,
    ok: false,
    reason,
    elementId,
    message: error?.message || reason,
    errors,
  };
}

function typedSymmetryError(matrix) {
  const values = new Map();
  let scale = 0;
  for (const value of matrix.values) scale = Math.max(scale, Math.abs(Number(value)));
  if (scale === 0) return 0;
  let norm = 0;
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let p = matrix.colPtr[column]; p < matrix.colPtr[column + 1]; p += 1) {
      const row = matrix.rowIdx[p];
      const value = Number(matrix.values[p]) / scale;
      values.set(`${row}:${column}`, value);
      norm += value * value;
    }
  }
  let diff = 0;
  for (const [key, value] of values) {
    const [row, column] = key.split(':').map(Number);
    const delta = value - Number(values.get(`${column}:${row}`) || 0);
    diff += delta * delta;
  }
  return norm === 0 ? 0 : Math.sqrt(diff / norm);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
