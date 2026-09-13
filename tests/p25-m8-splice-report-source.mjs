import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {selectDrawingSnapshot} from '../src/report/phase24/drawingSnapshot.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {createDrawingExportService} from '../src/report/phase24/drawingExportService.js';
import {createResourceBudget,retainedBytes} from '../src/core/resourceBudget.js';
const proof={version:'splice-version',stressIntegrationConvergenceVerified:true,frameRefinement:{convergenceVerified:true},spatialTrace:[{stressChange:.001}],globalMethodQualified:false,codeReferences:[{code:'KDS 14 20 52',governsCalculation:false}]};
const snapshot={id:'report-source',inputHash:'a'.repeat(64),model:createModel(),checks:[{entityId:'AB',checkId:'test',status:'NOT_CHECKED',reason:'RC_SPLICE_GLOBAL_METHOD_UNQUALIFIED',incomplete:true}],sets:[{source:{rcSpliceId:'splice-source-A',comboId:'S'},resultHash:'b'.repeat(64),splicePolicy:{frameConvergence:true},analysisProof:proof,set:{memberResults:{large:'omit'}}}]};
snapshot.model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];snapshot.model.members=[{id:'AB',n1:'A',n2:'B',secId:'rc3060'}];snapshot.model.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,bars:[{y:0,z:0,diameter:.02,area:.000314}],stirrups:null}]};
snapshot.designComparison={version:'p25-design-check-comparison-v1',beforeEvaluationId:'before-evaluation',afterEvaluationId:snapshot.id,beforeChecksHash:'c'.repeat(64),afterChecksHash:'d'.repeat(64),counts:{resolvedNg:3,remainingNg:2,newNg:1,ngToIncomplete:1,remainingIncomplete:4,newIncomplete:2,removed:0},affectedScope:{complete:false,projectComplete:false}};
const selected=selectDrawingSnapshot(snapshot);assert.deepEqual(selected.designComparison,snapshot.designComparison);assert.equal(selected.sets[0].source.rcSpliceId,'splice-source-A');assert.equal(selected.sets[0].source.comboId,'S');assert.equal(selected.sets[0].resultHash,'b'.repeat(64));assert.deepEqual(selected.sets[0].analysisProof,proof);assert.equal(selected.sets[0].set,undefined);
const drawing=buildDetailDrawings(selected);assert.deepEqual(drawing.sourceAnalysisRunIds,[]);assert.equal(drawing.analysisSources[0].source.rcSpliceId,'splice-source-A');assert.deepEqual(drawing.designComparison,snapshot.designComparison);const text=drawing.pages.flatMap(p=>p.commands.map(c=>c.text||'')).join('');assert.ok(text.includes('splice-source-A'));assert.ok(text.includes('before-evaluation'));assert.ok(text.includes('후보 적용 전후 비교'));assert.ok(text.includes('RC_SPLICE_GLOBAL_METHOD_UNQUALIFIED'));assert.ok(text.includes('KDS 14 20 52'));
const budget=createResourceBudget(),service=createDrawingExportService({bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>retainedBytes(selected),readSnapshot:()=>selected},budget});
try{const exported=await service.exportDrawing({evaluationId:snapshot.id,format:'json'});assert.equal(exported.analysisSources[0].source.rcSpliceId,'splice-source-A');assert.deepEqual(exported.analysisSources[0].analysisProof,proof);assert.equal(exported.designTransferAllowed,false);assert.deepEqual(exported.designComparison,snapshot.designComparison);}finally{service.dispose();}assert.equal(budget.snapshot().totalBytes,0);
console.log('PASS splice report source selection, recorded proof pages and actual Worker artifact manifest');

const {selectReportSource}=await import('../src/report/phase24/drawingSnapshot.js');
const applied={version:'p25-applied-flexural-stiffness-v1',appliedProfileHash:'current-profile',sourceModelHash:'physical-model',stiffnessMode:'fully-cracked-elastic',timeEffect:'sustained-effective-modulus',globalMethodQualified:false};
const source=selectReportSource({source:{rcIterationId:'I',comboId:'S'},stiffnessProvenance:{appliedProfileHash:'old'},set:{stiffnessProvenance:applied,memberResults:{large:'excluded'}}});
assert.deepEqual(source.stiffnessProvenance,applied,'fresh set proof must take precedence over a copied source wrapper');
assert.equal(source.set,undefined);
assert.deepEqual(selectReportSource(source).stiffnessProvenance,applied,'second projection must retain proof');

const effects={AB:{effectiveE:10000,elasticModulusAtLoading:30000,creepCoefficient:2,loadingAgeDays:28,evaluationAgeDays:365,reference:'specified synthetic creep',shrinkageIncluded:true,shrinkageInitialStrain:-.0003,shrinkageReference:'specified synthetic shrinkage',ageingStressHistoryIncluded:false,designTransferAllowed:false}};
const fullSource={source:{rcIterationId:'I',comboId:'S'},set:{stiffnessProvenance:applied,creepEffects:effects,memberResults:{large:'excluded'}}};
const fullSelected=selectDrawingSnapshot({...snapshot,sets:[fullSource]}).sets[0];
assert.deepEqual(fullSelected.creepEffects,effects,'preserve actual per-member time-effect evidence for report pages');
assert.deepEqual(selectDrawingSnapshot({...snapshot,sets:[fullSelected]}).sets[0].creepEffects,effects);
const compact=selectReportSource(fullSource);
assert.equal(compact.creepEffects,undefined,'manifest must not repeat the full material evidence');
assert.equal(compact.creepEvidence.memberCount,1);assert.match(compact.creepEvidence.sha256,/^[a-f0-9]{64}$/);
assert.deepEqual(selectReportSource(fullSelected),compact);
assert.equal(selectReportSource({...fullSelected,set:{}}).creepEvidence,undefined,'fresh set must not inherit old time-effect evidence');

const timeSnapshot=selectDrawingSnapshot({...snapshot,sets:[fullSource]});
const timeService=createDrawingExportService({bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>retainedBytes(timeSnapshot),readSnapshot:()=>timeSnapshot},budget});
try{
 const artifact=await timeService.exportDrawing({evaluationId:snapshot.id,format:'json'});
 assert.deepEqual(artifact.analysisSources[0].creepEvidence,compact.creepEvidence);
 assert.equal(artifact.analysisSources[0].creepEffects,undefined);
}finally{timeService.dispose();}
assert.equal(budget.snapshot().totalBytes,0);

// Small standalone render fixture for newly printed source provenance.
const {mkdirSync,writeFileSync,readFileSync}=await import('node:fs');
const {buildVectorDetailPdf}=await import('../src/report/phase24/vectorPdf.js');
const reportSnapshot={...snapshot,designComparison:undefined,checks:[],sets:[{source:{rcIterationId:'RC-검토',comboId:'S'},resultHash:'d'.repeat(64),set:{creepEffects:effects,stiffnessProvenance:{...applied,appliedProfileHash:'a'.repeat(64),sourceModelHash:'b'.repeat(64)}}}]};
const report=buildDetailDrawings(selectDrawingSnapshot(reportSnapshot));
const sourcePages=report.pages.filter(p=>p.commands.some(c=>c.text==='해석 원본 및 수렴 근거'));
assert.ok(sourcePages.length>0);
assert.ok(sourcePages.flatMap(p=>p.commands).some(c=>c.text?.includes('유효탄성계수 (MPa): 10000')));
assert.ok(sourcePages.flatMap(p=>p.commands).map(c=>c.text||'').join('').includes('specified synthetic shrinkage'));
assert.ok(sourcePages.flatMap(p=>p.commands).some(c=>c.text?.includes('실제 적용 강성 해시')));
mkdirSync('output/pdf/phase25',{recursive:true});
writeFileSync('output/pdf/phase25/applied-stiffness-proof.pdf',buildVectorDetailPdf(sourcePages,new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))));

reportSnapshot.model.designDetails.reinforcement[0].fabricationShape='straight';
reportSnapshot.model.designDetails.reinforcement[0].endSetbackStart=.04;reportSnapshot.model.designDetails.reinforcement[0].endSetbackEnd=.04;
reportSnapshot.model.designDetails.reinforcement[0].bars[0].unitMassKgPerM=2.47;
const massReport=buildDetailDrawings(selectDrawingSnapshot(reportSnapshot));
const quantityPages=massReport.pages.filter(p=>p.commands.some(c=>c.text==='철근 전수 일람 및 수량'));
assert.ok(quantityPages.flatMap(p=>p.commands).some(c=>c.text?.includes('공칭 질량:')));
writeFileSync('output/pdf/phase25/prepared-mass-proof.pdf',buildVectorDetailPdf(quantityPages,new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))));

const connectedProof={...snapshot.designComparison,connectedGeometryChanges:{version:'p25-connected-geometry-changes-v1',recordCount:12,fieldCount:36,truncated:false,records:Array.from({length:12},(_,i)=>({id:`기초-연결부-${i+1}`,type:'foundation-record',beforeVersion:1,afterVersion:2,fields:[{key:'columnWidth',before:.6,after:.65,unit:'m'},{key:'columnDepth',before:.3,after:.35,unit:'m'},{key:'bottomSpacingB',before:150,after:100,unit:'mm'}]}))}};
const connectedDrawing=buildDetailDrawings({...snapshot,checks:[],sets:[],designComparison:connectedProof});
const connectedPages=connectedDrawing.pages.filter(p=>p.commands.some(c=>c.text?.includes('후보 적용 전후 비교')));
assert.equal(connectedPages.length,2);assert.ok(connectedPages.flatMap(p=>p.commands).some(c=>c.text?.includes('기초-연결부-12')));
writeFileSync('output/pdf/phase25/applied-connected-geometry-proof.pdf',buildVectorDetailPdf(connectedPages,new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))));
console.log('PASS two-page applied connected geometry PDF fixture retains final record');
