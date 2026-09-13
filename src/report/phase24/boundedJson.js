import {jsonTokens} from '../../core/jsonTokens.js';
// Two passes avoid retaining a complete JSON string alongside the output bytes.
// Callers supply deterministic report data; getters/toJSON must not mutate it.
export function encodeBoundedJson(value,{maxBytes=32*1024*1024}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw Error('ARTIFACT_SIZE_LIMIT');
 const encoder=new TextEncoder(),scratch=new Uint8Array(65536);
 let size=0;
 for(const token of jsonTokens(value,{maxUnits:maxBytes,pretty:true})){
  const part=encoder.encodeInto(token,scratch);
  if(part.read!==token.length)throw Error('JSON_TOKEN_LIMIT');
  size+=part.written;if(size>maxBytes)throw Error('ARTIFACT_SIZE_LIMIT');
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const token of jsonTokens(value,{maxUnits:maxBytes,pretty:true})){
  const part=encoder.encodeInto(token,bytes.subarray(offset));
  if(part.read!==token.length)throw Error('JSON_CHANGED');offset+=part.written;
 }
 if(offset!==size)throw Error('JSON_CHANGED');
 return bytes;
}
