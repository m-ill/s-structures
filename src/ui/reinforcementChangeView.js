// Render one region and at most 25 bar rows. Values use public input units.
export function renderReinforcementChanges(doc,container,changes){
 if(!Array.isArray(changes)||!changes.length)return false;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
 const section=el('section'),select=el('select'),body=el('div');let offset=0;
 select.setAttribute('aria-label','변경 배근 구간');
 changes.forEach((c,i)=>{const option=el('option',`${c.after?.id||'배근'}: ${c.before?.version??'없음'} → ${c.after?.version??'없음'}`);option.value=String(i);select.appendChild(option);});select.value='0';
 section.appendChild(el('h4','배근 변경 전후'));
 section.appendChild(el('p','좌표는 mm입니다. 행 번호는 각 배근안의 번호이며, 같은 철근을 뜻하지 않을 수 있습니다. 적용 전 KDS 근거와 남은 NG·미검토를 확인하세요.'));
 section.appendChild(select);section.appendChild(body);container.appendChild(section);
 const value=x=>Number.isFinite(x)?String(Number(x.toFixed(3))):'미기록';
 const coords=b=>b&&Number.isFinite(b.y)&&Number.isFinite(b.z)?`${(b.y*1000).toFixed(3)}, ${(b.z*1000).toFixed(3)}`:'—';
 const bars=r=>Array.isArray(r?.bars)?r.bars:[];
 function render(){
  const change=changes[Number(select.value)],before=change.before,after=change.after,a=bars(before),b=bars(after),total=Math.max(a.length,b.length);body.replaceChildren();
  body.appendChild(el('p',before?`주근 ${a.length} → ${b.length}개 · 스터럽 간격 ${value(before.stirrupSpacing)} → ${value(after?.stirrupSpacing)} mm`:'기준 배근 자료 없음 · 변경 후 입력만 표시합니다.'));
  body.appendChild(el('p',`철근 재료 ${before?.barMaterialId||'미기록'} → ${after?.barMaterialId||'미기록'}`));
  body.appendChild(el('p',`크로스타이 연결: ${(before?.crossTieBarPairs||[]).join(', ')||'없음'} → ${(after?.crossTieBarPairs||[]).join(', ')||'없음'}`));
  const table=el('table'),thead=el('thead'),header=el('tr'),tbody=el('tbody');
  for(const label of ['행','이전 y, z (mm)','이전 직경 (mm)','이후 y, z (mm)','이후 직경 (mm)'])header.appendChild(el('th',label));thead.appendChild(header);table.appendChild(thead);
  for(let i=offset;i<Math.min(offset+25,total);i++){const tr=el('tr');for(const text of [i+1,coords(a[i]),value(a[i]?.diameter),coords(b[i]),value(b[i]?.diameter)])tr.appendChild(el('td',text));tbody.appendChild(tr);}table.appendChild(tbody);body.appendChild(table);
  const endFields=[['startExtension','시작 정착 연장'],['endExtension','끝 정착 연장'],['anchorageStartCriticalX','시작 위험단면 위치'],['anchorageEndCriticalX','끝 위험단면 위치'],['endSetbackStart','시작 끝단 이격'],['endSetbackEnd','끝 끝단 이격'],['anchorageLength','입력 정착길이'],['lapLength','입력 이음길이'],['startHookTailLength','시작 후크 꼬리길이'],['endHookTailLength','끝 후크 꼬리길이'],['startBendInsideRadius','시작 굽힘 안쪽 반지름'],['endBendInsideRadius','끝 굽힘 안쪽 반지름']];
  const selected=endFields.filter(([key])=>before?.[key]!==undefined||after?.[key]!==undefined);
  const shapes=[['startFabricationShape','시작 형상'],['endFabricationShape','끝 형상']].filter(([key])=>before?.[key]!==undefined||after?.[key]!==undefined);
  if(selected.length||shapes.length){
   body.appendChild(el('h5','정착·이음 변경 전후'));
   const ends=el('table'),header=el('tr');for(const label of ['항목','이전','이후'])header.appendChild(el('th',label));ends.appendChild(header);
   for(const [key,label] of selected){const row=el('tr');for(const text of [label+' (mm)',value(Number.isFinite(before?.[key])?before[key]*1000:NaN),value(Number.isFinite(after?.[key])?after[key]*1000:NaN)])row.appendChild(el('td',text));ends.appendChild(row);}
   for(const [key,label] of shapes){const row=el('tr');for(const text of [label,before?.[key]??'미기록',after?.[key]??'미기록'])row.appendChild(el('td',text));ends.appendChild(row);}
   body.appendChild(ends);
  }
  body.appendChild(el('p',total?`철근 ${offset+1}–${Math.min(offset+25,total)} / ${total}행`:'표시할 철근 없음'));
  for(const [label,delta,disabled] of [['이전 철근',-25,offset===0],['다음 철근',25,offset+25>=total]]){const button=el('button',label);button.type='button';button.disabled=disabled;button.addEventListener('click',()=>{if(button.disabled)return;offset+=delta;render();});body.appendChild(button);}
 }
 select.addEventListener('change',()=>{offset=0;render();});render();return true;
}
