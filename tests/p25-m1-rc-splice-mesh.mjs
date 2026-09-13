import {prepareRcModelNetwork} from '../src/compute/product/rcModelNetwork.js';
import {prepareRcSegmentDisplacements} from '../src/compute/product/rcSegmentDisplacementRecovery.js';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {prepareRcSpliceMemberMesh} from '../src/compute/product/rcSpliceMemberMesh.js';
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
const bars=[[-.2,-.08],[-.2,.08],[.2,-.08],[.2,.08]].map(([y,z])=>({y,z,area:Math.PI*.02**2/4,diameter:.02}));
m.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,bars,cover:.04,barMaterialId:'steel@1'}],splices:[{id:'SP',version:1,memberId:'AB',reinforcementId:'R@1',barIndices:['1'],start:.25,end:.65,offsetY:.02,offsetZ:0,spliceType:'tension-B',continuationSide:'offset-toward-end',transferStiffness:80000,transferElasticSlipLimit:.001,transferReference:'synthetic'}]};
const original=structuredClone(m),mesh=prepareRcSpliceMemberMesh(m,{memberId:'AB'});
assert.deepEqual(mesh.nodes.map(n=>n.x),[0,1,2.6,4]);assert.deepEqual(mesh.elements.map(e=>e.nodes),[[0,1],[1,2],[2,3]]);assert.deepEqual(mesh.elements.map(e=>e.laps.length),[0,1,0]);
assert.equal(mesh.elements[0].bars[0].y,-.2);assert.ok(Math.abs(mesh.elements[2].bars[0].y+.18)<1e-12);assert.equal(mesh.elements[1].laps[0].barIndex,0);
assert.ok(Math.abs(mesh.physicalSteelVolume-bars[0].area*(4*4+1.6))<1e-12);
assert.equal(mesh.originalNodeIds[0],'A');assert.equal(mesh.originalNodeIds[3],'B');assert.equal(mesh.sources[1].spliceIds[0],'SP');assert.deepEqual(m,original);
const reversed=structuredClone(m);reversed.designDetails.splices[0].continuationSide='offset-toward-start';const r=prepareRcSpliceMemberMesh(reversed,{memberId:'AB'});assert.ok(Math.abs(r.elements[0].bars[0].y+.18)<1e-12);assert.equal(r.elements[2].bars[0].y,-.2);
const broken=structuredClone(m);broken.designDetails.splices.push({...broken.designDetails.splices[0],id:'SP2',start:.7,end:.9});assert.throws(()=>prepareRcSpliceMemberMesh(broken,{memberId:'AB'}),{code:'SPLICE_PIECE_LANE_DISCONTINUITY'});
const partial=structuredClone(m);partial.designDetails.reinforcement[0].end=.9;assert.throws(()=>prepareRcSpliceMemberMesh(partial,{memberId:'AB'}),{code:'RC_MESH_REINFORCEMENT_COVERAGE'});
console.log('PASS source member mesh: splice boundaries, directional piece continuity, source mapping and immutable input');

const loads=Array(24).fill(0);loads[18]=100;
const solved=solveRcLapNetwork({...mesh,fixedDofs:Array.from({length:24},(_,i)=>i).filter(i=>![6,12,18].includes(i)),loads});
assert.equal(solved.ok,true,JSON.stringify(solved));
const EA=mesh.elements[0].Es*bars[0].area*1000,exact=solveElasticLapTransfer({length:1.6,EA1:EA,EA2:EA,transferStiffness:80000,force:1});
const expected=100*(2.4/(4*EA)+1/(3*EA/1.6+1/exact.extension));
const refined=solveRcLapNetwork({...prepareRcSpliceMemberMesh(m,{memberId:'AB',subdivisions:32}),fixedDofs:Array.from({length:24},(_,i)=>i).filter(i=>![6,12,18].includes(i)),loads});
assert.equal(refined.ok,true);const coarseError=Math.abs(solved.displacements[18]-expected),fineError=Math.abs(refined.displacements[18]-expected);
assert.ok(fineError<coarseError*.3);assert.ok(fineError<1e-7);
console.log('PASS prepared source mesh directly assembles with exact serial axial compliance');

const finer=prepareRcSpliceMemberMesh(m,{memberId:'AB',frameDivisions:2});
assert.equal(finer.elements.length,6);
assert.deepEqual(finer.sources.filter(s=>s.spliceIds.length).map(s=>[s.startX,s.endX]),[[1,1.8],[1.8,2.6]]);
assert.ok(Math.abs(finer.physicalSteelVolume-mesh.physicalSteelVolume)<1e-12);
assert.equal(finer.frameRefinement.lapIntervalsRefined,true);
assert.equal(finer.fixedSlipIds.length,2);
assert.deepEqual(finer.elements[2].laps[0].slipIds.slice(2),finer.elements[3].laps[0].slipIds.slice(0,2));
assert.equal(finer.frameRefinement.requestedDivisions,2);
assert.throws(()=>prepareRcSpliceMemberMesh(m,{memberId:'AB',frameDivisions:0}),{code:'RC_MESH_INPUT_INVALID'});
console.log('PASS frame subdivision preserves shared lap continuity, piece volume and provenance');

// Compressed, uncracked uniform RC cantilever: independent quartic UDL solution.
const uniform=structuredClone(m);uniform.designDetails.splices=[];uniform.nodes[0].support='fixed';
uniform.analysisSettings.shearDeformation=false;uniform.analysisSettings.includeSelfWeight=false;
uniform.loadCombinations=[{id:'S',enabled:true,factors:{D:1}}];
uniform.loads=[{id:'N',case:'D',type:'nodal',node:'B',dir:'-x',P:100},{id:'Q',case:'D',type:'udl',member:'AB',dir:'-z',w:.01}];
const errors=[];
for(const frameDivisions of [1,2,4]){
 const n=prepareRcModelNetwork(uniform,{comboId:'S',frameDivisions}),sol=solveRcLapNetwork(n);assert.equal(sol.ok,true,JSON.stringify(sol));
 const e=n.elements[0],EI=1000*(e.Ec*e.B*e.H**3/12+(e.Es-e.Ec)*e.bars.reduce((a,b)=>a+b.area*b.y*b.y,0));
 const x=1,exact=-.01*x*x*(6*16-4*4*x+x*x)/(24*EI);
 const i=n.sources.findIndex(s=>s.startX<=x&&s.endX>=x),source=n.sources[i];
 const field=prepareRcSegmentDisplacements({source,localDisplacements:sol.elementResults[i].localDisplacements,samples:17});
 const at=field.stations.find(s=>Math.abs(s.x-x)<1e-12);assert.ok(at);errors.push(Math.abs(at.displacements.v-exact));
 assert.ok(Math.abs(sol.reactions[2]-.04)<1e-6);
}
assert.ok(errors[1]<errors[0]*.2,JSON.stringify(errors));assert.ok(errors[2]<1e-12,JSON.stringify(errors));
console.log('PASS actual frame subdivision reduces UDL interior displacement error against quartic solution',errors);

const staggered=structuredClone(m);staggered.designDetails.splices.push({...staggered.designDetails.splices[0],id:'SP2',barIndices:['4'],start:.4,end:.85,offsetY:-.02,continuationSide:'offset-toward-start'});
const staggeredMesh=prepareRcSpliceMemberMesh(staggered,{memberId:'AB'});
assert.deepEqual(staggeredMesh.elements.map(e=>e.laps.length),[0,1,2,1,0]);
assert.equal(staggeredMesh.fixedSlipIds.length,4);
assert.equal(staggeredMesh.frameRefinement.lapIntervalsRefined,true);
assert.ok(Math.abs(staggeredMesh.physicalSteelVolume-bars[0].area*(16+1.6+1.8))<1e-12);
const f=Array(staggeredMesh.nodes.length*6).fill(0),last=f.length-6;f[last]=100;
const solvedStaggered=solveRcLapNetwork({...staggeredMesh,loads:f,fixedDofs:Array.from({length:f.length},(_,i)=>i).filter(i=>i===0||i%6!==0)});
assert.equal(solvedStaggered.ok,true,JSON.stringify(solvedStaggered));assert.equal(solvedStaggered.slipResults.length,12);
assert.ok(solvedStaggered.slipResults.filter(s=>!s.fixed).every(s=>Math.abs(s.reaction)<1e-6));assert.ok(Math.abs(solvedStaggered.reactions[0]+100)<1e-6);
console.log('PASS staggered independent bar laps: overlap mesh, four true attachments, physical volume and shared-slip equilibrium');

const duplicateLane=structuredClone(staggered);duplicateLane.designDetails.splices[1].barIndices=['1'];
assert.throws(()=>prepareRcSpliceMemberMesh(duplicateLane,{memberId:'AB'}),{code:'OVERLAPPING_SPLICE_OBJECTS'});
const reordered=structuredClone(staggered);reordered.designDetails.splices.reverse();const reorderedMesh=prepareRcSpliceMemberMesh(reordered,{memberId:'AB'});
const reorderedSolved=solveRcLapNetwork({...reorderedMesh,loads:f,fixedDofs:Array.from({length:f.length},(_,i)=>i).filter(i=>i===0||i%6!==0)});
assert.equal(reorderedSolved.ok,true);assert.ok(Math.abs(reorderedSolved.displacements[last]-solvedStaggered.displacements[last])<1e-10);
console.log('PASS staggered record ordering invariance and same-bar overlapping splice rejection');

for(const divisions of [1,2,4]){
 const allocated=prepareRcSpliceMemberMesh(m,{memberId:'AB',subdivisions:32,frameDivisions:divisions});
 assert.equal(allocated.elements.reduce((n,e)=>n+e.subdivisions,0),96);
 assert.ok(allocated.elements.every(e=>e.subdivisions===32/divisions));
}
console.log('PASS physical integration density remains constant under frame subdivision without increasing work budget');
