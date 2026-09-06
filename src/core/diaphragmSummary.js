import { DIAPHRAGM_VERSION } from './diaphragmContract.js';
import { resolveRigidDiaphragms } from './diaphragmGroups.js';

export const DIAPHRAGM_SUMMARY_VERSION = 'p2-t11-rigid-diaphragm-summary';

export function buildDiaphragmSummary(model) {
  const groups = resolveRigidDiaphragms(model);
  return {
    version: DIAPHRAGM_SUMMARY_VERSION,
    diaphragmVersion: DIAPHRAGM_VERSION,
    count: groups.length,
    nodeCount: groups.reduce((sum, item) => sum + item.nodeIds.length, 0),
    groups: groups.map((item) => ({
      id: item.id,
      type: item.type,
      nodeCount: item.nodeIds.length,
      center: item.center,
    })),
  };
}
