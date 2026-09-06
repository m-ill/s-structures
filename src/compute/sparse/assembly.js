import { stableHash } from '../../core/stableHash.js';
import {
  createCscFromTriplets,
  cscSymmetryError,
  validateCommonSparseMatrix,
} from './matrix.js';

export const DETERMINISTIC_SPARSE_ASSEMBLY_VERSION = 'p15-m2-deterministic-sparse-assembly-v1';
export const MUTABLE_SPARSE_ACCUMULATOR_VERSION = 'p15-m8-mutable-sparse-accumulator-adapter-v1';
export const SPARSE_ASSEMBLY_BASIS = Object.freeze({
  GLOBAL: 'GLOBAL',
  LOCAL: 'LOCAL',
});

/**
 * Deterministic finite-element block assembler.
 *
 * Contributions are retained until finalization and sorted by their stable
 * source identity before compensated summation. This makes duplicate
 * accumulation independent of element traversal order.
 */
export function createDeterministicSparseAssembler(options = {}) {
  const rowCount = dimension(options.rowCount, 'rowCount');
  const colCount = dimension(options.colCount ?? rowCount, 'colCount');
  const basis = normalizeBasis(options.basis, 'basis');
  const symmetric = options.symmetric === true;
  if (symmetric && rowCount !== colCount) {
    throw assemblyError('SPARSE_ASSEMBLY_SYMMETRIC_NOT_SQUARE', 'A symmetric assembler must be square.');
  }
  const rowDofOrder = normalizeTargetDofOrder(options.rowDofOrder ?? options.dofOrder, rowCount, 'rowDofOrder');
  const colDofOrder = normalizeTargetDofOrder(
    options.colDofOrder ?? (rowCount === colCount ? options.dofOrder : null),
    colCount,
    'colDofOrder',
  );
  const requireDofOrder = options.requireDofOrder !== false;
  const defaultSymmetryTolerance = nonnegative(options.symmetryTolerance, 1e-12);
  const contributions = new Map();
  const termIdentities = new Set();
  const blockIdentities = new Set();
  const sourceIds = new Set();
  let contributionCount = 0;
  let peakCoordinateCount = 0;
  let finalized = false;

  return Object.freeze({
    version: DETERMINISTIC_SPARSE_ASSEMBLY_VERSION,
    rowCount,
    colCount,
    basis,
    symmetric,
    addBlock,
    addValue,
    finalize,
    snapshot,
  });

  function addBlock(block = {}) {
    assertOpen();
    const elementId = requiredText(block.elementId, 'elementId');
    const contributionId = requiredText(block.contributionId ?? 'stiffness', 'contributionId');
    assertBasis(block.basis, `element ${elementId}`);
    const rowDofs = dofIndices(block.rowDofs ?? block.dofs, rowCount, `element ${elementId} rowDofs`);
    const colDofs = dofIndices(block.colDofs ?? block.dofs, colCount, `element ${elementId} colDofs`);
    const rowOrder = normalizeBlockDofOrder(
      block.rowDofOrder ?? block.dofOrder,
      rowDofs.length,
      `element ${elementId} rowDofOrder`,
      requireDofOrder,
    );
    const colOrder = normalizeBlockDofOrder(
      block.colDofOrder ?? block.dofOrder,
      colDofs.length,
      `element ${elementId} colDofOrder`,
      requireDofOrder,
    );
    assertDofOrder(rowDofOrder, rowDofs, rowOrder, `element ${elementId} row`);
    assertDofOrder(colDofOrder, colDofs, colOrder, `element ${elementId} column`);
    const matrix = normalizeBlockMatrix(block.matrix, rowDofs.length, colDofs.length, elementId);
    const blockIdentity = `${elementId}\u0000${contributionId}`;
    if (blockIdentities.has(blockIdentity)) {
      throw assemblyError(
        'SPARSE_ASSEMBLY_BLOCK_DUPLICATE',
        `Element ${elementId} contribution ${contributionId} was added more than once.`,
      );
    }
    blockIdentities.add(blockIdentity);
    sourceIds.add(elementId);
    for (let localRow = 0; localRow < rowDofs.length; localRow += 1) {
      for (let localColumn = 0; localColumn < colDofs.length; localColumn += 1) {
        const value = matrix[localRow * colDofs.length + localColumn];
        if (value === 0) continue;
        retainContribution({
          row: rowDofs[localRow],
          column: colDofs[localColumn],
          value,
          sourceId: elementId,
          termId: `${contributionId}:${localRow}:${localColumn}`,
        });
      }
    }
    return apiSnapshot();
  }

  function addValue(rowInput, columnInput, valueInput, metadata = {}) {
    assertOpen();
    const row = index(rowInput, rowCount, 'row');
    const column = index(columnInput, colCount, 'column');
    const value = finite(valueInput, 'value');
    if (value === 0) return apiSnapshot();
    const sourceId = requiredText(metadata.sourceId, 'sourceId');
    const termId = requiredText(metadata.termId, 'termId');
    assertBasis(metadata.basis, `source ${sourceId}`);
    if (requireDofOrder) {
      const rowLabel = requiredText(metadata.rowDof, 'rowDof');
      const columnLabel = requiredText(metadata.colDof, 'colDof');
      assertScalarDofOrder(rowDofOrder, row, rowLabel, `source ${sourceId} row`);
      assertScalarDofOrder(colDofOrder, column, columnLabel, `source ${sourceId} column`);
    }
    sourceIds.add(sourceId);
    retainContribution({ row, column, value, sourceId, termId });
    return apiSnapshot();
  }

  function finalize(finalizeOptions = {}) {
    assertOpen();
    finalized = true;
    const tolerance = nonnegative(finalizeOptions.tolerance, 0);
    const symmetryTolerance = nonnegative(finalizeOptions.symmetryTolerance, defaultSymmetryTolerance);
    const triplets = [];
    const coordinateRows = [...contributions.entries()]
      .map(([key, terms]) => ({ key, terms, ...decodeCoordinate(key, colCount) }))
      .sort((left, right) => left.column - right.column || left.row - right.row);
    for (const coordinate of coordinateRows) {
      const terms = coordinate.terms.slice().sort(compareContribution);
      const value = compensatedSum(terms.map((term) => term.value));
      if (Math.abs(value) > tolerance) triplets.push({ row: coordinate.row, column: coordinate.column, value });
    }
    const core = createCscFromTriplets(rowCount, colCount, triplets, { tolerance });
    const symmetryError = rowCount === colCount ? cscSymmetryError(core) : null;
    if (symmetric && (!Number.isFinite(symmetryError) || symmetryError > symmetryTolerance)) {
      contributions.clear();
      throw assemblyError(
        'SPARSE_ASSEMBLY_SYMMETRY_AUDIT_FAILED',
        `Assembled symmetry error ${symmetryError} exceeds ${symmetryTolerance}.`,
        { symmetryError, symmetryTolerance },
      );
    }
    const sortedSources = [...sourceIds].sort(compareText);
    const assembly = Object.freeze({
      version: DETERMINISTIC_SPARSE_ASSEMBLY_VERSION,
      basis,
      symmetric,
      symmetryError,
      symmetryTolerance: symmetric ? symmetryTolerance : null,
      contributionCount,
      coordinateCount: coordinateRows.length,
      peakCoordinateCount,
      sourceCount: sortedSources.length,
      sourceHash: stableHash(sortedSources),
      deterministicOrder: 'column-row-source-term-value',
      summation: 'neumaier-compensated',
    });
    contributions.clear();
    termIdentities.clear();
    blockIdentities.clear();
    return Object.freeze({
      ...core,
      basis,
      dofOrder: rowCount === colCount && sameDofOrder(rowDofOrder, colDofOrder) ? rowDofOrder : null,
      rowDofOrder,
      colDofOrder,
      assembly,
    });
  }

  function snapshot() {
    return Object.freeze(apiSnapshot());
  }

  function apiSnapshot() {
    return {
      version: DETERMINISTIC_SPARSE_ASSEMBLY_VERSION,
      rowCount,
      colCount,
      basis,
      symmetric,
      finalized,
      contributionCount,
      coordinateCount: contributions.size,
      peakCoordinateCount,
      sourceCount: sourceIds.size,
    };
  }

  function assertOpen() {
    if (finalized) throw assemblyError('SPARSE_ASSEMBLY_FINALIZED', 'Sparse assembler is already finalized.');
  }

  function assertBasis(value, source) {
    const sourceBasis = normalizeBasis(value, `${source} basis`);
    if (sourceBasis !== basis) {
      throw assemblyError(
        'SPARSE_ASSEMBLY_BASIS_MISMATCH',
        `${source} uses ${sourceBasis} basis but the target assembly uses ${basis} basis.`,
        { sourceBasis, targetBasis: basis },
      );
    }
  }

  function retainContribution(term) {
    const identity = `${term.sourceId}\u0000${term.termId}\u0000${term.row}\u0000${term.column}`;
    if (termIdentities.has(identity)) {
      throw assemblyError(
        'SPARSE_ASSEMBLY_TERM_DUPLICATE',
        `Contribution ${term.sourceId}/${term.termId} at (${term.row}, ${term.column}) is duplicated.`,
      );
    }
    termIdentities.add(identity);
    const key = term.row * colCount + term.column;
    const list = contributions.get(key) || [];
    list.push(term);
    contributions.set(key, list);
    contributionCount += 1;
    peakCoordinateCount = Math.max(peakCoordinateCount, contributions.size);
  }
}

export function assembleSparseBlocks(options = {}, blocks = []) {
  if (!Array.isArray(blocks)) throw assemblyError('SPARSE_ASSEMBLY_BLOCKS_INVALID', 'blocks must be an array.');
  const assembler = createDeterministicSparseAssembler(options);
  for (const block of blocks) assembler.addBlock(block);
  return assembler.finalize(options);
}

/**
 * Compatibility adapter for assembly paths that must inspect or augment an
 * unfinished matrix (for example, support springs and stabilization plans).
 * New element workflows should use createDeterministicSparseAssembler.
 */
export function createMutableSparseAccumulator(rowCountInput, colCountInput = rowCountInput) {
  const rowCount = dimension(rowCountInput, 'rowCount');
  const colCount = dimension(colCountInput, 'colCount');
  return {
    version: MUTABLE_SPARSE_ACCUMULATOR_VERSION,
    rowCount,
    colCount,
    entries: new Map(),
    peakEntries: 0,
    finalized: false,
  };
}

export function addMutableSparseValue(accumulator, rowInput, columnInput, valueInput) {
  assertMutableAccumulator(accumulator);
  const row = index(rowInput, accumulator.rowCount, 'row');
  const column = index(columnInput, accumulator.colCount, 'column');
  const value = finite(valueInput, 'value');
  if (value === 0) return accumulator;
  const key = row * accumulator.colCount + column;
  const next = Number(accumulator.entries.get(key) || 0) + value;
  if (next !== 0) accumulator.entries.set(key, next);
  else accumulator.entries.delete(key);
  accumulator.peakEntries = Math.max(accumulator.peakEntries, accumulator.entries.size);
  return accumulator;
}

export function finalizeMutableSparseAccumulator(accumulator, options = {}) {
  assertMutableAccumulator(accumulator);
  const triplets = [...accumulator.entries.entries()].map(([key, value]) => {
    const column = key % accumulator.colCount;
    return { row: (key - column) / accumulator.colCount, column, value };
  });
  const matrix = createCscFromTriplets(accumulator.rowCount, accumulator.colCount, triplets, options);
  accumulator.entries.clear();
  accumulator.finalized = true;
  return Object.freeze({
    ...matrix,
    accumulator: Object.freeze({
      version: MUTABLE_SPARSE_ACCUMULATOR_VERSION,
      peakEntries: accumulator.peakEntries,
      finalized: true,
    }),
  });
}

export function extractDeterministicCscSubmatrix(matrix, rowIdsInput = [], colIdsInput = rowIdsInput) {
  validateCommonSparseMatrix(matrix);
  if (matrix.format !== 'csc') throw assemblyError('SPARSE_SUBMATRIX_CSC_REQUIRED', 'CSC input is required.');
  const rowIds = dofIndices(rowIdsInput, matrix.rowCount, 'rowIds');
  const colIds = dofIndices(colIdsInput, matrix.colCount, 'colIds');
  const rowMap = new Map(rowIds.map((value, position) => [value, position]));
  const triplets = [];
  colIds.forEach((sourceColumn, column) => {
    for (let pointer = matrix.colPtr[sourceColumn]; pointer < matrix.colPtr[sourceColumn + 1]; pointer += 1) {
      const row = rowMap.get(matrix.rowIdx[pointer]);
      if (row != null) triplets.push({ row, column, value: matrix.values[pointer] });
    }
  });
  const core = createCscFromTriplets(rowIds.length, colIds.length, triplets);
  const rowDofOrder = subsetDofOrder(matrix.rowDofOrder ?? matrix.dofOrder, rowIds);
  const colDofOrder = subsetDofOrder(matrix.colDofOrder ?? matrix.dofOrder, colIds);
  const sameIndices = rowIds.length === colIds.length && rowIds.every((value, indexValue) => value === colIds[indexValue]);
  const symmetryError = sameIndices ? cscSymmetryError(core) : null;
  return Object.freeze({
    ...core,
    basis: matrix.basis ?? null,
    dofOrder: sameIndices && sameDofOrder(rowDofOrder, colDofOrder) ? rowDofOrder : null,
    rowDofOrder,
    colDofOrder,
    assembly: Object.freeze({
      version: DETERMINISTIC_SPARSE_ASSEMBLY_VERSION,
      operation: 'submatrix',
      parentPatternHash: matrix.patternHash ?? null,
      parentValueHash: matrix.valueHash ?? null,
      rowSelectionHash: stableHash(rowIds),
      columnSelectionHash: stableHash(colIds),
      symmetryError,
    }),
  });
}

function normalizeBlockMatrix(input, rowCount, colCount, elementId) {
  if (Array.isArray(input) && input.length === rowCount && input.every((row) => Array.isArray(row) || ArrayBuffer.isView(row))) {
    if (input.some((row) => row.length !== colCount)) {
      throw assemblyError('SPARSE_ASSEMBLY_BLOCK_SIZE', `Element ${elementId} matrix must be ${rowCount} by ${colCount}.`);
    }
    return Float64Array.from(input.flatMap((row) => Array.from(row, Number)), (value) => finite(value, `element ${elementId} matrix`));
  }
  if ((Array.isArray(input) || ArrayBuffer.isView(input)) && input.length === rowCount * colCount) {
    return Float64Array.from(input, (value) => finite(value, `element ${elementId} matrix`));
  }
  throw assemblyError('SPARSE_ASSEMBLY_BLOCK_SIZE', `Element ${elementId} matrix must be ${rowCount} by ${colCount}.`);
}

function assertMutableAccumulator(value) {
  if (!value
    || value.version !== MUTABLE_SPARSE_ACCUMULATOR_VERSION
    || !(value.entries instanceof Map)
    || value.finalized === true) {
    throw assemblyError('SPARSE_MUTABLE_ACCUMULATOR_INVALID', 'An open mutable sparse accumulator is required.');
  }
}

function normalizeTargetDofOrder(value, expected, name) {
  if (value == null) return null;
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    throw assemblyError('SPARSE_ASSEMBLY_DOF_ORDER_INVALID', `${name} must be an array.`);
  }
  if (value.length !== expected) {
    throw assemblyError('SPARSE_ASSEMBLY_DOF_ORDER_SIZE', `${name} must contain ${expected} entries.`);
  }
  return Object.freeze(Array.from(value, (entry, indexValue) => requiredText(entry, `${name}[${indexValue}]`)));
}

function normalizeBlockDofOrder(value, expected, name, required) {
  if (value == null && !required) return null;
  if (value == null) throw assemblyError('SPARSE_ASSEMBLY_DOF_ORDER_REQUIRED', `${name} is required.`);
  return normalizeTargetDofOrder(value, expected, name);
}

function assertDofOrder(target, indices, actual, source) {
  if (!target || !actual) return;
  indices.forEach((dof, indexValue) => {
    if (target[dof] !== actual[indexValue]) {
      throw assemblyError(
        'SPARSE_ASSEMBLY_DOF_ORDER_MISMATCH',
        `${source} DOF ${indexValue} is ${actual[indexValue]}; expected ${target[dof]}.`,
        { dof, actual: actual[indexValue], expected: target[dof] },
      );
    }
  });
}

function assertScalarDofOrder(target, dof, actual, source) {
  if (target && target[dof] !== actual) {
    throw assemblyError(
      'SPARSE_ASSEMBLY_DOF_ORDER_MISMATCH',
      `${source} is ${actual}; expected ${target[dof]}.`,
      { dof, actual, expected: target[dof] },
    );
  }
}

function subsetDofOrder(order, indices) {
  if (!order) return null;
  return Object.freeze(indices.map((value) => order[value]));
}

function dofIndices(values, upperBound, name) {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) {
    throw assemblyError('SPARSE_ASSEMBLY_DOFS_INVALID', `${name} must be an array.`);
  }
  const normalized = Array.from(values, (value, indexValue) => index(value, upperBound, `${name}[${indexValue}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw assemblyError('SPARSE_ASSEMBLY_DOFS_DUPLICATE', `${name} must not contain duplicate indices.`);
  }
  return normalized;
}

function normalizeBasis(value, name) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!Object.values(SPARSE_ASSEMBLY_BASIS).includes(normalized)) {
    throw assemblyError('SPARSE_ASSEMBLY_BASIS_INVALID', `${name} must be GLOBAL or LOCAL.`);
  }
  return normalized;
}

function compareContribution(left, right) {
  return compareText(left.sourceId, right.sourceId)
    || compareText(left.termId, right.termId)
    || compareNumberCanonical(left.value, right.value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumberCanonical(left, right) {
  if (left === right) return 0;
  const leftAbs = Math.abs(left);
  const rightAbs = Math.abs(right);
  return leftAbs - rightAbs || left - right;
}

function compensatedSum(values) {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value)
      ? (sum - next) + value
      : (value - next) + sum;
    sum = next;
  }
  return sum + correction;
}

function decodeCoordinate(key, colCount) {
  const column = key % colCount;
  return { row: (key - column) / colCount, column };
}

function sameDofOrder(left, right) {
  if (left == null || right == null || left.length !== right.length) return false;
  return left.every((value, indexValue) => value === right[indexValue]);
}

function dimension(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw assemblyError('SPARSE_ASSEMBLY_DIMENSION_INVALID', `${name} must be a nonnegative integer.`);
  }
  return number;
}

function index(value, upperBound, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number >= upperBound) {
    throw assemblyError('SPARSE_ASSEMBLY_INDEX_INVALID', `${name} must be an integer in [0, ${upperBound}).`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw assemblyError('SPARSE_ASSEMBLY_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function requiredText(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw assemblyError('SPARSE_ASSEMBLY_METADATA_REQUIRED', `${name} is required.`);
  return text;
}

function assemblyError(code, message, details = null) {
  const error = new TypeError(message);
  error.name = 'DeterministicSparseAssemblyError';
  error.code = code;
  error.details = details;
  return error;
}
