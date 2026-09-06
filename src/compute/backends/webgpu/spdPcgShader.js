import { stableHash } from '../../../core/stableHash.js';

export const WEBGPU_SPD_PCG_SHADER_VERSION = 'p9-m5-webgpu-spd-pcg-shader-v1';

const source = `
@group(0) @binding(0) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(1) var<storage, read> colIdx: array<u32>;
@group(0) @binding(2) var<storage, read> matrixValues: array<f32>;
@group(0) @binding(3) var<storage, read> diagonal: array<f32>;
@group(0) @binding(4) var<storage, read> rhs: array<f32>;
@group(0) @binding(5) var<storage, read_write> workspace: array<f32>;
@group(0) @binding(6) var<uniform> params: vec4<f32>;

var<workgroup> scratch: array<f32, 256>;
var<workgroup> scalar: array<f32, 8>;

fn reduceSum(value: f32, lane: u32) -> f32 {
  scratch[lane] = value;
  workgroupBarrier();
  var stride = 128u;
  loop {
    if (lane < stride) { scratch[lane] = scratch[lane] + scratch[lane + stride]; }
    workgroupBarrier();
    if (stride == 1u) { break; }
    stride = stride / 2u;
  }
  return scratch[0];
}

fn reduceMax(value: f32, lane: u32) -> f32 {
  scratch[lane] = value;
  workgroupBarrier();
  var stride = 128u;
  loop {
    if (lane < stride) { scratch[lane] = max(scratch[lane], scratch[lane + stride]); }
    workgroupBarrier();
    if (stride == 1u) { break; }
    stride = stride / 2u;
  }
  return scratch[0];
}

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) localId: vec3<u32>) {
  let lane = localId.x;
  let n = u32(params.x);
  let maxIterations = u32(params.y);
  let tolerance = params.z;
  let curvatureTolerance = params.w;
  let xOffset = 0u;
  let rOffset = n;
  let zOffset = n * 2u;
  let pOffset = n * 3u;
  let productOffset = n * 4u;
  let diagnosticOffset = n * 5u;

  var localInvalid = 0.0;
  var index = lane;
  loop {
    if (index >= n) { break; }
    workspace[xOffset + index] = 0.0;
    workspace[rOffset + index] = rhs[index];
    if (diagonal[index] > 0.0) {
      workspace[zOffset + index] = rhs[index] / diagonal[index];
      workspace[pOffset + index] = workspace[zOffset + index];
    } else {
      workspace[zOffset + index] = 0.0;
      workspace[pOffset + index] = 0.0;
      localInvalid = 1.0;
    }
    workspace[productOffset + index] = 0.0;
    index = index + 256u;
  }
  let invalid = reduceMax(localInvalid, lane);

  var localLoadNorm = 0.0;
  var localResidualNorm = 0.0;
  var localRz = 0.0;
  index = lane;
  loop {
    if (index >= n) { break; }
    localLoadNorm = max(localLoadNorm, abs(rhs[index]));
    localResidualNorm = max(localResidualNorm, abs(workspace[rOffset + index]));
    localRz = localRz + workspace[rOffset + index] * workspace[zOffset + index];
    index = index + 256u;
  }
  let loadNorm = max(1e-30, reduceMax(localLoadNorm, lane));
  let initialResidual = reduceMax(localResidualNorm, lane) / loadNorm;
  let initialRz = reduceSum(localRz, lane);
  if (lane == 0u) {
    scalar[0] = 1.0;
    scalar[1] = 0.0;
    scalar[2] = initialRz;
    scalar[3] = 0.0;
    scalar[4] = initialResidual;
    scalar[5] = 1.0;
    scalar[6] = 0.0;
    scalar[7] = loadNorm;
    if (invalid > 0.0) { scalar[0] = 0.0; scalar[5] = 3.0; }
    if (initialResidual <= tolerance) { scalar[0] = 0.0; scalar[5] = 0.0; }
  }
  workgroupBarrier();

  var iteration = 0u;
  loop {
    let iterationEnabled = workgroupUniformLoad(&scalar[0]);
    if (iteration >= maxIterations || iterationEnabled == 0.0) { break; }
    var row = lane;
    loop {
      if (row >= n) { break; }
      var sum = 0.0;
      var pointer = rowPtr[row];
      loop {
        if (pointer >= rowPtr[row + 1u]) { break; }
        sum = sum + matrixValues[pointer] * workspace[pOffset + colIdx[pointer]];
        pointer = pointer + 1u;
      }
      workspace[productOffset + row] = sum;
      row = row + 256u;
    }
    workgroupBarrier();

    var localDenominator = 0.0;
    var localAbsoluteDenominator = 0.0;
    index = lane;
    loop {
      if (index >= n) { break; }
      let term = workspace[pOffset + index] * workspace[productOffset + index];
      localDenominator = localDenominator + term;
      localAbsoluteDenominator = localAbsoluteDenominator + abs(term);
      index = index + 256u;
    }
    let denominator = reduceSum(localDenominator, lane);
    let absoluteDenominator = reduceSum(localAbsoluteDenominator, lane);
    if (lane == 0u) {
      scalar[6] = denominator;
      if (denominator <= curvatureTolerance * max(1e-30, absoluteDenominator)) {
        scalar[0] = 0.0;
        scalar[5] = 2.0;
      } else {
        scalar[1] = scalar[2] / denominator;
      }
    }
    workgroupBarrier();
    let validCurvature = workgroupUniformLoad(&scalar[0]);
    if (validCurvature == 0.0) { break; }

    let alpha = scalar[1];
    var localNextResidual = 0.0;
    index = lane;
    loop {
      if (index >= n) { break; }
      workspace[xOffset + index] = workspace[xOffset + index] + alpha * workspace[pOffset + index];
      workspace[rOffset + index] = workspace[rOffset + index] - alpha * workspace[productOffset + index];
      localNextResidual = max(localNextResidual, abs(workspace[rOffset + index]));
      index = index + 256u;
    }
    let relativeResidual = reduceMax(localNextResidual, lane) / scalar[7];
    if (lane == 0u) {
      scalar[3] = f32(iteration + 1u);
      scalar[4] = relativeResidual;
      if (relativeResidual <= tolerance) { scalar[0] = 0.0; scalar[5] = 0.0; }
    }
    workgroupBarrier();
    let needsNextIteration = workgroupUniformLoad(&scalar[0]);
    if (needsNextIteration == 0.0) { break; }

    var localNextRz = 0.0;
    index = lane;
    loop {
      if (index >= n) { break; }
      workspace[zOffset + index] = workspace[rOffset + index] / diagonal[index];
      localNextRz = localNextRz + workspace[rOffset + index] * workspace[zOffset + index];
      index = index + 256u;
    }
    let nextRz = reduceSum(localNextRz, lane);
    if (lane == 0u) {
      scalar[1] = nextRz / scalar[2];
      scalar[2] = nextRz;
    }
    workgroupBarrier();
    let beta = scalar[1];
    index = lane;
    loop {
      if (index >= n) { break; }
      workspace[pOffset + index] = workspace[zOffset + index] + beta * workspace[pOffset + index];
      index = index + 256u;
    }
    workgroupBarrier();
    iteration = iteration + 1u;
  }

  if (lane == 0u) {
    if (scalar[0] != 0.0) { scalar[0] = 0.0; scalar[5] = 1.0; }
    workspace[diagnosticOffset] = select(0.0, 1.0, scalar[5] == 0.0);
    workspace[diagnosticOffset + 1u] = scalar[3];
    workspace[diagnosticOffset + 2u] = scalar[4];
    workspace[diagnosticOffset + 3u] = scalar[5];
    workspace[diagnosticOffset + 4u] = scalar[7];
    workspace[diagnosticOffset + 5u] = scalar[2];
    workspace[diagnosticOffset + 6u] = scalar[6];
    workspace[diagnosticOffset + 7u] = f32(maxIterations);
  }
}`;

export const WEBGPU_SPD_PCG_SHADER = Object.freeze({
  version: WEBGPU_SPD_PCG_SHADER_VERSION,
  name: 'spdPcgResident',
  entryPoint: 'main',
  source,
  shaderHash: stableHash({ version: WEBGPU_SPD_PCG_SHADER_VERSION, source }),
});
