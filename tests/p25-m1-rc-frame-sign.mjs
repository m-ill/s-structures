import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {runRcCoupledIteration} from '../src/compute/product/rcCoupledIteration.js';
import {resolveMaterialRecord} from '../src/materials/registry.js';
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'T',name:'T',type:'live'}];m.loads=[{id:'F',node:'B',type:'nodal',P:50,dir:'+x',case:'T'}];m.loadCombinations=[{id:'S',type:'service',factors:{T:1}}];m.analysisSettings={pDeltaMethod:'off'};
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-.08,.08].flatMap(z=>[{y:-.2,z,diameter:20},{y:.2,z,diameter:16}]),sourceNote:'synthetic asymmetric steel'},[]);
const Es=resolveMaterialRecord(m,'steel@1').elastic.E,bars=m.designDetails.reinforcement[0].bars;
const S0=bars.reduce((s,b)=>s+Es*b.area*1000,0),Sy=bars.reduce((s,b)=>s+Es*b.area*1000*b.y,0),Syy=bars.reduce((s,b)=>s+Es*b.area*1000*b.y*b.y,0);
// Physical Euler-Bernoulli kinematics: axial strain = u' - y*v''.
// At N=50, Mz=0: kappa=Sy/Syy*epsilon, N=(S0-Sy^2/Syy)*epsilon.
const epsilon=50/(S0-Sy*Sy/Syy),kappa=Sy/Syy*epsilon;
assert.ok(bars.every(b=>epsilon-b.y*kappa>0),'fully tensile section, no concrete term');
const r=await runRcCoupledIteration(m,{comboIds:['S'],maxRefinements:1});assert.equal(r.ok,true,JSON.stringify(r));
const dl=r.analysis.byCombo.S.memberResults.AB.dl;
assert.ok(Math.abs(dl[6]-3*epsilon)<1e-10);assert.ok(Math.abs(dl[7]-kappa*9/2)<1e-10,`physical local-y deflection ${kappa*9/2}, received ${dl[7]}`);
console.log('PASS asymmetric RC axial-bending sign against independent physical strain equilibrium');
// Add a positive solver-native Mz and check the physical strain-plane solution.
const bent=structuredClone(m);bent.loads.push({id:'Mz',node:'B',type:'nmoment',dir:'-y',M:2,case:'T'});
const b=await runRcCoupledIteration(bent,{comboIds:['S'],maxRefinements:1});assert.equal(b.ok,true,JSON.stringify(b));
const epsB=(50+Sy*2/Syy)/(S0-Sy*Sy/Syy),kB=(2+Sy*epsB)/Syy;
assert.ok(bars.every(bar=>epsB-bar.y*kB>0));assert.ok(Math.abs(b.analysis.byCombo.S.memberResults.AB.dl[7]-kB*9/2)<1e-10);
for(const station of b.stationsByCombo.S){
 assert.ok(Math.abs(station.demand.Mz-2)<1e-9);assert.ok(Math.abs(station.sectionDemand.Mz+2)<1e-9);
 assert.ok(Math.abs(station.frameStrain[2]-kB)<1e-10);
 for(const [i,bar] of bars.entries())assert.ok(Math.abs(station.steelForces[i]-Es*bar.area*1000*(epsB-bar.y*kB))<1e-8);
}
console.log('PASS native Mz conversion, prepared frame/section conventions and physical individual steel forces');
import {frameEndsToRcSectionEnds,rcSectionEndForcesToFrame,rcSectionFlexibilityToFrame,frameDemandToRcSection} from '../src/compute/adapters/rcFrameConvention.js';
const uf=[.001,0,0,0,.002,-.003,.005,0,0,0,-.004,.006],qs=frameEndsToRcSectionEnds(uf),fs=[10,2,-3,-10,-2,3],ff=rcSectionEndForcesToFrame(fs);
assert.ok(Math.abs(qs.reduce((s,v,i)=>s+v*fs[i],0)-uf.reduce((s,v,i)=>s+v*ff[i],0))<1e-14);
const C=[[2,.1,.2],[.1,3,.3],[.2,.3,4]],Cf=rcSectionFlexibilityToFrame(C),native=[1,2,3],converted=frameDemandToRcSection({N:1,My:2,Mz:3}),section=[converted.N,converted.My,converted.Mz];
const energy=(A,v)=>v.reduce((s,x,i)=>s+x*A[i].reduce((t,a,j)=>t+a*v[j],0),0);assert.ok(Math.abs(energy(Cf,native)-energy(C,section))<1e-12);
console.log('PASS work-conjugate frame/section endpoint and flexibility transforms');
