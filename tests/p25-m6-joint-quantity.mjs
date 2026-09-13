import assert from 'node:assert/strict';
import {jointHoopQuantity} from '../src/design/connection/jointHoopQuantity.js';
const record={jointWidth:.4,jointDepth:.6,reinforcement:{diameter:.01,area:.00008}};
const q=jointHoopQuantity(record,{hoops:{count:10}});
assert.equal(q.status,'OK');assert.equal(q.steelVolume,.0016);assert.equal(q.area,.00008);assert.equal(q.quantityComplete,false);assert.equal(q.cutLength,null);
assert.equal(jointHoopQuantity({...record,reinforcement:{diameter:.01,area:NaN}},{hoops:{count:10}}).status,'NOT_CHECKED');
assert.equal(jointHoopQuantity(record,{hoops:{count:0}}).status,'NOT_CHECKED');
assert.equal(jointHoopQuantity(record,{hoops:{count:1000000}}).steelVolume,160);
console.log('PASS nominal joint hoop area, bounded count estimate and explicit incomplete full shape');
