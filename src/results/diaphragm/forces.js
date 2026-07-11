import { diaphragmCenter, diaphragmNodeIds } from '../../core/diaphragmGroupSource.js';
import { comboFactors, factorFor } from '../resultUtils.js';

export const DIAPHRAGM_LOAD_PATH_FORCE_VERSION = 'p6-m4-diaphragm-load-path-force-v1';

export const DIAPHRAGM_LOAD_PATH_WARNING = 'not shell/local design force; preliminary semi-rigid diaphragm load-path trace only';

export function buildDiaphragmLoadPathForces(model = {}, analysis = {}) {
  const semiRigid = (model.diaphragms || []).filter((diaphragm) => diaphragm.type === 'semiRigid');
  const rigid = (model.diaphragms || []).filter((diaphragm) => diaphragm.type === 'rigid');
  const rows = [];
  for (const [comboId, result] of Object.entries(analysis.byCombo || {})) {
    const factors = comboFactors(result);
    for (const diaphragm of semiRigid) {
      rows.push(diaphragmForceRow(model, diaphragm, comboId, factors));
    }
  }
  return {
    version: DIAPHRAGM_LOAD_PATH_FORCE_VERSION,
    method: 'sum applied diaphragm nodal lateral loads by active combination factors',
    rows,
    skippedRigidDiaphragmCount: rigid.length,
    warning: DIAPHRAGM_LOAD_PATH_WARNING,
    summary: {
      rowCount: rows.length,
      semiRigidDiaphragmCount: semiRigid.length,
      rigidDiaphragmCount: rigid.length,
      maxForce: Math.max(0, ...rows.map((row) => Math.hypot(row.forceX, row.forceY))),
      maxTorsionMz: Math.max(0, ...rows.map((row) => Math.abs(row.torsionMz))),
      status: semiRigid.length ? 'available' : 'not-modeled',
    },
  };
}

function diaphragmForceRow(model, diaphragm, comboId, factors) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const nodeIds = diaphragmNodeIds(diaphragm, model).filter((id) => nodes[id]);
  const center = diaphragm.center || diaphragmCenter(nodeIds.map((id) => nodes[id]));
  const out = {
    comboId,
    diaphragmId: diaphragm.id,
    type: diaphragm.type,
    nodeCount: nodeIds.length,
    center,
    forceX: 0,
    forceY: 0,
    torsionMz: 0,
    warning: DIAPHRAGM_LOAD_PATH_WARNING,
  };
  const idSet = new Set(nodeIds);
  for (const load of model.loads || []) {
    if (load.type !== 'nodal' || !idSet.has(load.node)) continue;
    const factor = factorFor(factors, load.case || 'LC1');
    if (!factor) continue;
    const direction = directionVector(load);
    const force = Number(load.P || 0) * factor;
    const fx = direction[0] * force;
    const fy = direction[1] * force;
    const node = nodes[load.node];
    out.forceX += fx;
    out.forceY += fy;
    out.torsionMz += ((Number(node.y || 0) - center.y) * fx) - ((Number(node.x || 0) - center.x) * fy);
  }
  return out;
}

function directionVector(load = {}) {
  if (Array.isArray(load.direction) && load.direction.length === 3) {
    const n = Math.hypot(Number(load.direction[0]) || 0, Number(load.direction[1]) || 0, Number(load.direction[2]) || 0) || 1;
    return [load.direction[0] / n, load.direction[1] / n, load.direction[2] / n];
  }
  return {
    '+x': [1, 0, 0],
    '-x': [-1, 0, 0],
    '+y': [0, 1, 0],
    '-y': [0, -1, 0],
    '+z': [0, 0, 1],
    '-z': [0, 0, -1],
  }[load.dir || '+x'] || [1, 0, 0];
}
