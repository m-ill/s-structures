export function renderSpliceChanges(doc,container,changes,diagnostics={}){
 if(!Array.isArray(changes)||!changes.length)return false;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;},section=el('section'),select=el('select'),body=el('div');
 const rows=changes.slice(0,100),number=(value,scale=1)=>Number.isFinite(value)?String(Number((value*scale).toFixed(3))):'미기록';
 select.setAttribute('aria-label','변경 이음 선택');
 rows.forEach((change,i)=>{const option=el('option',`${change.after?.id||change.before?.id||'이음'}: ${change.before?.version??'없음'} → ${change.after?.version??'없음'}`);option.value=String(i);select.appendChild(option);});select.value='0';
 section.appendChild(el('h4','이음 변경 전후'));section.appendChild(el('p','시작·끝 위치는 부재 전체 길이에 대한 비율입니다. 이음 판정과 KDS 근거는 후보 검토 결과에서 확인하세요.'));section.appendChild(select);section.appendChild(body);container.appendChild(section);
 const state=diagnostics.spliceRefinementState;
 if(state){const labels={NOT_REQUESTED:'추가 길이 보완 미요청',NO_QUALIFIED_LENGTH_DEFICIT:'계산으로 확인된 A급 길이 부족 없음',RESOLVED_LENGTH_ONLY:'확인된 A급 길이 부족 해소',PASS_LIMIT:'반복 보완 회수 한도 도달',UNRESOLVED:'추가 길이 보완 불가',PENDING:'추가 길이 보완 대기'};section.appendChild(el('p',`후보 이음 보완: ${labels[state.status]||'상태 미확인'} · 수행 ${number(state.performedPasses)} / ${number(state.maximumPasses)}회 · 남은 길이 부족 ${number(state.remainingLengthChecks)}건. 전체 설계 판정은 별도입니다.${state.reason?' 사유: '+state.reason:''}`));}
 if(changes.length>rows.length)section.appendChild(el('p','앞 100개 이음만 표시합니다. 나머지는 전체 후보 자료에서 확인하세요.'));
 const strategies={'joint-shift-preserving-overlap':'여러 이음 공동 배치','centre-preserved':'중심 유지','boundary-shift-preserving-overlap':'구간 경계 조정','neighbor-shift-preserving-overlap':'인접 이음 회피'};
 const row=(table,values)=>{const tr=el('tr');for(const value of values)tr.appendChild(el('td',value));table.appendChild(tr);};
 function render(){
  body.replaceChildren();const change=rows[Number(select.value)],before=change.before,after=change.after,id=after?.id||before?.id,table=el('table');
  const heading=el('tr');for(const label of ['항목','이전','이후'])heading.appendChild(el('th',label));table.appendChild(heading);
  for(const [key,label] of [['memberId','부재'],['reinforcementId','배근 참조'],['spliceType','이음 종류'],['spliceSystem','상세 시스템']])row(table,[label,before?.[key]??'미기록',after?.[key]??'미기록']);
  for(const [key,label,scale] of [['start','시작 위치 (부재 길이 %)',100],['end','끝 위치 (부재 길이 %)',100],['offsetY','y 편심 (mm)',1000],['offsetZ','z 편심 (mm)',1000]])row(table,[label,number(before?.[key],scale),number(after?.[key],scale)]);
  row(table,['철근 번호',(before?.barIndices||[]).join(', ')||'미기록',(after?.barIndices||[]).join(', ')||'미기록']);body.appendChild(table);
  const stages=[...(diagnostics.spliceLengthChanges||[]).filter(r=>r.id===id).map(r=>({...r,stage:'계획 보완'})),...(diagnostics.spliceDevelopment||[]).flatMap(r=>(r.changes||[]).filter(c=>c.id===id).map(c=>({...c,stage:'후보 재검토 보완'}))),...(diagnostics.spliceRefinement||[]).flatMap(r=>(r.changes||[]).filter(c=>c.id===id).map(c=>({...c,stage:'해석 후 보완'})))];
  if(stages.length){const history=el('table'),header=el('tr');for(const label of ['단계','위치 조정','보완 목표 길이 (mm)','해당 단계 중심 이동 (mm)'])header.appendChild(el('th',label));history.appendChild(header);for(const stage of stages.slice(0,16))row(history,[stage.stage,strategies[stage.positionStrategy]||'미기록',number(stage.requiredLength,1000),number(stage.centreShiftM,1000)]);body.appendChild(history);if(stages.length>16)body.appendChild(el('p','보완 기록 앞 16건만 표시합니다.'));}
 }
 select.addEventListener('change',render);render();return true;
}
