import { stableHash } from '../../../core/stableHash.js';

export const WEBGPU_SHADER_CATALOG_VERSION = 'p10-m2-webgpu-shader-catalog-v2';

const vectorScale = `
@group(0) @binding(0) var<storage, read> inputValues: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputValues: array<f32>;
@group(0) @binding(2) var<storage, read> params: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  let count = u32(params[0]);
  if (index < count) { outputValues[index] = inputValues[index] * params[1]; }
}`;

const vectorAxpy = `
@group(0) @binding(0) var<storage, read> x: array<f32>;
@group(0) @binding(1) var<storage, read> y: array<f32>;
@group(0) @binding(2) var<storage, read_write> outputValues: array<f32>;
@group(0) @binding(3) var<storage, read> params: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  let count = u32(params[0]);
  if (index < count) { outputValues[index] = params[1] * x[index] + y[index]; }
}`;

const deterministicReduction = `
@group(0) @binding(0) var<storage, read> inputValues: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputValues: array<f32>;
@group(0) @binding(2) var<storage, read> params: array<f32>;
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x != 0u) { return; }
  let count = u32(params[0]);
  var sum = 0.0;
  var minimum = inputValues[0];
  var maximum = inputValues[0];
  var minIndex = 0u;
  var maxIndex = 0u;
  for (var index = 0u; index < count; index = index + 1u) {
    let value = inputValues[index];
    sum = sum + value;
    if (value < minimum) { minimum = value; minIndex = index; }
    if (value > maximum) { maximum = value; maxIndex = index; }
  }
  outputValues[0] = sum;
  outputValues[1] = minimum;
  outputValues[2] = maximum;
  outputValues[3] = f32(minIndex);
  outputValues[4] = f32(maxIndex);
}`;

const csrSpmv = `
@group(0) @binding(0) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(1) var<storage, read> colIdx: array<u32>;
@group(0) @binding(2) var<storage, read> matrixValues: array<f32>;
@group(0) @binding(3) var<storage, read> x: array<f32>;
@group(0) @binding(4) var<storage, read_write> y: array<f32>;
@group(0) @binding(5) var<storage, read> params: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  let rowCount = u32(params[0]);
  if (row >= rowCount) { return; }
  var sum = 0.0;
  for (var pointer = rowPtr[row]; pointer < rowPtr[row + 1u]; pointer = pointer + 1u) {
    sum = sum + matrixValues[pointer] * x[colIdx[pointer]];
  }
  y[row] = sum;
}`;

const jacobi = `
@group(0) @binding(0) var<storage, read> diagonal: array<f32>;
@group(0) @binding(1) var<storage, read> rhs: array<f32>;
@group(0) @binding(2) var<storage, read_write> outputValues: array<f32>;
@group(0) @binding(3) var<storage, read> params: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  let count = u32(params[0]);
  if (index < count) { outputValues[index] = rhs[index] / diagonal[index]; }
}`;

const fiberSampleBatch = `
@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read> areas: array<f32>;
@group(0) @binding(2) var<storage, read> moduli: array<f32>;
@group(0) @binding(3) var<storage, read> yieldStress: array<f32>;
@group(0) @binding(4) var<storage, read> axialStrains: array<f32>;
@group(0) @binding(5) var<storage, read> curvatures: array<f32>;
@group(0) @binding(6) var<storage, read_write> outputValues: array<f32>;
@group(0) @binding(7) var<storage, read> params: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let sample = gid.x;
  let sampleCount = u32(params[0]);
  let fiberCount = u32(params[1]);
  if (sample >= sampleCount) { return; }
  var axial = 0.0;
  var moment = 0.0;
  var axialTangent = 0.0;
  var momentTangent = 0.0;
  for (var fiber = 0u; fiber < fiberCount; fiber = fiber + 1u) {
    let strain = axialStrains[sample] - curvatures[sample] * positions[fiber];
    let elasticStress = moduli[fiber] * strain;
    let stress = clamp(elasticStress, -yieldStress[fiber], yieldStress[fiber]);
    let tangent = select(0.0, moduli[fiber], abs(elasticStress) < yieldStress[fiber]);
    axial = axial + stress * areas[fiber];
    moment = moment - stress * areas[fiber] * positions[fiber];
    axialTangent = axialTangent + tangent * areas[fiber];
    momentTangent = momentTangent + tangent * areas[fiber] * positions[fiber] * positions[fiber];
  }
  let base = sample * 4u;
  outputValues[base] = axial;
  outputValues[base + 1u] = moment;
  outputValues[base + 2u] = axialTangent;
  outputValues[base + 3u] = momentTangent;
}`;

const frameMatrixBatch = `
@group(0) @binding(0) var<storage, read> properties: array<f32>;
@group(0) @binding(1) var<storage, read> responseTransforms: array<f32>;
@group(0) @binding(2) var<storage, read_write> outputValues: array<f32>;
@group(0) @binding(3) var<storage, read> params: array<f32>;

fn setSymmetric(k: ptr<function, array<f32, 144>>, i: u32, j: u32, value: f32) {
  (*k)[i * 12u + j] = value;
  (*k)[j * 12u + i] = value;
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let element = gid.x;
  let count = u32(params[0]);
  if (element >= count) { return; }
  let propertyStride = u32(params[1]);
  let propertyBase = element * propertyStride;
  let e = properties[propertyBase];
  let g = properties[propertyBase + 1u];
  let a = properties[propertyBase + 2u];
  let iy = properties[propertyBase + 3u];
  let iz = properties[propertyBase + 4u];
  let j = properties[propertyBase + 5u];
  let length = properties[propertyBase + 6u];
  var phiY = 0.0;
  var phiZ = 0.0;
  if (propertyStride >= 9u) {
    phiY = max(0.0, properties[propertyBase + 7u]);
    phiZ = max(0.0, properties[propertyBase + 8u]);
  }
  var k: array<f32, 144>;
  var temp: array<f32, 144>;
  for (var index = 0u; index < 144u; index = index + 1u) { k[index] = 0.0; temp[index] = 0.0; }
  let ea = e * a / length;
  let gj = g * j / length;
  setSymmetric(&k, 0u, 0u, ea); setSymmetric(&k, 6u, 6u, ea); setSymmetric(&k, 0u, 6u, -ea);
  setSymmetric(&k, 3u, 3u, gj); setSymmetric(&k, 9u, 9u, gj); setSymmetric(&k, 3u, 9u, -gj);
  let denominatorZ = 1.0 + phiZ;
  let az = 12.0 * e * iz / (denominatorZ * length * length * length);
  let bz = 6.0 * e * iz / (denominatorZ * length * length);
  let cz = (4.0 + phiZ) * e * iz / (denominatorZ * length);
  let dz = (2.0 - phiZ) * e * iz / (denominatorZ * length);
  setSymmetric(&k, 1u, 1u, az); setSymmetric(&k, 7u, 7u, az); setSymmetric(&k, 1u, 7u, -az);
  setSymmetric(&k, 1u, 5u, bz); setSymmetric(&k, 1u, 11u, bz); setSymmetric(&k, 5u, 7u, -bz); setSymmetric(&k, 7u, 11u, -bz);
  setSymmetric(&k, 5u, 5u, cz); setSymmetric(&k, 11u, 11u, cz); setSymmetric(&k, 5u, 11u, dz);
  let denominatorY = 1.0 + phiY;
  let ay = 12.0 * e * iy / (denominatorY * length * length * length);
  let by = 6.0 * e * iy / (denominatorY * length * length);
  let cy = (4.0 + phiY) * e * iy / (denominatorY * length);
  let dy = (2.0 - phiY) * e * iy / (denominatorY * length);
  setSymmetric(&k, 2u, 2u, ay); setSymmetric(&k, 8u, 8u, ay); setSymmetric(&k, 2u, 8u, -ay);
  setSymmetric(&k, 2u, 4u, -by); setSymmetric(&k, 2u, 10u, -by); setSymmetric(&k, 4u, 8u, by); setSymmetric(&k, 8u, 10u, by);
  setSymmetric(&k, 4u, 4u, cy); setSymmetric(&k, 10u, 10u, cy); setSymmetric(&k, 4u, 10u, dy);
  let transformBase = element * 144u;
  for (var row = 0u; row < 12u; row = row + 1u) {
    for (var col = 0u; col < 12u; col = col + 1u) {
      var sum = 0.0;
      for (var inner = 0u; inner < 12u; inner = inner + 1u) {
        sum = sum + k[row * 12u + inner] * responseTransforms[transformBase + inner * 12u + col];
      }
      temp[row * 12u + col] = sum;
    }
  }
  for (var row = 0u; row < 12u; row = row + 1u) {
    for (var col = 0u; col < 12u; col = col + 1u) {
      var sum = 0.0;
      for (var inner = 0u; inner < 12u; inner = inner + 1u) {
        sum = sum + responseTransforms[transformBase + inner * 12u + row] * temp[inner * 12u + col];
      }
      outputValues[transformBase + row * 12u + col] = sum;
    }
  }
}`;

const SOURCES = Object.freeze({
  vectorScale,
  vectorAxpy,
  deterministicReduction,
  csrSpmv,
  jacobi,
  fiberSampleBatch,
  frameMatrixBatch,
});

export const WEBGPU_SHADER_CATALOG_HASH = stableHash({ version: WEBGPU_SHADER_CATALOG_VERSION, sources: SOURCES });

export function webGpuShader(name) {
  const source = SOURCES[name];
  if (!source) throw Object.assign(new Error(`Unknown WebGPU shader: ${name}.`), { code: 'WEBGPU_SHADER_UNKNOWN' });
  return Object.freeze({
    version: WEBGPU_SHADER_CATALOG_VERSION,
    catalogHash: WEBGPU_SHADER_CATALOG_HASH,
    name,
    entryPoint: 'main',
    source,
    shaderHash: stableHash({ name, source }),
  });
}

export function webGpuShaderCatalog() {
  return Object.freeze(Object.keys(SOURCES).map((name) => webGpuShader(name)));
}
