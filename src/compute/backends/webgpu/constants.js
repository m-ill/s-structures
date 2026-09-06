export const WEBGPU_BUFFER_USAGE = Object.freeze({
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
});

export const WEBGPU_MAP_MODE = Object.freeze({ READ: 0x0001, WRITE: 0x0002 });
export const WEBGPU_SHADER_STAGE = Object.freeze({ VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 });

export function gpuBufferUsage(name) {
  return Number(globalThis.GPUBufferUsage?.[name] ?? WEBGPU_BUFFER_USAGE[name]);
}

export function gpuMapMode(name) {
  return Number(globalThis.GPUMapMode?.[name] ?? WEBGPU_MAP_MODE[name]);
}
