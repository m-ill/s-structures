import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {analyzePhase15Architecture} from './check-phase15-architecture.mjs';
export function sourceGraph(root=resolve('.')) {
  function walk(p){return existsSync(p)?readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):/\.[cm]?js$/.test(e.name)?[p+'/'+e.name]:[]):[];}
  const sources=new Map(['src','tests','tools','verification/framework','verification/harnesses'].flatMap(p=>walk(resolve(root,p))).map(p=>[relative(root,p).replaceAll('\\','/'),readFileSync(p,'utf8')]));
  const edges=[];
  for(const [file,s] of sources)for(const m of s.matchAll(/(?:\b(?:import|export)\s+(?:\{[^}]*\}|\*[^;]*?)\s+from\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\))/g)){
    const p=m[1]||m[2];if(!p.startsWith('.'))continue;
    edges.push({source:file,target:relative(root,resolve(root,dirname(file),p)).replaceAll('\\','/')});
  }
  return {sources,edges};
}
export const sourceHash=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
export async function auditPhase20(root=resolve('.')) {
  const raw=await analyzePhase15Architecture({root}),{sources,edges}=sourceGraph(root);
  const registry=JSON.parse(readFileSync(resolve(root,'verification/specs/phase20/compatibility.json')));
  const issues=[];
  for(const row of registry.modules){
    if(!row.owner||!row.role||!row.reason||!row.replacement||!row.reviewAt||!row.removalGate)issues.push({code:'INCOMPLETE_POLICY',file:row.file});
    if(!sources.has(row.file)||sourceHash(sources.get(row.file))!==row.sourceHash)issues.push({code:'UNREVIEWED_SOURCE',file:row.file});
    const actual=[...new Set(edges.filter(e=>e.target===row.file).map(e=>e.source))].sort();
    if(JSON.stringify(actual)!==JSON.stringify(row.allowedCallers))issues.push({code:'CONSUMER_DRIFT',file:row.file,actual});
  }
  for(const row of raw.compatibility.wrappers)if(!registry.modules.some(r=>r.file===row.file))issues.push({code:'UNCLASSIFIED_COMPATIBILITY',file:row.file});
  for(const row of raw.compatibility.overduePolicies)if(!registry.modules.some(r=>r.file===row.file&&r.historicalPolicyPreserved&&r.reviewAt==='P20-M4'))issues.push({code:'UNREVIEWED_HISTORICAL_POLICY',file:row.file});
  const canonicalEdges=edges.filter(e=>e.source.startsWith('src/')&&e.source!=='src/index.js'&&e.target==='src/solver/linear3d.js');
  if(canonicalEdges.length)issues.push({code:'INTERNAL_PUBLIC_FACADE_IMPORT',edges:canonicalEdges});
  const bridge=edges.filter(e=>e.source==='src/solver/linear3d.js'&&e.target.startsWith('src/compute/product/'));
  if(bridge.length!==1||bridge[0].target!=='src/compute/product/elasticAnalysisWorkflow.js')issues.push({code:'PUBLIC_BRIDGE_BUDGET',edges:bridge});
  const pure=edges.filter(e=>e.source.startsWith('src/solver/elastic/')&&/src\/(?:dynamics|design|ui|report|compute\/product)\//.test(e.target));
  if(pure.length)issues.push({code:'ELASTIC_STAGE_UPWARD',edges:pure});
  const reach=start=>{const seen=new Set(),queue=[start];while(queue.length){const p=queue.pop();if(seen.has(p))continue;seen.add(p);for(const e of edges)if(e.source===p)queue.push(e.target);}return [...seen];};
  for(const file of ['src/nonlinear/pushover/productionPushover.js','src/nonlinear/dynamics/productionNlth.js']){
    const legacy=reach(file).filter(p=>p.startsWith('src/nonlinear/control/')||p.startsWith('src/nonlinear/legacy/'));
    if(legacy.length)issues.push({code:'PRODUCTION_TRACE_DEPENDENCY',file,legacy});
  }
  const metadata=reach('src/metadata/numericVersions.js').filter(p=>p!=='src/metadata/numericVersions.js');
  if(metadata.length)issues.push({code:'METADATA_IMPLEMENTATION_IMPORT',metadata});
  const architectureOk=Object.entries(raw.gate).filter(([name])=>name!=='compatibilityGoverned').every(([,ok])=>ok);
  return {version:'p20-module-audit-v1',ok:architectureOk&&issues.length===0,issues,registeredModules:registry.modules.length,
    compatibilityBridge:bridge,rawArchitecture:raw,policyAuthority:'verification/specs/phase20/compatibility.json',
    historicalPolicyDisposition:'Preserved public policy values are superseded for maintenance review only; execution/qualification values are unchanged.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const report=await auditPhase20();const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6);if(out){if(existsSync(out))throw Error('Use a new audit path');writeFileSync(out,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({ok:report.ok,issues:report.issues,registeredModules:report.registeredModules,rawFindings:report.rawArchitecture.forbiddenImports.length,rawHistoricalPolicyFindings:report.rawArchitecture.compatibility.overduePolicies.length}));process.exitCode=report.ok?0:1;}
