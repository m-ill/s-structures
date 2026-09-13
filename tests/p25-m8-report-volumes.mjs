import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createModel} from '../src/core/model.js';
import {createResourceBudget,retainedBytes} from '../src/core/resourceBudget.js';
import {createDrawingExportService} from '../src/report/phase24/drawingExportService.js';
const model=createModel();model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];model.members=[{id:'AB',n1:'A',n2:'B',secId:'rc3060',matId:'concrete',type:'frame'}];
model.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,bars:[{y:0,z:0,diameter:.02,area:.000314}],stirrups:null}]};
const checks=Array.from({length:180},(_,i)=>({entityId:'AB',checkId:`check-${i}`,status:'NOT_CHECKED',reason:`UNIQUE-${i}-`+'long explanation '.repeat(60)}));
const snapshot={id:'volume-test',inputHash:'a'.repeat(64),model,checks,sets:[]},budget=createResourceBudget();
const service=createDrawingExportService({bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>retainedBytes(snapshot),readSnapshot:()=>snapshot},budget,loadFont:async()=>new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))});
try{
 const first=await service.exportDrawing({evaluationId:snapshot.id,format:'pdf',volume:0});
 assert.equal(first.pages,60);assert.equal(first.retainedPages,60);assert.ok(first.totalPages>60);assert.equal(first.nextVolume,1);assert.equal(first.pageStart,1);assert.equal(first.pageEnd,60);
 const last=await service.exportDrawing({evaluationId:snapshot.id,format:'pdf',volume:first.volumeCount-1});
 assert.equal(last.nextVolume,null);assert.equal(last.retainedPages,last.pages);assert.equal(last.pageEnd,first.totalPages);assert.notEqual(first.artifactId,last.artifactId);
 assert.equal(service.getArtifact({artifactId:last.artifactId}).volume,last.volume);
 if(process.env.P25_WRITE_VOLUME_PDFS==='1'){mkdirSync('output/pdf/phase25',{recursive:true});for(const artifact of [first,last]){let offset=0,parts=[];do{const chunk=service.getArtifact({artifactId:artifact.artifactId,offset});parts.push(Buffer.from(chunk.content,'base64'));offset=chunk.nextOffset;}while(offset!==null);writeFileSync(`output/pdf/phase25/volume-${artifact.volume+1}.pdf`,Buffer.concat(parts));}}
 await assert.rejects(service.exportDrawing({evaluationId:snapshot.id,format:'pdf',volume:first.volumeCount}),e=>e.code==='DRAWING_VOLUME_REQUIRED'||e.message==='DRAWING_VOLUME_REQUIRED');
 console.log(`PASS report volumes ${first.totalPages} pages / ${first.volumeCount} volumes; artifact lookup and range rejection`);
}finally{service.dispose();assert.equal(budget.snapshot().totalBytes,0);}
