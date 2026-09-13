import {stableHash} from '../core/stableHash.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function readJsonRecord(read,{hashKey='checkHash',totalKey='totalChars',encoding='json-text-utf16',signal}={}){
 const limit=4096,maxChars=2000000,parts=[];let offset=0,total,hash;
 const cancelled=()=>{if(signal?.aborted)fail('DETAIL_READ_CANCELLED');};
 const validate=row=>{
  cancelled();if(row?.stale!==false)fail('STALE_DETAIL_RECORD');
  if(row.ok!==true||row.offset!==offset||row.encoding!==encoding||typeof row.chunk!=='string'||!/^[a-f0-9]{64}$/.test(row[hashKey]||''))fail('DETAIL_RECORD_CHUNK_INVALID');
  if(!Number.isSafeInteger(row[totalKey])||row[totalKey]<1||row[totalKey]>maxChars)fail('DETAIL_RECORD_SIZE_LIMIT');
  if(hash!==undefined&&(hash!==row[hashKey]||total!==row[totalKey]))fail('DETAIL_RECORD_CHANGED');
  hash=row[hashKey];total=row[totalKey];
 };
 do{
  cancelled();const row=await read({offset,limit});validate(row);
  const length=Math.min(limit,total-offset),next=offset+length;
  if(row.chunk.length!==length||row.nextOffset!==(next<total?next:null))fail('DETAIL_RECORD_CHUNK_INVALID');
  parts.push(row.chunk);offset=next;
  if(parts.length%16===0)await new Promise(resolve=>setTimeout(resolve,0));
 }while(offset<total);
 const text=parts.join('');let value;
 try{value=JSON.parse(text);}catch{fail('DETAIL_RECORD_JSON_INVALID');}
 if(stableHash(value)!==hash)fail('DETAIL_RECORD_HASH_MISMATCH');
 cancelled();const tail=await read({offset,limit:1});validate(tail);
 if(tail.chunk!==''||tail.nextOffset!==null)fail('DETAIL_RECORD_CHUNK_INVALID');
 return {value,text,hash};
}
