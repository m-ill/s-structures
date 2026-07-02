import { materialOf } from '../core/catalogs.js';

export const SEMI_RIGID_DIAPHRAGM_VERSION = 'p3-t75-semi-rigid-diaphragm-braces';

export function expandSemiRigidDiaphragms(model = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const members = [];
  const sections = [];
  const rows = [];
  for (const diaphragm of model.diaphragms || []) {
    if (diaphragm.type !== 'semiRigid') continue;
    const ids = (diaphragm.nodeIds || []).filter((id) => nodes[id]);
    const pairs = nodePairs(ids, nodes);
    const matId = diaphragm.matId || 'steel';
    const E = Math.max(1e-9, Number(materialOf(model, matId).E || 205000000));
    const edgeK = Number(diaphragm.inPlaneStiffness || 0) / Math.max(1, pairs.length);
    pairs.forEach(([a, b], index) => {
      const L = distance(nodes[a], nodes[b]);
      const secId = `__semi_${diaphragm.id}_${index + 1}_sec`;
      members.push({ id: `__semi_${diaphragm.id}_${index + 1}`, type: 'truss', n1: a, n2: b, matId, secId, generated: true, source: 'semiRigidDiaphragm', diaphragmId: diaphragm.id });
      sections.push({ id: secId, kind: 'direct', A: Math.max(1e-9, edgeK * L / E), Iy: 1e-12, Iz: 1e-12, J: 1e-12 });
    });
    rows.push({ id: diaphragm.id, nodeCount: ids.length, braceCount: pairs.length, matId, materialE: E, inPlaneStiffness: Number(diaphragm.inPlaneStiffness || 0), edgeStiffness: edgeK });
  }
  return { version: SEMI_RIGID_DIAPHRAGM_VERSION, braceCount: members.length, rows, members, sections };
}

export function buildSemiRigidRedistributionReport(model = {}, analysis = {}) {
  const expansion = expandSemiRigidDiaphragms(model);
  const combos = Object.entries(analysis.byCombo || {}).map(([comboId, result]) => ({
    comboId,
    rows: expansion.rows.map((row) => driftSpread(row.id, model, result)),
  }));
  return { version: SEMI_RIGID_DIAPHRAGM_VERSION, status: expansion.braceCount ? 'available' : 'not-modeled', braceCount: expansion.braceCount, rows: expansion.rows, combos };
}

function nodePairs(ids, nodes) {
  const out = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) if (distance(nodes[ids[i]], nodes[ids[j]]) > 1e-9) out.push([ids[i], ids[j]]);
  return out;
}

function driftSpread(diaphragmId, model, result) {
  const diaphragm = (model.diaphragms || []).find((item) => item.id === diaphragmId);
  const values = (diaphragm?.nodeIds || []).map((id) => result?.disp?.[id]?.[0]).filter((value) => Number.isFinite(Number(value))).map(Number);
  const spread = values.length ? Math.max(...values) - Math.min(...values) : null;
  return {
    diaphragmId,
    uxSpread: spread,
    sampledNodeCount: values.length,
    status: spread == null ? 'not-sampled' : 'available',
    review: spread == null ? 'no-displacement-samples' : 'redistribution-spread-trace',
  };
}

function distance(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
}
