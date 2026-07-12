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

export const MDOF_EQUILIBRIUM_ASSEMBLER_VERSION = 'p8-m2-mdof-equilibrium-assembler-v1';

export function createEquilibriumAssembler(input = {}) {
  const domain = requireDomain(input.domain);
  const elements = normalizeEntries(input.elements || []);
  const loadPattern = normalizeLoadPattern(
    input.loadPattern || buildNonlinearLoadPattern(domain, input.loadOptions),
    domain.constraint,
  );
  const memberLoadTraces = indexMemberLoadTraces(loadPattern.trace);
  const pattern = input.pattern || buildReducedSparsePattern(
    domain.constraint,
    elements.map((entry) => entry.dofs),
  );
  let evaluationCount = 0;
  let tangentAssemblyCount = 0;

  return {
    version: MDOF_EQUILIBRIUM_ASSEMBLER_VERSION,
    domain,
    elements,
    loadPattern,
    pattern,
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
        elementMatrices.push(response.tangentGlobal);
        elementStates[entry.id] = clone(response.trialState);
        elementResponses[entry.id] = {
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
      const tangentReduced = assembleReducedTangent(pattern, elementMatrices);
      tangentAssemblyCount += 1;
      const pInternalReduced = Float64Array.from(reduceConstraintVector(domain.constraint, pInternalFull));
      const pExternalFull = combineLoads(loadPattern.constantFull, loadPattern.referenceFull, lambda);
      const pExternalReduced = combineLoads(loadPattern.constantReduced, loadPattern.referenceReduced, lambda);
      const residualFull = subtract(pExternalFull, pInternalFull);
      const residualReduced = subtract(pExternalReduced, pInternalReduced);
      const reactionsFull = Float64Array.from(residualFull, (value) => -value);
      const audit = buildNonlinearEquilibriumAudit(domain.nodes || [], pExternalFull, reactionsFull, options.auditOptions);
      const response = {
        version: MDOF_EQUILIBRIUM_ASSEMBLER_VERSION,
        ok: true,
        lambda,
        q,
        u,
        pExternalFull,
        pExternalReduced,
        pInternalFull,
        pInternalReduced,
        residualFull,
        residualReduced,
        reactionsFull,
        tangentReduced,
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
  let norm = 0;
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let p = matrix.colPtr[column]; p < matrix.colPtr[column + 1]; p += 1) {
      const row = matrix.rowIdx[p];
      const value = Number(matrix.values[p]);
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
  return Math.sqrt(diff) / Math.max(Math.sqrt(norm), 1);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
