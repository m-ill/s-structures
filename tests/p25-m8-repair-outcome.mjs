import assert from 'node:assert/strict';
import {designRepairOutcome} from '../src/compute/product/designRepairOutcome.js';
import {appendRecordedCalculationPages} from '../src/report/phase24/recordedCalculationPages.js';
const checks=[{id:'X',entityId:'outside',checkId:'strength',comboId:'U',status:'NG',reason:'OUTSIDE'},{id:'A',entityId:'joint:N',checkId:'joint-hoop-detail',comboId:'U',status:'NG',incomplete:true,reason:'GEOMETRY',requiredInputFields:['cover'],codeBasis:{applied:[{code:'KDS 14 20 80',edition:'2021',clause:'4.6.2'}]}},{id:'B',entityId:'joint:N',checkId:'other',comboId:'U',status:'OK'}];
const data={checks,commands:[{type:'connection-record',id:'J',version:2}],originalRegions:[{id:'R',version:1}],entityIds:['joint:N']};
const r=designRepairOutcome(data);
assert.equal(r.changedDetailCount,1);assert.equal(r.preservedRegionCount,1);assert.equal(r.pendingCheckCount,2);assert.equal(r.affectedPendingCheckCount,1);
assert.equal(r.pendingChecks[0].checkId,'joint-hoop-detail');assert.equal(r.pendingChecks[0].incomplete,true);assert.equal(r.pendingChecks[0].codeReferences[0].clause,'4.6.2');
const huge=designRepairOutcome({...data,checks:Array.from({length:500},(_,i)=>({...checks[1],id:String(i),reason:'x'.repeat(10000),requiredInputFields:Array(100).fill('x'.repeat(1000))}))});
assert.equal(huge.pendingCheckCount,500);assert.equal(huge.pendingChecks.length,10);assert.equal(huge.truncated,true);assert.ok(JSON.stringify(huge).length<22000);
const lines=[];appendRecordedCalculationPages({snapshot:{checks:[],designComparison:{counts:{},affectedScope:{},repairOutcome:r}},pages:[],quantities:[],createPage:()=>({}),writeText:(_p,_x,_y,t)=>lines.push(String(t)),maxPages:60});
assert.ok(lines.join(' ').includes('유지한 배근 구간 1개'));assert.ok(lines.join(' ').includes('GEOMETRY'));assert.ok(lines.join(' ').includes('4.6.2'));
console.log('PASS bounded post-apply repair outcome and report display');

const geometry={version:'p25-connected-geometry-changes-v1',recordCount:2,fieldCount:2,truncated:true,records:[{id:'J',type:'connection-record',beforeVersion:1,afterVersion:2,fields:[{key:'jointWidth',before:.3,after:.35,unit:'m'}]},{id:'F',type:'foundation-record',beforeVersion:1,afterVersion:2,fields:[{key:'columnDepth',before:.3,after:.35,unit:'m'}]}]};
const printed=[];appendRecordedCalculationPages({snapshot:{checks:[],designComparison:{counts:{},affectedScope:{},connectedGeometryChanges:geometry}},pages:[],quantities:[],createPage:()=>({}),writeText:(_p,_x,_y,t)=>printed.push(String(t)),maxPages:60});
assert.ok(printed.join(' ').includes('실제 적용 연결 치수'));assert.ok(printed.join(' ').includes('0.3 → 0.35 m'));assert.ok(printed.join(' ').includes('접합부 폭'));assert.ok(printed.join(' ').includes('기둥 Y방향 폭'));assert.ok(printed.join(' ').includes('일부만 표시'));
console.log('PASS Korean applied geometry labels, source units, before/after values and truncated disclosure');
