import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createModel} from '../src/core/model.js';
import {createResourceBudget,retainedBytes} from '../src/core/resourceBudget.js';
import {createDrawingExportService} from '../src/report/phase24/drawingExportService.js';
import {readDrawingArtifact} from '../src/ui/drawingArtifactReader.js';
const model=createModel();model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];model.members=[{id:'AB',n1:'A',n2:'B',secId:'rc3060',matId:'concrete',type:'frame'}];
model.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,bars:[{y:0,z:0,diameter:.02,area:.000314}],stirrups:null}]};
const checks=Array.from({length:180},(_,i)=>({entityId:'AB',checkId:`check-${i}`,status:'NOT_CHECKED',reason:`UNIQUE-${i}-`+'long explanation '.repeat(60)}));
const snapshot={id:'bundle-test',inputHash:'a'.repeat(64),model,checks,sets:[]},budget=createResourceBudget();let stale=false;
const service=createDrawingExportService({bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale}),snapshotBytes:()=>retainedBytes(snapshot),readSnapshot:()=>snapshot},budget,loadFont:async()=>new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))});
try{
 const result=await service.exportDrawing({evaluationId:snapshot.id,format:'pdf-bundle'});
 assert.equal(result.mime,'application/zip');assert.ok(result.volumeCount>1);assert.equal(result.volumes.length,result.volumeCount);assert.equal(result.pageEnd,result.totalPages);assert.equal(result.nextVolume,null);assert.equal(result.designTransferAllowed,false);
 const bytes=await readDrawingArtifact(result,args=>service.getArtifact(args));
 const verify=spawnSync('python',['-c',`import sys,io,zipfile,json,hashlib,re
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
m=json.loads(z.read('manifest.json'))
assert len(z.namelist())==len(m['volumes'])+1
assert m['reviewOnly'] and not m['designTransferAllowed']
end=0
for v in m['volumes']:
 b=z.read(v['filename'])
 assert hashlib.sha256(b).hexdigest()==v['sha256']
 assert b.startswith(b'%PDF-')
 assert len(re.findall(rb'/Type\\s*/Page\\b',b))==v['pages']
 assert v['pageStart']==end+1
 end=v['pageEnd']
assert end==m['totalPages']
print(end)`],{input:bytes,maxBuffer:1024*1024});
 assert.equal(verify.status,0,verify.stderr?.toString());assert.equal(Number(verify.stdout.toString().trim()),result.totalPages);
 const single=await service.exportDrawing({evaluationId:snapshot.id,format:'pdf',volume:0});assert.equal(single.sha256,result.volumes[0].sha256,'bundle uses identical existing PDF renderer');
 await assert.rejects(service.exportDrawing({evaluationId:snapshot.id,format:'pdf-bundle',volume:1}),e=>e.code==='DRAWING_VOLUME_INVALID');
 stale=true;await assert.rejects(readDrawingArtifact(result,args=>service.getArtifact(args)),e=>e.code==='STALE_DRAWING_ARTIFACT');
 console.log('PASS all PDF volumes, standard-library ZIP/CRC/PDF page checks, hashes, single-volume identity and stale refusal');
}finally{service.dispose();assert.equal(budget.snapshot().totalBytes,0);}

// Resource/failure boundaries apply to the complete bundle, never publish a
// partially assembled ZIP when the shared operation is cancelled.
const abortBudget=createResourceBudget();let release;
const abortService=createDrawingExportService({budget:abortBudget,bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>1000,readSnapshot:()=>snapshot},loadFont:()=>new Promise(resolve=>{release=resolve;})});
try{
 const pending=abortService.exportDrawing({evaluationId:snapshot.id,format:'pdf-bundle'});
 await assert.rejects(abortService.exportDrawing({evaluationId:snapshot.id,format:'pdf-bundle'}),{code:'EXPORT_BUSY'});
 abortService.cancel();release(new Uint8Array([0]));await assert.rejects(pending,{code:'EXPORT_CANCELLED'});assert.equal(abortBudget.snapshot().totalBytes,0);
}finally{abortService.dispose();}
const {buildStoredZip}=await import('../src/report/phase24/storedZip.js');
assert.throws(()=>buildStoredZip([{name:'../x.pdf',bytes:new Uint8Array(1)}]),/ENTRY_INVALID/);
assert.throws(()=>buildStoredZip([{name:'x.pdf',bytes:new Uint8Array(30)}],{maxBytes:30}),/ENTRY_INVALID/);
assert.throws(()=>buildStoredZip([{name:'x.pdf',bytes:new Uint8Array(1)},{name:'x.pdf',bytes:new Uint8Array(1)}]),/ENTRY_INVALID/);

const {designContext}=await import('./fixtures/p24/context.js');
const {stagePracticalDesignInput}=await import('../src/modeling/practicalDesignInputs.js');
const ctx=designContext({SStructuresLoadDrawingFont:async()=>new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))});
try{
 const m=ctx.model;m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:-.08,diameter:20},{y:-.2,z:.08,diameter:20}]},[]);
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:1,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'bundle-run'});
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const artifact=await ctx.call('export_design_drawings',{evaluationId:evaluated.evaluationId,format:'pdf-bundle'});
 assert.equal(artifact.ok,true,JSON.stringify(artifact));assert.equal(artifact.mime,'application/zip');assert.equal(artifact.evaluationId,evaluated.evaluationId);
 const data=await readDrawingArtifact(artifact,args=>ctx.call('get_design_drawing_artifact',args));assert.equal(data[0],0x50);assert.equal(data[1],0x4b);
 console.log('PASS actual WebMCP analysis/evaluation/bundle/chunk route; cancellation and archive bounds');
}finally{await ctx.dispose();}
