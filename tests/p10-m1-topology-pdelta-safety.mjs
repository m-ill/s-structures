import assert from 'node:assert/strict';
import { analyzeAll } from '../src/solver/linear3d.js';
import { connectedComponentGroups } from '../src/solver/linear3dPost.js';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';

// A memberless diaphragm master/support still belongs to the connected
// component established by the diaphragm node group.
const groups = connectedComponentGroups(
  [{ id: 'MASTER' }, { id: 'A' }, { id: 'B' }],
  [{ id: 'AB', n1: 'A', n2: 'B' }],
  [['MASTER', 'A']],
);
assert.equal(Object.keys(groups).length, 1);
assert.deepEqual([...Object.values(groups)[0].mids], ['AB']);
assert.deepEqual([...Object.values(groups)[0].nids].sort(), ['A', 'B', 'MASTER']);

const topology = topologyModel();
const linear = analyzeAll(topology, { D: 1 });
assert.equal(linear.ok, true, JSON.stringify(linear, null, 2));
assert.deepEqual(linear.failedComponents, []);
assert.ok(Object.hasOwn(linear.disp, 'MASTER'));
assert.ok(Math.abs(linear.disp.B[0] - 0.001) < 1e-12);
assert.ok(Math.abs(linear.reactions.MASTER.rx + 10) < 1e-10);
assert.equal(linear.summary.equilibriumStatus, 'PASS');
assert.equal(linear.summary.equilibriumResidual, 0);

// Direct P-Delta currently partitions legacy support settlement only.  An
// explicit prescribed displacement must therefore fail closed instead of
// being silently solved as zero.
const explicit = explicitPrescribedModel();
const blocked = runSecondOrderPDelta(explicit, { D: 1 }, { loadSteps: 1 });
assert.equal(blocked.ok, false);
assert.equal(blocked.converged, false);
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.reason, 'DIRECT_PDELTA_EXPLICIT_PRESCRIBED_UNSUPPORTED');
assert.equal(blocked.result, null);
assert.equal(blocked.compatibility.supported, false);
assert.equal(blocked.compatibility.status, 'blocked');
assert.deepEqual(
  blocked.compatibility.blockers.find((item) => item.code === blocked.reason),
  {
    code: 'DIRECT_PDELTA_EXPLICIT_PRESCRIBED_UNSUPPORTED',
    message: 'Direct P-Delta does not yet apply explicit prescribed displacement B.ux.',
    nodeId: 'B',
    dof: 'ux',
  },
);

console.log(JSON.stringify({
  ok: true,
  diaphragmComponentNodeIds: [...Object.values(groups)[0].nids].sort(),
  directPDeltaBlocker: blocked.reason,
}, null, 2));

function topologyModel() {
  return {
    nodes: [
      { id: 'MASTER', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'A', x: 0, y: 0, z: 0 },
      { id: 'B', x: 1, y: 0, z: 0 },
    ],
    members: [{ id: 'AB', n1: 'A', n2: 'B', type: 'truss', matId: 'MAT', secId: 'SEC' }],
    diaphragms: [{ id: 'DIA', type: 'rigid', nodeIds: ['MASTER', 'A'], center: { x: 0, y: 0, z: 0 } }],
    materials: [material()],
    sections: [section()],
    loads: [{ id: 'P', type: 'nodal', node: 'B', P: 10, dir: '+x', case: 'D' }],
    loadCases: [{ id: 'D', type: 'dead' }],
    loadCombinations: [{ id: 'D_ONLY', factors: { D: 1 } }],
    analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
  };
}

function explicitPrescribedModel() {
  return {
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 1, y: 0, z: 0, prescribedDisplacement: { ux: 0.001 } },
    ],
    members: [{ id: 'AB', n1: 'A', n2: 'B', type: 'truss', matId: 'MAT', secId: 'SEC' }],
    materials: [material()],
    sections: [section()],
    loads: [],
    loadCases: [{ id: 'D', type: 'dead' }],
    loadCombinations: [{ id: 'D_ONLY', factors: { D: 1 } }],
    analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
  };
}

function material() {
  return {
    id: 'MAT',
    E: 1000,
    G: 400,
    Fy: 1e9,
    allow: { fb: 1e9, ft: 1e9, fc: 1e9, fv: 1e9 },
  };
}

function section() {
  return {
    id: 'SEC',
    type: 'direct',
    A: 0.01,
    Iy: 0.001,
    Iz: 0.001,
    J: 0.001,
    Zy: 1,
    Zz: 1,
  };
}
