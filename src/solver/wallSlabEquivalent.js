import { buildShellV1Trace } from './shell/quad4.js';
import { expandShellsToFrameLinks } from './shell/shellAssembly.js';
import { buildSemiRigidRedistributionReport, expandSemiRigidDiaphragms } from './semiRigidDiaphragm.js';

export const WALL_SLAB_EQUIVALENT_VERSION = 'p3-m12-wall-slab-equivalent';
export const WALL_SLAB_TRACE_VERSION = 'p3-m12-wall-slab-trace-v1';

export function wallToMidPierMember(wall) {
  const z1 = Math.min(...wall.nodes.map((node) => node.z || 0));
  const z2 = Math.max(...wall.nodes.map((node) => node.z || 0));
  const cx = avg(wall.nodes, 'x'); const cy = avg(wall.nodes, 'y');
  const t = Number(wall.thickness || 0.2); const length = Number(wall.length || Math.max(1, wall.width || 1));
  return {
    version: WALL_SLAB_EQUIVALENT_VERSION,
    nodes: [{ id: `${wall.id}-b`, x: cx, y: cy, z: z1 }, { id: `${wall.id}-t`, x: cx, y: cy, z: z2 }],
    member: { id: `${wall.id}-pier`, n1: `${wall.id}-b`, n2: `${wall.id}-t`, type: 'frame', secId: wall.secId || `${wall.id}-sec`, matId: wall.matId || 'concrete' },
    section: { id: wall.secId || `${wall.id}-sec`, type: 'RECT', A: t * length, Iy: length * t ** 3 / 12, Iz: t * length ** 3 / 12, J: t * length * (t ** 2 + length ** 2) / 12, Zy: t * length ** 2 / 6, Zz: length * t ** 2 / 6 },
  };
}

export function addWallMidPierToModel(model, wall) {
  const eq = wallToMidPierMember(wall);
  const nodes = [...(model.nodes || []), ...eq.nodes.map((node, index) => ({
    ...node,
    support: index === 0 && wall.baseSupport ? wall.baseSupport : node.support,
  }))];
  return {
    ...model,
    nodes,
    members: [...(model.members || []), eq.member],
    sections: [...(model.sections || []), eq.section],
    wallEquivalents: [...(model.wallEquivalents || []), { wallId: wall.id, memberId: eq.member.id, sectionId: eq.section.id }],
  };
}

export function recoverWallPierForces(model, analysis) {
  const result = analysis?.envelope || Object.values(analysis?.byCombo || {})[0] || null;
  return (model.wallEquivalents || []).map((row) => {
    const member = result?.memberResults?.[row.memberId] || {};
    return {
      version: WALL_SLAB_EQUIVALENT_VERSION,
      wallId: row.wallId,
      memberId: row.memberId,
      N: maxAbs(member.N),
      Vy: maxAbs(member.Vy),
      Vz: maxAbs(member.Vz),
      My: maxAbs(member.My),
      Mz: maxAbs(member.Mz),
      source: 'mid-pier-equivalent',
    };
  });
}

export function summarizeSemiRigidDiaphragm(model = {}) {
  const expansion = expandSemiRigidDiaphragms(model);
  const rows = (model.diaphragms || []).map((item) => ({
    id: item.id,
    type: item.type,
    nodeCount: item.nodeIds?.length || 0,
    stiffness: item.inPlaneStiffness || null,
    solverTreatment: item.type === 'semiRigid' ? 'equivalent-truss-brace-grid' : 'rigid-condensed',
    generatedBraceCount: expansion.rows.find((row) => row.id === item.id)?.braceCount || 0,
  }));
  return { version: WALL_SLAB_EQUIVALENT_VERSION, semiRigidCount: rows.filter((row) => row.type === 'semiRigid').length, rows };
}

export function buildWallSlabEquivalentTrace(model = {}, analysis = null) {
  const pierForces = analysis ? recoverWallPierForces(model, analysis) : [];
  const diaphragm = summarizeSemiRigidDiaphragm(model);
  const redistribution = buildSemiRigidRedistributionReport(model, analysis || {});
  const shell = buildShellV1Trace(model);
  const shellAssembly = analysis?.byCombo
    ? Object.values(analysis.byCombo).find((result) => result?.shellFrameAssembly)?.shellFrameAssembly || expandShellsToFrameLinks(model)
    : expandShellsToFrameLinks(model);
  shell.assembly = shellAssembly;
  return {
    version: WALL_SLAB_TRACE_VERSION,
    equivalentVersion: WALL_SLAB_EQUIVALENT_VERSION,
    wallMidPier: {
      count: (model.wallEquivalents || []).length,
      rows: (model.wallEquivalents || []).map((row) => ({
        wallId: row.wallId,
        memberId: row.memberId,
        sectionId: row.sectionId,
        recoveryAvailable: pierForces.some((force) => force.wallId === row.wallId),
      })),
      forces: pierForces,
    },
    diaphragm,
    shell,
    slab: {
      status: redistribution.status,
      redistribution,
      limitation: 'Semi-rigid diaphragm uses an equivalent truss brace grid for preliminary in-plane redistribution; shell slab membrane assembly remains future hardening.',
    },
  };
}

function avg(nodes, key) {
  return nodes.reduce((sum, node) => sum + Number(node[key] || 0), 0) / Math.max(1, nodes.length);
}

function maxAbs(values = []) {
  return values.length ? Math.max(...values.map((value) => Math.abs(Number(value || 0)))) : 0;
}
