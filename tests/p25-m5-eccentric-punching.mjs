import assert from 'node:assert/strict';
import {perimeterShearInteraction,criticalPerimeterActions} from '../src/design/foundation/eccentricPunching.js';
const x={B:1,L:1,d:.2,V:100,Mx:0,My:0,designStress:400};
const r=perimeterShearInteraction(x),moment=275*(.2*2/3)/.5;
assert.ok(Math.abs(r.momentCapacityX-moment)<1e-10);
assert.equal(perimeterShearInteraction({...x,Mx:moment/2,My:moment/2}).status,'OK');
assert.equal(perimeterShearInteraction({...x,Mx:moment/2,My:moment/2+.01}).status,'NG');
assert.equal(perimeterShearInteraction({...x,V:321}).status,'NG');
const a=criticalPerimeterActions({B:1,L:1,reaction:{rmx:30,rmy:-40},ledger:{columnN:200,uniformDownwardPressure:10},contact:{polygon:[[-1,-1],[1,-1],[1,1],[-1,1]],pressurePlane:[60,12,24]}});
assert.ok(Math.abs(a.V-150)<1e-10);assert.ok(Math.abs(a.Mx-28)<1e-10);assert.ok(Math.abs(a.My+39)<1e-10);
console.log('PASS net critical-perimeter forces and conservative biaxial shear-only interaction');

const translated=criticalPerimeterActions({B:1,L:1,x:.3,y:-.2,reaction:{rmx:10,rmy:-20},ledger:{columnN:200,columnMx:10,columnMy:-20,uniformDownwardPressure:10},contact:{polygon:[[-2,-2],[2,-2],[2,2],[-2,2]],pressurePlane:[60,12,24]}});
assert.ok(Math.abs(translated.soilForce-58.8)<1e-9);assert.ok(Math.abs(translated.Mx-8)<1e-9);assert.ok(Math.abs(translated.My+19)<1e-9);

const {evaluateFootingPunching}=await import('../src/design/foundation/kdsPunching.js');
const {createModel}=await import('../src/core/model.js');
const model=createModel();model.loadCombinations=[{id:'U',type:'strength',factors:{}}];
const footing={punchingStandard:'KDS-142022-2022',nodeId:'A',B:2,L:2,thickness:.5,cover:.05,columnWidth:.4,columnDepth:.4,materialId:'concrete@1',concreteWeight:'normal',barCoating:'uncoated',reinforcement:{materialId:'steel@1',bottomB:{diameter:.016,spacing:.15},bottomL:{diameter:.016,spacing:.15}}};
const set={combo:{id:'U'},reactions:{A:{rz:100,rmx:0,rmy:0}}};
const extensionFailure=evaluateFootingPunching(model,footing,set);
assert.equal(extensionFailure.status,'NG');assert.ok(extensionFailure.shearRatio<1);assert.ok(extensionFailure.ratio>1);assert.equal(extensionFailure.governingCriterion,'reinforcement-extension');assert.equal(extensionFailure.ratio,Math.max(...extensionFailure.extensions.map(e=>e.required/e.available),extensionFailure.shearRatio));
assert.equal(evaluateFootingPunching(model,{...footing,B:.9,L:.9},set).ratio,null);
console.log('PASS punching governing utilization retains extension failure and preserves separate shear ratio');
