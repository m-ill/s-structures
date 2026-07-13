import {
  createCorotationalFrame3dKernel,
  HINGED_COROTATIONAL_FRAME_3D_STATE_VERSION,
  HINGED_COROTATIONAL_FRAME_3D_VERSION,
} from './corotationalFrame3d.js';
import { resolveDomainHingeAssignments } from '../properties/assignments.js';
import { createDistributedFiberFrame3dKernel } from './distributedFiberFrame3d.js';

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
    const distributed = descriptor.nonlinear?.formulation === 'distributed-plasticity';
    if (distributed && hingeAssignments.length) {
      const error = new Error(`Element ${descriptor.id} cannot combine concentrated hinges and distributed fiber plasticity.`);
      error.code = 'NONLINEAR_FORMULATION_CONFLICT';
      throw error;
    }
    const fiberSection = mapValue(options.fiberSections, descriptor.id);
    if (distributed && !fiberSection) {
      const error = new Error(`Element ${descriptor.id} requires a resolved distributed fiber section.`);
      error.code = 'DISTRIBUTED_FIBER_SECTION_REQUIRED';
      throw error;
    }
    const kernel = distributed
      ? createDistributedFiberFrame3dKernel(descriptor, fiberSection, options)
      : hingeAssignments.length
        ? createHingedFrame3dKernel(descriptor, hingeAssignments, options)
        : createCorotationalFrame3dKernel(descriptor, options);
    return Object.freeze({
      id: descriptor.id,
      dofs: Int32Array.from(descriptor.fullDofs),
      descriptor,
      hingeAssignments,
      fiberSection: distributed ? fiberSection : null,
      handlesMemberPrestress: true,
      handlesMechanicalMemberLoads: true,
      usesFiniteRotationCoordinates: true,
      requiredMatrixClass: distributed || hingeAssignments.some((item) => item.requiredMatrixClass === 'general') ? 'general' : 'spd',
      usesDistributedFiber: distributed,
      kernel,
    });
  });
}

function mapValue(source, key) {
  return source instanceof Map ? source.get(key) : source?.[key];
}
