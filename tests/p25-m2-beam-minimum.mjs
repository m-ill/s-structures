import assert from 'node:assert/strict';
import {kdsFlexuralMinimum} from '../src/design/rc/kdsDetailing.js';
const x={B:.3,H:.6,fck:25,lambda:1,designMomentCapacity:75};
assert.ok(Math.abs(kdsFlexuralMinimum(x).Mcr-56.7)<1e-10);
assert.equal(kdsFlexuralMinimum(x).status,'OK');assert.equal(kdsFlexuralMinimum({...x,designMomentCapacity:60}).status,'NG');
assert.equal(kdsFlexuralMinimum({...x,lambda:undefined}).status,'NOT_CHECKED');
console.log('PASS KDS beam minimum phiMn >= 1.2 Mcr without excess-steel exception');
