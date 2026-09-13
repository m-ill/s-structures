export function installDrawingArtifactControls({document,container,bridge,isBusy=()=>false}){
 const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;container.appendChild(e);return e;};
 element('p','보관된 출력 파일 · 메모리에서 해제해도 다운로드한 파일은 유지됩니다.');
 const select=element('select');select.setAttribute('aria-label','보관된 출력 파일');
 const reload=element('button','보관 파일 목록 새로고침'),release=element('button','선택 파일 메모리 해제'),notice=element('p');notice.setAttribute('role','status');
 let generation=0,releasing=false;
 async function refresh(){
  if(!bridge.listDesignDrawingArtifacts)return;
  const ticket=++generation,selected=select.value;
  try{
   const result=await bridge.listDesignDrawingArtifacts();if(ticket!==generation)return;
   if(!result.ok||!Array.isArray(result.rows)||result.rows.length>8)throw Error('OUTPUT_LIST_INVALID');
   select.replaceChildren();
   for(const row of result.rows){const option=document.createElement('option');option.value=row.artifactId;option.textContent=`${row.format.toUpperCase()} · ${row.evaluationId} · ${row.artifactId.slice(-8)} · ${(row.byteLength/1024).toFixed(1)} KB · ${row.stale?'이전 결과':'현재 결과'}`;select.appendChild(option);}
   select.value=result.rows.some(r=>r.artifactId===selected)?selected:result.rows[0]?.artifactId||'';
   release.disabled=!result.rows.length||releasing;notice.textContent=`보관 파일 ${result.rows.length}개`;
  }catch{if(ticket===generation)notice.textContent='보관 파일 목록을 불러오지 못했습니다.';}
 }
 reload.addEventListener('click',()=>{void refresh();});
 release.addEventListener('click',async()=>{
  if(releasing)return;
  if(isBusy()){notice.textContent='파일 출력·다운로드가 끝난 뒤 해제하세요.';return;}
  const artifactId=select.value;if(!artifactId)return;
  releasing=true;release.disabled=true;++generation;
  try{const result=await bridge.releaseDesignDrawingArtifact({artifactId});if(!result.ok)throw Error('OUTPUT_RELEASE_FAILED');await refresh();}
  catch{notice.textContent='선택 파일을 해제하지 못했습니다. 목록을 새로고침하세요.';}
  finally{releasing=false;release.disabled=!select.value;}
 });
 return {refresh,invalidate(){++generation;}};
}
