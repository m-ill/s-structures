import { stableHash } from '../../core/stableHash.js';

export const NONLINEAR_SUPPORT_SPRING_VERSION = 'p8-m9-support-spring-v1';
export const SUPPORT_STIFFNESS_COMPONENTS = Object.freeze(['kx', 'ky', 'kz', 'krx', 'kry', 'krz']);
export const SUPPORT_DISPLACEMENT_COMPONENTS = Object.freeze(['ux', 'uy', 'uz', 'rx', 'ry', 'rz']);

export function buildNonlinearSupportSprings(domain = {}) {
  if (!domain?.constraint || !Array.isArray(domain.nodes)) {
    const error = new TypeError('Canonical domain is required to build nonlinear support springs.');
    error.code = 'NONLINEAR_SUPPORT_SPRING_DOMAIN_REQUIRED';
    throw error;
  }
  const springs = [];
  const issues = [];
  domain.nodes.forEach((node, nodeIndex) => {
    if (node.support !== 'spring') return;
    SUPPORT_STIFFNESS_COMPONENTS.forEach((stiffnessKey, componentIndex) => {
      const raw = node.spring?.[stiffnessKey];
      const stiffness = raw == null ? 0 : Number(raw);
      const displacementKey = SUPPORT_DISPLACEMENT_COMPONENTS[componentIndex];
      const imposedRaw = node.settlement?.[stiffnessKey] ?? node.settlement?.[displacementKey] ?? 0;
      const imposed = Number(imposedRaw);
      if (!Number.isFinite(stiffness) || stiffness < 0) {
        issues.push({
          code: 'NONLINEAR_SUPPORT_SPRING_INVALID',
          nodeId: node.id,
          component: stiffnessKey,
          message: `${node.id}.${stiffnessKey} must be finite and nonnegative.`,
        });
        return;
      }
      if (!Number.isFinite(imposed) || (imposed !== 0 && stiffness <= 0)) {
        issues.push({
          code: 'NONLINEAR_SUPPORT_SETTLEMENT_INVALID',
          nodeId: node.id,
          component: displacementKey,
          message: `${node.id}.${displacementKey} settlement requires finite data and positive ${stiffnessKey}.`,
        });
        return;
      }
      if (stiffness === 0) return;
      const descriptor = {
        version: NONLINEAR_SUPPORT_SPRING_VERSION,
        id: `support-spring:${node.id}:${displacementKey}`,
        nodeId: node.id,
        nodeIndex,
        component: displacementKey,
        stiffnessComponent: stiffnessKey,
        componentIndex,
        fullDof: nodeIndex * 6 + componentIndex,
        stiffness,
        imposed,
      };
      descriptor.descriptorHash = stableHash(descriptor).slice(0, 24);
      springs.push(Object.freeze(descriptor));
    });
  });
  issues.sort((a, b) => `${a.nodeId}:${a.component}`.localeCompare(`${b.nodeId}:${b.component}`));
  const result = {
    version: NONLINEAR_SUPPORT_SPRING_VERSION,
    ok: issues.length === 0,
    reason: issues.length ? issues[0].code : null,
    springs: Object.freeze(springs),
    issues: Object.freeze(issues),
  };
  result.contractHash = stableHash({ springs, issues }).slice(0, 24);
  return Object.freeze(result);
}

export function evaluateNonlinearSupportSprings(contract, displacementFull) {
  if (!contract?.ok) {
    const error = new Error(contract?.issues?.[0]?.message || 'Nonlinear support spring contract is invalid.');
    error.code = contract?.reason || 'NONLINEAR_SUPPORT_SPRING_INVALID';
    error.details = contract;
    throw error;
  }
  const internalFull = new Float64Array(displacementFull.length);
  const responses = {};
  let strainEnergy = 0;
  for (const spring of contract.springs) {
    const displacement = Number(displacementFull[spring.fullDof]);
    const deformation = displacement - spring.imposed;
    const force = spring.stiffness * deformation;
    const energy = 0.5 * spring.stiffness * deformation * deformation;
    internalFull[spring.fullDof] += force;
    strainEnergy += energy;
    responses[spring.id] = Object.freeze({
      id: spring.id,
      nodeId: spring.nodeId,
      component: spring.component,
      stiffness: spring.stiffness,
      imposed: spring.imposed,
      displacement,
      deformation,
      resistingForce: force,
      supportReaction: -force,
      coordinate: spring.componentIndex < 3 ? 'global-translation' : 'generalized-global-rotation-vector',
      strainEnergy: energy,
      descriptorHash: spring.descriptorHash,
    });
  }
  return Object.freeze({
    version: NONLINEAR_SUPPORT_SPRING_VERSION,
    internalFull,
    responses: Object.freeze(responses),
    strainEnergy,
    responseHash: stableHash(responses).slice(0, 24),
  });
}
