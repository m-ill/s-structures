import { COROTATIONAL_TRUSS_3D_VERSION } from '../../metadata/numericVersions.js';
export { COROTATIONAL_TRUSS_3D_VERSION };
import { createCorotationalFrame3dKernel } from './corotationalFrame3d.js';



export function createCorotationalTruss3dKernel(descriptor, options = {}) {
  const behavior = descriptor?.behavior || descriptor?.type;
  if (!['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
    const error = new TypeError(`Element ${descriptor?.id || '(unknown)'} is not a truss behavior.`);
    error.code = 'COROTATIONAL_TRUSS_BEHAVIOR_REQUIRED';
    throw error;
  }
  return createCorotationalFrame3dKernel(descriptor, options);
}
