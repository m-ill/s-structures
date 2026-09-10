import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { selectStaticResult } from '../src/ui/resultSelectionProjection.js';

const input=process.argv[2],out=process.argv[3];
if(!input||!out)throw new Error('Usage: node tools/run-p21-pilot.mjs input-book.json new-output-directory');
if(fs.existsSync(out))throw new Error('OUTPUT_ALREADY_EXISTS');
fs.mkdirSync(out,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2));
const bytes=fs.readFileSync(input),book=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),model=book.pages[0].model;
write('input-book.json',bytes.toString('utf8'));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
globalThis.Worker=Worker;
const target={model:()=>model,location:{search:''}},bridge=installIndexEngineBridge(target);
const initial=bridge.getWorkflowInputIdentity(),rows=[],sources=[];
const good=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r;};
try {
 for(const analysisCase of model.analysisCases.filter(c=>c.kind==='static')) {
  const start=performance.now();
  const plan=good(bridge.planElasticWorkflow({caseIds:[analysisCase.id]}));
  const run=good(await bridge.runElasticWorkflow({plan,requestId:`pilot-${analysisCase.id}`}));
  const record=bridge.getAnalysisCaseResult(analysisCase.id);
  const selection=selectStaticResult(record.payload,analysisCase.settings.comboId);
  assert.equal(selection.available,true);const selected=selection.result;
  const row={caseId:analysisCase.id,comboId:analysisCase.settings.comboId,method:analysisCase.settings.pDeltaMethod,elapsedMs:performance.now()-start,analysisRunId:run.steps[0].analysisRunId,status:record.status,ok:record.ok,dmax:selected?.dmax,selectionKeys:Object.keys(selected||{}),managed:bridge.getResourceState().totalBytes};
  rows.push(row);sources.push({analysisRunId:row.analysisRunId,comboId:row.comboId});
  write(`${analysisCase.id}.json`,record);write('progress.json',rows);console.log(JSON.stringify(row));
 }
 assert.equal(bridge.getWorkflowInputIdentity().inputHash,initial.inputHash);
 // A report has one authoritative demand source per combination. Direct X/Y
 // replace their first-order sources; both original runs remain in evidence.
 const reviewSources=[...new Map(sources.map(source=>[source.comboId,source])).values()];
 const review=good(bridge.startDesignReview({plan:good(bridge.planDesignReview({sources:reviewSources})),requestId:'pilot-review'}));
 const report=good(bridge.createDesignReviewReport(review.designRunId));
 write('review.json',review);write('artifact-manifest.json',report.artifactManifest);
 for(const format of ['html','json','csv']) {
  let text='',offset=0;
  do {const chunk=bridge.getDesignReviewArtifact(review.designRunId,{format,offset,limit:12000});text+=chunk.content;offset=chunk.nextOffset;}while(offset!==null&&offset!==undefined);
  assert.equal(digest(text),report.artifactManifest[format].sha256);
  write(`original-report.${format}`,text);
 }
 const get=id=>rows.find(r=>r.caseId===id).dmax;
 assert.ok(Math.abs(get('A-ULS-G1')/get('A-D-ONLY')-1.4)<1e-9);
 assert.ok(get('A-DIRECT-X')>get('A-MAX-EX-P'));assert.ok(get('A-DIRECT-Y')>get('A-MAX-EY-P'));
 write('summary.json',{ok:true,scope:'Node real Worker product workflow; not browser evidence',inputFileSha256:digest(bytes),inputIdentity:initial,rows,reviewSummary:review.summary,artifactManifest:report.artifactManifest,resource:bridge.getResourceState(),runtime:process.version,maxRSSKiB:process.resourceUsage().maxRSS});
} catch(error) {write('failure.json',{message:error.message,stack:error.stack,rows});throw error;}
finally {await bridge.disposeRuntime();assert.equal(bridge.getResourceState().totalBytes,0);}
