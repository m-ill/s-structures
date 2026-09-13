import assert from 'node:assert/strict';
import {spatialHoopLongitudinalPaths} from '../src/design/rc/spatialHoopLongitudinalPaths.js';
const distribution={status:'OK',explicitEnds:true,count:4,first:.2,last:.8,spacing:.2};
const detail={bars:[{y:0,z:0,diameter:.02}]};
const prepared={length:1,stirrupDistribution:distribution,bars:[{cutLength:.9,points:[[.05,0],[.95,0]],segmentErrors:[0]}],outerHoop:{closureGeometry:{diameter:.01,path:{status:'OK',points:[[-.03,-.1,0],[.03,.1,0]],segmentErrors:[0],bounds:{min:[-.03,-.1,0],max:[.03,.1,0]}}}}};
const collision=spatialHoopLongitudinalPaths(detail,prepared);
assert.equal(collision.status,'NG');assert.equal(collision.checks[0].centerlineUpperBound,0);assert.ok(collision.checks[0].witness.station>=0);
const clear=structuredClone(prepared);clear.outerHoop.closureGeometry.path.points=clear.outerHoop.closureGeometry.path.points.map(([x,y,z])=>[x,y,z+.1]);clear.outerHoop.closureGeometry.path.bounds.min[2]=.1;clear.outerHoop.closureGeometry.path.bounds.max[2]=.1;
assert.equal(spatialHoopLongitudinalPaths(detail,clear).status,'OK');
const outside=structuredClone(clear);outside.stirrupDistribution.first=0;outside.stirrupDistribution.last=.6;
assert.equal(spatialHoopLongitudinalPaths(detail,outside).reason,'SPATIAL_HOOP_OUTSIDE_REGION');
const missing=structuredClone(clear);missing.bars=[{cutLength:null}];assert.equal(spatialHoopLongitudinalPaths(detail,missing).status,'NOT_CHECKED');
const bad=structuredClone(clear);bad.outerHoop.closureGeometry.path.segmentErrors=[-1];assert.equal(spatialHoopLongitudinalPaths(detail,bad).status,'NOT_CHECKED');
const million=structuredClone(clear);million.length=1000000;million.stirrupDistribution={status:'OK',explicitEnds:true,count:1000000,first:.1,last:999999.1,spacing:1};million.bars[0]={cutLength:999999.9,points:[[.05,0],[999999.95,0]],segmentErrors:[0]};
const scaled=spatialHoopLongitudinalPaths(detail,million);assert.equal(scaled.status,'OK');assert.equal(scaled.segmentPairs,1);assert.ok(scaled.stationEvaluations<45);
console.log('PASS actual spatial hoop/longitudinal collision, clear geometry, region extent and bounded million-repeat processing');

const {spatialHoopCrossTieAssembly}=await import('../src/design/rc/spatialHoopCrossTieAssembly.js');
const cage=structuredClone(prepared);cage.outerHoop.closureGeometry.path.points=[[0,-.1,0],[0,.1,0]];
cage.crossTies={pieces:[{mark:'CT1',diameter:.01,planeOffset:0,points:[[0,-.1],[0,.1]],segmentErrors:[0]}]};
const ties={...detail,crossTieBarPairs:['1:2']};
assert.equal(spatialHoopCrossTieAssembly(ties,cage).status,'NG');
cage.crossTies.pieces[0].planeOffset=.1;assert.equal(spatialHoopCrossTieAssembly(ties,cage).status,'OK');
cage.crossTies.pieces[0].planeOffset=.195;const neighbor=spatialHoopCrossTieAssembly(ties,cage);assert.equal(neighbor.status,'NG');assert.notEqual(neighbor.checks[0].witness.indices[0],neighbor.checks[0].witness.indices[1]);
assert.equal(spatialHoopCrossTieAssembly(detail,cage).status,'N_A');
console.log('PASS actual spatial hoop/cross-tie collision including adjacent repeated stations');

const {spatialHoopSelfAssembly}=await import('../src/design/rc/spatialHoopSelfAssembly.js');
const {outerHoopClosure}=await import('../src/design/rc/outerHoopClosure.js');
const closed=outerHoopClosure({cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.025,tieHookTail:.06,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:0},{B:.4,H:.4});
const self=spatialHoopSelfAssembly(closed,distribution);
assert.equal(self.status,'NG');assert.equal(self.sameStation.status,'NG');assert.equal(self.repeatedStations.status,'OK');
const separated=outerHoopClosure({cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.025,tieHookTail:.06,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03},{B:.4,H:.4});
const same=spatialHoopSelfAssembly(separated,{status:'OK',explicitEnds:true,count:2,first:.2,last:.2,spacing:.2});
assert.equal(same.repeatedStations.status,'NG');assert.notEqual(...same.repeatedStations.witness.indices);
console.log('PASS spatial hoop non-adjacent self intersection and distinct repeated-station collision');

const corrupt=structuredClone(separated);corrupt.path.segmentErrors[0]=-1;
assert.equal(spatialHoopSelfAssembly(corrupt,distribution).status,'NOT_CHECKED');
