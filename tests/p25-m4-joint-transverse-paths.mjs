import assert from 'node:assert/strict';
import {jointTransverseLongitudinalAssembly} from '../src/design/connection/jointTransverseLongitudinalAssembly.js';
const prepared={hoops:{height:1},stirrupDistribution:{status:'OK',explicitEnds:true,count:3,first:.1,last:.85,spacing:.4},outerHoop:{closureGeometry:{diameter:.02,path:{status:'OK',points:[[0,-.5,0],[0,.5,0]],segmentErrors:[0]}}}};
const congestion={pathCoordinates:'column-local-y,z,x; metres from joint node',barPaths:[{id:'beam',diameter:.02,sagitta:0,segments:[[[0,-.3,-.4],[0,.3,-.4]]]}]};
const collision=jointTransverseLongitudinalAssembly(prepared,congestion);
assert.equal(collision.status,'NG');assert.equal(collision.checks[0].barId,'beam');assert.ok(collision.checks[0].clearanceUpperBound<0);
const clear=jointTransverseLongitudinalAssembly(prepared,{...congestion,barPaths:[{...congestion.barPaths[0],segments:[[[0,-.3,-.2],[0,.3,-.2]]]}]});assert.equal(clear.status,'OK');
const final=jointTransverseLongitudinalAssembly(prepared,{...congestion,barPaths:[{...congestion.barPaths[0],segments:[[[0,-.3,.35],[0,.3,.35]]]}]});assert.equal(final.status,'NG','shortened final hoop station is checked');
assert.equal(jointTransverseLongitudinalAssembly(prepared,{...congestion,pathCoordinates:'global'}).status,'NOT_CHECKED');
assert.equal(jointTransverseLongitudinalAssembly(prepared,{...congestion,barPaths:[{...congestion.barPaths[0],sagitta:NaN}]}).status,'NOT_CHECKED');
const contact={...congestion.barPaths[0],sagitta:.001,segments:[[[0,-.3,-.38],[0,.3,-.38]]]};
assert.equal(jointTransverseLongitudinalAssembly(prepared,{...congestion,barPaths:[contact]}).status,'NOT_CHECKED','legacy whole-path error remains conservative');
assert.equal(jointTransverseLongitudinalAssembly(prepared,{...congestion,barPaths:[{...contact,segmentErrors:[0]}]}).status,'OK','straight segment contact has no arc chord error');
for(const segmentErrors of [[],[-1],[NaN]])assert.equal(jointTransverseLongitudinalAssembly(prepared,{...congestion,barPaths:[{...contact,segmentErrors}]}).status,'NOT_CHECKED');
console.log('PASS physical hoop/bar collision in transformed joint frame, clear separation and final station');

assert.equal(final.checks[0].witness.stationIndex,2);assert.equal(final.checks[0].witness.stationPlane,.85);
const mixed=jointTransverseLongitudinalAssembly(prepared,{...congestion,barPaths:[...congestion.barPaths,{...congestion.barPaths[0],id:'invalid',sagitta:NaN}]});assert.equal(mixed.status,'NG');assert.equal(mixed.incomplete,true);assert.ok(mixed.incompleteReasons.includes('JOINT_LONGITUDINAL_PATH_INVALID'));
