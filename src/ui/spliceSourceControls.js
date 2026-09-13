export function installSpliceSourceControls({target,bridge,panel,onEvaluate,onCancelReview=()=>{}}){
 if(!bridge.getRcSpliceSourceMetadata||!bridge.getPracticalDesignContext)return null;
 const el=(tag,text)=>{const n=target.document.createElement(tag);if(text)n.textContent=text;return n;};
 const root=el('section'),list=el('div'),status=el('p'),refreshButton=el('button','이음 해석 조합 새로고침'),evaluate=el('button','선택한 이음 조합으로 상세 검토'),cancel=el('button','이음 조합 검토 취소');
 root.appendChild(el('h4','이음 해석 결과로 상세 검토'));
 root.appendChild(el('p','응력·프레임 수렴과 탄성범위가 확인된 조합을 선택하세요. 평가 결과에는 해석 방법의 미검증 자격과 미완료 검토가 유지됩니다.'));
 for(const b of [refreshButton,evaluate,cancel])b.type='button';status.setAttribute('role','status');
 for(const n of [refreshButton,list,evaluate,cancel,status])root.appendChild(n);panel.appendChild(root);
 let selection=[],busy=false,generation=0;
 const eligible=r=>r?.ok&&!r.stale&&r.converged&&r.elasticRangeSatisfied;
 const sync=()=>{refreshButton.disabled=busy;evaluate.disabled=busy||!selection.some(s=>s.input.checked&&s.eligible);cancel.disabled=!busy;for(const row of selection)row.input.disabled=busy||!row.eligible;};
 const refresh=()=>{
  if(busy)return;const checked=new Set(selection.filter(s=>s.input.checked).map(s=>s.sourceId));selection=[];
  while(list.children.length)list.removeChild(list.children[0]);
  for(const row of bridge.getPracticalDesignContext().rcSpliceInterval?.sources||[]){
   const label=el('label'),input=el('input');input.type='checkbox';input.checked=checked.has(row.sourceId)&&eligible(row);input.disabled=!eligible(row);
   const message=row.stale?'입력 변경됨':!row.converged?'수렴 미확인':!row.elasticRangeSatisfied?'탄성범위 미충족':'검토 가능';
   input.setAttribute('aria-label',`${row.comboId} 이음 해석 선택`);label.appendChild(input);label.appendChild(el('span',`${row.comboId} · ${message}`));list.appendChild(label);
   selection.push({input,sourceId:row.sourceId,comboId:row.comboId,eligible:eligible(row)});input.addEventListener('change',sync);
  }
  if(!selection.length)list.appendChild(el('p','보관된 이음 해석 결과가 없습니다. 원본 모델 해석을 먼저 실행하세요.'));sync();
 };
 refreshButton.addEventListener('click',()=>{try{refresh();}catch(e){status.textContent=`목록 조회 중단: ${e.code||e.message}`;}});
 evaluate.addEventListener('click',async()=>{
  if(busy)return;const chosen=selection.filter(s=>s.input.checked&&s.eligible);if(!chosen.length)return;
  busy=true;const at=++generation;sync();status.textContent='선택한 이음 조합 상세 검토 중';
  try{
   const seen=new Set();for(const row of chosen){const current=bridge.getRcSpliceSourceMetadata(row.sourceId);if(!eligible(current)||current.comboId!==row.comboId)throw Error('RC_SPLICE_SOURCE_NOT_CURRENT');if(seen.has(row.comboId))throw Error('DUPLICATE_COMBINATION');seen.add(row.comboId);}
   const result=await onEvaluate(chosen.map(s=>({rcSpliceId:s.sourceId,comboId:s.comboId})));
   if(at===generation&&!result){status.textContent='검토 입력이 변경되었거나 취소되었습니다. 다시 확인하세요.';return;}
   if(at===generation)status.textContent='상세 검토 결과를 표시했습니다. 미완료 검토와 KDS 근거를 확인하세요.';
  }catch(e){if(at===generation)status.textContent=`검토 중단: ${e.code||e.message}`;}
  finally{if(at===generation){busy=false;sync();}}
 });
 const stop=()=>{if(!busy)return;generation++;busy=false;onCancelReview();status.textContent='이음 조합 검토 취소';sync();};
 cancel.addEventListener('click',stop);target.addEventListener?.('pagehide',stop);refresh();
 return {root,status,refresh,evaluate,refreshButton,cancel,get selection(){return selection;}};
}
