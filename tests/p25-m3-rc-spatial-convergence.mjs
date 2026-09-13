import assert from 'node:assert/strict';
import {captureSpatialResponse,compareSpatialResponse} from '../src/compute/product/spatialResponse.js';
const set={ok:true,disp:{A:[0,0,0,0,0,0]},reactions:{A:{rx:0,ry:1,rz:0,rmx:0,rmy:0,rmz:1}},memberResults:{M:{xs:[0,1,2],shape:[[0,0,0],[0,.001,0],[0,0,0]],end:[0,1,0,0,0,1,0,-1,0,0,0,-1]}}};
const a=captureSpatialResponse(set),changed=structuredClone(set);changed.memberResults.M.shape[1][1]=.002;
assert.equal(compareSpatialResponse(a,captureSpatialResponse(changed)).residual,.5);
assert.equal(compareSpatialResponse(a,a).residual,0);
changed.memberResults.M.shape[1][1]=NaN;assert.throws(()=>captureSpatialResponse(changed),/SPATIAL_RESPONSE_NONFINITE/);
const badGrid=structuredClone(set);badGrid.memberResults.M.xs=[0,.5,2];assert.equal(compareSpatialResponse(a,captureSpatialResponse(badGrid)).compatible,false);
console.log('PASS spatial comparison detects internal deflection with zero nodal motion, topology and nonfinite data');
