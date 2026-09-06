import { stableHash } from '../../../core/stableHash.js';
import { gpuBufferUsage, gpuMapMode } from './constants.js';
import { WEBGPU_SPD_PCG_SHADER } from './spdPcgShader.js';

export const WEBGPU_SPD_SESSION_VERSION = 'p9-m5-webgpu-spd-session-v1';

export async function createWebGpuSpdSession(platform, matrix, defaults = {}) {
  validateMatrix(matrix);
  platform.assertReady(defaults.signal);
  const n = matrix.rowCount;
  const limits = platform.capability.limits || {};
  if (Number(limits.maxComputeInvocationsPerWorkgroup || 0) < 256 || Number(limits.maxComputeWorkgroupSizeX || 0) < 256) {
    throw sessionError('WEBGPU_SPD_WORKGROUP_LIMIT_UNAVAILABLE', 'The device cannot execute the qualified 256-lane SPD kernel.');
  }
  if (Number(limits.maxStorageBuffersPerShaderStage || 0) < 6) {
    throw sessionError('WEBGPU_SPD_BINDING_LIMIT_UNAVAILABLE', 'The device storage binding limit is below six.');
  }

  const storageInput = gpuBufferUsage('STORAGE') | gpuBufferUsage('COPY_DST');
  const storageWorkspace = gpuBufferUsage('STORAGE') | gpuBufferUsage('COPY_SRC');
  const uniformInput = gpuBufferUsage('UNIFORM') | gpuBufferUsage('COPY_DST');
  const readbackUsage = gpuBufferUsage('MAP_READ') | gpuBufferUsage('COPY_DST');
  const workspaceLength = n * 5 + 8;
  const readbackLength = n + 8;
  const rows = [
    lease(matrix.rowPtr.byteLength, storageInput, 'rowPtr'),
    lease(matrix.colIdx.byteLength, storageInput, 'colIdx'),
    lease(matrix.values.byteLength, storageInput, 'values'),
    lease(matrix.diagonal.byteLength, storageInput, 'diagonal'),
    lease(n * 4, storageInput, 'rhs'),
    lease(workspaceLength * 4, storageWorkspace, 'workspace'),
    lease(4 * 4, uniformInput, 'params', 'uniform'),
    lease(readbackLength * 4, readbackUsage, 'readback'),
  ];
  const [rowPtr, colIdx, values, diagonal, rhs, workspace, params, readback] = rows;
  for (const [target, data] of [[rowPtr, matrix.rowPtr], [colIdx, matrix.colIdx], [values, matrix.values], [diagonal, matrix.diagonal]]) {
    platform.queue.writeBuffer(target.buffer, 0, data.buffer, data.byteOffset, data.byteLength);
  }
  const pipeline = await compilePipeline(platform);
  const bindGroup = platform.device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [rowPtr, colIdx, values, diagonal, rhs, workspace, params].map((item, binding) => ({
      binding,
      resource: { buffer: item.buffer, size: item.size },
    })),
    label: 'p9-m5-spd-pcg-bind-group',
  });
  const matrixHash = stableHash({
    rowCount: n,
    rowPtr: Array.from(matrix.rowPtr),
    colIdx: Array.from(matrix.colIdx),
    values: Array.from(matrix.values),
  });
  let solveCount = 0;
  let failedSolveCount = 0;
  let busy = false;
  let disposed = false;

  return Object.freeze({
    version: WEBGPU_SPD_SESSION_VERSION,
    matrixHash,
    solve,
    snapshot,
    dispose,
  });

  async function solve(rhsInput, options = {}) {
    if (disposed) return failure('WEBGPU_SPD_SESSION_DISPOSED');
    if (busy) return failure('WEBGPU_SPD_SESSION_BUSY');
    const input = Float32Array.from(rhsInput || [], Number);
    if (input.length !== n || input.some((value) => !Number.isFinite(value))) return failure('WEBGPU_SPD_RHS_INVALID');
    busy = true;
    solveCount += 1;
    try {
      return await platform.withErrorScopes(async () => {
        platform.queue.writeBuffer(rhs.buffer, 0, input.buffer, input.byteOffset, input.byteLength);
        const tolerance = positive(options.tolerance, defaults.tolerance, 1e-5);
        const maxIterations = positiveInteger(options.maxIterations, defaults.maxIterations, Math.min(2048, Math.max(64, n * 2)));
        const curvatureTolerance = positive(options.curvatureTolerance, defaults.curvatureTolerance, 1e-12);
        const parameters = Float32Array.of(n, maxIterations, tolerance, curvatureTolerance);
        platform.queue.writeBuffer(params.buffer, 0, parameters.buffer, parameters.byteOffset, parameters.byteLength);
        const encoder = platform.device.createCommandEncoder({ label: 'p9-m5-spd-pcg-commands' });
        const pass = encoder.beginComputePass({ label: 'p9-m5-spd-pcg-pass' });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(1);
        pass.end();
        encoder.copyBufferToBuffer(workspace.buffer, 0, readback.buffer, 0, n * 4);
        encoder.copyBufferToBuffer(workspace.buffer, n * 5 * 4, readback.buffer, n * 4, 8 * 4);
        await platform.submit(encoder.finish(), { signal: options.signal });
        await readback.buffer.mapAsync(gpuMapMode('READ'), 0, readbackLength * 4);
        const copy = readback.buffer.getMappedRange(0, readbackLength * 4).slice(0);
        readback.buffer.unmap();
        const data = new Float32Array(copy);
        const diagnostic = data.subarray(n);
        const reason = reasonCode(Math.trunc(diagnostic[3]));
        const ok = diagnostic[0] === 1 && reason === null && data.subarray(0, n).every(Number.isFinite);
        if (!ok) failedSolveCount += 1;
        return Object.freeze({
          ok,
          x: ok ? data.slice(0, n) : null,
          reason: ok ? null : reason || 'WEBGPU_SPD_NONFINITE_RESULT',
          diagnostics: Object.freeze({
            version: WEBGPU_SPD_SESSION_VERSION,
            method: 'webgpu-resident-jacobi-pcg-f32',
            precision: 'f32',
            iterations: Math.trunc(diagnostic[1]),
            relativeResidual: diagnostic[2],
            reasonCode: Math.trunc(diagnostic[3]),
            loadNorm: diagnostic[4],
            rz: diagnostic[5],
            denominator: diagnostic[6],
            maxIterations: Math.trunc(diagnostic[7]),
            tolerance,
            fallback: false,
            dispatchCount: 1,
            residentMatrix: true,
          }),
        });
      }, options.signal);
    } catch (error) {
      failedSolveCount += 1;
      throw error;
    } finally {
      try { readback.buffer.unmap?.(); } catch {}
      busy = false;
    }
  }

  function snapshot() {
    return Object.freeze({
      version: WEBGPU_SPD_SESSION_VERSION,
      matrixHash,
      rowCount: n,
      nnz: matrix.nnz,
      solveCount,
      failedSolveCount,
      busy,
      disposed,
      allocatedBytes: rows.reduce((sum, item) => sum + item.size, 0),
      resourceBalanced: disposed ? rows.every((item) => item.released === true) : null,
    });
  }

  async function dispose() {
    if (disposed) return snapshot();
    disposed = true;
    for (let index = rows.length - 1; index >= 0; index -= 1) rows[index].releaseOnce();
    return snapshot();
  }

  function lease(size, usage, name, bindingClass = 'storage') {
    assertBindingLimit(platform, size, name, bindingClass);
    const item = platform.pool.acquire({ size, usage, label: `p9-m5-spd:${name}` });
    let released = false;
    return Object.freeze({
      token: item.token,
      buffer: item.buffer,
      size: item.size,
      usage: item.usage,
      label: item.label,
      get released() { return released; },
      releaseOnce() { if (!released) { released = true; item.release(); } },
    });
  }
}

async function compilePipeline(platform) {
  return platform.getPipeline(WEBGPU_SPD_PCG_SHADER.shaderHash, async () => {
    const module = platform.device.createShaderModule({ code: WEBGPU_SPD_PCG_SHADER.source, label: WEBGPU_SPD_PCG_SHADER.name });
    if (typeof module.getCompilationInfo === 'function') {
      const info = await module.getCompilationInfo();
      const errors = (info.messages || []).filter((row) => row.type === 'error');
      if (errors.length) throw sessionError('WEBGPU_SPD_SHADER_COMPILATION_FAILED', errors.map((row) => row.message).join('\n'));
    }
    const descriptor = { layout: 'auto', compute: { module, entryPoint: WEBGPU_SPD_PCG_SHADER.entryPoint }, label: 'p9-m5-spd-pcg-pipeline' };
    return typeof platform.device.createComputePipelineAsync === 'function'
      ? platform.device.createComputePipelineAsync(descriptor)
      : platform.device.createComputePipeline(descriptor);
  });
}

function validateMatrix(matrix) {
  const n = Number(matrix?.rowCount || 0);
  if (matrix?.format !== 'csr-f32' || !n || n !== matrix.colCount || matrix.rowPtr?.length !== n + 1
    || matrix.colIdx?.length !== matrix.values?.length || matrix.diagonal?.length !== n) {
    throw sessionError('WEBGPU_SPD_MATRIX_INVALID', 'A nonempty scaled CSR f32 SPD matrix is required.');
  }
}

function assertBindingLimit(platform, byteLength, name, bindingClass = 'storage') {
  const bindingLimit = bindingClass === 'uniform'
    ? Number(platform.capability.limits.maxUniformBufferBindingSize || platform.device.limits?.maxUniformBufferBindingSize || 0)
    : Number(platform.capability.limits.maxStorageBufferBindingSize || 0);
  const limit = Math.min(Number(platform.capability.limits.maxBufferSize || 0), bindingLimit);
  if (!(limit > 0) || byteLength > limit) throw sessionError('WEBGPU_SPD_BUFFER_LIMIT_EXCEEDED', `${name} exceeds the device ${bindingClass} buffer limit.`);
}

function reasonCode(code) {
  if (code === 0) return null;
  if (code === 1) return 'WEBGPU_SPD_NOT_CONVERGED';
  if (code === 2) return 'WEBGPU_SPD_NON_POSITIVE_CURVATURE';
  if (code === 3) return 'WEBGPU_SPD_DIAGONAL_INVALID';
  return 'WEBGPU_SPD_UNKNOWN_FAILURE';
}

function failure(reason) { return { ok: false, x: null, reason, diagnostics: { version: WEBGPU_SPD_SESSION_VERSION, reason } }; }
function positive(...values) { for (const value of values) { const number = Number(value); if (Number.isFinite(number) && number > 0) return number; } return 1; }
function positiveInteger(...values) { for (const value of values) { const number = Number(value); if (Number.isInteger(number) && number > 0) return number; } return 1; }
function sessionError(code, message) { return Object.assign(new Error(message), { code }); }
