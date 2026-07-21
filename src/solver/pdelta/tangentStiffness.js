import { materialOf, sectionOf } from '../../core/catalogs.js';
import { assembleStiffness3D } from '../linear3dAssembly.js';
import {
  GEOMETRIC_STIFFNESS_VERSION,
  assembleGlobalGeometricStiffness,
  averageMemberAxialForce,
} from '../geometricStiffness.js';

export const PDELTA_TANGENT_STIFFNESS_VERSION = 'p6-m5-pdelta-tangent-stiffness-v1';

export function buildPDeltaTangentStiffness(model = {}, options = {}) {
  const assembly = options.assembly || assembleStiffness3D(model.nodes || [], model.members || [], {
    model,
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
  });
  if (!assembly.ok) {
    return {
      version: PDELTA_TANGENT_STIFFNESS_VERSION,
      ok: false,
      reason: assembly.reason || 'ASSEMBLY_FAILED',
      method: 'geometric-stiffness-second-order-direct',
      assembly,
    };
  }
  const releaseMemberIds = Object.entries(assembly.memData || {})
    .filter(([, data]) => data.rel?.length)
    .map(([memberId]) => memberId);
  if (releaseMemberIds.length) {
    return {
      version: PDELTA_TANGENT_STIFFNESS_VERSION,
      ok: false,
      reason: 'DIRECT_PDELTA_RELEASE_UNSUPPORTED',
      method: 'geometric-stiffness-second-order-direct',
      assembly,
      releaseMemberIds,
      designEligibility: {
        eligible: false,
        status: 'blocked',
        reason: 'DIRECT_PDELTA_RELEASE_UNSUPPORTED',
        message: 'Combined elastic-geometric release condensation is required before this tangent can be used.',
      },
    };
  }
  const axialForces = options.axialForces || axialForcesFromResults(options.results || {});
  const geometric = assembleGlobalGeometricStiffness(model, assembly, {
    mode: 'tangent',
    axialForces,
    includeTension: options.includeTensionKg !== false,
  });
  const Kt = addMatrices(assembly.K, geometric.KG);
  return {
    version: PDELTA_TANGENT_STIFFNESS_VERSION,
    ok: true,
    method: 'geometric-stiffness-second-order-direct',
    signConvention: 'tension-positive; compression axial force is negative and reduces tangent stiffness',
    geometricVersion: GEOMETRIC_STIFFNESS_VERSION,
    assembly,
    axialForces,
    Kt,
    geometric,
    summary: {
      dofCount: Kt.length,
      freeDofCount: assembly.free?.length || 0,
      geometricMemberCount: geometric.summary.memberCount,
      compressionMemberCount: geometric.summary.compressionMemberCount,
      tensionMemberCount: geometric.summary.tensionMemberCount,
      maxAbsAxialForce: geometric.summary.maxAbsAxialForce,
      timoshenkoApproximationCount: geometric.summary.timoshenkoApproximationCount,
      limitationCodes: geometric.summary.limitationCodes,
    },
  };
}

function axialForcesFromResults(results = {}) {
  return Object.fromEntries(Object.entries(results).map(([memberId, row]) => [memberId, averageMemberAxialForce(row)]));
}

function addMatrices(a = [], b = []) {
  return a.map((row, i) => row.map((value, j) => value + (Number(b[i]?.[j]) || 0)));
}
