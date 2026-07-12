import {
  createCorotationalFrame3dKernel,
  HINGED_COROTATIONAL_FRAME_3D_STATE_VERSION,
  HINGED_COROTATIONAL_FRAME_3D_VERSION,
} from './corotationalFrame3d.js';
import { resolveDomainHingeAssignments } from '../properties/assignments.js';

export const HINGED_FRAME_3D_VERSION = HINGED_COROTATIONAL_FRAME_3D_VERSION;
export const HINGED_FRAME_3D_STATE_VERSION = HINGED_COROTATIONAL_FRAME_3D_STATE_VERSION;

export function createHingedFrame3dKernel(descriptor, hingeAssignments = [], options = {}) {
  if (!Array.isArray(hingeAssignments) || hingeAssignments.length === 0) {
    const error = new TypeError(`Element ${descriptor?.id || '(missing)'} requires at least one resolved hinge assignment.`);
    error.code = 'HINGED_FRAME_ASSIGNMENT_REQUIRED';
    throw error;
  }
  return createCorotationalFrame3dKernel(descriptor, {
    ...options,
    hingeAssignments,
  });
}

export function buildHingedFrame3dEntries(domain, options = {}) {
  const resolution = options.assignmentResolution || resolveDomainHingeAssignments(domain, options);
  return domain.elements.map((descriptor) => {
    const hingeAssignments = resolution.byElement[descriptor.id] || [];
    const kernel = hingeAssignments.length
      ? createHingedFrame3dKernel(descriptor, hingeAssignments, options)
      : createCorotationalFrame3dKernel(descriptor, options);
    return Object.freeze({
      id: descriptor.id,
      dofs: Int32Array.from(descriptor.fullDofs),
      descriptor,
      hingeAssignments,
      handlesMemberPrestress: true,
      handlesMechanicalMemberLoads: true,
      usesFiniteRotationCoordinates: true,
      requiredMatrixClass: hingeAssignments.some((item) => item.requiredMatrixClass === 'general') ? 'general' : 'spd',
      kernel,
    });
  });
}
