import assert from 'node:assert/strict';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
import {renderSpliceChanges} from '../src/ui/spliceChangeView.js';
const doc=createFakeIndexDocument(),box=doc.createElement('div');
const changes=[{before:{id:'SP',version:1,memberId:'M',reinforcementId:'R@1',start:.48,end:.52,offsetY:.02,offsetZ:0,barIndices:['1','2']},after:{id:'SP',version:2,memberId:'M',reinforcementId:'R@1',start:.2,end:.76,offsetY:.02,offsetZ:0,barIndices:['1','2']}},{before:null,after:{id:'<script>bad</script>',version:1,start:0,end:.1}}];
assert.equal(renderSpliceChanges(doc,box,changes,{spliceLengthChanges:[{id:'SP',requiredLength:2.25,centreShiftM:-.08,positionStrategy:'neighbor-shift-preserving-overlap'}]}),true);
assert.ok(box.querySelectorAll('h4').some(n=>n.textContent==='이음 변경 전후'));
assert.ok(box.querySelectorAll('tr').some(r=>r.children[0]?.textContent==='시작 위치 (부재 길이 %)'&&r.children[1]?.textContent==='48'&&r.children[2]?.textContent==='20'));
assert.ok(box.querySelectorAll('tr').some(r=>r.children[0]?.textContent==='y 편심 (mm)'&&r.children[1]?.textContent==='20'&&r.children[2]?.textContent==='20'));
assert.ok(box.querySelectorAll('td').some(n=>n.textContent==='2250'));assert.ok(box.querySelectorAll('td').some(n=>n.textContent==='-80'));
const select=box.querySelector('select');select.value='1';select.dispatchEvent({type:'change'});assert.equal(box.querySelectorAll('script').length,0);assert.ok(!box.querySelectorAll('td').some(n=>n.textContent==='2250'));assert.ok(box.querySelectorAll('td').some(n=>n.textContent==='미기록'));
assert.equal(renderSpliceChanges(doc,doc.createElement('div'),[]),false);
console.log('PASS splice-only before/after interval, offset, repair-stage units and region switching');

const historyBox=doc.createElement('div');renderSpliceChanges(doc,historyBox,[changes[0]],{spliceRefinementState:{status:'PASS_LIMIT',performedPasses:2,maximumPasses:2,remainingLengthChecks:1},spliceLengthChanges:[{id:'SP',requiredLength:1}],spliceDevelopment:[{changes:[{id:'SP',requiredLength:2}]}],spliceRefinement:[{changes:[{id:'SP',requiredLength:3}]}]});
assert.ok(historyBox.querySelectorAll('p').some(n=>n.textContent.includes('회수 한도 도달')&&n.textContent.includes('전체 설계 판정은 별도')));
assert.deepEqual(historyBox.querySelectorAll('td').map(n=>n.textContent).filter(t=>['계획 보완','후보 재검토 보완','해석 후 보완'].includes(t)),['계획 보완','후보 재검토 보완','해석 후 보완']);
