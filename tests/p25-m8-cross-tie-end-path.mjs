import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {prepareDetailGeometry} from '../src/design/rc/preparedDetailGeometry.js';
const model=createModel();model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];model.members=[{id:'AB',n1:'A',n2:'B',secId:'rc3060'}];
const d={id:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,bars:[{y:0,z:-.09,diameter:.02},{y:0,z:.09,diameter:.02},{y:.12,z:0,diameter:.02}].map(b=>({...b,area:Math.PI*b.diameter**2/4})),fabricationShape:'L90',endSetbackStart:.04,endSetbackEnd:.04,bendInsideRadius:.06,hookTailLength:.24,stirrups:{diameter:.01,spacing:.15,legs:2},tieFirstStart:.075,tieFirstEnd:.05,tieClosure:'standard-135',tieBendInsideRadius:.02,tieHookTail:.06,crossTieBarPairs:['1:2'],crossTieHookSides:['left'],crossTiePlaneOffsets:['0']};
model.designDetails={reinforcement:[d]};
let g=prepareDetailGeometry(model).reinforcement['R@1'].crossTies.actualPathAssembly;
assert.equal(g.status,'NG');assert.ok(g.checks.some(c=>c.bar===3&&c.status==='NG'));
d.tieFirstEnd=.2;g=prepareDetailGeometry(model).reinforcement['R@1'].crossTies.actualPathAssembly;
assert.ok(!g.checks.some(c=>c.bar===3&&c.status==='NG'));
assert.ok(g.checks.some(c=>c.status==='NOT_CHECKED')); // Other unavailable end geometries remain explicit.
console.log('PASS prepared L90 tail collision and axial separation, without hiding unavailable paths');
