import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { analyzePhase15Architecture } from '../verification/harnesses/check-phase15-architecture.mjs';
import { listNonlinearCapabilities } from '../src/nonlinear/capabilities.js';
import { buildPhase8PerformanceBaseline } from '../src/nonlinear/performanceBaseline.js';

const root = resolve('.'), out = resolve(process.argv[2]);
mkdirSync(out, { recursive: false });
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, ...args], { encoding: 'utf8' }).trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = [...new Set(git('ls-files','-z','--cached','--others','--exclude-standard','--','src','server','index.html','app.html').split('\0'))].filter(Boolean).sort();
const sources = sourceFiles.map(path => ({ path, sha256: hash(readFileSync(path)) }));
const methods = path => [...readFileSync(path,'utf8').matchAll(/^    ([A-Za-z][A-Za-z0-9]+)\([^\n]*\) \{/gm)].map(x => x[1]);
const bridge = methods('src/ui/indexBridge.js'), agent = methods('src/ui/indexAgentApi.js');
const webmcp = [...readFileSync('src/ui/webmcp/tools.js','utf8').matchAll(/tool\('([^']+)'/g)].map(x=>x[1]);
const groups = [
  ['elastic', ['startAnalysisRun','getAnalysisRunResult'], ['start_analysis','get_result_slice'], 'src/compute/product/analysisProductService.js'],
  ['design-input', ['getDesignBasisInput','applyDesignBasisLoads'], [], 'src/design/designBasisChangeSet.js'],
  ['steel-rc-review', ['getSteelDetailingReport','getRcDetailingReport'], [], 'src/design/p3DetailedDesignReport.js'],
  ['report', ['getDetailedReport','getCalculationPackage'], [], 'src/ui/indexReportExportWorkflow.js'],
  ['nonlinear', ['startNonlinearRun','getNonlinearResult'], [], 'src/nonlinear/product/index.js'],
];
const architecture = await analyzePhase15Architecture();
const report = { schema:'p19-baseline-v1', createdAt:new Date().toISOString(),
  source:{ commit:git('rev-parse','HEAD'), tree:git('rev-parse','HEAD^{tree}'), trackedChanges:git('status','--porcelain','--untracked-files=no'), sources, sourceDigest:hash(JSON.stringify(sources)) },
  environment:{node:process.version,platform:process.platform,release:os.release(),arch:process.arch,cpu:os.cpus()[0]?.model,logicalCores:os.cpus().length,memoryBytes:os.totalmem(),browser:'NOT_MEASURED',powerMode:'NOT_MEASURED'},
  catalog:{methodExtraction:'source syntax inventory; presence is not execution evidence',bridge,agent,webmcp,
    groups:groups.map(([feature,apis,tools,owner])=>({feature,apis:apis.map(name=>({name,bridge:bridge.includes(name),agent:agent.includes(name)})),webmcp:tools.filter(name=>webmcp.includes(name)),owner,ownerExists:existsSync(owner),executionEvidence:'NOT_RUN_IN_M0'}))},
  nonlinear:listNonlinearCapabilities(), performance:buildPhase8PerformanceBaseline(),
  qualification:JSON.parse(readFileSync('verification/specs/phase8/release-manifest.json','utf8')),
  unresolved:[{id:'EXTERNAL-COMPARISON-1',owner:null,status:'SOURCE_AND_REVIEWER_REQUIRED'}, {id:'EXTERNAL-COMPARISON-2',owner:null,status:'SOURCE_AND_REVIEWER_REQUIRED'},
    ...['PILOT-ST-01','PILOT-ST-02','PILOT-ST-03','PILOT-RC-01','PILOT-DYN-01'].map(id=>({id,owner:null,status:'INDEPENDENT_REVIEW_REQUIRED'})),
    {id:'REFERENCE-HARDWARE',status:'LOCAL_HARDWARE_RECORDED_BROWSER_POWER_PROFILE_NOT_FIXED'},
    {id:'PMM-INTEGRATION',status:'M5_REQUIRED',source:'src/nonlinear/equilibrium'},
  ],
};
writeFileSync(join(out,'baseline.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(join(out,'architecture.json'),JSON.stringify(architecture,null,2)+'\n');
writeFileSync(join(out,'SHA256SUMS.txt'),['baseline.json','architecture.json'].map(p=>`${hash(readFileSync(join(out,p)))}  ${p}\n`).join(''));
console.log(JSON.stringify({out,sourceDigest:report.source.sourceDigest,webmcp,architectureOK:architecture.ok,forbiddenImports:architecture.forbiddenImports?.length}));
