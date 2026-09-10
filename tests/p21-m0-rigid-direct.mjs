import assert from 'node:assert/strict';
import { createModel, runSecondOrderPDelta, runSecondOrderPDeltaAsync, analyzeModel, materialOf, sectionOf } from '../src/index.js';
import { createHybridPDeltaTangentSolver, createReferenceSpdGpuSession, executeProductionElastic } from '../src/compute/index.js';

function fixture(P = 100) {
  const model = createModel();
  model.nodes = [-2, 2].flatMap((x, i) => [
    { id: `B${i}`, x, y: 0, z: 0, support: 'fixed' },
    { id: `T${i}`, x, y: 0, z: 4 },
  ]);
  model.members = [0, 1].map(i => ({ id: `C${i}`, n1: `B${i}`, n2: `T${i}`, type: 'frame', matId: 'steel', secId: 'rcsq400' }));
  model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }, { id: 'W', name: 'Wind', type: 'wind' }];
  model.loadCombinations = [{ id: 'DW', name: 'DW', type: 'strength', factors: { D: 1, W: 1 } }];
  model.loads = [0, 1].map(i => ({ id: `P${i}`, type: 'nodal', node: `T${i}`, case: 'D', P, dir: '-z' }));
  model.loads.push({ id: 'H', type: 'nodal', node: 'T0', case: 'W', P: 20, dir: '+x' });
  model.diaphragms = [{ id: 'ROOF', type: 'rigid', nodeIds: ['T0', 'T1'] }];
  model.analysisSettings.includeSelfWeight = false;
  model.analysisSettings.shearDeformation = false;
  model.analysisSettings.includeShearDeformation = false;
  return model;
}
const close = (a, b, label, tol = 1e-8) => assert.ok(Math.abs(a-b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} != ${b}`);
const model = fixture();
const run = m => runSecondOrderPDelta(m, { D: 1, W: 1 }, { loadSteps: 4 });
const result = run(model);
assert.equal(result.ok, true, JSON.stringify(result, null, 2));
close(result.result.disp.T0[0], result.result.disp.T1[0], 'rigid translation');
assert.equal(result.result.summary.equilibriumOk, true);
assert.equal(result.result.recovery.qualified, true);
// Independent two-DOF beam-column energy matrix and scalar condensation.
// These coefficients are evaluated here, without calling a stiffness/solve helper.
const E = materialOf(model, 'steel').E, I = 0.4 ** 4 / 12, L = 4, P = 100;
close(sectionOf(model, 'rcsq400').Iy, I, 'fixture section');
const k11 = 12*E*I/L**3 - 6*P/(5*L);
const k12 = 6*E*I/L**2 - P/10;
const k22 = 4*E*I/L - 2*P*L/15;
const expected = 20 / (2 * (k11-k12*k12/k22));
close(result.result.disp.T0[0], expected, 'independent beam-column sway', 1e-10);
close(result.result.reactions.B0.rz + result.result.reactions.B1.rz, 200, 'vertical reaction');
const zero = run(fixture(0));
assert.equal(zero.ok, true);
const linear = analyzeModel(fixture(0));
close(zero.result.disp.T0[0], linear.byCombo.DW.disp.T0[0], 'P=0 limit');
assert.ok(result.result.disp.T0[0] > zero.result.disp.T0[0]);
const criticalDimensionless = (5.2-Math.sqrt(5.2**2-4*0.15*12))/(2*0.15);
close(result.stability.critical.criticalLoadFactor, criticalDimensionless*E*I/L**2/P, 'independent constrained critical load', 1e-6);
const byLevel = fixture();
byLevel.diaphragms = [{ id: 'ROOF', type: 'rigid', z: 4 }];
close(run(byLevel).result.disp.T0[0], expected, 'z group');
const shifted = fixture();
shifted.nodes.forEach(n => { n.x += 7; n.y -= 13; });
close(run(shifted).result.disp.T0[0], expected, 'origin translation');
const rotated = fixture();
rotated.nodes.forEach(n => { const x=n.x; n.x=-n.y; n.y=x; });
rotated.loads.find(l=>l.id==='H').dir='+y';
close(run(rotated).result.disp.T0[1], expected, '90-degree rotated model', 1e-10);
const mixed = fixture();
mixed.constraints=[{id:'VERTICAL-TIE',type:'mpc',slave:{node:'T1',dof:'uz'},terms:[{node:'T0',dof:'uz',c:1}],d:0}];
const mixedResult=run(mixed); assert.equal(mixedResult.ok,true,mixedResult.reason);
close(mixedResult.result.disp.T0[0], expected, 'general MPC plus diaphragm', 1e-10);
const spring = fixture(0);
spring.nodes.filter(n=>n.support==='fixed').forEach(n=>{n.support='spring';n.spring={kx:1e7,ky:1e7,kz:1e7,krx:1e7,kry:1e7,krz:1e7};});
const springResult=run(spring); assert.equal(springResult.ok,true,springResult.reason);
close(springResult.result.disp.T0[0],analyzeModel(spring).byCombo.DW.disp.T0[0],'spring P=0 parity',1e-10);
const bad = fixture(); bad.diaphragms.push({ ...bad.diaphragms[0], id: 'OVERLAP' });
assert.equal(run(bad).reason, 'DIRECT_DIAPHRAGM_OVERLAP');
const nonplanar = fixture(); nonplanar.nodes.find(n => n.id === 'T1').z = 5;
assert.equal(run(nonplanar).reason, 'DIRECT_DIAPHRAGM_NONPLANAR');
const imposed = fixture(0);
imposed.nodes.filter(n => n.support === 'fixed').forEach(n => { n.settlement = { kx: 0.001 }; });
const settlement = run(imposed);
assert.equal(settlement.ok, true, settlement.reason);
close(settlement.result.disp.T0[0], zero.result.disp.T0[0] + 0.001, 'affine displacement steps', 1e-10);
const unstable = run(fixture(1e8));
assert.equal(unstable.ok, false);
assert.equal(unstable.designEligibility.eligible, false);
const capped = runSecondOrderPDelta(model, { D: 1, W: 1 }, { maxWorkingBytes: 1 });
assert.equal(capped.admission.ok, false);
// Four-column eccentric roof: independent 3-DOF diaphragm equilibrium.
const eccentric = fixture(); eccentric.nodes = []; eccentric.members = []; eccentric.loads = [];
for (const [i, [x,y]] of [[-2,-2],[2,-2],[2,2],[-2,2]].entries()) {
  eccentric.nodes.push({id:`B${i}`,x,y,z:0,support:'fixed'},{id:`T${i}`,x,y,z:4});
  eccentric.members.push({id:`C${i}`,n1:`B${i}`,n2:`T${i}`,type:'frame',matId:'steel',secId:'rcsq400'});
  eccentric.loads.push({id:`P${i}`,type:'nodal',node:`T${i}`,case:'D',P:100,dir:'-z'});
}
eccentric.loads.push({id:'H',type:'nodal',node:'T0',case:'W',P:20,dir:'+x'});
eccentric.diaphragms[0].nodeIds = ['T0','T1','T2','T3'];
const er = run(eccentric);
assert.equal(er.ok, true, er.reason);
const lateralK = k11-k12*k12/k22;
const roofRotation = 40 / (32*lateralK + 4*materialOf(model,'steel').G*sectionOf(model,'rcsq400').J/L);
close(er.result.disp.T0[5], roofRotation, 'eccentric roof rotation', 1e-10);
close(er.result.disp.T0[0], 20/(4*lateralK)+2*roofRotation, 'eccentric roof displacement', 1e-10);
// Three stories with equal columns: independent planar 8x8 assembly, then
// fixed-base elimination. Per-column nodal forces are half the floor loads.
const tall = fixture(); tall.nodes=[]; tall.members=[]; tall.loads=[]; tall.diaphragms=[];
for (let floor=0; floor<=3; floor++) for (let column=0; column<2; column++) {
  tall.nodes.push({id:`N${floor}-${column}`,x:column?2:-2,y:0,z:4*floor,...(floor===0?{support:'fixed'}:{})});
  if(floor) {
    tall.members.push({id:`C${floor}-${column}`,n1:`N${floor-1}-${column}`,n2:`N${floor}-${column}`,type:'frame',matId:'steel',secId:'rcsq400'});
    tall.loads.push({id:`P${floor}-${column}`,type:'nodal',node:`N${floor}-${column}`,case:'D',P:100,dir:'-z'});
  }
}
for(let floor=1;floor<=3;floor++) {
  tall.diaphragms.push({id:`D${floor}`,type:'rigid',nodeIds:[`N${floor}-0`,`N${floor}-1`]});
  tall.loads.push({id:`H${floor}`,type:'nodal',node:`N${floor}-0`,case:'W',P:20,dir:'+x'});
}
const tr = run(tall); assert.equal(tr.ok,true,tr.reason);
const A=Array.from({length:8},()=>Array(8).fill(0));
const B=[[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]];
const G=[[36,3*L,-36,3*L],[3*L,4*L*L,-3*L,-L*L],[-36,-3*L,36,-3*L],[3*L,-L*L,-3*L,4*L*L]];
for(let floor=1;floor<=3;floor++) for(let i=0;i<4;i++) for(let j=0;j<4;j++) A[2*(floor-1)+i][2*(floor-1)+j]+= E*I/L**3*B[i][j] - (4-floor)*100/(30*L)*G[i][j];
const aug=A.slice(2).map((row,i)=>[...row.slice(2),i%2===0?10:0]);
for(let p=0;p<6;p++) { const pivot=aug[p][p]; for(let j=p;j<=6;j++) aug[p][j]/=pivot; for(let i=0;i<6;i++) if(i!==p) {const v=aug[i][p];for(let j=p;j<=6;j++)aug[i][j]-=v*aug[p][j];} }
for(let floor=1;floor<=3;floor++) close(tr.result.disp[`N${floor}-0`][0],aug[2*(floor-1)][6],`three-story independent floor ${floor}`,1e-10);
assert.equal(runSecondOrderPDelta(model, { D: 1 }, { maxWorkingBytes: 1 }).reason, 'DIRECT_PDELTA_MEMORY_BUDGET');
const hybrid = createHybridPDeltaTangentSolver({ gpuSessionFactory: (a,o) => createReferenceSpdGpuSession(a,o), f64Tolerance: 1e-9, maxCorrections: 4 });
try {
  const asyncResult = await runSecondOrderPDeltaAsync(model, { D: 1, W: 1 }, { tangentSolver: hybrid.solve });
  assert.equal(asyncResult.ok, true, asyncResult.reason);
  close(asyncResult.result.disp.T0[0], expected, 'async constrained path');
  assert.equal(hybrid.snapshot().resourceBalanced, true);
} finally { hybrid.dispose(); }
const productModel = structuredClone(model); productModel.analysisSettings.pDeltaMethod = 'direct';
const product = await executeProductionElastic({ model: productModel, computeTarget: 'cpu' });
assert.equal(product.result.pDelta.ok, true);
assert.equal(product.execution.fallbackUsed, false);
assert.equal(product.execution.resourceBalanced, true);
const unsupportedGpuModel = structuredClone(productModel);
unsupportedGpuModel.constraints = mixed.constraints;
await assert.rejects(executeProductionElastic({model:unsupportedGpuModel,computeTarget:'gpu'}), {code:'DIRECT_DIAPHRAGM_GPU_NOT_QUALIFIED'});
console.log(JSON.stringify({ ok: true, expected, actual: result.result.disp.T0[0], equilibrium: result.result.summary.equilibriumResidual, amplification: result.amplification, scope: 'symmetric/eccentric/three-story independent equations, affine supports, CPU product, reference async; mixed-MPC GPU scope blocked; hardware coverage is recorded separately in Phase23' }, null, 2));
