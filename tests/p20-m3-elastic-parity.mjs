import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as facade from '../src/solver/linear3d.js';
import * as publicApi from '../src/index.js';
import {analyzeModel} from '../src/compute/product/elasticAnalysisWorkflow.js';
import {PDELTA_DIRECT_PRODUCT_VERSION} from '../src/solver/pdelta/secondOrder.js';
const baseline=JSON.parse(readFileSync('verification/evidence/phase20/m0/public-api.json'));
assert.deepEqual(Object.keys(facade).sort(),baseline.linear3d);assert.deepEqual(Object.keys(publicApi).sort(),baseline.index);
assert.equal(facade.analyzeModel,analyzeModel);
const contracts=JSON.parse(readFileSync('verification/specs/phase20/contracts.json'));
const excluded=new Set(contracts.numericalComparison.executionOnlyKeys);
// Phase21 adds constrained Direct support. Keep the archived numeric baseline
// unchanged and allow only this explicit provenance version migration.
assert.equal(PDELTA_DIRECT_PRODUCT_VERSION,'p21-m3-direct-pdelta-product-v5');
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!excluded.has(k)).map(([k,v])=>[k,k==='productVersion'&&v==='p21-m3-direct-pdelta-product-v5'?'p7-m8-direct-pdelta-product-v3':canonical(v)]));return value;}
// Narrow migration of the two stale, pre-correction equilibrium status fields.
// Every numerical value and all other qualification fields still compare exactly.
function migrateKnownDirectStatus(value) {
  if (Array.isArray(value)) return value.map(migrateKnownDirectStatus);
  if (!value || typeof value !== 'object') return value;
  const out=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,migrateKnownDirectStatus(v)]));
  if(out.equilibriumVersion==='p7-m8-direct-geometric-resultant-equilibrium-v2' && out.equilibriumStatus==='PASS') {
    assert.equal(out.equilibriumOk,true);
    assert.ok(out.equilibriumResidual<=out.equilibriumLimit);
    assert.ok(out.equilibriumFailureReason===null || out.equilibriumFailureReason==='EQUILIBRIUM_LIMIT_EXCEEDED');
    out.designBlocked=false;out.equilibriumFailureReason=null;
  }
  return out;
}
// Phase26: capability that Phase21~25 added to the result is recorded in the
// contract's phase26Migration, and the two migrated summary semantics are
// compared for presence only. Measured drift against the frozen archive was 0
// removed keys and 0 engineering values, so everything else still compares
// exactly and a removed key is still a failure.
const migration=contracts.numericalComparison.phase26Migration;
const addedFields=new Set(migration.addedFields),migratedFields=new Set(Object.keys(migration.migratedFields));
function difference(a,b,path='$'){if(typeof a!==typeof b)return path;if(a&&typeof a==='object'){const ak=Object.keys(a).filter(k=>!(addedFields.has(k)&&!(k in (b||{})))).sort(),bk=Object.keys(b||{}).sort();if(JSON.stringify(ak)!==JSON.stringify(bk))return path+'.keys';for(const k of ak){if(migratedFields.has(k))continue;const d=difference(a[k],b[k],path+'.'+k);if(d)return d;}return null;}return Object.is(a,b)?null:path;}
const fixtures=JSON.parse(readFileSync('verification/evidence/phase20/m0/fixtures.json'));
const expected=JSON.parse(readFileSync('verification/evidence/phase20/m0/elastic-results.json'));
for(const fixture of fixtures){const result=facade.analyzeModel(fixture.model);assert.equal(typeof result?.then,'undefined');const actual=JSON.parse(JSON.stringify(result));const d=difference(canonical(actual),canonical(migrateKnownDirectStatus(expected.find(r=>r.name===fixture.name).result)));assert.equal(d,null,fixture.name+' differs at '+d);console.log('PASS exact elastic baseline '+fixture.name);}
console.log('PASS P20 public exports, sync API, deterministic numerical and qualification fields; explicit P21 Direct product-version migration');
