import { createModel } from '../../src/core/model.js';
import { materialOf, sectionOf } from '../../src/index.js';

export function rigidGpuFixture(P = 100) {
  const model = createModel();
  model.nodes = []; model.members = []; model.loads = [];
  for (const [i, [x,y]] of [[-2,-2],[2,-2],[2,2],[-2,2]].entries()) {
    model.nodes.push({id:`B${i}`,x,y,z:0,support:'fixed'},{id:`T${i}`,x,y,z:4});
    model.members.push({id:`C${i}`,n1:`B${i}`,n2:`T${i}`,type:'frame',matId:'steel',secId:'rcsq400'});
    model.loads.push({id:`P${i}`,type:'nodal',node:`T${i}`,case:'D',P,dir:'-z'});
  }
  model.loads.push({id:'H',type:'nodal',node:'T0',case:'W',P:20,dir:'+x'});
  model.loadCases = [{id:'D',name:'Dead',type:'dead'},{id:'W',name:'Wind',type:'wind'}];
  model.loadCombinations = [{id:'DW',name:'DW',type:'strength',factors:{D:1,W:1}}];
  model.diaphragms = [{id:'ROOF',type:'rigid',nodeIds:['T0','T1','T2','T3']}];
  Object.assign(model.analysisSettings,{includeSelfWeight:false,shearDeformation:false,includeShearDeformation:false,pDeltaMethod:'off'});
  return model;
}

// Independent three-coordinate roof equilibrium; no solver stiffness helpers.
export function independentRoof(model, P = 100) {
  const {E,G} = materialOf(model,'steel'), {J} = sectionOf(model,'rcsq400');
  const I = 0.4**4/12, L = 4;
  const a = 12*E*I/L**3-6*P/(5*L), b = 6*E*I/L**2-P/10, c = 4*E*I/L-2*P*L/15;
  const k = a-b*b/c, rz = 40/(32*k+4*G*J/L);
  return { ux:20/(4*k)+2*rz, uy:-2*rz, rz };
}
