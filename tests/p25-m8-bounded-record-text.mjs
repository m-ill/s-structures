import assert from 'node:assert/strict';
import {wrapReportText} from '../src/report/phase24/wrapReportText.js';
import {appendRecordedCalculationPages} from '../src/report/phase24/recordedCalculationPages.js';
for(const s of ['', 'x'.repeat(64), 'x'.repeat(65), 'x'.repeat(64)+'\n', 'a\r\nb\r', '😀'.repeat(100)+'\n\n끝']){
 const expected=s.split(/\r?\n/).flatMap(p=>{const chars=Array.from(p);return chars.length?Array.from({length:Math.ceil(chars.length/64)},(_,i)=>chars.slice(i*64,i*64+64).join('')):[' '];});
 assert.deepEqual([...wrapReportText([s])],expected);
 assert.deepEqual([...wrapReportText(Array.from(s))],expected);
}
const raw=Array.from({length:8000},(_,i)=>i),expected=JSON.stringify(raw),lines=[];
const stringify=JSON.stringify,from=Array.from;
try{
 JSON.stringify=v=>{assert.ok(v===null||typeof v!=='object','no full object serialization');return stringify(v);};
 Array.from=(v,...args)=>{assert.ok(typeof v!=='string'||v.length<=64,'no full paragraph character array');return from(v,...args);};
 appendRecordedCalculationPages({snapshot:{checks:[{entityId:'A',checkId:'T',status:'NG',values:raw}]},pages:[],quantities:[],maxPages:100,createPage:()=>({}),writeText:(_p,_x,_y,text)=>lines.push(text)});
}finally{JSON.stringify=stringify;Array.from=from;}
assert.ok(lines.join('').includes('values: '+expected));
console.log('PASS bounded report wrapping, split CRLF/emoji and full array content without full serialization');
