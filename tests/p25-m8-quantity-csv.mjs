import assert from 'node:assert/strict';
import {encodeQuantityCsv} from '../src/report/phase24/quantityCsv.js';
const q={detailId:'=SUM(1,2)',version:2,kind:'longitudinal',mark:'철근 "A",1',count:1,cutLength:2,area:.0002,massQuantity:{status:'OK',pieceCount:1,totalLength:2,totalMassKg:3.12}};
const drawing={evaluationId:'E',inputHash:'input',detailHash:'detail',preparedGeometryHash:'geometry',rulePackHash:'rules',quantities:[q],checks:[],analysisSources:[]};
const bytes=encodeQuantityCsv(drawing),csv=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes);
assert.ok(csv.startsWith('\ufeff'));
assert.ok(csv.includes(`"'=SUM(1,2)"`),'formula-like identifiers must be inert spreadsheet text');
assert.ok(csv.includes('"철근 ""A"",1"'));
assert.ok(csv.includes('total_mass_kg'));
assert.ok(csv.includes('"3.12"'));
assert.equal(q.detailId,'=SUM(1,2)');
assert.throws(()=>encodeQuantityCsv(drawing,{maxBytes:10}),/QUANTITY_CSV_SIZE_LIMIT/);
console.log('PASS UTF-8 BOM, Korean CSV quoting, formula-safe identifiers, prepared mass and explicit size limit');

const many={...drawing,quantities:Array.from({length:13},(_,i)=>({...q,mark:`B${i+1}`})),checks:[{codeBasis:{applied:[{code:'KDS 14 20 50',clause:'4.1.1',sha256:'source-hash'}]}}]};
const all=new TextDecoder().decode(encodeQuantityCsv(many));
assert.equal(all.split(',"longitudinal",').length-1,13);
assert.ok(all.includes('"B13"'));assert.ok(all.includes('KDS 14 20 50'));assert.ok(all.includes('source-hash'));
assert.ok(all.includes('quantity_json'));assert.ok(all.includes('rule_pack_hash'));
