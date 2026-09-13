import assert from 'node:assert/strict';
import {foundationDevelopmentProposal} from '../src/compute/product/foundationDevelopmentProposal.js';
const command={nodeId:'A',columnEmbedmentLength:.3,columnDevelopmentAbove:.3,thickness:.5};
const check={id:'C',entityId:'foundation:A',checkId:'foundation-column-transfer',requiredBelow:.345,requiredAbove:.31,criteria:[{id:'embedment-envelope',capacity:.44},{id:'column-region-envelope',capacity:3}]};
let p=foundationDevelopmentProposal(command,[check]);assert.equal(p.ok,true);assert.ok(Math.abs(p.edits[0].columnEmbedmentLength-.35)<1e-12);assert.ok(Math.abs(p.edits[0].columnDevelopmentAbove-.325)<1e-12);assert.equal(p.edits[0].thickness,undefined);assert.deepEqual(p.basisCheckIds,['C']);
p=foundationDevelopmentProposal(command,[{...check,requiredBelow:.8}]);assert.ok(p.edits[0].thickness>=.86);
assert.equal(foundationDevelopmentProposal(command,[{...check,requiredAbove:4}]).ok,false);
assert.equal(foundationDevelopmentProposal(command,[{...check,requiredBelow:NaN}]).ok,false);
assert.equal(foundationDevelopmentProposal(command,[{...check,entityId:'foundation:B'}]).ok,false);
assert.equal(foundationDevelopmentProposal({...command,columnEmbedmentLength:.4,columnDevelopmentAbove:.4},[check]).ok,false);
console.log('PASS recorded development demands generate bounded length and thickness proposals');

assert.equal(foundationDevelopmentProposal({...command,columnEmbedmentLength:.43,columnDevelopmentAbove:.43},[check]).ok,false);

const wrapped={id:'T',entityId:'foundation:A',checkId:'foundation-column-transfer',normalTransfer:{normalTransfer:check}};
assert.equal(foundationDevelopmentProposal(command,[wrapped]).ok,true,'nested torsion and bending results retain development requirements');

assert.equal(foundationDevelopmentProposal(command,[wrapped]).requirementPaths[0].path,'normalTransfer.normalTransfer');
const cycle={...wrapped};cycle.normalTransfer=cycle;
assert.equal(foundationDevelopmentProposal(command,[cycle]).ok,false);
const tooDeep={...wrapped,normalTransfer:{normalTransfer:{normalTransfer:{normalTransfer:check}}}};
assert.equal(foundationDevelopmentProposal(command,[tooDeep]).ok,false);
