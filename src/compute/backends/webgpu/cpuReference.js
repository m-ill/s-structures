export const WEBGPU_CPU_REFERENCE_VERSION = 'p9-m4-webgpu-cpu-reference-v1';

export function referenceVectorScale(values, scale) {
  return Float32Array.from(values, (value) => Math.fround(Math.fround(value) * Math.fround(scale)));
}

export function referenceVectorAxpy(x, y, alpha) {
  requireSameLength(x, y, 'vectorAxpy');
  return Float32Array.from(x, (value, index) => Math.fround(Math.fround(alpha) * Math.fround(value) + Math.fround(y[index])));
}

export function referenceDeterministicReduction(values) {
  const input = finiteF32(values, 'values');
  if (!input.length) throw referenceError('WEBGPU_REDUCTION_EMPTY', 'Reduction input is empty.');
  let sum = Math.fround(0);
  let min = input[0];
  let max = input[0];
  let minIndex = 0;
  let maxIndex = 0;
  for (let index = 0; index < input.length; index += 1) {
    sum = Math.fround(sum + input[index]);
    if (input[index] < min) { min = input[index]; minIndex = index; }
    if (input[index] > max) { max = input[index]; maxIndex = index; }
  }
  return Object.freeze({ sum, min, max, minIndex, maxIndex });
}

export function referenceCsrSpmv(matrix, vector) {
  const rowPtr = Uint32Array.from(matrix.rowPtr || []);
  const colIdx = Uint32Array.from(matrix.colIdx || []);
  const values = finiteF32(matrix.values, 'matrix.values');
  const x = finiteF32(vector, 'vector');
  const rowCount = rowPtr.length - 1;
  if (rowCount < 0 || colIdx.length !== values.length || rowPtr[rowCount] !== values.length) {
    throw referenceError('WEBGPU_CSR_INVALID', 'CSR storage is invalid.');
  }
  const output = new Float32Array(rowCount);
  for (let row = 0; row < rowCount; row += 1) {
    let sum = Math.fround(0);
    for (let pointer = rowPtr[row]; pointer < rowPtr[row + 1]; pointer += 1) {
      if (colIdx[pointer] >= x.length) throw referenceError('WEBGPU_CSR_COLUMN_INVALID', 'CSR column index is out of range.');
      sum = Math.fround(sum + Math.fround(values[pointer] * x[colIdx[pointer]]));
    }
    output[row] = sum;
  }
  return output;
}

export function referenceJacobi(diagonal, rhs) {
  requireSameLength(diagonal, rhs, 'jacobi');
  const d = finiteF32(diagonal, 'diagonal');
  const b = finiteF32(rhs, 'rhs');
  if (d.some((value) => !(value > 0))) throw referenceError('WEBGPU_JACOBI_DIAGONAL_INVALID', 'Jacobi diagonal must be positive.');
  return Float32Array.from(b, (value, index) => Math.fround(value / d[index]));
}

export function referenceFiberSampleBatch(input = {}) {
  const positions = finiteF32(input.positions, 'positions');
  const areas = finiteF32(input.areas, 'areas');
  const moduli = finiteF32(input.moduli, 'moduli');
  const yieldStress = finiteF32(input.yieldStress, 'yieldStress');
  const axialStrains = finiteF32(input.axialStrains, 'axialStrains');
  const curvatures = finiteF32(input.curvatures, 'curvatures');
  if (positions.length !== areas.length || positions.length !== moduli.length || positions.length !== yieldStress.length) {
    throw referenceError('WEBGPU_FIBER_SHAPE_INVALID', 'Fiber property arrays must have equal length.');
  }
  requireSameLength(axialStrains, curvatures, 'fiber samples');
  const output = new Float32Array(axialStrains.length * 4);
  for (let sample = 0; sample < axialStrains.length; sample += 1) {
    let axial = Math.fround(0);
    let moment = Math.fround(0);
    let axialTangent = Math.fround(0);
    let momentTangent = Math.fround(0);
    for (let fiber = 0; fiber < positions.length; fiber += 1) {
      const strain = Math.fround(axialStrains[sample] - Math.fround(curvatures[sample] * positions[fiber]));
      const elasticStress = Math.fround(moduli[fiber] * strain);
      const stress = Math.max(-yieldStress[fiber], Math.min(yieldStress[fiber], elasticStress));
      const tangent = Math.abs(elasticStress) < yieldStress[fiber] ? moduli[fiber] : 0;
      axial = Math.fround(axial + Math.fround(stress * areas[fiber]));
      moment = Math.fround(moment - Math.fround(Math.fround(stress * areas[fiber]) * positions[fiber]));
      axialTangent = Math.fround(axialTangent + Math.fround(tangent * areas[fiber]));
      momentTangent = Math.fround(momentTangent + Math.fround(Math.fround(Math.fround(tangent * areas[fiber]) * positions[fiber]) * positions[fiber]));
    }
    output.set([axial, moment, axialTangent, momentTangent], sample * 4);
  }
  return output;
}

export function referenceFrameMatrixBatch(input = {}) {
  const properties = finiteF32(input.properties, 'properties');
  const transforms = finiteF32(input.responseTransforms, 'responseTransforms');
  const propertyStride = framePropertyStride(input.propertyStride, properties.length);
  if (properties.length % propertyStride !== 0) throw referenceError('WEBGPU_FRAME_PROPERTY_SHAPE_INVALID', 'Frame properties require seven EB values or nine values including phiY and phiZ per element.');
  const count = properties.length / propertyStride;
  if (transforms.length !== count * 144) throw referenceError('WEBGPU_FRAME_TRANSFORM_SHAPE_INVALID', 'Frame response transforms require 144 values per element.');
  const output = new Float32Array(count * 144);
  for (let element = 0; element < count; element += 1) {
    const p = properties.subarray(element * propertyStride, element * propertyStride + propertyStride);
    const k = localFrameF32(...p);
    const t = transforms.subarray(element * 144, element * 144 + 144);
    const temp = multiply12F32(k, t);
    const global = multiplyTransposeLeft12F32(t, temp);
    output.set(global, element * 144);
  }
  return output;
}

export function referenceShellTangentBatch(input = {}) {
  const normalizedValues = finiteF32(input.normalizedValues, 'normalizedValues');
  const elementScales = finiteF32(input.elementScales, 'elementScales');
  const matrixStride = positiveInteger(input.matrixStride, 'matrixStride');
  if (normalizedValues.length !== elementScales.length * matrixStride) {
    throw referenceError('WEBGPU_SHELL_TANGENT_SHAPE_INVALID', 'Shell tangent values must match elementScales × matrixStride.');
  }
  return Float32Array.from(normalizedValues, (value, index) => Math.fround(value * elementScales[Math.floor(index / matrixStride)]));
}

export function referenceShellDeterministicGather(input = {}) {
  const gatherOffsets = Uint32Array.from(input.gatherOffsets || []);
  const gatherEntries = Uint32Array.from(input.gatherEntries || []);
  const elementValues = finiteF32(input.elementValues, 'elementValues');
  const slotCount = gatherOffsets.length - 1;
  if (slotCount < 0 || gatherOffsets[slotCount] !== gatherEntries.length) {
    throw referenceError('WEBGPU_SHELL_GATHER_SHAPE_INVALID', 'Shell gather offsets and entries are inconsistent.');
  }
  const output = new Float32Array(slotCount);
  for (let slot = 0; slot < slotCount; slot += 1) {
    let sum = Math.fround(0);
    for (let pointer = gatherOffsets[slot]; pointer < gatherOffsets[slot + 1]; pointer += 1) {
      const entry = gatherEntries[pointer];
      if (entry >= elementValues.length) throw referenceError('WEBGPU_SHELL_GATHER_ENTRY_INVALID', 'Shell gather entry is outside element values.');
      sum = Math.fround(sum + elementValues[entry]);
    }
    output[slot] = sum;
  }
  return output;
}

export function referenceShellStressRecovery(input = {}) {
  const operators = finiteF32(input.operators, 'operators');
  const displacements = finiteF32(input.displacements, 'displacements');
  const elementCount = positiveInteger(input.elementCount, 'elementCount');
  const responseStride = positiveInteger(input.responseStride, 'responseStride');
  const dofStride = positiveInteger(input.dofStride, 'dofStride');
  if (operators.length !== elementCount * responseStride * dofStride || displacements.length !== elementCount * dofStride) {
    throw referenceError('WEBGPU_SHELL_RECOVERY_SHAPE_INVALID', 'Shell recovery operator or displacement shape is inconsistent.');
  }
  const output = new Float32Array(elementCount * responseStride);
  for (let element = 0; element < elementCount; element += 1) for (let response = 0; response < responseStride; response += 1) {
    let sum = Math.fround(0);
    const operatorBase = (element * responseStride + response) * dofStride;
    const displacementBase = element * dofStride;
    for (let dof = 0; dof < dofStride; dof += 1) sum = Math.fround(sum + Math.fround(operators[operatorBase + dof] * displacements[displacementBase + dof]));
    output[element * responseStride + response] = sum;
  }
  return output;
}

function localFrameF32(e, g, a, iy, iz, j, length, phiY = 0, phiZ = 0) {
  if (![e, g, a, iy, iz, j, length].every((value) => Number.isFinite(value) && value > 0)) {
    throw referenceError('WEBGPU_FRAME_PROPERTY_INVALID', 'Frame properties must be finite and positive.');
  }
  if (phiY < 0 || phiZ < 0) {
    throw referenceError('WEBGPU_FRAME_PHI_INVALID', 'Frame phiY and phiZ must be nonnegative.');
  }
  const k = new Float32Array(144);
  const set = (i, q, value) => { k[i * 12 + q] = Math.fround(value); k[q * 12 + i] = Math.fround(value); };
  const ea = Math.fround(e * a / length);
  const gj = Math.fround(g * j / length);
  set(0, 0, ea); set(6, 6, ea); set(0, 6, -ea);
  set(3, 3, gj); set(9, 9, gj); set(3, 9, -gj);
  const denominatorZ = Math.fround(1 + Math.max(0, phiZ));
  const az = Math.fround(12 * e * iz / (denominatorZ * length * length * length));
  const bz = Math.fround(6 * e * iz / (denominatorZ * length * length));
  const cz = Math.fround((4 + Math.max(0, phiZ)) * e * iz / (denominatorZ * length));
  const dz = Math.fround((2 - Math.max(0, phiZ)) * e * iz / (denominatorZ * length));
  set(1, 1, az); set(7, 7, az); set(1, 7, -az); set(1, 5, bz); set(1, 11, bz); set(5, 7, -bz); set(7, 11, -bz); set(5, 5, cz); set(11, 11, cz); set(5, 11, dz);
  const denominatorY = Math.fround(1 + Math.max(0, phiY));
  const ay = Math.fround(12 * e * iy / (denominatorY * length * length * length));
  const by = Math.fround(6 * e * iy / (denominatorY * length * length));
  const cy = Math.fround((4 + Math.max(0, phiY)) * e * iy / (denominatorY * length));
  const dy = Math.fround((2 - Math.max(0, phiY)) * e * iy / (denominatorY * length));
  set(2, 2, ay); set(8, 8, ay); set(2, 8, -ay); set(2, 4, -by); set(2, 10, -by); set(4, 8, by); set(8, 10, by); set(4, 4, cy); set(10, 10, cy); set(4, 10, dy);
  return k;
}

function framePropertyStride(value, length) {
  if (value != null) {
    const stride = Number(value);
    if (stride === 7 || stride === 9) return stride;
    throw referenceError('WEBGPU_FRAME_PROPERTY_STRIDE_INVALID', 'Frame propertyStride must be 7 or 9.');
  }
  if (length % 7 === 0) return 7;
  if (length % 9 === 0) return 9;
  return 7;
}

function multiply12F32(left, right) {
  const output = new Float32Array(144);
  for (let row = 0; row < 12; row += 1) for (let column = 0; column < 12; column += 1) {
    let sum = Math.fround(0);
    for (let inner = 0; inner < 12; inner += 1) sum = Math.fround(sum + Math.fround(left[row * 12 + inner] * right[inner * 12 + column]));
    output[row * 12 + column] = sum;
  }
  return output;
}

function multiplyTransposeLeft12F32(left, right) {
  const output = new Float32Array(144);
  for (let row = 0; row < 12; row += 1) for (let column = 0; column < 12; column += 1) {
    let sum = Math.fround(0);
    for (let inner = 0; inner < 12; inner += 1) sum = Math.fround(sum + Math.fround(left[inner * 12 + row] * right[inner * 12 + column]));
    output[row * 12 + column] = sum;
  }
  return output;
}

function finiteF32(values, field) {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) throw referenceError('WEBGPU_REFERENCE_INPUT_REQUIRED', `${field} is required.`);
  const output = Float32Array.from(values, Number);
  if (output.some((value) => !Number.isFinite(value))) throw referenceError('WEBGPU_REFERENCE_NONFINITE', `${field} must be finite.`);
  return output;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw referenceError('WEBGPU_REFERENCE_SHAPE_INVALID', `${field} must be a positive integer.`);
  return number;
}

function requireSameLength(left, right, field) {
  if (left?.length !== right?.length) throw referenceError('WEBGPU_REFERENCE_SHAPE_INVALID', `${field} arrays must have equal length.`);
}

function referenceError(code, message) {
  return Object.assign(new Error(message), { code });
}
