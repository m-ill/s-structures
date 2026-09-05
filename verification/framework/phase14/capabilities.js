export const PHASE14_CAPABILITY_REGISTRY_VERSION = 'p14-m0-capability-registry-v1';

export const PHASE14_CAPABILITY_STATES = Object.freeze([
  'planned',
  'implementation-complete',
  'internally-verified',
  'independently-qualified',
  'cross-solver-compared',
  'release-allowed',
]);

export const PHASE14_CAPABILITIES = deepFreeze([
  capability('SB7', 'P14-M1', 'distributed-winkler-foundation', ['R1', 'R2', 'R3', 'R4']),
  capability('TH1', 'P14-M2', 'linear-tha-modal-damping', ['R1', 'R2', 'R3', 'R4']),
  capability('SR2', 'P14-M3', 'modal-combination', ['R1', 'R2', 'R3', 'R4']),
  capability('SR2B', 'P14-M4', 'six-dof-mass-rsa-recovery', ['R1', 'R2', 'R3', 'R4']),
  capability('SB2', 'P14-M5', 'membrane-stress-qualification', ['R1', 'R2', 'R3', 'R4']),
  capability('SB3', 'P14-M6', 'distorted-membrane-robustness', ['R1', 'R2', 'R3', 'R4']),
  capability('SB5', 'P14-M7', 'thin-plate-bending', ['R1', 'R2', 'R3', 'R4']),
  capability('SB6', 'P14-M8', 'thick-plate-transverse-shear', ['R1', 'R2', 'R3', 'R4']),
  capability('P3S2-SS', 'P14-M9', 'shell-stabilization-custom', ['R5'], { crossSolverEligible: false }),
  capability('SP1', 'P14-M10', 'production-pushover-hardening', ['R1', 'R2', 'R3', 'R4']),
]);

export const PHASE14_CAPABILITY_IMPACT_MAP = deepFreeze({
  governance: PHASE14_CAPABILITIES.map((row) => row.id),
  foundation: ['SB7'],
  frameStiffness: ['SB7', 'SP1'],
  linearDynamics: ['TH1', 'SR2', 'SR2B'],
  mass: ['TH1', 'SR2', 'SR2B'],
  modalCombination: ['SR2', 'SR2B'],
  membrane: ['SB2', 'SB3', 'P3S2-SS'],
  plate: ['SB5', 'SB6', 'P3S2-SS'],
  shellStabilization: ['SB2', 'SB3', 'SB5', 'SB6', 'P3S2-SS'],
  nonlinearStatic: ['SP1'],
  projectSchema: PHASE14_CAPABILITIES.map((row) => row.id),
  resultContract: PHASE14_CAPABILITIES.map((row) => row.id),
});

export function getPhase14Capability(id) {
  const normalized = String(id || '').trim().toUpperCase();
  return PHASE14_CAPABILITIES.find((row) => row.id === normalized) || null;
}

export function listImpactedPhase14Capabilities(changeAreas = []) {
  const impacted = new Set();
  for (const area of Array.from(changeAreas || [])) {
    for (const id of PHASE14_CAPABILITY_IMPACT_MAP[String(area)] || []) impacted.add(id);
  }
  return PHASE14_CAPABILITIES.map((row) => row.id).filter((id) => impacted.has(id));
}

function capability(id, milestone, owner, referenceLevels, options = {}) {
  return {
    id,
    milestone,
    owner,
    referenceLevels,
    crossSolverEligible: options.crossSolverEligible !== false,
    runtimeOwner: 's-structures-in-house',
    externalSolverRuntimeAllowed: false,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
