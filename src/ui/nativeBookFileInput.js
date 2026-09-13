export const BOOK_FILE_INPUT_VERSION='p25-book-file-input-v1';
export const MAX_BOOK_FILE_BYTES=32*1024*1024;
// Intercept only the versioned Product Book format. Existing drawing-book and
// 2D readers keep their original event handler through one guarded redispatch.
export function installNativeBookFileInput(target,api,{budget,getInputHash}={}){
 const input=target.document?.getElementById?.('fileInput');if(!input?.addEventListener)return null;
 let forwarding=false,generation=0,disposed=false;
 const onChange=async event=>{
  if(forwarding)return;
  const file=input.files?.[0];if(!file)return;
  event.stopImmediatePropagation();
  const version=++generation,identity=getInputHash?.(),owner=budget?.nextOwner('book-file-import');let legacy=false;
  try{
   if(!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_BOOK_FILE_BYTES)throw Error('BOOK_IMPORT_FILE_LIMIT');
   budget?.reserve(owner,file.size*12+65536);
   const parsed=JSON.parse(await file.text());
   if(disposed||version!==generation)throw Error('BOOK_IMPORT_INTERRUPTED');
   if(getInputHash?.()!==identity)throw Error('STALE_INPUT');
   if((parsed?.book?.format??parsed?.format)!=='s-structures-product-book'){
    legacy=true;forwarding=true;
    try{input.dispatchEvent(new target.Event('change',{bubbles:true}));}finally{forwarding=false;}
    return;
   }
   api.importBook(parsed);
   const status=target.document?.getElementById?.('statusTxt');
   if(status){status.textContent='설계 Book 가져오기 완료 · 해석·검토 결과를 확인하세요.';status.removeAttribute?.('title');status.removeAttribute?.('aria-label');}
  }catch(error){if(!disposed&&version===generation)target.alert?.(`설계 파일을 가져오지 못했습니다. ${error.code||error.message}`);}
  finally{budget?.release(owner);if(!legacy&&version===generation)input.value='';}
 };
 input.addEventListener('change',onChange,true);
 target.addEventListener?.('pagehide',()=>{disposed=true;generation++;});
 target.addEventListener?.('pageshow',event=>{if(event.persisted)disposed=false;});
 return {version:BOOK_FILE_INPUT_VERSION};
}
