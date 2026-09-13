export const PUBLIC_SITE_URL='https://m-ill.github.io/s-structures/';
let connection={status:'not-prepared',folderName:null,agentVerified:false};
export const getDirectoryConnection=()=>structuredClone(connection);
const missing=error=>error?.name==='NotFoundError';
async function lookup(root,path){
 const parts=path.split('/');let dir=root;
 for(const part of parts.slice(0,-1)){try{dir=await dir.getDirectoryHandle(part);}catch(e){if(missing(e))return null;throw e;}}
 try{return await dir.getFileHandle(parts.at(-1));}catch(e){if(missing(e))return null;throw e;}
}
export async function planDirectory(root,files){
 const rows=[];
 for(const [path,content]of Object.entries(files)){
  if(!/^(AGENTS\.md|CLAUDE\.md|\.sstructures\/(project\.json|state\.json|harness\/(instructions\.md|policy\.json|workflow\.json|check\.mjs)|records\/(facts|sources|questions|decisions)\.json)|(inputs|models|runs|reports)\/README-SSTRUCTURES\.md)$/.test(path)||typeof content!=='string')throw new Error('INVALID_PACKAGE_PATH');
  const handle=await lookup(root,path);
  rows.push({path,action:!handle?'create':await(await handle.getFile()).text()===content?'unchanged':'preserve'});
 }
 const blocked=rows.some(row=>row.action==='preserve'&&row.path.startsWith('.sstructures/'));
 return {rows,blocked,createCount:rows.filter(r=>r.action==='create').length,preserveCount:rows.filter(r=>r.action==='preserve').length};
}
export async function prepareDirectory(root,files){
 const plan=await planDirectory(root,files);
 if(plan.blocked)return {...plan,prepared:false};
 connection={status:'preparing',folderName:root.name,agentVerified:false};
 try{
  for(const row of plan.rows){
   if(row.action!=='create')continue;
   if(await lookup(root,row.path))throw new Error('PROJECT_CHANGED_DURING_PREPARATION');
   let dir=root;const parts=row.path.split('/');
   for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part,{create:true});
   if(await lookup(root,row.path))throw new Error('PROJECT_CHANGED_DURING_PREPARATION');
   const file=await dir.getFileHandle(parts.at(-1),{create:true});
   const stream=await file.createWritable();
   try{await stream.write(files[row.path]);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}
  }
  connection={status:'prepared',folderName:root.name,agentVerified:false,entrypointReviewRequired:plan.rows.some(r=>r.action==='preserve'&&['AGENTS.md','CLAUDE.md'].includes(r.path))};
  return {...plan,prepared:true};
 }catch(e){connection={status:'incomplete',folderName:root.name,agentVerified:false};throw e;}
}
