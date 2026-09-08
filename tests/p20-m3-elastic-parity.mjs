import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as facade from '../src/solver/linear3d.js';
import * as publicApi from '../src/index.js';
import {analyzeModel} from '../src/compute/product/elasticAnalysisWorkflow.js';
const baseline=JSON.parse(readFileSync('verification/evidence/phase20/m0/public-api.json'));
assert.deepEqual(Object.keys(facade).sort(),baseline.linear3d);assert.deepEqual(Object.keys(publicApi).sort(),baseline.index);
assert.equal(facade.analyzeModel,analyzeModel);
const contracts=JSON.parse(readFileSync('verification/specs/phase20/contracts.json'));
const excluded=new Set(contracts.numericalComparison.executionOnlyKeys);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!excluded.has(k)).map(([k,v])=>[k,canonical(v)]));return value;}
function difference(a,b,path='$'){if(typeof a!==typeof b)return path;if(a&&typeof a==='object'){const ak=Object.keys(a).sort(),bk=Object.keys(b||{}).sort();if(JSON.stringify(ak)!==JSON.stringify(bk))return path+'.keys';for(const k of ak){const d=difference(a[k],b[k],path+'.'+k);if(d)return d;}return null;}return Object.is(a,b)?null:path;}
const fixtures=JSON.parse(readFileSync('verification/evidence/phase20/m0/fixtures.json'));
const expected=JSON.parse(readFileSync('verification/evidence/phase20/m0/elastic-results.json'));
for(const fixture of fixtures){const result=facade.analyzeModel(fixture.model);assert.equal(typeof result?.then,'undefined');const actual=JSON.parse(JSON.stringify(result));const d=difference(canonical(actual),canonical(expected.find(r=>r.name===fixture.name).result));assert.equal(d,null,fixture.name+' differs at '+d);console.log('PASS exact elastic baseline '+fixture.name);}
console.log('PASS P20 public exports, sync API, all deterministic numerical and qualification fields');
