export function installSpliceTransferControls({target,bridge,panel}){
 if(!bridge.evaluateSpliceElasticTransfer)return null;
 const doc=target.document,el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},box=el('details');
 box.appendChild(el('summary','이음 탄성 전달 계산'));
 box.appendChild(el('p','이음 입력에 등가 전달강성·탄성 미끄럼 한계·산정 근거를 등록한 뒤 사용합니다. 아래 힘은 선택 철근 한 개의 인장력이며, 부재 해석에서 자동 산출한 값이 아닙니다.'));
 const fields={};for(const [key,label,type] of [['spliceId','이음 ID','text'],['barIndex','이음 철근 번호 (1부터)','number'],['force','해당 철근 인장력 (kN)','number']]){
  const row=el('label',label),input=el('input');input.type=type;input.setAttribute('aria-label',label);if(type==='number'){input.min=key==='barIndex'?'1':'0';input.step=key==='barIndex'?'1':'any';}row.appendChild(input);box.appendChild(row);fields[key]=input;
 }
 const button=el('button','이음 전달 계산'),status=el('p'),result=el('pre');button.type='button';status.setAttribute('role','status');box.appendChild(button);box.appendChild(status);box.appendChild(result);panel.appendChild(box);
 let intervalButton=null,intervalLoads=null,modelButton=null,comboId=null,nextPage=null,previousPage=null,modelPage=null;
 const pageState=()=>{if(nextPage)nextPage.disabled=button.disabled||modelPage?.segmentPage?.nextOffset==null;if(previousPage)previousPage.disabled=button.disabled||!(modelPage?.segmentPage?.offset>0);};
 const clearPage=()=>{modelPage=null;pageState();};
 const setBusy=value=>{button.disabled=value;if(intervalButton)intervalButton.disabled=value;if(modelButton)modelButton.disabled=value;pageState();};
 let generation=0;target.addEventListener?.('pagehide',()=>{generation++;result.textContent='';clearPage();bridge.cancelRcSpliceInterval?.();});
 const invalidate=()=>{generation++;result.textContent='';clearPage();bridge.cancelRcSpliceInterval?.();status.textContent='입력이 변경되었습니다. 다시 계산하세요.';};
 for(const input of Object.values(fields))input.addEventListener('input',invalidate);
 button.addEventListener('click',async()=>{
  if(button.disabled)return;clearPage();setBusy(true);result.textContent='';const at=++generation;
  try{
   if(Object.values(fields).some(f=>!f.value.trim()))throw Error('이음 ID·철근 번호·인장력을 입력하세요.');
   const inputHash=bridge.getWorkflowInputIdentity().inputHash;
   const response=await bridge.evaluateSpliceElasticTransfer({inputHash,spliceId:fields.spliceId.value.trim(),barIndex:Number(fields.barIndex.value),force:Number(fields.force.value)});
   if(at!==generation)return;
   if(inputHash!==bridge.getWorkflowInputIdentity().inputHash)throw Error('입력이 변경되었습니다. 다시 계산하세요.');
   if(!response.ok)throw Error(response.code||'SPLICE_TRANSFER_FAILED');
   status.textContent=response.elasticRangeSatisfied?'지정 탄성 범위 내 계산입니다. 전체 부재 강도·KDS 적합성 승인은 별도입니다.':'입력한 탄성 범위를 벗어났습니다. 예측값을 설계에 적용할 수 없습니다.';
   if(response.rcHostCoupling?.status==='NOT_CHECKED')status.textContent+=` RC 이음 구간 계산 미충족: ${response.rcHostCoupling.reason}`;
   result.textContent=JSON.stringify(response,null,2);
  }catch(e){if(at===generation)status.textContent=`계산 중단: ${e.code||e.message}`;}
  finally{setBusy(false);}
 });
 if(bridge.solveRcSpliceInterval){
  box.appendChild(el('p','RC 이음 구간 하중 해석: 구간 시작을 고정하고 끝에 입력 하중을 가합니다. 실제 건물 지지조건을 사용하는 해석은 아닙니다. 하중 순서는 국부 Fx,Fy,Fz,Mx,My,Mz (kN, kNm)입니다.'));
  intervalLoads=el('input');intervalLoads.type='text';intervalLoads.addEventListener('input',invalidate);intervalLoads.setAttribute('aria-label','RC 이음 구간 끝 하중 6개');box.appendChild(intervalLoads);
  intervalButton=el('button','RC 이음 구간 하중 해석');intervalButton.type='button';box.appendChild(intervalButton);
  const cancel=el('button','RC 이음 해석 취소');cancel.type='button';cancel.addEventListener('click',()=>{generation++;clearPage();bridge.cancelRcSpliceInterval?.();result.textContent='';status.textContent='RC 이음 해석 취소 요청';});box.appendChild(cancel);
  intervalButton.addEventListener('click',async()=>{
   if(button.disabled)return;clearPage();setBusy(true);result.textContent='';const at=++generation;
   try{
    const spliceId=fields.spliceId.value.trim(),parts=intervalLoads.value.split(',').map(x=>x.trim());
    if(!spliceId||parts.length!==6||parts.some(x=>!x||!Number.isFinite(Number(x))))throw Error('이음 ID와 쉼표로 구분한 하중 6개를 입력하세요.');
    const inputHash=bridge.getWorkflowInputIdentity().inputHash,response=await bridge.solveRcSpliceInterval({inputHash,spliceId,endLoads:parts.map(Number)});
    if(at!==generation)return;if(inputHash!==bridge.getWorkflowInputIdentity().inputHash)throw Error('입력이 변경되었습니다. 다시 계산하세요.');
    status.textContent=response.status==='CALCULATED'?'RC 이음 구간 평형 계산 완료. 실제 건물 해석·설계 승인은 별도입니다.':`RC 이음 구간 계산 미충족: ${response.reason||response.code}`;
    result.textContent=JSON.stringify(response,null,2);
   }catch(e){if(at===generation)status.textContent=`계산 중단: ${e.code||e.message}`;}
   finally{setBusy(false);}
  });
 }
 if(bridge.solveRcSpliceModel&&bridge.getRcSpliceModelResult){
  box.appendChild(el('h4','원본 모델 RC 이음 해석'));
  box.appendChild(el('p','현재 모델의 지지조건과 선택한 하중조합을 사용합니다. 내부 철근응력·미끄럼과 프레임 분할 수렴을 확인하며, 계산 한도 또는 미수렴 사유를 표시합니다.'));
  comboId=el('select');comboId.setAttribute('aria-label','원본 모델 RC 하중조합');
  const refresh=()=>{
   const selected=comboId.value;while(comboId.children.length)comboId.removeChild(comboId.children[0]);
   for(const c of bridge.getCurrentModel?.()?.loadCombinations||[])if(c.enabled!==false){const option=el('option',c.name?`${c.id}: ${c.name}`:c.id);option.value=c.id;comboId.appendChild(option);}
   comboId.value=[...comboId.children].some(c=>c.value===selected)?selected:(comboId.children[0]?.value||'');
  };
  refresh();comboId.addEventListener('focus',refresh);comboId.addEventListener('change',invalidate);box.appendChild(comboId);
  modelButton=el('button','원본 모델 해석 및 수렴 확인');modelButton.type='button';box.appendChild(modelButton);
  previousPage=el('button','이전 구간');nextPage=el('button','다음 구간');for(const node of [previousPage,nextPage]){node.type='button';box.appendChild(node);}pageState();
  const render=response=>{
   modelPage=response.ok?response:null;pageState();
   if(!response.ok)status.textContent=`원본 모델 해석 미충족: ${response.reason||response.code||'결과 없음'}`;
   else if(!response.stressIntegrationConvergenceVerified||!response.frameRefinement?.convergenceVerified)status.textContent='응력 또는 프레임 수렴이 확인되지 않았습니다. 설계 적용 전 확인이 필요합니다.';
   else status.textContent=response.status==='CALCULATED'?'원본 모델 해석·응력·프레임 수렴 확인 완료. 전체 설계 및 KDS 적합성 검토는 별도입니다.':`수렴은 확인했으나 설계 적용 미충족: ${response.reason||response.status}`;
   if(response.segmentPage)status.textContent+=` 구간 ${response.segmentPage.offset+1}–${response.segmentPage.offset+response.segmentPage.returned} / ${response.segmentPage.total}`;
   result.textContent=JSON.stringify(response,null,2);
  };
  modelButton.addEventListener('click',async()=>{
   if(button.disabled)return;clearPage();setBusy(true);result.textContent='';status.textContent='원본 모델 해석과 수렴 확인 중';const at=++generation;
   try{
    if(!comboId.value)throw Error('하중조합을 선택하세요.');
    const inputHash=bridge.getWorkflowInputIdentity().inputHash,response=await bridge.solveRcSpliceModel({inputHash,comboId:comboId.value,frameConvergence:true});
    if(at!==generation)return;if(inputHash!==bridge.getWorkflowInputIdentity().inputHash)throw Error('입력이 변경되었습니다. 다시 계산하세요.');render(response);
   }catch(e){if(at===generation){clearPage();status.textContent=`원본 모델 해석 중단: ${e.code||e.message}`;}}
   finally{setBusy(false);}
  });
  const readPage=async offset=>{
   if(button.disabled||!modelPage)return;const inputHash=modelPage.inputHash,sourceId=modelPage.sourceId,at=++generation;setBusy(true);
   try{const response=await bridge.getRcSpliceModelResult({inputHash,...(sourceId?{sourceId}:{}),offset,limit:3});if(at!==generation)return;if(inputHash!==bridge.getWorkflowInputIdentity().inputHash)throw Error('입력이 변경되었습니다. 다시 계산하세요.');render(response);}
   catch(e){if(at===generation){clearPage();result.textContent='';status.textContent=`결과 조회 중단: ${e.code||e.message}`;}}
   finally{setBusy(false);}
  };
  nextPage.addEventListener('click',()=>{if(modelPage?.segmentPage?.nextOffset!=null)readPage(modelPage.segmentPage.nextOffset);});
  previousPage.addEventListener('click',()=>{if(modelPage?.segmentPage?.offset>0)readPage(Math.max(0,modelPage.segmentPage.offset-3));});
 }
 return {box,fields,button,status,result,intervalButton,intervalLoads,modelButton,comboId,nextPage,previousPage};
}
