import assert from 'node:assert/strict';
import {memberForceAt} from '../src/solver/linear3dRecovery.js';
const end=[0,10,0,0,0,0,0,0,0,0,0,0],loads=[{type:'point',a:2,q:[0,-3,0]},{type:'moment',a:2,axis:'z',M:7}];
const left=memberForceAt(end,loads,4,2,'left'),right=memberForceAt(end,loads,4,2,'right');
assert.equal(left.Vy,-10);assert.equal(right.Vy,-7);assert.equal(left.Mz,20);assert.equal(right.Mz,13);
assert.equal(memberForceAt(end,loads,4,3).Mz,20);
assert.throws(()=>memberForceAt(end,loads,4,5),/POSITION/);
console.log('PASS exact point-force and point-moment left/right recovery without epsilon interpolation');
