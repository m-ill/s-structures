import {jsonTokens} from './jsonTokens.js';
export function jsonTextWindow(value,{offset=0,limit=8000}={}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(offset+limit))throw Object.assign(Error('PAGINATION_INVALID'),{code:'PAGINATION_INVALID'});
 let totalChars=0,chunk='';
 const end=offset+limit;
 for(const token of jsonTokens(value)){
  const start=totalChars;totalChars+=token.length;
  if(totalChars>offset&&start<end)chunk+=token.slice(Math.max(0,offset-start),Math.min(token.length,end-start));
 }
 if(offset>totalChars)throw Object.assign(Error('PAGINATION_INVALID'),{code:'PAGINATION_INVALID'});
 return {chunk,totalChars,nextOffset:end<totalChars?end:null};
}
