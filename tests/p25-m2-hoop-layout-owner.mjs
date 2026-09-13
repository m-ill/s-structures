import assert from 'node:assert/strict';
import {roundedHoopPerimeterLayout} from '../src/design/rc/roundedHoopPerimeterLayout.js';
import {torsionPerimeterDetail} from '../src/design/rc/torsionPerimeterDetail.js';
const cy=.05,cz=.05,r=.01,c=cy+r/Math.sqrt(2),bars=[[-c,-c],[-.06,0],[-c,c],[0,.06],[c,c],[.06,0],[c,-c],[0,-.06]].map(([y,z])=>({y,z,diameter:.02}));
const x={B:.24,H:.24,cover:.04,tieDiameter:.01,insideRadius:.02,bars};
const g=roundedHoopPerimeterLayout(x);assert.equal(g.status,'OK');assert.deepEqual(g.cornerBarIndices,[1,3,5,7]);assert.equal(g.positions.length,8);assert.equal(g.cornerCount,4);assert.equal(g.codeReferences,undefined);
assert.ok(Math.abs(g.perimeter-(4*(cy+cz)+2*Math.PI*.025))<1e-12);assert.ok(Math.abs(g.gaps.reduce((s,g)=>s+g.length,0)-g.perimeter)<1e-12);
const t=torsionPerimeterDetail({...x,spacing:.15});assert.deepEqual(t.positions,g.positions);assert.deepEqual(t.gaps,g.gaps);assert.equal(t.perimeter,g.perimeter);assert.ok(t.codeReferences.some(r=>r.clause==='4.5.4(5)'));
assert.equal(roundedHoopPerimeterLayout({...x,spacing:1e6}).status,'OK');assert.equal(torsionPerimeterDetail({...x,spacing:1e6}).status,'NG');
assert.equal(roundedHoopPerimeterLayout({...x,bars:[...bars,{y:0,z:0,diameter:.02}]}).status,'NG');
assert.equal(roundedHoopPerimeterLayout({...x,insideRadius:undefined}).status,'NOT_CHECKED');
console.log('PASS shared geometric perimeter owner independent of torsion rules and identical consumer coordinates');

const shared=torsionPerimeterDetail({...x,spacing:.15},{preparedLayout:g});assert.equal(shared.positions,g.positions);assert.equal(shared.gaps,g.gaps);
