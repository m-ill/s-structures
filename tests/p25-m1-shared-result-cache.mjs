import {PREPARED_DETAIL_VERSION} from '../src/design/rc/preparedDetailGeometry.js';
import assert from 'node:assert/strict';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {createPracticalResultCache,practicalResultCacheKey} from '../src/compute/product/practicalResultCache.js';
import {PRACTICAL_EVALUATION_VERSION} from '../src/design/evaluation/practicalEvaluation.js';
const budget=createResourceBudget(),cache=createPracticalResultCache(budget),sets=[{source:{analysisRunId:'A',comboId:'U'},resultHash:'hash',method:'off'}];
const key=practicalResultCacheKey('input',sets),result={evaluatorVersion:PRACTICAL_EVALUATION_VERSION,preparedDetails:{version:PREPARED_DETAIL_VERSION},summary:{counts:{NG:1}}};
assert.throws(()=>practicalResultCacheKey('input',[]));assert.equal(cache.get(key),null);assert.equal(cache.put(key,result),true);result.summary.counts.NG=100;assert.equal(cache.get(key).summary.counts.NG,1);
assert.throws(()=>{cache.get(key).summary.counts.NG=5;});
assert.notEqual(key,practicalResultCacheKey('changed',sets));assert.notEqual(key,practicalResultCacheKey('input',[{...sets[0],resultHash:'changed'}]));assert.notEqual(key,practicalResultCacheKey('input',sets,{phi:.8}));
for(let i=0;i<8;i++)cache.put('key'+i,result);assert.equal(cache.snapshot().entries,4);cache.clear();assert.equal(budget.snapshot().totalBytes,0);
console.log('PASS bounded immutable shared result cache, identity separation, eviction and release');

cache.put('first',result);cache.put('second',result);const before=budget.snapshot().totalBytes;assert.equal(cache.evict('first'),true);assert.equal(cache.get('first'),null);assert.ok(cache.get('second'));assert.ok(budget.snapshot().totalBytes<before);assert.equal(cache.evict('first'),false);cache.clear();assert.equal(budget.snapshot().totalBytes,0);console.log('PASS single-entry release preserves unrelated cached evaluation');
