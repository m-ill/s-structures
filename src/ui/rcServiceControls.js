import {installRcAttachmentReviewControls} from './rcAttachmentReviewControls.js';
export function installRcServiceControls({target,bridge,panel,onEvaluate,onCancelReview=()=>{}}){
 if(!bridge.runRcServiceIteration)return null;
 const doc=target.document,el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const root=el('section'),status=el('p'),live=el('select'),saved=el('select'),mode=el('select');
 mode.setAttribute('aria-label','RC 반복해석 강성 방식');
 for(const [value,label] of [['effective-inertia','KDS 유효강성 · 무축력 단축'],['fully-cracked-elastic','완전균열 탄성 · 축력·양축휨'],['kds-elastic-second-order','KDS 탄성 2차 강성 · 모델 Direct 설정 필요'],['sustained-effective-modulus','최종 재령 · 지정 크리프 유효계수'],['attachment-effective-modulus','부착 재령 · 지정 크리프 유효계수']]){const o=el('option',label);o.value=value;mode.appendChild(o);}mode.value='effective-inertia';
 live.setAttribute('aria-label','RC 반복해석 조합');saved.setAttribute('aria-label','저장된 RC 반복해석');status.setAttribute('role','status');
 root.appendChild(el('p','KDS 탄성 2차 강성 모드는 보·기둥 역할과 기둥의 횡방향 지속하중 비율을 설계 입력에서 지정하고 모델의 Direct 해석을 선택해야 합니다. 강도 조합도 선택할 수 있으며 국부 안정 검토 완료를 뜻하지 않습니다.'));
 root.appendChild(el('h4','RC 강성 반복해석'));
 root.appendChild(el('p','유효강성 방식은 무축력·단축 순간 강성과 부착 후 장기 처짐을 계산합니다. 완전균열 탄성 방식은 선택 조합의 축력·양축휨을 계산하며 인장강화는 포함하지 않습니다. 수렴은 KDS 전체 적합성을 뜻하지 않습니다. 공간 분할은 응답 수렴을 확인하며 모델의 direct P-delta 설정을 반영합니다. 지속하중 모드는 재료에 지정한 크리프 유효계수와 선택 입력한 균일 수축 초기변형률을 반영합니다. 재령별 응력이력·이음 미끄럼·독립 방법 검증은 미완료입니다.'));
 root.appendChild(mode);root.appendChild(live);root.appendChild(saved);
 let selected=null,busy=false,generation=0,barRead,barMore,barNext=null,barGeneration=0;
 const barResult=el('pre'),barStation=el('input'),barCombo=el('input');barStation.type='number';barStation.min='1';barStation.value='1';barStation.setAttribute('aria-label','철근력 조회 단면 번호');barCombo.setAttribute('aria-label','철근력 조회 조합 ID');
 const buttons=[];
 const sync=()=>{for(const b of buttons)b.disabled=!!busy;run.disabled=!!busy||!live.value;review.disabled=!!busy||!selected;release.disabled=!!busy||!selected;cancel.disabled=!busy;live.disabled=!!busy;saved.disabled=!!busy;mode.disabled=!!busy;if(barRead)barRead.disabled=!!busy||!selected;if(barMore)barMore.disabled=!!busy||!selected||barNext===null;if(!selected){barResult.textContent='';barNext=null;}};
 const action=(label,fn)=>{const b=el('button',label);b.type='button';b.addEventListener('click',async()=>{if(b.disabled)return;try{await fn();}catch(e){status.textContent=`작업 중단: ${e.code||e.message}`;}finally{sync();}});root.appendChild(b);buttons.push(b);return b;};
 const refresh=()=>{
  const model=bridge.getCurrentModel(),previous=live.value;live.replaceChildren();
  for(const c of model.loadCombinations||[]){
   const factors=Object.entries(c.factors||{}).filter(([,v])=>v!==0);
   if(c.enabled===false||!(mode.value==='kds-elastic-second-order'?['strength','service'].includes(c.type):c.type==='service')||!factors.length||!factors.every(([id,v])=>mode.value==='kds-elastic-second-order'?Number.isFinite(v):mode.value!=='effective-inertia'?Number.isFinite(v)&&Math.abs(v)<=1:v===1&&model.loadCases?.some(l=>l.id===id&&l.type==='live')))continue;
   if(['sustained-effective-modulus','attachment-effective-modulus'].includes(mode.value)&&((model.loadCases||[]).some(l=>l.type==='dead'&&c.factors?.[l.id]!==1)||factors.some(([id,v])=>v<0||!model.loadCases?.some(l=>l.id===id&&['dead','live'].includes(l.type)))))continue;
   const option=el('option',c.name||c.id);option.value=c.id;live.appendChild(option);
  }
  if([...live.children].some(o=>o.value===previous))live.value=previous;
  else if(live.children.length)live.value=live.children[0].value;
  else live.value='';
  saved.replaceChildren();const placeholder=el('option','저장된 결과 선택');placeholder.value='';saved.appendChild(placeholder);
  for(const row of bridge.getPracticalDesignContext().rcServiceIterations?.iterations||[]){const o=el('option',`${row.iterationId} · ${row.stale?'오래됨':row.converged?'수렴':'미수렴'}`);o.value=row.iterationId;saved.appendChild(o);}
 };
 const run=action('RC 강성 반복해석',async()=>{
  busy='iteration';selected=null;const at=++generation;sync();status.textContent='RC 강성 반복해석 중';
  try{const result=await bridge.runRcServiceIteration({inputHash:bridge.getWorkflowInputIdentity().inputHash,...(mode.value!=='effective-inertia'?{stiffnessMode:mode.value==='kds-elastic-second-order'?mode.value:'fully-cracked-elastic',comboIds:[live.value],...(['sustained-effective-modulus','attachment-effective-modulus'].includes(mode.value)?{timeEffect:mode.value}:{})}:{liveComboId:live.value})});
   if(at!==generation)return;
   if(!result.ok||result.stale||!result.converged){status.textContent=`반복해석 미완료: ${result.code||result.reason||'수렴 확인 필요'}`;return;}
   selected=result.iterationId;status.textContent=`${result.trace.length}${result.stiffnessMode==='fully-cracked-elastic'?'개 조합':'단계'} 수렴 · 전역 해석 방법 검증은 미완료`;refresh();saved.value=selected;
  }finally{if(at===generation)busy=false;}
 });
 const cancel=action('반복해석 취소',()=>{if(busy==='review')onCancelReview();generation++;busy=false;selected=null;bridge.cancelRcServiceIteration();status.textContent='반복해석을 취소했습니다.';});
 const review=action('반복 결과로 상세 검토',async()=>{
  const row=bridge.getRcServiceIteration({iterationId:selected});
  if(!row.ok||row.stale||!row.converged)throw Error('RC_ITERATION_SOURCE_NOT_CURRENT');
  busy='review';const at=++generation;sync();try{await onEvaluate(row.comboIds.map(comboId=>({rcIterationId:row.iterationId,comboId})));}finally{if(at===generation)busy=false;}
 });
 const release=action('반복 결과 해제',()=>{bridge.releaseRcServiceIteration({iterationId:selected});selected=null;refresh();status.textContent='저장된 반복 결과를 해제했습니다.';});
 if(bridge.getRcServiceBarForces){
  root.appendChild(el('p','완전균열 탄성 결과의 철근력 조회: 조합 ID(한 조합이면 생략)와 단면 번호(1부터)를 입력하세요. 완전 부착을 가정한 철근력이며 이음 미끄럼은 반영하지 않습니다.'));
  root.appendChild(barCombo);root.appendChild(barStation);
  const readBars=async offset=>{
   const readGeneration=++barGeneration,chosen=selected,at=generation,state=bridge.getRcServiceIteration({iterationId:chosen});
   if(state.stale||!state.converged)throw Error('RC_ITERATION_SOURCE_NOT_CURRENT');
   const comboId=barCombo.value.trim()||(state.comboIds.length===1?state.comboIds[0]:null);
   if(!comboId)throw Error('철근력 조회 조합 ID를 입력하세요.');
   barResult.textContent='';barNext=null;
   const result=await bridge.getRcServiceBarForces({iterationId:chosen,comboId,stationIndex:Number(barStation.value)-1,offset,limit:25});
   if(at!==generation||selected!==chosen||readGeneration!==barGeneration)return;
   if(bridge.getRcServiceIteration({iterationId:chosen}).stale)throw Error('RC_ITERATION_SOURCE_NOT_CURRENT');
   barNext=result.nextOffset;barResult.textContent=JSON.stringify(result,null,2);
  };
  barRead=action('반복 결과 철근력 조회',()=>readBars(0));barMore=action('다음 철근력',()=>readBars(barNext));
  for(const input of [barCombo,barStation])input.addEventListener('change',()=>{barGeneration++;barNext=null;barResult.textContent='';sync();});
  root.appendChild(barResult);
 }
 action('반복 조합·결과 새로고침',()=>{refresh();selected=null;});
 saved.addEventListener('change',()=>{barGeneration++;barNext=null;barResult.textContent='';try{if(!saved.value){selected=null;return;}const row=bridge.getRcServiceIteration({iterationId:saved.value});selected=row.ok&&!row.stale&&row.converged?row.iterationId:null;status.textContent=selected?'저장된 반복 결과를 선택했습니다.':'현재 사용할 수 없는 결과입니다.';}catch(e){selected=null;status.textContent=`결과 조회 중단: ${e.code||e.message}`;}finally{sync();}});
 mode.addEventListener('change',()=>{selected=null;refresh();sync();});
 root.appendChild(status);panel.appendChild(root);refresh();sync();
 const attachment=installRcAttachmentReviewControls({target,bridge,panel:root});
 target.addEventListener?.('pagehide',()=>{if(busy==='review')onCancelReview();generation++;busy=false;selected=null;bridge.cancelRcServiceIteration();sync();});
 return {section:root,refresh:()=>{refresh();sync();attachment?.refresh();}};
}
