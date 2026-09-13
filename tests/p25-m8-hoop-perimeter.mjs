import assert from 'node:assert/strict';
import {outerHoopPerimeter} from '../src/design/rc/outerHoopPerimeter.js';
import {prepareDetailGeometry} from '../src/design/rc/preparedDetailGeometry.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {createModel} from '../src/core/model.js';
const input={B:.3,H:.6,cover:.04,diameter:.01,insideRadius:.025};
const p=outerHoopPerimeter(input);
assert.equal(p.perimeterPath3d.status,'OK');assert.ok(p.perimeterPath3d.checks.every(c=>c.status==='OK'));assert.equal(p.centerlineLength,p.perimeterPath3d.centerlineLength);assert.equal(p.perimeterPath3d.primitives.length,8);
assert.equal(p.status,'OK');assert.equal(p.segmentErrors.length,p.points.length-1);
assert.deepEqual(p.points[0],p.points.at(-1));
assert.ok(Math.abs(p.centerlineLength-(4*(.225+.075)+2*Math.PI*.03))<1e-12);
assert.equal(p.cutLength,null);assert.equal(p.fabricationApproved,false);
for(const [y,z] of p.points){assert.ok(Math.abs(y)<=.255+1e-12);assert.ok(Math.abs(z)<=.105+1e-12);}
assert.equal(outerHoopPerimeter({...input,insideRadius:undefined}).status,'NOT_CHECKED');
assert.equal(outerHoopPerimeter({...input,insideRadius:.2}).status,'NG');
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',n1:'A',n2:'B',secId:'rc3060'}];
m.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,tieBendInsideRadius:.025,stirrups:{diameter:.01,spacing:.2,legs:2},tieFirstStart:.1,tieFirstEnd:.1,bars:[{y:0,z:0,area:.0002,diameter:.016}]}]};
const prepared=prepareDetailGeometry(m);const {actualPathAssembly,...perimeter}=prepared.reinforcement['R@1'].outerHoop;assert.deepEqual(perimeter,p);
const drawing=buildDetailDrawings({id:'test',inputHash:'a'.repeat(64),model:m,sets:[],checks:[],preparedDetails:prepared});
const q=drawing.quantities.find(q=>q.kind==='stirrup');assert.deepEqual(q.perimeterGeometry,prepared.reinforcement['R@1'].outerHoop);assert.equal(q.cutLength,null);
const scale=Math.min(190/.3,245/.6),lines=drawing.pages[0].commands.filter(c=>c.kind==='line');
for(let i=1;i<p.points.length;i++){
 const [a,b]=[p.points[i-1],p.points[i]];
 assert.ok(lines.some(l=>Math.abs(l.x1-(55+(a[1]+.15)*scale))<1e-9&&Math.abs(l.y1-(182+(.3-a[0])*scale))<1e-9&&Math.abs(l.x2-(55+(b[1]+.15)*scale))<1e-9&&Math.abs(l.y2-(182+(.3-b[0])*scale))<1e-9));
}
console.log('PASS shared rounded hoop perimeter, analytical length, prepared/drawing identity and closure gate');
