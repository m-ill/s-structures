import assert from 'node:assert/strict';
import {solveInterfaceTraction} from '../src/design/foundation/interfaceTraction.js';
const section={B:.4,H:.6},bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.15,z:z*.1,area:.0005,diameter:Math.sqrt(.002/Math.PI)})));
const material={Ec:30000,Es:200000,concreteLimit:13.26,steelCompressionLimit:260,steelTensionLimit:340};
const run=demand=>solveInterfaceTraction({section,bars,material,demand});
const compression=run({N:-200,My:0,Mz:0});assert.equal(compression.status,'OK');assert.ok(Math.abs(compression.strain[0]+200/7540000)<1e-10);
const tension=run({N:100,My:0,Mz:0});assert.equal(tension.status,'OK');assert.ok(tension.bars.every(b=>Math.abs(b.force-25)<1e-7));
// Independent integration of triangular concrete stress on one half-section,
// replacing displaced concrete at four point steel fibres.
const cracked=run({N:-178.5,My:0,Mz:38.775});assert.equal(cracked.status,'OK');assert.ok(Math.abs(cracked.strain[0])<1e-9);assert.ok(Math.abs(cracked.strain[1]-.0001)<1e-9);
assert.ok(cracked.bars.every((b,i)=>Math.abs(b.force-(bars[i].y>0?5:-5))<1e-6));
const biaxial=run({N:-100,My:6,Mz:15});assert.equal(biaxial.status,'OK');for(const key of ['N','My','Mz'])assert.ok(Math.abs(biaxial.recovered[key]-({N:-100,My:6,Mz:15})[key])<1e-6);
const mirror=run({N:-100,My:-6,Mz:-15});assert.equal(mirror.status,'OK');assert.ok(Math.abs(mirror.strain[1]+biaxial.strain[1])<1e-9);assert.ok(Math.abs(mirror.strain[2]+biaxial.strain[2])<1e-9);
assert.equal(run({N:1000,My:0,Mz:0}).status,'NG');
console.log('PASS bounded interface traction: uniform elastic compression/tension, cracked hand integration, biaxial equilibrium and axial bound');
