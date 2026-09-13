import assert from 'node:assert/strict';
import {meanConsolidationDegree} from '../src/design/foundation/consolidationTime.js';
assert.equal(meanConsolidationDegree(0).degree,0);
assert.ok(Math.abs(meanConsolidationDegree(.197).degree-.5)<.002);
assert.ok(Math.abs(meanConsolidationDegree(.848).degree-.9)<.001);
assert.equal(meanConsolidationDegree(-1).ok,false);
assert.equal(meanConsolidationDegree(Infinity).ok,false);
let last=0;
for(const t of [1e-20,1e-8,.019999,.02,.020001,.1,1,10,100]){const r=meanConsolidationDegree(t);assert.equal(r.ok,true);assert.ok(r.degree>=last&&r.degree<=1);assert.ok(r.absoluteErrorBound<1e-12);last=r.degree;}
// Independent explicit finite-difference diffusion with one drained and one sealed boundary.
const n=80,steps=3200,dt=.2/steps,alpha=dt*n*n;let u=new Float64Array(n+1).fill(1);u[0]=0;
for(let step=0;step<steps;step++){const v=new Float64Array(n+1);for(let i=1;i<n;i++)v[i]=u[i]+alpha*(u[i-1]-2*u[i]+u[i+1]);v[n]=u[n]+2*alpha*(u[n-1]-u[n]);u=v;}
const mean=(u.slice(1,n).reduce((a,b)=>a+b,0)+u[n]/2)/n;
assert.ok(Math.abs(meanConsolidationDegree(.2).degree-(1-mean))<2e-4);
console.log('PASS consolidation time zero, limiting cases, monotonicity and independent diffusion');

const {evaluateGroundSettlement}=await import('../src/design/foundation/groundSettlement.js');
const ground={id:'G',version:1,settlementMethod:'layered-constrained-modulus',settlementLayers:['2:10000:1'],settlementReference:'fixture',settlementLimit:.01,consolidationModel:'independent-uniform-layers',consolidationLayers:['1:single'],consolidationElapsedDays:0,consolidationReference:'fixture constant uniform independent drainage'};
const input={ground,combo:{type:'service'},contact:{ok:true,qmax:100}};
const atZero=evaluateGroundSettlement(input);assert.equal(atZero.demand,.02);assert.equal(atZero.status,'NG');assert.equal(atZero.consolidation.displacementAtTime,0);
const single=evaluateGroundSettlement({...input,ground:{...ground,consolidationElapsedDays:.8}}).consolidation;
const double=evaluateGroundSettlement({...input,ground:{...ground,consolidationLayers:['1:double'],consolidationElapsedDays:.2}}).consolidation;
assert.equal(single.displacementAtTime,double.displacementAtTime);
assert.ok(Math.abs(single.displacementAtTime/.02-meanConsolidationDegree(.2).degree)<1e-14);
const missing=evaluateGroundSettlement({...input,ground:{...ground,consolidationElapsedDays:undefined}});assert.equal(missing.status,'NG');assert.equal(missing.consolidation.status,'NOT_CHECKED');assert.ok(missing.requiredInputFields.includes('consolidationElapsedDays'));
const {validatePracticalCommand}=await import('../src/modeling/practicalInputContract.js');
const command={type:'ground-record',...ground,name:'fixture',sourceNote:'fixture',sourceReference:'fixture',basisStatus:'specified',allowableBearing:200,bearingBasis:'gross'};
assert.doesNotThrow(()=>validatePracticalCommand(command));
assert.throws(()=>validatePracticalCommand({...command,consolidationLayers:['1:single','1:double']}));
assert.throws(()=>validatePracticalCommand({...command,consolidationLayers:['1:unknown']}));
assert.throws(()=>validatePracticalCommand({...command,consolidationModel:undefined}));
console.log('PASS time-zero ultimate NG preservation, drainage scaling, input contract and missing-time target');

const stagesGround={...ground,consolidationElapsedDays:1,consolidationStages:['0:0.4','0.5:1']};
const staged=evaluateGroundSettlement({...input,ground:stagesGround});
const reference=.02*(.4*meanConsolidationDegree(.25).degree+.6*meanConsolidationDegree(.125).degree);
assert.ok(Math.abs(staged.consolidation.displacementAtTime-reference)<1e-14,JSON.stringify(staged));
assert.equal(staged.status,'NG');assert.equal(staged.demand,.02);assert.equal(staged.consolidation.appliedLoadFraction,1);
const beforeSecond=evaluateGroundSettlement({...input,ground:{...stagesGround,consolidationElapsedDays:.25}}).consolidation;
assert.equal(beforeSecond.appliedLoadFraction,.4);assert.equal(beforeSecond.futureLoadFraction,.6);
assert.ok(Math.abs(beforeSecond.displacementAtTime-.02*.4*meanConsolidationDegree(.0625).degree)<1e-14);
const shifted=evaluateGroundSettlement({...input,ground:{...stagesGround,consolidationElapsedDays:11,consolidationStages:['10:0.4','10.5:1']}}).consolidation;
assert.equal(shifted.displacementAtTime,staged.consolidation.displacementAtTime);
assert.throws(()=>validatePracticalCommand({...command,consolidationStages:['1:0.4','0:1']}));
assert.throws(()=>validatePracticalCommand({...command,consolidationStages:['0:0.8','1:0.4','2:1']}));
assert.throws(()=>validatePracticalCommand({...command,consolidationStages:['0:0.5']}));
console.log('PASS staged load superposition, future fraction, time translation and invalid history rejection');

let stagedPore=new Float64Array(n+1).fill(.4);stagedPore[0]=0;
for(let step=0;step<steps;step++){
 if(step===steps/2)for(let i=1;i<=n;i++)stagedPore[i]+=.6;
 const v=new Float64Array(n+1);for(let i=1;i<n;i++)v[i]=stagedPore[i]+alpha*(stagedPore[i-1]-2*stagedPore[i]+stagedPore[i+1]);v[n]=stagedPore[n]+2*alpha*(stagedPore[n-1]-stagedPore[n]);stagedPore=v;
}
const stagedMean=(stagedPore.slice(1,n).reduce((a,b)=>a+b,0)+stagedPore[n]/2)/n;
const diffusionCheck=evaluateGroundSettlement({...input,ground:{...ground,consolidationElapsedDays:.8,consolidationStages:['0:0.4','0.4:1']}}).consolidation;
assert.ok(Math.abs(diffusionCheck.displacementAtTime/.02-(1-stagedMean))<2e-4);
const future=evaluateGroundSettlement({...input,ground:{...ground,consolidationElapsedDays:1,consolidationStages:['10:1']}}).consolidation;
assert.equal(future.displacementAtTime,0);assert.equal(future.appliedLoadFraction,0);assert.equal(future.futureLoadFraction,1);
const invalid=evaluateGroundSettlement({...input,ground:{...ground,consolidationStages:['0:.5']}});assert.equal(invalid.status,'NG');assert.ok(invalid.requiredInputFields.includes('consolidationStages'));
console.log('PASS independent staged diffusion and future-only load, invalid stage preserves ultimate NG');
