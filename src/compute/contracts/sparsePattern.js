import { stableHash } from '../../core/stableHash.js';
import { DOMAIN_BINARY_VERSION, validateDomainBinary } from './domainBinary.js';

export const SPARSE_PATTERN_VERSION = 'p9-sparse-pattern-v1';

export function createSparsePattern(input = {}) {
  const format = String(input.format || 'csr').toLowerCase();
  if (format !== 'csr' && format !== 'csc') throw patternError('SPARSE_FORMAT_UNSUPPORTED', 'Sparse pattern format must be CSR or CSC.');
  const rowCount = positiveInteger(input.rowCount ?? input.rows, 'rowCount');
  const colCount = positiveInteger(input.colCount ?? input.cols, 'colCount');
  const majorCount = format === 'csr' ? rowCount : colCount;
  const minorCount = format === 'csr' ? colCount : rowCount;
  const pointerSource = input.pointers ?? input.rowPtr ?? input.colPtr;
  const indexSource = input.indices ?? input.colIdx ?? input.rowIdx;
  if (!arrayLike(pointerSource) || !arrayLike(indexSource)) throw patternError('SPARSE_ARRAY_REQUIRED', 'Sparse pointers and indices are required.');
  if (pointerSource.length !== majorCount + 1) throw patternError('SPARSE_POINTER_LENGTH', 'Sparse pointer length is invalid.');
  const pointers = Int32Array.from(pointerSource, Number);
  const indices = Int32Array.from(indexSource, Number);
  validatePointers(pointers, indices.length);
  validateIndices(indices, minorCount);
  const scatter = input.scatter == null ? new Int32Array(0) : Int32Array.from(input.scatter, Number);
  const core = {
    version: SPARSE_PATTERN_VERSION,
    format,
    rowCount,
    colCount,
    nnz: indices.length,
    pointers,
    indices,
    scatter,
    factorGroupKey: String(input.factorGroupKey || ''),
    sourceDomainHash: input.sourceDomainHash || null,
  };
  const byteLength = pointers.byteLength + indices.byteLength + scatter.byteLength;
  return Object.freeze({ ...core, byteLength, patternHash: hashPattern(core, byteLength) });
}

export function createSparsePatternFromDomain(domain, options = {}) {
  const validation = validateDomainBinary(domain);
  if (!validation.ok) throw patternError('DOMAIN_BINARY_INVALID', validation.errors.join(', '));
  if (domain.version !== DOMAIN_BINARY_VERSION) throw patternError('DOMAIN_BINARY_VERSION_UNSUPPORTED', String(domain.version));
  const dofCount = domain.metadata.counts.activeDof;
  const rowSets = Array.from({ length: dofCount }, (_item, index) => new Set([index]));
  const elementDofs = [];
  for (let member = 0; member < domain.metadata.counts.members; member += 1) {
    const n1 = domain.buffers.connectivity[member * 2];
    const n2 = domain.buffers.connectivity[member * 2 + 1];
    const dofs = [
      ...domain.buffers.dofMap.slice(n1 * 6, n1 * 6 + 6),
      ...domain.buffers.dofMap.slice(n2 * 6, n2 * 6 + 6),
    ];
    elementDofs.push(dofs);
    for (const row of dofs) {
      if (row < 0) continue;
      for (const column of dofs) if (column >= 0) rowSets[row].add(column);
    }
  }
  const pointers = new Int32Array(dofCount + 1);
  const columns = [];
  const rowOffsets = [];
  rowSets.forEach((set, row) => {
    const sorted = [...set].sort((left, right) => left - right);
    const offsets = new Map();
    for (const column of sorted) {
      offsets.set(column, columns.length);
      columns.push(column);
    }
    rowOffsets.push(offsets);
    pointers[row + 1] = columns.length;
  });
  const scatter = new Int32Array(elementDofs.length * 144).fill(-1);
  elementDofs.forEach((dofs, member) => {
    for (let localRow = 0; localRow < 12; localRow += 1) {
      const row = dofs[localRow];
      if (row < 0) continue;
      for (let localColumn = 0; localColumn < 12; localColumn += 1) {
        const column = dofs[localColumn];
        if (column < 0) continue;
        scatter[member * 144 + localRow * 12 + localColumn] = rowOffsets[row].get(column);
      }
    }
  });
  return createSparsePattern({
    format: 'csr',
    rowCount: dofCount,
    colCount: dofCount,
    pointers,
    indices: Int32Array.from(columns),
    scatter,
    sourceDomainHash: domain.domainHash,
    factorGroupKey: options.factorGroupKey || domain.domainHash,
  });
}

export function validateSparsePattern(pattern) {
  const errors = [];
  if (!pattern || typeof pattern !== 'object') return { ok: false, errors: ['pattern:not-object'] };
  if (pattern.version !== SPARSE_PATTERN_VERSION) errors.push('pattern:version');
  if (!['csr', 'csc'].includes(pattern.format)) errors.push('pattern:format');
  if (!ArrayBuffer.isView(pattern.pointers) || !ArrayBuffer.isView(pattern.indices) || !ArrayBuffer.isView(pattern.scatter)) {
    errors.push('pattern:buffers');
  } else {
    try {
      validatePointers(pattern.pointers, pattern.indices.length);
      validateIndices(pattern.indices, pattern.format === 'csr' ? pattern.colCount : pattern.rowCount);
    } catch (error) {
      errors.push(error.code || 'pattern:invalid');
    }
  }
  const byteLength = (pattern.pointers?.byteLength || 0) + (pattern.indices?.byteLength || 0) + (pattern.scatter?.byteLength || 0);
  if (byteLength !== pattern.byteLength) errors.push('pattern:byteLength');
  if (pattern.patternHash !== hashPattern(pattern, byteLength)) errors.push('pattern:hash');
  return { ok: errors.length === 0, errors };
}

function hashPattern(pattern, byteLength) {
  return stableHash({
    version: pattern.version,
    format: pattern.format,
    rowCount: pattern.rowCount,
    colCount: pattern.colCount,
    nnz: pattern.nnz,
    pointers: Array.from(pattern.pointers || []),
    indices: Array.from(pattern.indices || []),
    scatter: Array.from(pattern.scatter || []),
    factorGroupKey: pattern.factorGroupKey || '',
    sourceDomainHash: pattern.sourceDomainHash || null,
    byteLength,
  });
}

function validatePointers(pointers, nnz) {
  if (pointers[0] !== 0 || pointers[pointers.length - 1] !== nnz) throw patternError('SPARSE_POINTER_RANGE', 'Sparse pointers must span nnz.');
  for (let index = 1; index < pointers.length; index += 1) {
    if (!Number.isInteger(pointers[index]) || pointers[index] < pointers[index - 1]) {
      throw patternError('SPARSE_POINTER_ORDER', 'Sparse pointers must be monotonic integers.');
    }
  }
}

function validateIndices(indices, limit) {
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= limit) throw patternError('SPARSE_INDEX_RANGE', 'Sparse index is out of range.');
  }
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw patternError('SPARSE_DIMENSION_INVALID', field + ' must be a positive integer.');
  return number;
}

function arrayLike(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function patternError(code, message) {
  return Object.assign(new Error(message), { code });
}
