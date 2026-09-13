import assert from 'node:assert/strict';
import {analyzeModel,createCantileverTipLoad,memberAxes} from '../src/index.js';
import {runSecondOrderPDelta} from '../src/solver/pdelta/secondOrder.js';
import {fixedEndMemberMoment} from '../src/loads/fixedEnd/memberMoment.js';
import {collectMemberSpanLoads} from '../src/solver/linear3dRecovery.js';
const fixture=()=>createCantileverTipLoad().model;
for(const axis of ['x','y','z'])for(const sign of [-1,1]){
 const model=fixture();model.loads=[{id:'M',type:'nmoment',node:'N2',dir:`${sign<0?'-':'+'}${axis}`,M:2,case:'D'}];
 const actual=analyzeModel(model).byCombo.D_ONLY;const expected=structuredClone(model);expected.loads=[{id:'M',type:'nmoment',node:'N2',axis,M:2*sign,case:'D'}];const legacy=analyzeModel(expected).byCombo.D_ONLY;
 assert.ok(actual.ok);actual.disp.N2.forEach((v,i)=>assert.ok(Math.abs(v-legacy.disp.N2[i])<1e-12));
 assert.ok(Math.abs(actual.reactions.N1[`rm${axis}`]+2*sign)<1e-10);assert.equal(actual.summary.equilibriumOk,true);
 if(axis==='x'&&sign===-1){const direct=runSecondOrderPDelta(model,{D:1},{loadSteps:1});assert.equal(direct.ok,true,direct.reason);assert.ok(Math.abs(direct.result.reactions.N1.rmx-2)<1e-8);}
}
const a={x:0,y:0,z:0},b={x:2,y:3,z:1},axes=memberAxes(a,b),load={id:'MM',type:'mmoment',member:'M',M:3,at:.4,dir:'-x'};
const result=fixedEndMemberMoment(load,axes),local=[axes.x[0],axes.y[0],axes.z[0]].map(v=>-v*3),parts=['x','y','z'].map((axis,i)=>fixedEndMemberMoment({...load,dir:undefined,axis,M:local[i]},axes));
assert.equal(result.ok,true);result.fe.forEach((v,i)=>assert.ok(Math.abs(v-parts.reduce((s,p)=>s+p.fe[i],0))<1e-12));
const recovered=collectMemberSpanLoads('M',[load],axes);assert.equal(recovered.issues.length,0);recovered.forEach(r=>assert.ok(Math.abs(r.M-local['xyz'.indexOf(r.axis)])<1e-12));
const model=fixture();model.loads=[{...load,member:'M1',case:'D'}];const solved=analyzeModel(model).byCombo.D_ONLY;assert.equal(solved.ok,true);assert.ok(Math.abs(solved.reactions.N1.rmx-3)<1e-10);assert.equal(solved.summary.equilibriumOk,true);
console.log('PASS six signed global nodal moment directions, legacy parity, Direct P-delta and oblique member moment assembly/recovery/equilibrium');
