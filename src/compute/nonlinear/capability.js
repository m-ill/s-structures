export const NONLINEAR_BATCH_CAPABILITY_VERSION = 'p9-m7-nonlinear-batch-capability-v1';

const GPU_SHADOW_TYPES = Object.freeze({
  'elastic-frame-matrix-shadow': Object.freeze({ operation: 'frameMatrixBatch', matrixClasses: ['spd'] }),
  'monotonic-epp-fiber-shadow': Object.freeze({ operation: 'fiberSampleBatch', matrixClasses: ['none', 'spd'] }),
});

export function partitionNonlinearBatchCapability(batch, options = {}) {
  if (!Number.isInteger(batch?.elementCount) || !Array.isArray(batch.elementTypes)) {
    return result(false, 'NONLINEAR_BATCH_REQUIRED', [], []);
  }
  const target = normalizeTarget(options.target);
  const production = options.production === true;
  const supported = [];
  const unsupported = [];
  for (let index = 0; index < batch.elementCount; index += 1) {
    const item = classify(batch.elementTypes[index], batch.matrixClasses[index], target, production);
    (item.supported ? supported : unsupported).push(Object.freeze({
      elementIndex: index,
      elementId: batch.elementIds[index],
      elementType: batch.elementTypes[index],
      matrixClass: batch.matrixClasses[index],
      operation: item.operation,
      reason: item.reason,
    }));
  }
  const explicitGpuBlocked = target === 'gpu' && unsupported.length > 0;
  return result(!explicitGpuBlocked, explicitGpuBlocked ? 'NONLINEAR_GPU_BATCH_UNSUPPORTED' : null, supported, unsupported, {
    target,
    production,
    fallbackRequired: target === 'auto' && unsupported.length > 0,
    designTransferAllowed: target !== 'gpu' && production,
  });
}

export function describeNonlinearBatchSupport() {
  return Object.freeze({
    version: NONLINEAR_BATCH_CAPABILITY_VERSION,
    cpu: Object.freeze({ precision: 'f64', production: true, matrixClasses: Object.freeze(['spd', 'general']), elementContract: 'all-validated' }),
    gpu: Object.freeze({
      precision: 'f32',
      production: false,
      designTransferAllowed: false,
      elementTypes: GPU_SHADOW_TYPES,
      excludedProductionTypes: Object.freeze({
        'corotational-frame-3d': 'GEOMETRIC_STATEFUL_ELEMENT_NOT_GPU_QUALIFIED',
        'corotational-truss-3d': 'GEOMETRIC_STATEFUL_ELEMENT_NOT_GPU_QUALIFIED',
        'hinged-corotational-frame-3d': 'HISTORY_DEPENDENT_HINGE_NOT_GPU_QUALIFIED',
        'distributed-fiber-frame-3d': 'HISTORY_DEPENDENT_FIBER_NOT_GPU_QUALIFIED',
      }),
    }),
  });
}

function classify(type, matrixClass, target, production) {
  if (target === 'cpu' || target === 'auto') return { supported: true, operation: 'cpuNonlinearElementBatch', reason: null };
  if (production) return { supported: false, operation: null, reason: 'GPU_NONLINEAR_NOT_DESIGN_QUALIFIED' };
  const shadow = GPU_SHADOW_TYPES[type];
  if (!shadow) return { supported: false, operation: null, reason: productionTypeReason(type) };
  if (!shadow.matrixClasses.includes(matrixClass)) return { supported: false, operation: shadow.operation, reason: 'GPU_MATRIX_CLASS_UNSUPPORTED' };
  return { supported: true, operation: shadow.operation, reason: null };
}

function productionTypeReason(type) {
  return describeNonlinearBatchSupport().gpu.excludedProductionTypes[type] || 'GPU_ELEMENT_TYPE_UNSUPPORTED';
}

function result(ok, reason, supported, unsupported, extra = {}) {
  return Object.freeze({
    version: NONLINEAR_BATCH_CAPABILITY_VERSION,
    ok,
    reason,
    supported: Object.freeze(supported),
    unsupported: Object.freeze(unsupported),
    ...extra,
  });
}

function normalizeTarget(value) { return value === 'gpu' || value === 'auto' ? value : 'cpu'; }
