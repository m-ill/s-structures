import assert from 'node:assert/strict';
import {
  WALL_SLAB_EQUIVALENT_VERSION,
  summarizeSemiRigidDiaphragm,
  wallToMidPierMember,
} from '../src/index.js';

const wall = wallToMidPierMember({
  id: 'W1',
  thickness: 0.2,
  length: 4,
  nodes: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }],
});
assert.equal(wall.version, WALL_SLAB_EQUIVALENT_VERSION);
assert.equal(wall.nodes.length, 2);
assert.ok(wall.section.A > 0 && wall.section.Iz > wall.section.Iy);

const summary = summarizeSemiRigidDiaphragm({ diaphragms: [{ id: 'D1', type: 'semiRigid', nodeIds: ['N1', 'N2'], inPlaneStiffness: 1000 }] });
assert.equal(summary.semiRigidCount, 1);

console.log(JSON.stringify({ ok: true, version: 'p3-m12-wall-slab' }, null, 2));
