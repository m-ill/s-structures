import assert from 'node:assert/strict';
import {relatedLongitudinalQuantity} from '../src/compute/product/relatedLongitudinalQuantity.js';
const commands=[{type:'reinforcement-record',id:'R',version:2,memberId:'C'},{type:'reinforcement-record',id:'R2',version:2,memberId:'C2'},{type:'connection-record',id:'J'}];
const prepared={reinforcement:{'R@1':{longitudinalQuantity:{status:'OK',volume:99}},'R@2':{longitudinalQuantity:{status:'OK',volume:.02},bars:[{bodyVolume:.01}]},'R2@2':{longitudinalQuantity:{status:'NOT_CHECKED'},bars:[{bodyVolume:.003},{bodyVolume:.007}]}}};
const before=structuredClone(prepared),out=relatedLongitudinalQuantity(commands,prepared);
assert.equal(out.steelVolume,.03);assert.equal(out.nominalGeometryAvailable,false);assert.equal(out.rows.length,2);
assert.equal(out.rows[0].quantityBasis,'prepared-longitudinal-centerline');assert.equal(out.rows[1].quantityBasis,'longitudinal-body-proxy');
assert.ok(out.rows.every(r=>r.version===2&&r.unit==='m3'&&r.fabricationQuantity===false));assert.deepEqual(prepared,before);
for(const invalid of [undefined,{longitudinalQuantity:{status:'OK',volume:NaN}},{longitudinalQuantity:{status:'OK',volume:-1}},{bars:[]},{bars:[{bodyVolume:Infinity}]}]){
 const next=structuredClone(prepared);next.reinforcement['R@2']=invalid;
 assert.throws(()=>relatedLongitudinalQuantity(commands,next),{code:'RELATED_REINFORCEMENT_QUANTITY_REQUIRED'});
}
console.log('PASS current-version longitudinal quantity, explicit proxy, invalid rejection and immutable preparation');
