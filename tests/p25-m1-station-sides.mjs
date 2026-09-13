import assert from 'node:assert/strict';
import {concurrentMemberDemands} from '../src/design/evaluation/practicalEvaluation.js';
import {designSetSnapshot} from '../src/compute/product/candidateAnalysisSnapshot.js';
const d={xs:[0,1,1,2],stationSides:['point','left','right','point']};
for(const key of ['N','Vy','Vz','T','My','Mz'])d[key]=[0,1,2,0];
const rows=concurrentMemberDemands('M','U',d,{length:2});
assert.equal(rows.length,4);assert.equal(rows[1].side,'left');assert.equal(rows[2].side,'right');
assert.equal(concurrentMemberDemands('M','U',{...d,stationSides:undefined},{length:2}).length,0);
assert.equal(concurrentMemberDemands('M','U',{...d,xs:[0,1,1,2.01]},{length:2}).length,0);
assert.equal(concurrentMemberDemands('M','U',{...d,stationSides:['point','right','left','point']},{length:2}).length,0);
assert.deepEqual(designSetSnapshot({ok:true,memberResults:{M:d}}).memberResults.M.stationSides,d.stationSides);
console.log('PASS bounded concurrent stations and explicit discontinuity sides');

import {reinforcementRegionsAt} from '../src/design/rc/reinforcementRegions.js';
const regions=[{id:'a',start:0,end:.5},{id:'b',start:.5,end:1}];
assert.equal(reinforcementRegionsAt(regions,.5,'left')[0].id,'a');
assert.equal(reinforcementRegionsAt(regions,.5,'right')[0].id,'b');
