import {kdsRectangularTies} from '../src/design/rc/kdsConfinement.js';
import assert from 'node:assert/strict';
import {crossTieSupports} from '../src/design/rc/crossTieSupports.js';
const bars=[[-.14,-.14],[-.14,0],[-.14,.14],[0,.14],[.14,.14],[.14,0],[.14,-.14],[0,-.14]].map(([y,z])=>({y,z,diameter:.02}));
const x={perimeterPositions:Array.from({length:8},(_,i)=>i*.14),perimeterLength:1.12,bars,cornerIndices:[0,2,4,6],orderedIndices:[0,1,2,3,4,5,6,7],pairs:['2:6','4:8'],diameter:.01,insideRadius:.02,tail:.06};
assert.equal(crossTieSupports(x).status,'OK');assert.equal(crossTieSupports({...x,pairs:[]}).status,'NG');
assert.equal(crossTieSupports({...x,pairs:['2:6','6:2']}).status,'NOT_CHECKED');assert.equal(crossTieSupports({...x,tail:.05}).status,'NG');
assert.equal(crossTieSupports({...x,pairs:['2:99']}).status,'NOT_CHECKED');
console.log('PASS explicit cross-tie topology, insufficient support, duplicate pairs and hook tail');

const c=.13+.01/Math.sqrt(2),actualBars=bars.map(b=>({...b,y:Math.abs(b.y)>.1&&Math.abs(b.z)>.1?Math.sign(b.y)*c:b.y,z:Math.abs(b.y)>.1&&Math.abs(b.z)>.1?Math.sign(b.z)*c:b.z}));
const column={B:.4,H:.4,cover:.04,bars:actualBars,diameter:.01,spacing:.15,firstStart:.075,firstEnd:.075,anchorBolts:false,closure:'standard-135',tail:.06,insideRadius:.02,system:'ordinary-tied-column',crossTieBarPairs:x.pairs};
assert.equal(kdsRectangularTies(column).status,'OK');assert.equal(kdsRectangularTies({...column,crossTieBarPairs:['2:6']}).status,'NG');assert.equal(kdsRectangularTies(column).supports.supportedBarIndices.length,8);
console.log('PASS full perimeter-column rule routing and missing cross tie failure');

assert.equal(crossTieSupports({...x,diameter:.02,insideRadius:.04,tail:.12}).status,'NG');
assert.equal(crossTieSupports({...x,orderedIndices:[1,0,2,3,4,5,6,7]}).status,'NOT_CHECKED');

assert.equal(kdsRectangularTies({...column,preparedCrossTies:{status:'OK',contactCoverage:{status:'NOT_CHECKED'}}}).status,'NOT_CHECKED');
assert.equal(kdsRectangularTies({...column,preparedCrossTies:{status:'NG',contactCoverage:{status:'NOT_CHECKED'}}}).status,'NG');

const mixed=kdsRectangularTies({...column,spacing:.5,preparedCrossTies:{status:'NOT_CHECKED',reason:'SYNTHETIC_MISSING_CAGE'}});
assert.equal(mixed.status,'NG');assert.equal(mixed.incomplete,true);assert.ok(mixed.incompleteReasons.includes('SYNTHETIC_MISSING_CAGE'));

const missingPair=kdsRectangularTies({...column,spacing:.5,crossTieBarPairs:['2:99']});assert.equal(missingPair.status,'NG');assert.equal(missingPair.incomplete,true);assert.ok(missingPair.incompleteReasons.includes('CROSS_TIE_PAIR_INDICES_INVALID'));
const missingSupport=kdsRectangularTies({...column,spacing:.5,spatialSupport:{status:'NOT_CHECKED',supportedBarIndices:[]}});assert.equal(missingSupport.status,'NG');assert.equal(missingSupport.incomplete,true);
