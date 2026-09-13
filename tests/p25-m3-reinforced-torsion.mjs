import assert from 'node:assert/strict';
import {kdsReinforcedTorsion} from '../src/design/rc/kdsReinforcedTorsion.js';
const input={B:300,H:600,fck:25,fy:400,fyt:400,cover:40,tieDiameter:10,tieArea:Math.PI*25,spacing:100,d:540,V:50,T:10,longitudinalArea:1000};
const r=kdsReinforcedTorsion(input);
assert.equal(r.Aoh,210*510);assert.equal(r.ph,1440);assert.equal(r.Ao,.85*210*510);
assert.ok(Math.abs(r.requiredAtPerSpacing-10e6/(.75*2*r.Ao*400))<1e-12);
assert.ok(Math.abs(r.requiredLongitudinalArea-r.requiredAtPerSpacing*r.ph)<1e-10);
assert.equal(r.strengthStatus,'OK');assert.equal(r.status,'NOT_CHECKED');
assert.equal(r.reason,'TORSION_DETAIL_AND_ADDITIONAL_REINFORCEMENT_VERIFICATION_REQUIRED');
assert.equal(kdsReinforcedTorsion({...input,spacing:180}).strengthStatus,'NG'); // strict ph/8
assert.equal(kdsReinforcedTorsion({...input,T:100}).strengthStatus,'NG');
assert.equal(kdsReinforcedTorsion({...input,longitudinalArea:0}).strengthStatus,'NG');
assert.equal(kdsReinforcedTorsion({...input,fyt:501}).reason,'TORSION_REINFORCED_INPUT_SCOPE');
assert.ok(kdsReinforcedTorsion({...input,V:200}).requiredCombinedTransverseArea>r.requiredCombinedTransverseArea);
console.log('PASS KDS reinforced torsion numerical demand, strict spacing, shared shear area and unverified detailing gate');
import {torsionSteelAllocation} from '../src/design/rc/torsionAllocation.js';
import {sectionStressBlockResponse} from '../src/design/rc/providedSection.js';
import {evaluateKdsSection} from '../src/design/rc/kdsStrength.js';
const bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:.02,area:.0003})));
const allocation=torsionSteelAllocation({bars,torsionDesignMode:'solid-rectangular-45deg',torsionLongitudinalFraction:.25});
assert.equal(allocation.reservedArea,.0003);assert.equal(allocation.bars[0].physicalArea,.0003);
const section={B:.3,H:.6},material={fc:25,fy:400,Es:200000},law={alpha:.85,beta:.8,epscu:.0033};
const full=sectionStressBlockResponse(section,bars,material,law,0,1e9),reduced=sectionStressBlockResponse(section,allocation.bars,material,law,0,1e9);
assert.ok(Math.abs((reduced.N-full.N)-.0003*400*1000)<1e-8); // removed steel must not turn into concrete
assert.ok(evaluateKdsSection(section,allocation.bars,material,{N:100,My:0,Mz:0}).capacity<evaluateKdsSection(section,bars,material,{N:100,My:0,Mz:0}).capacity);
assert.throws(()=>torsionSteelAllocation({bars,torsionDesignMode:'solid-rectangular-45deg'}),/ALLOCATION_REQUIRED/);
