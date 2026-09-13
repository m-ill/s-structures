import {sha256Bytes} from '../core/stableHash.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function readDrawingArtifact(manifest,readChunk,{signal}={}){
 const size=manifest?.byteLength,limit=12288;
 if(!Number.isSafeInteger(size)||size<1||size>32*1024*1024)fail('DRAWING_ARTIFACT_SIZE_LIMIT');
 if(typeof manifest.artifactId!=='string'||!manifest.artifactId||!/^[a-f0-9]{64}$/.test(manifest.sha256||''))fail('DRAWING_ARTIFACT_MANIFEST_INVALID');
 const cancelled=()=>{if(signal?.aborted)fail('DRAWING_DOWNLOAD_CANCELLED');};
 const validate=(row,offset)=>{
  cancelled();if(row?.stale!==false)fail('STALE_DRAWING_ARTIFACT');
  if(row.ok!==true||row.artifactId!==manifest.artifactId||row.sha256!==manifest.sha256||row.byteLength!==size||row.offset!==offset||row.encoding!=='base64'||typeof row.content!=='string')fail('DRAWING_ARTIFACT_CHUNK_INVALID');
 };
 cancelled();const bytes=new Uint8Array(size);let offset=0,index=0;
 while(offset<size){
  cancelled();const row=await readChunk({artifactId:manifest.artifactId,offset,limit});validate(row,offset);
  const length=Math.min(limit,size-offset),next=offset+length;
  if(row.content.length>4*Math.ceil(limit/3)||row.nextOffset!==(next<size?next:null))fail('DRAWING_ARTIFACT_CHUNK_INVALID');
  let decoded;try{decoded=atob(row.content);}catch{fail('DRAWING_ARTIFACT_CHUNK_INVALID');}
  if(decoded.length!==length)fail('DRAWING_ARTIFACT_CHUNK_INVALID');
  for(let i=0;i<length;i++)bytes[offset+i]=decoded.charCodeAt(i);
  offset=next;if(++index%32===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 cancelled();if(sha256Bytes(bytes)!==manifest.sha256)fail('DRAWING_ARTIFACT_HASH_MISMATCH');
 // Recheck currentness after the complete transfer/hash, without rereading data.
 const tail=await readChunk({artifactId:manifest.artifactId,offset:size,limit:1});validate(tail,size);
 if(tail.content!==''||tail.nextOffset!==null)fail('DRAWING_ARTIFACT_CHUNK_INVALID');
 return bytes;
}
