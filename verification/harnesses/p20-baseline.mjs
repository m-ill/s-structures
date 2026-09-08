import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {analyzePhase15Architecture} from './check-phase15-architecture.mjs';

const root=resolve(process.argv[2]||'.'),out=resolve(process.argv[3]||'output/phase20/m0');
if(existsSync(out))throw Error('Use a new output directory.');
mkdirSync(out,{recursive:true});
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,encoding:'utf8'}).trim();
const load=p=>import(pathToFileURL(join(root,p)));
const write=(name,data)=>writeFileSync(join(out,name),JSON.stringify(data,null,2)+'\n');
const source={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),trackedChanges:git('status','--porcelain','--untracked-files=no')};
const files=git('ls-files','src','tests','tools','verification').split('\n').filter(p=>/\.[cm]?js$/.test(p));
const consumers=[];
for(const file of files){const s=readFileSync(join(root,file),'utf8');for(const m of s.matchAll(/(?:import|export)\s+[\s\S]*?from\s*['"]([^'"]+)['"]/g))if(/(?:linear3d\.js|nonlinear\/(?:control|legacy)|solver\/sparse)/.test(m[1]))consumers.push({file,dependency:m[1],declaration:m[0]});}
write('source-manifest.json',{source,node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,createdAt:new Date().toISOString()});
write('architecture.json',await analyzePhase15Architecture({root}));write('consumers.json',consumers);
const engine=await load('src/solver/linear3d.js'),api=await load('src/index.js');
const {buildAgentManifest}=await load('src/ui/agentManifest.js');
write('public-api.json',{linear3d:Object.keys(engine).sort(),index:Object.keys(api).sort(),manifest:buildAgentManifest()});
const {createModel}=await load('src/core/model.js');
const model=createModel();
model.nodes=[{id:'N1',x:0,y:0,z:0,support:'fixed'},{id:'N2',x:0,y:0,z:3}];
model.members=[{id:'M1',type:'frame',n1:'N1',n2:'N2',matId:'steel',secId:'h300'}];
model.loadCases=[{id:'D',type:'dead'}];model.loadCombinations=[{id:'D1',name:'Dead',type:'service',factors:{D:1}}];
model.loads=[{id:'P1',type:'nodal',node:'N2',P:10,dir:'-z',case:'D'},{id:'P2',type:'nodal',node:'N2',P:1,dir:'+x',case:'D'}];
const fixtures=[{name:'empty',model:createModel()},...['off','direct','legacy'].flatMap(pDeltaMethod=>[false,true].map(enabled=>({name:`${pDeltaMethod}-dynamic-${enabled}`,model:{...structuredClone(model),analysisSettings:{...model.analysisSettings,pDeltaMethod,responseSpectrum:{enabled}}}})))];
write('fixtures.json',fixtures);
const results=[];
for(const f of fixtures){const start=performance.now();const result=engine.analyzeModel(f.model);if(result?.then)throw Error('Public analyzeModel must remain synchronous');results.push({name:f.name,elapsedMs:performance.now()-start,result});}
write('elastic-results.json',results);
write('hashes.json',Object.fromEntries(['source-manifest.json','architecture.json','consumers.json','public-api.json','fixtures.json','elastic-results.json'].map(p=>[p,createHash('sha256').update(readFileSync(join(out,p))).digest('hex')])));
console.log(JSON.stringify({source:source.commit,fixtures:results.length,consumers:consumers.length,out}));
