import {openPerimeterActions} from '../src/design/foundation/rectangularFootingPunching.js';
import assert from 'node:assert/strict';
import {footingCriticalPerimeter,perimeterStress} from '../src/design/foundation/footingCriticalPerimeter.js';
const f={B:2,L:2,columnWidth:.4,columnDepth:.4};
const interior=footingCriticalPerimeter(f,.2);assert.equal(interior.columnPosition,'interior');assert.ok(Math.abs(interior.length-2.4)<1e-12);
const edge=footingCriticalPerimeter({...f,columnOffsetX:.8},.2);assert.equal(edge.columnPosition,'edge');assert.ok(Math.abs(edge.length-1.6)<1e-12);assert.ok(Math.abs(edge.centroid.x-.65625)<1e-12);assert.ok(Math.abs(edge.centroid.y)<1e-12);
assert.equal(edge.segments.length,3);assert.equal(edge.segments.some(s=>s.axis==='B'&&s.side===1),false);
const corner=footingCriticalPerimeter({...f,columnOffsetX:.8,columnOffsetY:.8},.2);assert.equal(corner.columnPosition,'corner');assert.ok(Math.abs(corner.length-1)<1e-12);assert.ok(Math.abs(corner.centroid.x-.625)<1e-12);assert.ok(Math.abs(corner.centroid.y-.625)<1e-12);
// An open path can be shorter even while all four d/2 lines fit inside the slab.
assert.equal(footingCriticalPerimeter({...f,columnOffsetX:.65},.2).columnPosition,'edge');
for(const geometry of [interior,edge,corner]){
 const r=perimeterStress(geometry,{V:60,Mx:3,My:-2,designStress:2000});assert.ok(['OK','NG'].includes(r.status));
 assert.ok(Math.abs(r.recovered.V-60)<1e-9);assert.ok(Math.abs(r.recovered.Mx-3)<1e-9);assert.ok(Math.abs(r.recovered.My+2)<1e-9);
 const mirror=footingCriticalPerimeter({...f,columnOffsetX:-(geometry.input.columnOffsetX??0),columnOffsetY:-(geometry.input.columnOffsetY??0)},.2);
 const mirrored=perimeterStress(mirror,{V:60,Mx:-3,My:2,designStress:2000});assert.ok(Math.abs(r.ratio-mirrored.ratio)<1e-10);
}
assert.equal(footingCriticalPerimeter({...f,columnOffsetX:1},.2).reason,'COLUMN_OUTSIDE_FOOTING');
console.log('PASS minimum rectangular interior/edge/corner perimeter, free-edge exclusion, line centroid and coupled biaxial equilibrium');

const contact={polygon:[[-1,-1],[1,-1],[1,1],[-1,1]],pressurePlane:[60,0,0]},ledger={columnN:200,totalMx:0,totalMy:-160,uniformDownwardPressure:10};
const action=openPerimeterActions(edge,{contact,ledger});assert.ok(Math.abs(action.V-185)<1e-9);assert.ok(Math.abs(action.Mx)<1e-9);assert.ok(Math.abs(action.My+27.34375)<1e-9);

assert.ok(Math.abs(corner.Ix-1/192)<1e-12);assert.ok(Math.abs(corner.Iy-1/192)<1e-12);assert.ok(Math.abs(corner.Ixy+.003125)<1e-12);
assert.ok(Math.abs(perimeterStress(corner,{V:60,Mx:3,My:-2,designStress:2000}).demandStress-630)<1e-9);

const {evaluateRectangularFootingPunching}=await import('../src/design/foundation/rectangularFootingPunching.js');
const {createModel}=await import('../src/core/model.js');
const footing={...f,thickness:.5,cover:.05,materialId:'concrete@1',punchingMomentMethod:'conservative-perimeter-shear',reinforcement:{materialId:'steel@1',bottomB:{diameter:.016,spacing:.15},bottomL:{diameter:.016,spacing:.15}}};
const result=evaluateRectangularFootingPunching(createModel(),footing,{d:.434,dB:.442,dL:.426,ledger:{ok:true,columnN:100,totalMx:0,totalMy:0,uniformDownwardPressure:0},contact:{ok:true,polygon:[[-1,-1],[1,-1],[1,1],[-1,1]],pressurePlane:[25,0,0]}});
assert.equal(result.status,'NG');assert.ok(result.shearRatio<1);assert.ok(result.ratio>1);assert.equal(result.governingCriterion,'reinforcement-extension');
console.log('PASS rectangular perimeter path reports extension-governed NG utilization');
