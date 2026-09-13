import assert from 'node:assert/strict';
import {crackedRectangularStiffness} from '../src/design/rc/crackedSectionStiffness.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(Math.abs(b)*1e-12,1e-18),`${a} != ${b}`);
const A=Math.PI*.02**2/4,bars=[{y:-.2,z:-.05,area:A},{y:.2,z:.05,area:A}];
const r=crackedRectangularStiffness({B:.3,H:.6,bars,Ec:25000,Es:200000});
// Independent quadratic equilibrium for two bars below the neutral axis (both in tension).
const a=.15,b=16*A,d=-4.8*A,c=-2*d/(b+Math.sqrt(b*b-4*a*d));
near(r.z.faces[1].neutralAxis,c);
near(r.z.faces[1].Icr,.3*c**3/3+8*A*(c-.1)**2+8*A*(c-.5)**2);
near(r.z.faces[0].Icr,r.z.faces[1].Icr);
assert.ok(c<.1);
const compressed=crackedRectangularStiffness({B:.3,H:.6,bars:bars.map(p=>({...p,y:Math.sign(p.y)*.25})),Ec:25000,Es:200000});
const bc=15*A,dc=-4.75*A,cc=-2*dc/(bc+Math.sqrt(bc*bc-4*a*dc));
assert.ok(cc>.05&&cc<.55);
near(compressed.z.faces[1].neutralAxis,cc);
near(compressed.z.faces[1].Icr,.3*cc**3/3+7*A*(cc-.05)**2+8*A*(cc-.55)**2);
const rotated=crackedRectangularStiffness({B:.6,H:.3,bars:bars.map(p=>({...p,y:p.z,z:p.y})),Ec:25000,Es:200000});
near(r.y.faces[0].Icr,rotated.z.faces[0].Icr);
near(r.y.faces[1].Icr,rotated.z.faces[1].Icr);
for(const factor of [.01,100]){
 const scaled=crackedRectangularStiffness({B:.3*factor,H:.6*factor,bars:bars.map(p=>({y:p.y*factor,z:p.z*factor,area:p.area*factor**2})),Ec:25000,Es:200000});
 near(scaled.z.faces[1].Icr,r.z.faces[1].Icr*factor**4);
}
assert.throws(()=>crackedRectangularStiffness({B:.3,H:.6,bars:[{...bars[0],area:NaN}],Ec:25000,Es:200000}),/CRACKED_SECTION_BAR_INVALID/);
assert.throws(()=>crackedRectangularStiffness({B:.3,H:.6,bars,Ec:25000,Es:20000}),/CRACKED_SECTION_INPUT_INVALID/);
assert.equal(r.globalRedistributionIncluded,false);
console.log('PASS shared cracked stiffness: independent equilibrium, axis rotation, length scaling and invalid input');
