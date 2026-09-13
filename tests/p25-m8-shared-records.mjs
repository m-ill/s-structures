import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {buildVectorDetailPdf} from '../src/report/phase24/vectorPdf.js';
import assert from 'node:assert/strict';
import {appendRecordedCalculationPages} from '../src/report/phase24/recordedCalculationPages.js';
const value={reason:'EXACT-REPEATED-RECORD-'+'X'.repeat(150),numbers:[1,1.000000000000001,3],capacity:21};
const pages=[];
appendRecordedCalculationPages({snapshot:{checks:[{entityId:'A',checkId:'first',status:'NG',data:value},{entityId:'B',checkId:'second',status:'NG',data:structuredClone(value)},{entityId:'C',checkId:'third',status:'NG',data:{...value,capacity:22}}]},pages,quantities:[],createPage:()=>({commands:[]}),writeText:(p,x,y,text)=>p.commands.push({x,y,text})});
const text=pages.flatMap(p=>p.commands.map(c=>c.text)).join('\n');
assert.ok(text.includes('공통 자료 D1 참조 (1쪽)'));assert.ok(text.includes('data.capacity: 21'));assert.ok(text.includes('data.capacity: 22'));assert.ok(text.includes('[1,1.000000000000001,3]'));
assert.equal((text.match(/EXACT-REPEATED-RECORD/g)||[]).length,2);
assert.ok(text.includes('A / - / first / NG')&&text.includes('B / - / second / NG')&&text.includes('C / - / third / NG'));
console.log('PASS exact duplicate references retain full originals, changed values, precision and every check status');

const huge={points:Array.from({length:6000},(_,i)=>i),capacity:21},large=[];
appendRecordedCalculationPages({snapshot:{checks:[{data:huge},{data:structuredClone(huge)},{data:{...huge,capacity:22}}]},pages:large,quantities:[],createPage:()=>({commands:[]}),writeText:(p,x,y,text)=>p.commands.push({text})});
const largeText=large.flatMap(p=>p.commands.map(c=>c.text)).join('\n');
assert.ok(largeText.includes('공통 자료 R1 참조'));assert.ok(largeText.includes('data.capacity: 21'));assert.ok(largeText.includes('data.capacity: 22'));

const ref={code:'KDS 14 20 50',edition:'2022',clause:'4.4.2(3)',sha256:'a'.repeat(64)},referencePages=[];
appendRecordedCalculationPages({snapshot:{checks:[1,2,3].map(n=>({entityId:String(n),checkId:'ref',status:'NOT_CHECKED',codeBasis:{status:'REVIEW_REQUIRED',reviewTargets:[n===3?{...ref,clause:'4.1.1(2)'}:ref]}}))},pages:referencePages,quantities:[],createPage:()=>({commands:[]}),writeText:(p,x,y,text)=>p.commands.push({text})});
const refText=referencePages.flatMap(p=>p.commands.map(c=>c.text)).join('');
assert.equal((refText.match(/KDS 14 20 50:2022 4\.4\.2\(3\)/g)||[]).length,2);
assert.ok(refText.includes('근거 K1, 1쪽'));assert.ok(refText.includes('근거 K2'));assert.ok(refText.includes('a'.repeat(64)));

const digest='1234567890abcdef'.repeat(4),digest2='abcdef0123456789'.repeat(4),hashPages=[];
appendRecordedCalculationPages({snapshot:{checks:[{entityId:'A',checkId:'hashes',status:'NG',inputHash:digest,requiredChecks:[digest,digest2,digest],demand:12.34567890123456},{entityId:'B',checkId:'hashes',status:'NOT_CHECKED',sourceHash:digest,unknownToken:'g'.repeat(64)}]},pages:hashPages,quantities:[],createPage:()=>({width:595,height:842,commands:[]}),writeText:(p,x,y,text,size)=>p.commands.push({kind:'text',x,y,text,size})});
const hashText=hashPages.flatMap(p=>p.commands.map(c=>c.text)).join('');
assert.equal(hashText.split(digest).length-1,1,'print each exact hash once');
assert.equal(hashText.split(digest2).length-1,1);
assert.ok(hashText.includes('해시 H1 참조 (1쪽)'));
assert.ok(hashText.includes('requiredChecks[3]'),'retain array order and repeated entries');
assert.ok(hashText.includes('12.34567890123456'),'never round numerical evidence');
assert.ok(hashText.includes('g'.repeat(64)),'nonhex identifiers remain literal');

mkdirSync('output/pdf/phase25',{recursive:true});
writeFileSync('output/pdf/phase25/hash-references.pdf',buildVectorDetailPdf(hashPages,new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))));
