import assert from 'node:assert/strict';
import {lineBarContactCoverage} from '../src/design/rc/lineBarContactCoverage.js';
const line={kind:'line',start:[0,-.1,.155],end:[.1,.1,.155]},detail={bars:[{y:0,z:.14,diameter:.02}]};
const prepared={stirrupDistribution:{status:'OK',explicitEnds:true,count:4,first:.2,last:.8,spacing:.2},bars:[{cutLength:1,points:[[0,0],[1,0]],segmentErrors:[0]}]};
const r=lineBarContactCoverage(detail,prepared,{lines:[line],diameter:.01});
assert.equal(r.status,'OK');assert.deepEqual(r.checks[0].contactedBarIndices,[1]);assert.ok(Math.abs(r.checks[0].candidates[0].contacts[0].localX-.05)<1e-12);
const short=structuredClone(prepared);short.bars[0].points[1][0]=.83;const missing=lineBarContactCoverage(detail,short,{lines:[line],diameter:.01});assert.equal(missing.checks[0].candidates[0].coverage.firstUncoveredIndex,3);
const outside=lineBarContactCoverage({bars:[{y:0,z:.17,diameter:.02}]},prepared,{lines:[line],diameter:.01});assert.deepEqual(outside.checks[0].contactedBarIndices,[]);
const absent=lineBarContactCoverage(detail,{...prepared,bars:[{cutLength:null}]},{lines:[line],diameter:.01});assert.equal(absent.checks[0].candidates[0].coverage.coveredCount,0);
const huge=structuredClone(prepared);huge.stirrupDistribution={status:'OK',explicitEnds:true,count:1000000,first:.2,last:999999.2,spacing:1};huge.bars[0].points[1][0]=1000000;assert.equal(lineBarContactCoverage(detail,huge,{lines:[line],diameter:.01}).checks[0].candidates[0].coverage.coveredCount,1000000);
console.log('PASS spatial straight-face contact, actual axial offset, exterior rejection and bounded station coverage');

assert.equal(lineBarContactCoverage({bars:[]},prepared,{lines:[line],diameter:.01}).status,'NOT_CHECKED');
assert.equal(lineBarContactCoverage(detail,prepared,{lines:[null],diameter:.01}).status,'NOT_CHECKED');
