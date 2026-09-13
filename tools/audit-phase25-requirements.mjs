import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function auditRequirementInventory(source,audit){
 const errors=[],expected=[];let milestone;
 source.split(/\r?\n/).forEach((text,index)=>{
  const heading=text.match(/^## (M\d+)\s/);if(heading)milestone=heading[1];
  if(!milestone)return;
  const numbered=text.match(/^(\d+)\. /);
  const kind=numbered?'requirement':/^대상:/.test(text)?'entry':/^작은 (TDD|확인):/.test(text)?'verification':/^완료(:| 표기:)/.test(text)?'completion':null;
  if(kind)expected.push({id:`${milestone}-${numbered?numbered[1]:kind}`,milestone,kind,sourceLine:index+1,text});
 });
 if(hash(source)!==audit.sourceSha256)errors.push('SOURCE_HASH_MISMATCH');
 if(!Array.isArray(audit.items))return {ok:false,complete:false,errors:[...errors,'ITEMS_REQUIRED']};
 const rows=new Map();
 for(const row of audit.items){
  if(rows.has(row.id))errors.push(`DUPLICATE:${row.id}`);rows.set(row.id,row);
  if(!['UNREVIEWED','PARTIAL','VERIFIED'].includes(row.auditStatus))errors.push(`STATUS_INVALID:${row.id}`);
  if(!Array.isArray(row.evidence)||row.evidence.some(e=>typeof e!=='string'||!e))errors.push(`EVIDENCE_INVALID:${row.id}`);
  if(row.auditStatus==='VERIFIED'&&!row.evidence?.length)errors.push(`VERIFIED_WITHOUT_EVIDENCE:${row.id}`);
 }
 for(const item of expected){const row=rows.get(item.id);if(!row)errors.push(`MISSING:${item.id}`);else for(const key of ['milestone','kind','sourceLine','text'])if(row[key]!==item[key])errors.push(`SOURCE_ITEM_MISMATCH:${item.id}:${key}`);}
 const ids=new Set(expected.map(row=>row.id));for(const id of rows.keys())if(!ids.has(id))errors.push(`UNEXPECTED:${id}`);
 const pending=audit.items.filter(row=>row.auditStatus!=='VERIFIED').map(row=>row.id);
 if(audit.wholePhaseComplete&&pending.length)errors.push('PREMATURE_COMPLETION');
 return {ok:errors.length===0,complete:errors.length===0&&pending.length===0,requirementCount:expected.length,pending,errors};
}
export function inspectRequirementEvidence(root,audit){
 const cache=new Map(),fileHash=path=>{if(!cache.has(path))cache.set(path,hash(readFileSync(path)));return cache.get(path);};
 const local=name=>{const path=resolve(root,name),rel=relative(root,path);if(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||/^[A-Za-z]:/.test(rel))throw Error('EVIDENCE_OUTSIDE_REPOSITORY');return path;};
 const paths=[...new Set(audit.items.flatMap(row=>row.evidence||[]))];
 const currentFiles=[];
 const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())walk(path);else if(/\.(js|mjs|json)$/.test(entry.name))currentFiles.push(relative(root,path).replaceAll('\\','/'));}};
 walk(resolve(root,'src'));
 return paths.map(path=>{
  try{
   const absolute=local(path),sha256=fileHash(absolute),row={path,sha256,exists:true};
   if(!path.endsWith('/SUMMARY.json'))return row;
   const summary=JSON.parse(readFileSync(absolute,'utf8'));
   if(!Array.isArray(summary.results))return {...row,valid:false,reason:'TEST_RESULTS_REQUIRED'};
   const manifest=JSON.parse(readFileSync(resolve(dirname(absolute),'SOURCE_MANIFEST.json'),'utf8'));
   const validManifest=Array.isArray(manifest.files)&&hash(JSON.stringify(manifest.files))===summary.sourceHash;
   const recordedFiles=new Set((manifest.files||[]).map(f=>f.file));
   const changedSources=validManifest?[...manifest.files.filter(f=>fileHash(local(f.file))!==f.sha256).map(f=>f.file),...currentFiles.filter(f=>!recordedFiles.has(f))]:[];
   const tests=summary.results.map(test=>({file:test.file,passed:test.passed===true&&test.exitCode===0,testHashMatches:fileHash(local(test.file))===test.sha256}));
   return {...row,valid:validManifest&&summary.sourceChangedDuringRun===false&&tests.length>0&&tests.every(t=>t.passed),sourceHash:summary.sourceHash,currentSourceMatches:validManifest&&changedSources.length===0,currentTestsMatch:tests.every(t=>t.testHashMatches),changedSources,tests};
  }catch(error){return {path,valid:false,reason:error.code||error.message};}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(x=>x!=='--require-complete'))throw Error('Use no arguments or --require-complete; no tests are executed.');
 const root=fileURLToPath(new URL('../',import.meta.url)),audit=JSON.parse(readFileSync(resolve(root,'docs/phase25/REQUIREMENT_AUDIT.json'),'utf8'));
 const inventory=auditRequirementInventory(readFileSync(resolve(root,audit.source),'utf8'),audit),evidence=inspectRequirementEvidence(root,audit);
 const report={version:'p25-requirement-evidence-audit-v1',date:new Date().toISOString(),inventory,evidence,completionProven:false,note:'Inventory and hash checks do not prove requirement coverage. Historical source drift is reported; scoped evidence requires human/code review. No numerical tests executed.'};
 const dir=resolve(root,'verification/evidence/phase25',`requirements-${report.date.replace(/[:.]/g,'-')}`);mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'AUDIT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({inventoryOk:inventory.ok,items:inventory.requirementCount,pending:inventory.pending?.length,evidenceCount:evidence.length,invalidEvidence:evidence.filter(e=>e.valid===false).length,historicalRuns:evidence.filter(e=>e.valid===true&&(!e.currentSourceMatches||!e.currentTestsMatch)).length,report:resolve(dir,'AUDIT.json')}));
 if(!inventory.ok||evidence.some(e=>e.valid===false)||args.includes('--require-complete')&&!inventory.complete)process.exitCode=1;
}
