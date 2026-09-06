import { stableHash } from '../../../core/stableHash.js';

export const WEBGPU_CAPABILITY_VERSION = 'p9-m4-webgpu-capability-v1';
export const WEBGPU_RECORDED_LIMITS = Object.freeze([
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxStorageBuffersPerShaderStage',
  'maxComputeWorkgroupsPerDimension',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupSizeX',
  'maxComputeWorkgroupStorageSize',
  'minStorageBufferOffsetAlignment',
]);

export async function requestWebGpuCapability(options = {}) {
  const gpu = options.gpu || options.navigator?.gpu || globalThis.navigator?.gpu;
  if (!gpu?.requestAdapter) return unavailable('WEBGPU_API_UNAVAILABLE');
  let adapter;
  try {
    adapter = options.adapter || await gpu.requestAdapter(options.adapterOptions || {});
  } catch (error) {
    return unavailable('WEBGPU_ADAPTER_REQUEST_FAILED', error?.message);
  }
  if (!adapter) return unavailable('WEBGPU_ADAPTER_UNAVAILABLE');
  return inspectWebGpuAdapter(adapter, options);
}

export function inspectWebGpuAdapter(adapter, options = {}) {
  if (!adapter) return unavailable('WEBGPU_ADAPTER_UNAVAILABLE');
  const features = [...(adapter.features || [])].map(String).sort();
  const limits = Object.fromEntries(WEBGPU_RECORDED_LIMITS.map((name) => [name, finiteLimit(adapter.limits?.[name])]));
  const requiredFeatures = [...new Set(options.requiredFeatures || [])].map(String).sort();
  const requiredLimits = normalizeRequiredLimits(options.requiredLimits);
  const missingFeatures = requiredFeatures.filter((feature) => !features.includes(feature));
  const limitFailures = Object.entries(requiredLimits)
    .filter(([name, value]) => !Number.isFinite(Number(adapter.limits?.[name])) || Number(adapter.limits[name]) < value)
    .map(([name, required]) => ({ name, required, available: finiteLimit(adapter.limits?.[name]) }));
  const ok = missingFeatures.length === 0 && limitFailures.length === 0;
  const reason = missingFeatures.length
    ? 'WEBGPU_FEATURE_UNAVAILABLE'
    : limitFailures.length ? 'WEBGPU_LIMIT_UNAVAILABLE' : null;
  const core = {
    version: WEBGPU_CAPABILITY_VERSION,
    ok,
    available: ok,
    reason,
    adapterInfo: adapterInfo(adapter),
    features,
    limits,
    requiredFeatures,
    requiredLimits,
    missingFeatures,
    limitFailures,
    fallbackUsed: false,
    designTransferAllowed: false,
  };
  return Object.freeze({ ...core, capabilityHash: stableHash(core), adapter });
}

export function serializableWebGpuCapability(capability = {}) {
  const copy = { ...capability };
  delete copy.adapter;
  return Object.freeze(copy);
}

function unavailable(reason, detail = null) {
  const core = {
    version: WEBGPU_CAPABILITY_VERSION,
    ok: false,
    available: false,
    reason,
    detail: detail || null,
    adapterInfo: null,
    features: [],
    limits: {},
    requiredFeatures: [],
    requiredLimits: {},
    missingFeatures: [],
    limitFailures: [],
    fallbackUsed: false,
    designTransferAllowed: false,
  };
  return Object.freeze({ ...core, capabilityHash: stableHash(core), adapter: null });
}

function adapterInfo(adapter) {
  const info = adapter.info || {};
  return Object.freeze({
    vendor: String(info.vendor || 'unknown'),
    architecture: String(info.architecture || 'unknown'),
    device: String(info.device || 'unknown'),
    description: String(info.description || 'unknown'),
    isFallbackAdapter: adapter.isFallbackAdapter === true,
  });
}

function normalizeRequiredLimits(value) {
  const output = {};
  for (const [name, raw] of Object.entries(value || {})) {
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) throw capabilityError('WEBGPU_REQUIRED_LIMIT_INVALID', `Required limit ${name} is invalid.`);
    output[name] = number;
  }
  return Object.freeze(output);
}

function finiteLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function capabilityError(code, message) {
  return Object.assign(new Error(message), { code });
}
