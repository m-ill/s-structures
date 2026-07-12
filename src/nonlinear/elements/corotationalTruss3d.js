import { createCorotationalFrame3dKernel } from './corotationalFrame3d.js';

export const COROTATIONAL_TRUSS_3D_VERSION = 'p8-m3-corotational-truss-3d-v2';

export function createCorotationalTruss3dKernel(descriptor, options = {}) {
  const behavior = descriptor?.behavior || descriptor?.type;
  if (!['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
    const error = new TypeError(`Element ${descriptor?.id || '(unknown)'} is not a truss behavior.`);
    error.code = 'COROTATIONAL_TRUSS_BEHAVIOR_REQUIRED';
    throw error;
  }
  return createCorotationalFrame3dKernel(descriptor, options);
}
