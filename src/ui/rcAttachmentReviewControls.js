export function installRcAttachmentReviewControls({target,bridge,panel}){
 if(!bridge.composeRcServiceStages)return null;
 const doc=target.document,el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},root=el('section'),out=el('pre');
 root.appendChild(el('h4','부착 후 축변형·양방향 처짐'));
 root.appendChild(el('p','동일한 지속하중과 동일 타설 재령을 가정한 부착/최종 유효탄성 해석 결과를 선택합니다. 허용변위는 부재 로컬 u(축), v, w 방향의 검토 기준이며 단위는 m입니다. KDS 한계값 자동 산정이나 추가 활하중 검토를 뜻하지 않습니다.'));
 const fields={};
 const input=(key,label,type='text')=>{const wrap=el('label',label),n=el('input');n.type=type;n.setAttribute('aria-label',label);wrap.appendChild(n);root.appendChild(wrap);fields[key]=n;return n;};
 const select=(key,label,values)=>{const wrap=el('label',label),n=el('select');n.setAttribute('aria-label',label);for(const [value,text] of values||[]){const o=el('option',text);o.value=value;n.appendChild(o);}wrap.appendChild(n);root.appendChild(wrap);fields[key]=n;return n;};
 select('before','부착 재령 해석 결과');select('final','최종 재령 해석 결과');input('memberId','검토 부재 ID');input('comboId','동일 지속하중 조합 ID');
 input('attachmentAgeDays','부착 재령 (일)','number');input('evaluationAgeDays','최종 재령 (일)','number');
 select('boundary','상대변형 기준',[['chord','양 끝 연결선'],['cantilever-start','시작 절점 고정 캔틸레버'],['cantilever-end','끝 절점 고정 캔틸레버']]);
 for(const axis of ['u','v','w'])input(axis,`${axis}축 허용변위 (m, 미검토 축은 비움)`,'number');
 input('limitReference','허용변위 산정·검토 근거');
 let revision=0,activeRequest=0,disposed=false,busy=false;
 const notice=el('p');notice.setAttribute('role','status');root.appendChild(notice);
 const ready=()=>fields.before.value&&fields.final.value&&fields.memberId.value.trim()&&fields.comboId.value.trim()&&Number(fields.attachmentAgeDays.value)>0&&Number(fields.evaluationAgeDays.value)>=Number(fields.attachmentAgeDays.value)&&['u','v','w'].some(a=>Number(fields[a].value)>0)&&fields.limitReference.value.trim();
 const sync=()=>{run.disabled=disposed||busy||!ready();notice.textContent=ready()?'지정 허용값으로 판정할 준비가 되었습니다.':'부착·최종 결과, 부재·조합, 재령과 한 축 이상의 허용변위·근거를 입력하세요.';};
 if(bridge.getCurrentModel&&doc.defaultView){
  for(const key of ['memberId','comboId']){const list=el('datalist');list.id='ssAttachment-'+key;fields[key].setAttribute('list',list.id);root.appendChild(list);
   fields[key].addEventListener('focus',()=>{list.replaceChildren();const model=bridge.getCurrentModel();for(const row of key==='memberId'?model.members||[]:model.loadCombinations||[]){const o=el('option');o.value=row.id;o.label=row.name||row.id;list.appendChild(o);}});
  }
 }
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);root.appendChild(b);return b;};
 const refresh=()=>{for(const key of ['before','final']){const s=fields[key],previous=s.value;s.replaceChildren();const blank=el('option','결과 선택');blank.value='';s.appendChild(blank);for(const row of bridge.getPracticalDesignContext().rcServiceIterations?.iterations||[]){if(row.stale||!row.converged||row.timeEffect!==(key==='before'?'attachment-effective-modulus':'sustained-effective-modulus'))continue;const o=el('option',row.iterationId);o.value=row.iterationId;s.appendChild(o);}s.value=[...s.children].some(o=>o.value===previous)?previous:'';}};
 button('부착·최종 결과 목록 갱신',()=>{try{refresh();sync();}catch(e){out.textContent=e.code||e.message;}});
 const run=button('부착 후 변형 판정',async()=>{
  if(disposed||run.disabled)return;const job=++activeRequest,at=++revision,hash=bridge.getWorkflowInputIdentity().inputHash;busy=true;run.disabled=true;out.textContent='계산 중';
  try{
   const limits={};for(const axis of ['u','v','w'])if(fields[axis].value.trim())limits[axis]=Number(fields[axis].value);
   const result=await bridge.composeRcServiceStages({inputHash:hash,memberId:fields.memberId.value.trim(),extrema:true,boundary:fields.boundary.value,stages:[{iterationId:fields.final.value,comboId:fields.comboId.value.trim(),factor:1},{iterationId:fields.before.value,comboId:fields.comboId.value.trim(),factor:-1}],postAttachment:{attachmentAgeDays:Number(fields.attachmentAgeDays.value),evaluationAgeDays:Number(fields.evaluationAgeDays.value),history:'constant-sustained-coeval',limits,limitReference:fields.limitReference.value.trim()}});
   if(disposed||at!==revision)return;
   if(hash!==bridge.getWorkflowInputIdentity().inputHash)throw Error('STALE_INPUT');
   out.textContent=result.report.content;
  }catch(e){if(!disposed&&at===revision)out.textContent=`판정 중단: ${e.code||e.message}`;}finally{if(job===activeRequest){busy=false;sync();}}
 });
 for(const n of Object.values(fields))n.addEventListener('change',()=>{revision++;out.textContent='입력이 바뀌었습니다. 다시 판정하세요.';sync();});
 root.appendChild(out);panel.appendChild(root);refresh();sync();
 target.addEventListener?.('pagehide',()=>{disposed=true;revision++;activeRequest++;out.textContent='';run.disabled=true;});
 target.addEventListener?.('pageshow',()=>{disposed=false;busy=false;refresh();sync();});
 return {section:root,refresh};
}
