import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const gate=JSON.parse(fs.readFileSync('verification/specs/phase21/release-gate.json','utf8'));
const failures=[];
for(const key of ['src','server','index.html','package.json'])if(!/^[a-f0-9]{40}$/.test(gate.verifiedGitObjects[key]||''))failures.push(`CANDIDATE_IDENTITY_REQUIRED:${key}`);
if(gate.status!=='PASS')failures.push('M6_RELEASE_EVIDENCE_PENDING');
for(const [name,status] of Object.entries(gate.requiredChecks))if(status!=='PASS')failures.push(name);
for(const [path,hash] of Object.entries(gate.verifiedGitObjects)){
 const actual=execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'rev-parse',`HEAD:${path}`],{encoding:'utf8'}).trim();
 if(actual!==hash)failures.push(`CANDIDATE_CHANGED:${path}`);
}
console.log(JSON.stringify({ok:failures.length===0,scope:gate.scope,failures},null,2));
process.exitCode=failures.length?1:0;
