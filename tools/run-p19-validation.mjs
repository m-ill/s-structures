import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync('verification/specs/phase19/m0-m1-tests.json','utf8'));
if (process.argv.includes('--list')) { console.log(manifest.tests.join('\n')); process.exit(0); }
const root = resolve('.');
const git = (...args) => execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{encoding:'utf8'}).trim();
const source = { commit:git('rev-parse','HEAD'), tree:git('rev-parse','HEAD^{tree}'), trackedChanges:git('status','--porcelain','--untracked-files=no') };
if(source.trackedChanges) throw new Error('Commit tracked changes before validation.');
if(!process.argv[2]) throw new Error('A new output directory is required.');
const out=resolve(process.argv[2]);mkdirSync(out,{recursive:false});
const archive=join(out,'source.zip'), checkout=join(out,'checkout');
execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'archive','--format=zip',`--output=${archive}`,'HEAD']);
// This archive is generated above from our committed tree, not a downloaded ZIP.
execFileSync('python',['-m','zipfile','-e',archive,checkout]);
writeFileSync(join(checkout,'SOURCE-IDENTITY.json'),JSON.stringify(source,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={version:'p19-validation-v1',source,scope:manifest.scope,manifestHash:hash(JSON.stringify(manifest)),
  runtime:{node:process.version,platform:process.platform,arch:process.arch},startedAt:new Date().toISOString(),results:[]};
for(const [i,test] of manifest.tests.entries()) {
  if(!existsSync(join(checkout,test))) throw new Error(`Uncommitted or missing required test: ${test}`);
  const run=spawnSync(process.execPath,[test],{cwd:checkout,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
  const log=`${run.stdout||''}\n${run.stderr||''}\n${run.error?.message||''}`;
  const name=`${String(i+1).padStart(2,'0')}-${test.split('/').at(-1)}.log`;writeFileSync(join(out,name),log);
  const row={test,status:run.status===0?'PASS':'FAIL',exitCode:run.status,signal:run.signal,log:name,sha256:hash(log)};
  report.results.push(row);console.log(`${row.status} ${test}`);
}
report.completedAt=new Date().toISOString();report.passed=report.results.filter(x=>x.status==='PASS').length;
report.failed=manifest.tests.length-report.passed;
report.planned=manifest.tests.length;report.executed=report.results.length;
writeFileSync(join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,out}));process.exitCode=report.failed?1:0;
