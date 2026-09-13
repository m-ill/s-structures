import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {selectDrawingSnapshot} from '../src/report/phase24/drawingSnapshot.js';
const model=createModel();model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];model.members=[{id:'AB',n1:'A',n2:'B',secId:'rc3060'}];model.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,bars:[{y:0,z:0,diameter:.02,area:.000314}]}]};
const snapshot={id:'retention',inputHash:'a'.repeat(64),model,checks:[{entityId:'A',checkId:'value',status:'NG',demand:123,capacity:100}],sets:[{source:{analysisRunId:'run'},set:{discarded:new Uint8Array(1024*1024)}}],demands:{discarded:new Uint8Array(1024*1024)}};
model.loads=[{payload:new Uint8Array(1024*1024)}];model.analysisCases=[{payload:new Uint8Array(1024*1024)}];
const projection=selectDrawingSnapshot(snapshot);assert.ok(!('loads' in projection.model),'report projection excludes loads');assert.ok(!('analysisCases' in projection.model),'report projection excludes analysis cases');assert.equal(projection.demands,undefined);assert.equal(projection.sets[0].set,undefined);
const copy=buildDetailDrawings(snapshot),projected=buildDetailDrawings(projection);
assert.deepEqual(projected,copy);assert.notEqual(copy.checks,snapshot.checks);
const clone=globalThis.structuredClone;let calls=0;
try{
 globalThis.structuredClone=(...args)=>{calls++;return clone(...args);};
 const omit=buildDetailDrawings(projection,{checkRetention:'omit'}),reference=buildDetailDrawings(projection,{checkRetention:'reference'});
 assert.equal(calls,0);assert.equal(omit.checks,undefined);assert.equal(reference.checks,projection.checks);
 assert.deepEqual(omit.pages,copy.pages);assert.deepEqual(reference.pages,copy.pages);assert.equal(omit.checkCount,1);
}finally{globalThis.structuredClone=clone;}
assert.throws(()=>buildDetailDrawings(snapshot,{checkRetention:'unknown'}),/CHECK_RETENTION/);
console.log('PASS identical report contents from projected snapshot, default owned checks, and zero check copies for worker retention modes');

const {createModuleWorker,runBoundedWorkerTask}=await import('../src/core/boundedWorkerTask.js');
for(const format of ['json','svg']){
 const result=await runBoundedWorkerTask({payload:{snapshot:projection,format,page:0},timeoutMs:10000,workerFactory:()=>createModuleWorker(new URL('../src/report/phase24/drawingWorker.js',import.meta.url))});
 assert.deepEqual(result.sourceAnalysisRunIds,['run']);
 if(format==='json'){const json=JSON.parse(new TextDecoder().decode(result.bytes));assert.deepEqual(json.checks,snapshot.checks);assert.equal(json.checkCount,1);}
 else{assert.equal(result.retainedPages,1);assert.ok(new TextDecoder().decode(result.bytes).includes('<svg'));}
}
console.log('PASS actual JSON/SVG worker output preserves source IDs and full JSON checks');

const {detailGeometryInputHash,prepareDetailGeometry,requirePreparedDetailGeometry}=await import('../src/design/rc/preparedDetailGeometry.js');
const baseline=detailGeometryInputHash(model),prepared=prepareDetailGeometry(model);
for(const key of ['globalSections','officeSections','materials','globalMaterials','officeMaterials']){
 const changed={...model,[key]:[{id:'changed-record',version:1}]};
 assert.notEqual(detailGeometryInputHash(changed),baseline,`${key} must invalidate prepared geometry`);
 assert.throws(()=>requirePreparedDetailGeometry(changed,prepared),/STALE/);
}

const {resolveSectionRecord}=await import('../src/materials/registry.js');
for(const key of ['globalSections','officeSections']){
 const scoped={...model,members:[{...model.members[0],secId:'scope-section@1'}],[key]:[{...resolveSectionRecord(model,'rc3060'),id:'scope-section',version:1}]};
 const full={...snapshot,model:scoped,preparedDetails:prepareDetailGeometry(scoped)};
 assert.deepEqual(buildDetailDrawings(selectDrawingSnapshot(full)),buildDetailDrawings(full));
}
assert.equal(detailGeometryInputHash({...model,loads:[],analysisCases:[]}),baseline,'excluded solver inputs do not change a geometric hash');
console.log('PASS global/office section rendering and all registry dependency invalidations');

const {retainedBytes}=await import('../src/core/resourceBudget.js');
assert.ok(retainedBytes(snapshot)-retainedBytes(projection)>=4*1024*1024,'managed retained-data accounting excludes all four unused 1MiB payloads');
console.log('PASS managed retained-data reduction >=4MiB; not a process peak-heap measurement');
