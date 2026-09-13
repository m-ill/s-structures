import assert from 'node:assert/strict';
import {torsionTransverseHook} from '../src/design/rc/torsionTransverseHook.js';
const cy=.15-.04-.01-.03,r=.03-.01,c=cy+r/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*c,z:z*c,diameter:.02})));
const x={B:.3,H:.3,cover:.04,tieDiameter:.01,insideRadius:.03,tail:.06,closure:'standard-135',corner:'+y+z',bars};
assert.equal(torsionTransverseHook(x).status,'OK');assert.equal(torsionTransverseHook({...x,tail:.059}).status,'NG');assert.equal(torsionTransverseHook({...x,insideRadius:.019}).status,'NG');
assert.equal(torsionTransverseHook({...x,corner:undefined}).status,'NOT_CHECKED');assert.equal(torsionTransverseHook({...x,bars:bars.slice(0,3)}).status,'NG');
assert.equal(torsionTransverseHook({...x,tieDiameter:.018}).status,'NOT_CHECKED');
console.log('PASS torsion 135 hook tail/radius, actual corner bar and unsupported size class');
