import { materialOf, sectionOf } from '../core/catalogs.js';
import { assembleStiffness3D } from '../solver/linear3d.js';
import { matMul, matTrans } from '../solver/linear3dElement.js';
import { geometricStiffnessTrace } from './elements/corotationalBeam.js';
import { createMomentRotationBackbone, evaluateMomentHinge } from './hinges/momentHinge.js';

export const NONLINEAR_ASSEMBLY_VERSION = 'p3-m14-nonlinear-assembly';

export function buildNonlinearTangentAssembly(model = {}, state = {}, options = {}) {
  const nodes = model.nodes || [];
  const members = model.members || [];
  const elastic = assembleStiffness3D(nodes, members, {
    model,
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
  });
  const K = cloneMatrix(elastic.K || []);
  const traces = [];
  let geometricMemberCount = 0;
  let hingeCorrectionCount = 0;

  for (const member of members) {
    const md = elastic.memData?.[member.id];
    if (!md) continue;
    const axialForce = axialForceFor(member, options.axialForces);
    const geometric = addGeometricTangent(K, md, axialForce);
    if (geometric.applied) geometricMemberCount += 1;
    const hingeRows = hingeCorrectionsFor(member.id, state, options);
    const hingeCorrections = hingeRows.map((hinge) => addHingeTangent(K, md, hinge));
    hingeCorrectionCount += hingeCorrections.filter((item) => item.applied).length;
    traces.push({
      memberId: member.id,
      length: md.ax.L,
      axialForce,
      geometric,
      hingeCorrections,
    });
  }

  return {
    version: NONLINEAR_ASSEMBLY_VERSION,
    ok: !!elastic.ok,
    reason: elastic.reason || null,
    ndof: elastic.ndof || K.length,
    freeDofs: elastic.free || [],
    freeDofCount: elastic.free?.length || 0,
    fixedDofCount: elastic.fixedDofs?.size || 0,
    K,
    members: traces,
    summary: {
      elasticMemberCount: Object.keys(elastic.memData || {}).length,
      geometricMemberCount,
      hingeCorrectionCount,
      maxAbsTangent: maxAbs(K),
      timoshenkoApproximationCount: traces.filter(
        (row) => row.geometric?.consistency?.consistent === false,
      ).length,
      limitationCodes: [...new Set(traces
        .map((row) => row.geometric?.consistency?.limitationCode)
        .filter(Boolean))],
    },
    limitations: [
      'Tangent assembly records KE plus KG plus concentrated hinge tangent corrections.',
      'It is a Phase 3 trace contract and does not yet perform global nonlinear equilibrium iterations.',
      ...new Set(traces
        .map((row) => row.geometric?.consistency?.limitationCode)
        .filter(Boolean)),
    ],
  };
}

function addGeometricTangent(K, md, axialForce) {
  const trace = geometricStiffnessTrace({ axialForce, length: md.ax.L });
  const consistency = md.timoshenko?.geometricStiffness || null;
  if (!Number.isFinite(axialForce) || Math.abs(axialForce) < 1e-12) {
    return { ...trace, consistency, applied: false };
  }
  const kgLocal = zero12();
  addPair(kgLocal, 1, 7, trace.kg);
  addPair(kgLocal, 2, 8, trace.kg);
  assembleMemberMatrix(K, md, kgLocal);
  return { ...trace, consistency, applied: true, localDofs: ['uy', 'uz'] };
}

function addHingeTangent(K, md, hinge = {}) {
  const backbone = hinge.backbone || createMomentRotationBackbone(hinge);
  const response = evaluateMomentHinge(hinge.rotation || 0, backbone);
  const index = hinge.end === 'j' ? 11 : 5;
  const elasticTangent = Math.abs(md.kl?.[index]?.[index] || 0);
  const delta = response.tangent - elasticTangent;
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-12) {
    return { ...response, end: hinge.end || 'i', applied: false, delta };
  }
  const khLocal = zero12();
  khLocal[index][index] = delta;
  assembleMemberMatrix(K, md, khLocal);
  return { ...response, end: hinge.end || 'i', applied: true, delta };
}

function hingeCorrectionsFor(memberId, state, options) {
  const direct = (options.hinges || []).filter((hinge) => hinge.memberId === memberId);
  if (direct.length) return direct;
  return [...(state.hinges || new Map()).entries()]
    .map(([id, value]) => ({ id, ...value }))
    .filter((hinge) => hinge.memberId === memberId);
}

function axialForceFor(member, axialForces = {}) {
  if (axialForces?.[member.id] != null) return Number(axialForces[member.id]);
  return Number(member.axialForce || 0);
}

function assembleMemberMatrix(K, md, local) {
  const global = matMul(matTrans(md.T), matMul(local, md.T));
  for (let i = 0; i < 12; i += 1) {
    for (let j = 0; j < 12; j += 1) K[md.dof[i]][md.dof[j]] += global[i][j];
  }
}

function addPair(K, i, j, value) {
  K[i][i] += value;
  K[j][j] += value;
  K[i][j] -= value;
  K[j][i] -= value;
}

function zero12() {
  return Array.from({ length: 12 }, () => new Array(12).fill(0));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function maxAbs(matrix) {
  let value = 0;
  for (const row of matrix) {
    for (const item of row) value = Math.max(value, Math.abs(Number(item) || 0));
  }
  return value;
}
