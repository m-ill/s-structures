import assert from 'node:assert/strict';
import {torsionPerimeterDetail} from '../src/design/rc/torsionPerimeterDetail.js';
const cy=.15-.04-.01-.03,r=.03-.01,coordinate=cy+r/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*coordinate,z:z*coordinate,diameter:.02})));
const x={B:.3,H:.3,cover:.04,tieDiameter:.01,insideRadius:.03,spacing:.1,bars};
const result=torsionPerimeterDetail(x);assert.equal(result.status,'OK');assert.equal(result.cornerCount,4);assert.ok(Math.abs(result.maximumGap-(2*cy+Math.PI*.035/2))<1e-10);
assert.equal(torsionPerimeterDetail({...x,bars:bars.slice(1)}).status,'NG');assert.equal(torsionPerimeterDetail({...x,bars:[...bars,{y:0,z:0,diameter:.02}]}).status,'NG');
assert.equal(torsionPerimeterDetail({...x,insideRadius:undefined}).status,'NOT_CHECKED');
const tall={...x,H:1,bars:bars.map(b=>({...b,y:Math.sign(b.y)*(Math.abs(b.y)+.35)}))};assert.equal(torsionPerimeterDetail(tall).status,'NG');assert.ok(torsionPerimeterDetail(tall).maximumGap>.3);
console.log('PASS rounded hoop perimeter projection, four corners, spacing and missing geometry');
