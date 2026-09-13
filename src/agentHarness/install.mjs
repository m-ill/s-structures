import { lstat, realpath, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const allowed = new Set(['AGENTS.md','CLAUDE.md','.sstructures/project.json','.sstructures/state.json',
  '.sstructures/harness/instructions.md','.sstructures/harness/policy.json','.sstructures/harness/workflow.json','.sstructures/harness/check.mjs',
  ...['facts','sources','questions','decisions'].map(x=>`.sstructures/records/${x}.json`),
  ...['inputs','models','runs','reports'].map(x=>`${x}/README-SSTRUCTURES.md`)]);
async function stat(path) { try { return await lstat(path); } catch(e) { if(e.code==='ENOENT')return null;throw e; } }
async function inspect(root, path, content) {
  const parts=path.split('/');
  for(let i=1;i<=parts.length;i++) {
    const node=await stat(join(root,...parts.slice(0,i)));
    if(node?.isSymbolicLink())throw new Error(`SYMLINK_REFUSED: ${path}`);
    if(i<parts.length && node && !node.isDirectory())throw new Error(`PARENT_NOT_DIRECTORY: ${path}`);
    if(i===parts.length && node) {
      if(!node.isFile())throw new Error(`TARGET_NOT_FILE: ${path}`);
      return (await readFile(join(root,path),'utf8'))===content?'unchanged':'preserved-conflict';
    }
  }
  return 'create';
}
export async function installHarness(bundle, target, {apply=false}={}) {
  if(bundle?.version!=='sstructures-agent-project-v1'||!bundle.files||Object.keys(bundle.files).length!==allowed.size)throw new Error('INVALID_PACKAGE');
  for(const [path,content] of Object.entries(bundle.files))if(!allowed.has(path)||typeof content!=='string'||content.length>100000)throw new Error('INVALID_PACKAGE_PATH_OR_CONTENT');
  const requested=resolve(target);
  if((await stat(requested))?.isSymbolicLink())throw new Error('SYMLINK_ROOT_REFUSED');
  const root=await realpath(requested);
  if(!(await stat(root))?.isDirectory())throw new Error('PROJECT_DIRECTORY_REQUIRED');
  const rows=[];
  for(const [path,content] of Object.entries(bundle.files))rows.push({path,action:await inspect(root,path,content)});
  // Existing harness files indicate an existing project. Never blend versions/state.
  const conflicts=rows.filter(row=>row.action==='preserved-conflict');
  const blocked=conflicts.some(row=>row.path.startsWith('.sstructures/'));
  if(apply&&!blocked)for(const row of rows)if(row.action==='create') {
    const content=bundle.files[row.path];
    if(await inspect(root,row.path,content)!=='create')throw new Error('PROJECT_CHANGED_DURING_INSTALL');
    await mkdir(dirname(join(root,row.path)),{recursive:true});
    await inspect(root,row.path,content);
    await writeFile(join(root,row.path),content,{encoding:'utf8',flag:'wx'});
  }
  return {root,applied:apply&&!blocked,blocked,rows,conflicts,
    entrypointReviewRequired:conflicts.some(r=>['AGENTS.md','CLAUDE.md'].includes(r.path)),
    note:'Existing files are never replaced. On an entrypoint conflict, read .sstructures/harness/instructions.md explicitly and ask the user how to link existing instructions. No hooks or credentials are installed.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),index=args.indexOf('--target');
    if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw new Error('Use node install.mjs --target <existing-project-folder> [--apply]');
    const bundle=JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)),'harness-package.json'),'utf8'));
    const result=await installHarness(bundle,args[index+1],{apply:args.includes('--apply')});
    console.log(JSON.stringify(result,null,2));if(result.blocked)process.exitCode=2;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
