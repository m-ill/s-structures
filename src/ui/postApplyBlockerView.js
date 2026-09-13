// Render recorded diagnostics only; missing input is never selected automatically.
export function renderPostApplyBlockers({document,container,followUp,onReadComparison}){
 container.replaceChildren();
 const blockers=followUp?.comparison?.completionBlockers;
 if(!blockers)return;
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 container.appendChild(el('h4','적용 후 남은 보완 사항'));
 container.appendChild(el('p',`검토 ${followUp.evaluationId||'-'} · 잔여 ${blockers.total}건 · 입력 ${blockers.counts.input} · 계산 실패 ${blockers.counts.failure??0} · NG ${blockers.counts.designNg} · 방법 검토 ${blockers.counts.method} · 기타 검토 ${blockers.counts.review} (분류 중복 가능)`));
 const actions=blockers.inputActions;
 if(actions){
  container.appendChild(el('p',`입력 보완 대상 ${actions.rows.length}건 · 대상 미확정 검사 ${actions.unmappedCheckCount}건`));
  for(const row of actions.rows.slice(0,80))container.appendChild(el('p',`${row.action==='create'?'새 입력 필요':'기존 입력 보완'}: ${[row.target.type,row.target.id,row.target.memberId,row.target.nodeId,row.target.version==null?'':`v${row.target.version}`].filter(Boolean).join(' / ')} · ${(row.requiredInputFields||[]).join(', ')||'필수 상세 입력'} · 관련 검사 ${row.affectedCheckCount}건`));
  if(actions.truncated)container.appendChild(el('p','입력 대상 목록이 한도에서 잘렸습니다. 전체 검토 결과의 보완 대상을 추가로 확인하세요.'));
 }
 const table=document.createElement('table'),header=document.createElement('tr');
 for(const text of ['대상 / 조합','검토 / 상태','사유','보완 입력','영향 범위','KDS 근거 상태'])header.appendChild(el('th',text));
 table.appendChild(header);
 for(const row of blockers.rows.slice(0,80)){
  const tr=document.createElement('tr');
  const targets=[...(row.requiredInputRecords||[]),...(row.inputTargets||[])].map(t=>[t.type,t.id,t.memberId,t.nodeId,t.version==null?'':`v${t.version}`].filter(Boolean).join(' / '));
  for(const text of [`${row.entityId} / ${row.comboId||'-'}`,`${row.checkId} / ${row.status}`,row.reason||'-',[...targets,...(row.requiredInputFields||[])].join('; ')||'-',row.withinAffectedScope?'변경 영향 범위':'프로젝트 다른 범위',row.codeBasisStatus||'미확정'])tr.appendChild(el('td',text));
  table.appendChild(tr);
 }
 const details=document.createElement('details');details.appendChild(el('summary','조합별 잔여 검사항목'));details.appendChild(table);container.appendChild(details);
 if(blockers.truncated||blockers.rows.length>80)container.appendChild(el('p',`표시 ${Math.min(80,blockers.rows.length)} / 잔여 ${blockers.total}건. 전체 검토 결과의 다음 페이지에서 나머지 검사를 확인하세요.`));
 if(followUp.comparison.detailsTruncated&&followUp.comparison.comparisonDetailQuery&&onReadComparison){
  const button=el('button','적용 기록 상세 불러오기'),notice=el('p');button.type='button';notice.setAttribute('role','status');
  button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;notice.textContent='적용 기록을 불러오는 중입니다.';
   try{await onReadComparison();notice.textContent='적용 기록 조회를 마쳤습니다.';}
   catch(error){notice.textContent=error.code==='DETAIL_READ_CANCELLED'?'조회가 취소되었습니다.':'기록을 불러오지 못했습니다. 현재 검토 결과를 다시 선택하세요.';}
   finally{button.disabled=false;}
  });container.appendChild(button);container.appendChild(notice);
 }
}
