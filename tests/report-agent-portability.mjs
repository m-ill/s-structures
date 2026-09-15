import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createReportExportWorkflow} from '../src/ui/indexReportExportWorkflow.js';
import {createP22Report} from './fixtures/p22-report.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {createBrowserReviewPdfExporter} from '../src/report/phase22/browserReviewPdf.js';
import {getReportRuntimeQualification, REPORT_CONTRACT} from '../src/report/reportContract.js';
import {createWebMcpTools} from '../src/ui/webmcp/tools.js';
import {createBrowserTools, browserDescriptorBytes} from '../src/ui/webmcp/browserTools.js';

const font=new Uint8Array(await readFile(new URL('../assets/fonts/phase24/SStructuresSans.ttf',import.meta.url)));
const results=[];
for(const platform of ['Win32','MacIntel']){
 const budget=createResourceBudget();
 const target={navigator:{platform},document:{createElement(){throw Error('Canvas must not affect report layout');}},Blob,URL,setTimeout,clearTimeout};
 const exporter=createBrowserReviewPdfExporter(target,budget,{loadFont:async()=>font});
 const result=await exporter.export(createP22Report(),{download:false});
 assert.equal(result.textSearchable,true);assert.equal(result.templateVersion,REPORT_CONTRACT.templateVersion);
 assert.match(new TextDecoder().decode(result.bytes),/\/FontFile2/);
 assert.equal(budget.snapshot().totalBytes,0);exporter.dispose();results.push(result);
}
assert.deepEqual(results[0].bytes,results[1].bytes);
// The same fixture is checked on Windows locally and Linux in Pages CI.
assert.equal(results[0].sha256,'9aebd23cf01f4a850a1fa4768170e64d5eca547d58914f5a93dee87e3c235cda');
const transport={plan(){},run(){},status(){},cancel(){}};
const sample=createP22Report(),preflightInput={snapshot:sample.snapshot,figureManifest:{status:'complete',reportSnapshotHash:sample.reportSnapshotHash,figureCount:7},qualification:getReportRuntimeQualification({sStructuresReportExport:transport})};
assert.equal(createReportExportWorkflow({transport}).preflight(preflightInput).ready,true);
assert.equal(createReportExportWorkflow({transport}).preflight({...preflightInput,qualification:{status:'BLOCKED'}}).ready,false);
assert.deepEqual(getReportRuntimeQualification({navigator:{platform:'Win32'},sStructuresReportExport:transport}),getReportRuntimeQualification({navigator:{platform:'MacIntel'},sStructuresReportExport:transport}));
assert.equal(getReportRuntimeQualification({}).status,'BLOCKED');
assert.equal(getReportRuntimeQualification({sStructuresReportExport:transport}).releaseQualified,false);
const budget=createResourceBudget();
const exporter=createBrowserReviewPdfExporter({document:{createElement(){}},Blob,URL,setTimeout,clearTimeout},budget,{loadFont:async()=>{throw Error('FONT_FETCH_FAILED');}});
await assert.rejects(exporter.export(createP22Report(),{download:false}),/FONT_FETCH_FAILED/);assert.equal(budget.snapshot().totalBytes,0);
const tools=createWebMcpTools({agent:{getModel:()=>({nodes:[],members:[],loads:[],analysisCases:[]})},bridge:{getWorkflowInputIdentity:()=>({inputHash:'current'})}});
try{
 const surface=createBrowserTools(tools),page=surface[0].execute({query:'report'});
 assert.equal(page.startHere.name,'get_agent_start_context');
 const start=await tools.find(t=>t.name==='get_agent_start_context').execute({});
 assert.equal(start.current.counts.nodes,0);assert.equal(start.current.inputIdentity.inputHash,'current');
 assert.equal(start.reportContract.exportTool,'export_report_pdf');
 assert.equal(start.permissions.designDecisions,'human');
 assert.ok(browserDescriptorBytes(surface)<24*1024);
}finally{tools.dispose();}
console.log('PASS deterministic PDF bytes across OS labels; embedded font, failure cleanup, portable qualification and agent bootstrap');
