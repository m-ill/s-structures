import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {createDrawingExportService} from '../src/report/phase24/drawingExportService.js';
const snapshot={id:'source-replacement',inputHash:'a'.repeat(64),model:createModel(),sets:[],checks:[]};
snapshot.model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];
snapshot.model.members=[{id:'AB',n1:'A',n2:'B',secId:'rc3060'}];
snapshot.model.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,fabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04,bars:[{y:0,z:0,diameter:.016,area:.0002}]}]};
let stale=false,reads=0;
const budget=createResourceBudget();
const service=createDrawingExportService({budget,workflow:{getEvaluation(){reads++;return {stale};},snapshotBytes:()=>1000,readSnapshot:()=>structuredClone(snapshot)},bridge:{getWorkflowInputIdentity(){stale=true;return {inputHash:snapshot.inputHash};}}});
try{
 await assert.rejects(service.exportDrawing({evaluationId:snapshot.id,format:'json'}),{code:'STALE_INPUT'});
 assert.ok(reads>=2,'recheck source currentness before publishing worker output');
 assert.equal(budget.snapshot().totalBytes,0,'stale artifact must not enter retained storage');
}finally{service.dispose();}
console.log('PASS actual drawing worker source replacement with unchanged model hash rejects publication and releases memory');

let fontStale=false;
const fontBudget=createResourceBudget();
const waiting=createDrawingExportService({budget:fontBudget,workflow:{getEvaluation:()=>({stale:fontStale}),snapshotBytes:()=>1000,readSnapshot:()=>structuredClone(snapshot)},bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},loadFont:async()=>{fontStale=true;return new Uint8Array([0]);}});
try{await assert.rejects(waiting.exportDrawing({evaluationId:snapshot.id}),{code:'STALE_INPUT'});assert.equal(fontBudget.snapshot().totalBytes,0);}finally{waiting.dispose();}
console.log('PASS source changes during font wait rejected before invalid font reaches worker');
