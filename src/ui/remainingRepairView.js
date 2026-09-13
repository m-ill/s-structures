const reasons={DETAIL_LOCKED:'잠긴 상세 · 잠금 상태 확인 필요',AMBIGUOUS_DETAIL_TARGET:'같은 절점의 상세가 여러 개 · 대상 확인 필요',CURRENT_DETAIL_TARGET_REQUIRED:'현재 상세 입력 필요'};
export function renderRemainingRepairTargets({document,container,data,onSelect}){
 container.replaceChildren();
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 container.appendChild(el('h4','다음 보완 대상'));
 container.appendChild(el('p',`잔여 NG ${data.ngCheckCount}건 · 미완료 검사 ${data.incompleteCheckCount}건. 후보 생성 가능 여부는 현재 입력과 계산 근거로 확인합니다.`));
 const rows=(data.targets||[]).slice(0,32),body=el('div');let page=0;container.appendChild(body);
 const draw=()=>{body.replaceChildren();const table=el('table');
  const header=el('tr');for(const title of ['대상','잔여 NG','다음 작업'])header.appendChild(el('th',title));table.appendChild(header);
  for(const row of rows.slice(page*8,page*8+8)){
   const tr=el('tr');tr.appendChild(el('td',row.entityId));tr.appendChild(el('td',String(row.ngCheckCount)));
   const cell=el('td');
   if(row.planQuery?.tool==='plan_design_candidates'){
    const b=el('button','이 대상 자동 후보');b.type='button';b.addEventListener('click',async()=>{if(b.disabled)return;b.disabled=true;try{await onSelect(row);}catch(error){cell.appendChild(el('p',`후보 준비 중단: ${error.code||error.message}`));}finally{b.disabled=false;}});cell.appendChild(b);
   }else cell.textContent=reasons[row.reason]||'상세 검토 필요';
   tr.appendChild(cell);table.appendChild(tr);
  }
  body.appendChild(table);
  if(rows.length>8)for(const [label,delta,disabled] of [['이전 보완 대상',-1,page===0],['다음 보완 대상',1,(page+1)*8>=rows.length]]){const b=el('button',label);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>{if(!b.disabled){page+=delta;draw();}});body.appendChild(b);}
 };
 draw();if(data.truncated)container.appendChild(el('p','표시 한도에 따라 일부 근거 또는 대상이 생략되었습니다. 전체 검사 목록도 확인하세요.'));
}
