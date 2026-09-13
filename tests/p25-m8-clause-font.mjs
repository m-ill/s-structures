import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildVectorDetailPdf} from '../src/report/phase24/vectorPdf.js';
const font=new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf')),provenance=JSON.parse(readFileSync('assets/fonts/phase24/provenance.json','utf8'));
assert.equal(createHash('sha256').update(font).digest('hex'),provenance.artifactSha256);
const commands=[
 {kind:'text',x:45,y:70,size:18,text:'KDS 세부항 번호 글꼴 검증'},
 {kind:'text',x:45,y:115,size:14,text:'① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩'},
 {kind:'text',x:45,y:155,size:12,text:'KDS 14 20 70 4.2.3.1(3)② - 접촉면 사이의 인장력'},
 {kind:'text',x:45,y:195,size:12,text:'철근량 0.001 m2 / 인장 170 kN / 전단 150 kN'},
];
const pdf=buildVectorDetailPdf([{width:595.28,height:841.89,commands}],font);
assert.ok(Buffer.from(pdf).includes(Buffer.from('<2461>')),'Unicode extraction map must preserve circled 2');
mkdirSync('output/pdf/phase25',{recursive:true});writeFileSync('output/pdf/phase25/clause-symbols.pdf',pdf);
console.log('PASS KDS circled clause glyphs, embedded font provenance hash and Unicode extraction map');
