import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createModel} from '../src/core/model.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {renderPdfVolume} from '../src/report/phase24/pdfVolumeBundle.js';
const model=createModel();model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:4,y:0,z:0}];model.members=[{id:'M',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'S@1'}];
stagePracticalDesignInput(model,{type:'section-record',id:'S',name:'synthetic',version:1,shape:'RECT',B:2000,H:2000,dimensionUnit:'mm',sourceNote:'pagination only'},[]);
model.designDetails={reinforcement:[{id:'R',version:1,memberId:'M',start:0,end:1,cover:.04,bars:Array.from({length:52},(_,i)=>({y:-.7+Math.floor(i/13)*.45,z:-.84+(i%13)*.14,diameter:.012,area:Math.PI*.012**2/4}))}],splices:[{id:'SP',version:1,memberId:'M',reinforcementId:'R@1',barIndices:Array.from({length:52},(_,i)=>String(i+1)),start:.2,end:.6,offsetY:.02,offsetZ:0,spliceType:'tension-B'}]};
const snapshot={id:'SPLICE-PAGINATION',inputHash:'a'.repeat(64),model,sets:[],checks:[{entityId:'M',checkId:'rc-splices',comboId:'SYNTHETIC-U',status:'NG',reason:'SYNTHETIC_REPORT_VALUES_ONLY',checks:Array.from({length:52},(_,i)=>({spliceId:'SP',barIndex:i+1,requiredLength:i===51?2:1.5,providedLength:1.6,ratio:i===51?1.25:.9375,status:i===51?'NG':'OK',units:{length:'m'}}))}]};
const drawing=buildDetailDrawings(snapshot,{maxPages:600}),pages=drawing.pages.filter(p=>p.commands.some(c=>c.text?.startsWith('겹침이음 철근 일람')));
assert.equal(pages.length,3);const checkPages=drawing.pages.filter(p=>p.commands.some(c=>c.text?.startsWith('겹침이음 길이 검토')));assert.equal(checkPages.length,3);assert.ok(checkPages.at(-1).commands.some(c=>c.text==='2000.0'));assert.ok(checkPages.at(-1).commands.some(c=>c.text==='NG'));assert.ok(checkPages.at(-1).commands.some(c=>c.text==='SP-B52'));const labels=pages.flatMap(p=>p.commands.filter(c=>/^SP-B\d+$/.test(c.text||'')).map(c=>c.text));assert.equal(new Set(labels).size,52);assert.equal(labels.at(-1),'SP-B52');
for(const p of pages)for(const c of p.commands.filter(c=>c.kind==='text'))assert.ok(c.y<=820);
const font=new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'));mkdirSync('output/pdf/phase25',{recursive:true});// The full schedule runs past one PDF volume, so it is written through the
// documented volume path instead of feeding every page to a single PDF.
const volume0=renderPdfVolume(snapshot,font,0);assert.equal(volume0.volume,0);assert.ok(volume0.volumeCount>=1);assert.ok(volume0.pages<=60);
writeFileSync('output/pdf/phase25/splice-schedule.pdf',volume0.bytes);writeFileSync('output/pdf/phase25/splice-schedule.json',JSON.stringify(pages));
console.log('PASS 52 splice bars on three schedule pages without omissions or duplicate marks');

const badModel=structuredClone(model);badModel.designDetails.splices.push({...badModel.designDetails.splices[0],id:'BAD',barIndices:['1'],start:.7,end:.9,offsetY:-.8});
const incomplete=buildDetailDrawings({...snapshot,model:badModel},{maxPages:600});assert.equal(incomplete.spliceGeometryIssues.length,1);assert.equal(incomplete.spliceGeometryIssues[0].reason,'SPLICE_BAR_OUTSIDE_SECTION');assert.equal(incomplete.quantities.some(q=>q.detailId==='BAD'),false);assert.ok(incomplete.pages.some(p=>p.detailId==='BAD'&&p.commands.some(c=>c.text?.includes('SPLICE_BAR_OUTSIDE_SECTION'))));
writeFileSync('output/pdf/phase25/splice-incomplete.pdf',renderPdfVolume({...snapshot,model:badModel},font,0).bytes);
console.log('PASS unavailable splice geometry is reported without fabricating quantities or suppressing valid splice pages');

const {prepareDetailGeometry}=await import('../src/design/rc/preparedDetailGeometry.js');const prepared=prepareDetailGeometry(badModel);delete prepared.splices['BAD@1'];assert.throws(()=>buildDetailDrawings({...snapshot,model:badModel,preparedDetails:prepared},{maxPages:600}),/PREPARED_SPLICE_GEOMETRY_REQUIRED/);

const {createDrawingExportService}=await import('../src/report/phase24/drawingExportService.js');const badSnapshot={...snapshot,model:badModel};
const {createResourceBudget}=await import('../src/core/resourceBudget.js');const exportBudget=createResourceBudget();
const exporter=createDrawingExportService({budget:exportBudget,bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale:false}),readSnapshot:()=>structuredClone(badSnapshot),snapshotBytes:()=>2000000},loadFont:async()=>font});
try{const exported=await exporter.exportDrawing({evaluationId:snapshot.id,format:'pdf'});assert.equal(exported.spliceGeometryIssueCount,1);assert.equal(exporter.getArtifact({artifactId:exported.artifactId,limit:32}).spliceGeometryIssueCount,1);}finally{exporter.dispose();}assert.equal(exportBudget.snapshot().totalBytes,0);
