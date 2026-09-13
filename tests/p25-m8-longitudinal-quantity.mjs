import assert from 'node:assert/strict';
import {longitudinalReinforcementQuantity} from '../src/design/rc/longitudinalReinforcementQuantity.js';
const detail={bars:[{diameter:.02,area:.0003},{diameter:.025,area:.0005}]};
const prepared={bars:[{cutLength:3.92},{cutLength:null,splicePath:{status:'OK',pieces:[{mark:'P1',cutLength:3.46},{mark:'P2',cutLength:3.46}],totalCutLength:6.92}}]};
const q=longitudinalReinforcementQuantity(detail,prepared,{spliceBarIndices:[2]});
assert.equal(q.status,'OK');assert.equal(q.pieceCount,3);assert.ok(Math.abs(q.volume-(3.92*.0003+6.92*.0005))<1e-15);
assert.equal(q.rows[1].geometricLength,6.92);assert.equal(q.fabricationApproved,false);
const invalid=structuredClone(prepared);invalid.bars[1].splicePath.totalCutLength=8;
assert.equal(longitudinalReinforcementQuantity(detail,invalid,{spliceBarIndices:[2]}).volume,null);
assert.equal(longitudinalReinforcementQuantity(detail,prepared,{spliceBarIndices:[1,2]}).volume,null);
assert.equal(longitudinalReinforcementQuantity({},{}).status,'NOT_CHECKED');
console.log('PASS longitudinal end lengths and lap pieces counted once; missing and inconsistent pieces remain incomplete');

const productDetail=structuredClone(detail);productDetail.bars[0].unitMassKgPerM=2.47;productDetail.bars[1].unitMassKgPerM=3.98;
const mass=longitudinalReinforcementQuantity(productDetail,prepared,{spliceBarIndices:[2]});
assert.equal(mass.rows[1].massQuantity.status,'OK');
assert.ok(Math.abs(mass.rows[1].massQuantity.totalMassKg-6.92*3.98)<1e-12,'lap pieces counted once in nominal mass');
assert.equal(mass.rows[1].massQuantity.pieceCount,2);
assert.equal(mass.rows[1].massQuantity.fabricationApproved,false);
assert.equal(q.rows[0].massQuantity.status,'NOT_CHECKED','missing catalogue unit mass must not be inferred from geometric density');

import {reinforcementMassQuantity} from '../src/design/rc/reinforcementMassQuantity.js';
assert.equal(reinforcementMassQuantity(1,[{length:2,count:1},{length:3,count:1}]).pieceMassKg,null);
assert.equal(reinforcementMassQuantity(1,[{length:2,count:1},{length:3,count:1}]).totalMassKg,5);
assert.equal(reinforcementMassQuantity(Number.MAX_VALUE,[{length:2,count:1}]).reason,'REINFORCEMENT_MASS_OVERFLOW');
assert.equal(reinforcementMassQuantity(1,[{length:2,count:1.5}]).reason,'PREPARED_PIECE_LENGTHS_REQUIRED');
