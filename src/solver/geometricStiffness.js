import { matMul, matTrans } from './linear3dElement.js';

export const GEOMETRIC_STIFFNESS_VERSION = 'p7-m8-geometric-stiffness-fixed-end-axial-v2';

export function localTangentGeometricStiffness12(axialForceTensionPositive = 0, L = 0) {
  return localGeometricBlock(Number(axialForceTensionPositive) || 0, L);
}

export function localCompressionGeometricStiffness12(compressionPositive = 0, L = 0) {
  return localGeometricBlock(Math.max(0, Number(compressionPositive) || 0), L);
}

export function assembleGlobalGeometricStiffness(model = {}, assembly = {}, options = {}) {
  const ndof = assembly.ndof || assembly.K?.length || 0;
  const KG = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const rows = [];
  const memberData = {};
  const mode = options.mode || 'tangent';
  const includeTension = options.includeTension !== false;
  for (const member of model.members || []) {
    const md = assembly.memData?.[member.id];
    if (!md) continue;
    const axial = resolveAxialForce(member, options, mode);
    if (mode === 'tangent' && axial > 0 && !includeTension) continue;
    if (mode === 'buckling' && !(axial > 0)) continue;
    const behavior = memberBehavior(member);
    const local = behavior === 'truss'
      ? localTrussGeometricStiffness12(axial, md.ax.L)
      : mode === 'buckling'
        ? localCompressionGeometricStiffness12(axial, md.ax.L)
        : localTangentGeometricStiffness12(axial, md.ax.L);
    const global = matMul(matTrans(md.T), matMul(local, md.T));
    for (let i = 0; i < 12; i += 1) {
      for (let j = 0; j < 12; j += 1) KG[md.dof[i]][md.dof[j]] += global[i][j];
    }
    const partialFixity = md.partialFixity?.enabled ? {
      method: 'uncondensed-prismatic-geometric-stiffness',
      elasticStiffnessCondensed: md.partialFixityApplication?.applied === true,
      geometricStiffnessCondensed: false,
      limitationCode: 'PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION',
    } : null;
    rows.push({
      memberId: member.id,
      mode,
      axialForce: axial,
      signConvention: mode === 'buckling' ? 'compression-positive' : 'tension-positive',
      behavior,
      length: md.ax.L,
      applied: true,
      elasticFormulation: md.timoshenko?.formulation || 'euler-bernoulli',
      consistency: md.timoshenko?.geometricStiffness || null,
      partialFixity,
    });
    memberData[member.id] = {
      memberId: member.id,
      axialForce: axial,
      behavior,
      local,
      global,
      dof: md.dof,
      timoshenko: md.timoshenko || null,
      partialFixity,
    };
  }
  return {
    version: GEOMETRIC_STIFFNESS_VERSION,
    mode,
    signConvention: mode === 'buckling' ? 'compression-positive' : 'tension-positive',
    KG,
    rows,
    memberData,
    summary: {
      memberCount: rows.length,
      compressionMemberCount: rows.filter((row) => row.mode === 'buckling' || row.axialForce < 0).length,
      tensionMemberCount: rows.filter((row) => row.mode === 'tangent' && row.axialForce > 0).length,
      maxAbsAxialForce: Math.max(0, ...rows.map((row) => Math.abs(row.axialForce))),
      timoshenkoApproximationCount: rows.filter((row) => row.consistency?.consistent === false).length,
      partialFixityApproximationCount: rows.filter((row) => row.partialFixity != null).length,
      limitationCodes: [...new Set(rows.flatMap((row) => [
        row.consistency?.limitationCode,
        row.partialFixity?.limitationCode,
      ]).filter(Boolean))],
    },
  };
}

function localTrussGeometricStiffness12(axialCoefficient, L) {
  const length = Number(L) || 0;
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0));
  if (!(length > 0)) return k;
  const coefficient = (Number(axialCoefficient) || 0) / length;
  for (const [i, j] of [[1, 7], [2, 8]]) {
    k[i][i] += coefficient;
    k[i][j] -= coefficient;
    k[j][i] -= coefficient;
    k[j][j] += coefficient;
  }
  return k;
}

function memberBehavior(member = {}) {
  const value = member.behavior || member.type;
  return ['truss', 'tensionOnly', 'compressionOnly'].includes(value) ? 'truss' : 'frame';
}

export function axialForcesFromDisplacements(assembly = {}, displacement = [], options = {}) {
  const rows = {};
  const fixedEndScale = Number.isFinite(Number(options.fixedEndScale))
    ? Number(options.fixedEndScale)
    : 1;
  for (const [memberId, md] of Object.entries(assembly.memData || {})) {
    const global = md.dof.map((dof) => Number(displacement[dof]) || 0);
    const local = matMul(md.T, global.map((value) => [value])).map((row) => row[0]);
    const EA = (Number(md.material?.E) || 0) * (Number(md.section?.A) || 0);
    const displacementForce = md.ax.L > 0
      ? (EA / md.ax.L) * ((local[6] || 0) - (local[0] || 0))
      : 0;
    const fixedEndForce = options.includeFixedEnd === false
      ? 0
      : fixedEndAxialForce(md.f0) * fixedEndScale;
    rows[memberId] = displacementForce + fixedEndForce;
  }
  return rows;
}

export function fixedEndAxialForce(fixedEndForces = []) {
  const start = Number(fixedEndForces?.[0]) || 0;
  const finish = Number(fixedEndForces?.[6]) || 0;
  return (-start + finish) / 2;
}

export function averageMemberAxialForce(memberResult = {}) {
  const values = (memberResult.N || []).map((value) => Number(value)).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveAxialForce(member, options, mode) {
  const explicit = options.axialForces?.[member.id];
  if (Number.isFinite(Number(explicit))) return Number(explicit);
  if (mode === 'buckling') {
    const compression = options.referenceAxialForces?.[member.id] ?? member.buckling?.referenceCompression;
    if (Number(compression) > 0) return Number(compression);
    const resultValues = options.results?.[member.id]?.N || [];
    if (resultValues.length) return Math.max(0, ...resultValues.map((value) => -Number(value || 0)));
    return 0;
  }
  const result = options.results?.[member.id];
  if (result) return averageMemberAxialForce(result);
  return 0;
}

function localGeometricBlock(axialCoefficient, L) {
  const length = Number(L) || 0;
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0));
  if (!(length > 0)) return k;
  const c = axialCoefficient / (30 * length);
  addBlock(k, [1, 5, 7, 11], [
    [36, 3 * length, -36, 3 * length],
    [3 * length, 4 * length ** 2, -3 * length, -(length ** 2)],
    [-36, -3 * length, 36, -3 * length],
    [3 * length, -(length ** 2), -3 * length, 4 * length ** 2],
  ], c);
  addBlock(k, [2, 4, 8, 10], [
    [36, -3 * length, -36, -3 * length],
    [-3 * length, 4 * length ** 2, 3 * length, -(length ** 2)],
    [-36, 3 * length, 36, 3 * length],
    [-3 * length, -(length ** 2), 3 * length, 4 * length ** 2],
  ], c);
  return k;
}

function addBlock(k, dofs, values, scale) {
  dofs.forEach((r, i) => dofs.forEach((c, j) => {
    k[r][c] += values[i][j] * scale;
  }));
}
