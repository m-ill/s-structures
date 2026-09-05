import { createModel } from '../core/model.js';

export function createRigidDiaphragmBenchmarkModel() {
  const model = createModel();
  model.nodes = [
    { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'T1', x: 0, y: 0, z: 3 },
    { id: 'B2', x: 4, y: 0, z: 0, support: 'fixed' },
    { id: 'T2', x: 4, y: 0, z: 3 },
  ];
  model.members = [member('C1', 'B1', 'T1'), member('C2', 'B2', 'T2')];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'T1', P: 20, dir: '+x', case: 'D' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: '1.0D', type: 'strength', factors: { D: 1 } }];
  model.diaphragms = [{ id: 'DIA1', type: 'rigid', z: 3 }];
  return model;
}

function member(id, n1, n2) {
  return { id, type: 'frame', n1, n2, matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } };
}
