import assert from 'node:assert/strict';
import {evaluateKdsSection} from '../src/design/rc/kdsStrength.js';
import {footingBarLayout} from '../src/design/foundation/footingBarLayout.js';
const bar={diameter:.016,spacing:.15},f={B:2.75,L:2.45,thickness:.5,cover:.05,barDistribution:'kds-centered-band',reinforcement:{bottomB:bar,bottomL:bar,topB:bar,topL:bar}};
const bars=[];for(const face of ['bottom','top'])for(const position of footingBarLayout(f,face,'L').positions)bars.push({y:(face==='bottom'?1:-1)*(.25-.426),z:-f.B/2+position,area:Math.PI*.016**2/4});
assert.equal(bars.length,70);
// Independent one-dimensional force/moment balance for two 35-bar layers.
const area=Math.PI*.016**2/4;
const balance=c=>{const a=.8*c,concrete=-.85*24*2.75*a*1000;let N=concrete,M=concrete*(.25-a/2);
 for(const y of [-.176,.176]){const strain=.0033*(1-(.25-y)/c),stress=Math.max(-235,Math.min(235,-200000*strain));const force=35*area*(stress+(y>=.25-a?.85*24:0))*1000;N+=force;M+=force*y;}
 return {N,M};};
let lo=.000001,hi=.5;for(let i=0;i<80;i++){const c=(lo+hi)/2;if(balance(c).N>0)lo=c;else hi=c;}
const neutral=(lo+hi)/2,reference=balance(neutral);
assert.ok(Math.abs(reference.N)<1e-8);assert.ok(.0033*((.25+.176)/neutral-1)>.005);
const independentCapacity=Math.abs(reference.M)*.85;
for(const sign of [-1,1]){
 const result=evaluateKdsSection({B:f.B,H:f.thickness},bars,{fc:24,fy:235,Es:200000},{N:0,My:0,Mz:sign*3.3017857142857174});
 assert.equal(result.status,'OK',JSON.stringify(result));
 assert.ok(Math.abs(result.equilibrium.N)<1e-5);
 assert.ok(Math.abs(result.equilibrium.My)<1e-5);
 assert.ok(Math.abs(result.capacity-independentCapacity)<1e-5);
}
console.log('PASS symmetric 70-bar centered-band section principal directions preserve axial and transverse moment equilibrium');
