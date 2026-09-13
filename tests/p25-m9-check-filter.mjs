import assert from 'node:assert/strict';
import {filterPracticalChecks} from '../src/compute/product/practicalCheckFilter.js';
const checks=[{id:'1',status:'NG',entityId:'A',comboId:'U',checkId:'strength',reason:'LIMIT'},{id:'2',status:'NOT_CHECKED',entityId:'A',comboId:'S',checkId:'service',reason:'MISSING'},{id:'3',status:'NG',entityId:'B',comboId:'U',checkId:'strength',reason:'LIMIT'}];
const before=structuredClone(checks);
assert.equal(filterPracticalChecks(checks),checks);
assert.deepEqual(filterPracticalChecks(checks,{status:'NG',entityId:'A',comboId:'U',checkId:'strength',reason:'LIMIT'}),[checks[0]]);
for(const bad of [null,[],42,{unknown:'x'},{status:'PASS'},{entityId:''},{entityId:'a'.repeat(201)},{comboId:1}])assert.throws(()=>filterPracticalChecks(checks,bad),/CHECK_FILTER_INVALID/);
assert.deepEqual(checks,before);
console.log('PASS exact compound filters, invalid filter rejection and source immutability');
