export const RIGID_GPU_CAPABILITY_VERSION = 'p23-rigid-gpu-candidate-v1';
export const RIGID_GPU_CAPABILITY = Object.freeze({
  version: RIGID_GPU_CAPABILITY_VERSION,
  status: 'hardware-smoke-verified-candidate',
  scope: 'horizontal-XY-small-rotation-frame-elastic-and-direct-pdelta',
  precision: 'gpu-f32-cpu-f64-audit',
  autoEnabled: false,
  productionQualified: false,
  designTransferAllowed: false,
});

// A discoverability filter only. The solver still validates geometry, supports,
// releases, matrix eligibility and stability before accepting a result.
export function hasRigidGpuCandidateScope(model = {}) {
  return model.diaphragms?.some(group => group.type === 'rigid') === true
    && (model.constraints || []).length === 0
    && (model.members || []).length > 0
    && model.members.every(member => !member.type || member.type === 'frame');
}
