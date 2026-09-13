import {renderRemainingRepairTargets} from './remainingRepairView.js';
import {renderConnectedDetailChanges} from './connectedDetailChangeView.js';
import {installDrawingArtifactControls} from './drawingArtifactControls.js';
import {renderPostApplyBlockers} from './postApplyBlockerView.js';
import {renderSpliceChanges} from './spliceChangeView.js';
import {renderReinforcementChanges} from './reinforcementChangeView.js';
import {installSpliceSourceControls} from './spliceSourceControls.js';
import {installSpliceTransferControls} from './spliceTransferControls.js';
import {installRcServiceControls} from './rcServiceControls.js';
import {readJsonRecord} from './jsonRecordReader.js';
import {readDrawingArtifact} from './drawingArtifactReader.js';
import {createDrawingDownloadResources} from './drawingDownloadResources.js';
import {formatPracticalCounts} from '../report/practicalSummaryFormat.js';
const stageLabels={preparation:'입력 준비',geometry:'형상 생성',analysis:'해석 준비·실행',evaluation:'설계 검토',quantity:'수량 계산',comparison:'후보 비교',application:'적용·후속 검토'};
function stageText(timing){if(!timing)return '';if(stageLabels[timing.activeStage])return ` · ${stageLabels[timing.activeStage]} ${(timing.activeElapsedMs/1000).toFixed(1)}초`;const rows=Object.entries(timing.durationsMs||{}).filter(([key,value])=>stageLabels[key]&&Number.isFinite(value));return rows.length?` · 단계 경과: ${rows.map(([key,value])=>`${stageLabels[key]} ${(value/1000).toFixed(1)}초`).join(' / ')}`:'';}
const labels={CANDIDATE_WORKER_UNAVAILABLE:'계산 Worker를 시작할 수 없습니다. 실행환경을 확인하세요.',CANDIDATE_WORKER_FAILED:'계산 Worker 실행 오류 · 설계 가능 여부를 판정하지 못했습니다.',CANDIDATE_WORKER_EXITED:'계산 Worker 비정상 종료 · 작업을 다시 실행하세요.','applied-needs-review':'입력 적용됨 · 변경 영향 범위 추가 검토 필요',POST_APPLY_SCOPE_INCOMPLETE:'입력 적용됨 · 변경 영향 범위 추가 검토 필요: NG·미검토 또는 검토 근거 누락',CANDIDATE_CONTINUATION_UNAVAILABLE:'이 작업은 이어서 검토할 수 없습니다. 탐색 상태와 적용 이력을 확인하세요.',CANDIDATE_CONTINUATION_HISTORY_LIMIT:'이어가기 이력 한도에 도달했습니다. 후보 조건을 좁혀 새 탐색을 시작하세요.',SEARCH_LIMIT_EXCEEDED:'후보 조합 한도에 도달했습니다. 탐색 조건을 좁혀주세요.',JOB_REQUIRED:'먼저 후보 탐색을 실행하세요.',DIRECT_FOOTING_MINIMUM_DEPTH_150MM:'기초 윗면부터 하부철근까지 최소 깊이 부족',FOOTING_MINIMUM_STEEL_AREA_INSUFFICIENT:'기초 최소 철근량 부족',FOOTING_MAXIMUM_REINFORCEMENT_SPACING_EXCEEDED:'기초 휨철근 최대 간격 초과',JOINT_HOOP_AREA_INSUFFICIENT:'접합 후프 철근량 부족',JOINT_HOOP_VERTICAL_SPACING_EXCEEDED:'접합 후프 수직 간격 초과',JOINT_TRANSVERSE_HORIZONTAL_SPACING_EXCEEDED:'접합 횡보강 수평 간격 초과 · 후프 구성 재검토 필요',JOINT_UNCONFINED_COVER_EXCEEDED:'접합부 비구속 피복 범위 초과 · 추가 횡보강 검토 필요',JOINT_CONCRETE_STRENGTH_SCOPE:'접합 콘크리트 강도 적용 범위 확인 필요',JOINT_HOOP_STEEL_STRENGTH_SCOPE:'접합 후프 강도 적용 범위 확인 필요',PRACTICAL_EVALUATION_REQUIRED:'먼저 제공 상세 검토를 실행하세요.',CANDIDATE_TARGET_REQUIRED:'후보 대상 ID를 입력하세요.',JOINT_SPACING_GRID_REQUIRES_REDESIGN:'필요한 접합부 구속철근 간격이 후보 하한보다 작습니다. 철근량·단면·배근 형상을 다시 검토하세요.',NO_JOINT_SPACING_CHANGE_REQUIRED:'접합부 간격 보완이 필요하지 않습니다. 남은 재료·형상·정착 검토 사유를 확인하세요.',RECORDED_JOINT_SPACING_REQUIREMENTS_REQUIRED:'접합부 간격 제안에 필요한 현재 계산 결과가 없습니다.',AUTOMATIC_PROPOSAL_UNAVAILABLE:'현재 검토에서 자동 보완 후보를 만들 수 없습니다.',STALE_CANDIDATE_SELECTION:'검토 선택이 바뀌었습니다. 현재 결과에서 후보를 다시 생성하세요.',WORKER_TERMINATION_UNCONFIRMED:'Worker 종료 미확인으로 새 할당이 차단되었습니다. 실행 자원 상태를 확인하세요.',CANDIDATE_WORKER_TERMINATION_FAILED:'후보 Worker 종료 실패 · 예약 유지 중',CANDIDATE_WORKER_TERMINATION_TIMEOUT:'후보 Worker 종료 확인 시간 초과 · 예약 유지 중',TASK_WORKER_TERMINATION_FAILED:'Worker 종료 실패 · 예약 유지 중',TASK_WORKER_TERMINATION_TIMEOUT:'Worker 종료 확인 시간 초과 · 예약 유지 중',CANDIDATE_APPLICATION_IN_PROGRESS:'이미 후보 적용이 시작되었습니다. 적용·재검토 결과를 확인하세요.',applying:'후보 적용·재해석·검토 중',applied:'후보 적용·변경 영향 범위 검토 완료','application-failed':'후보 적용 또는 후속 검토 중단','scope-completed':'변경 영향 범위 검토 완료 · 프로젝트 잔여 검토 있음',RC_SPLICE_SOURCE_NOT_CURRENT:'이음 해석 결과가 현재 입력과 맞지 않습니다. 재해석 후 검토하세요.',RC_ITERATION_SOURCE_NOT_CURRENT:'RC 반복해석 결과가 현재 입력과 맞지 않습니다. 재해석 후 검토하세요.',NEEDS_INPUT:'입력·기준 확인 필요',completed:'탐색 완료',running:'계산 중',cancelled:'취소됨',BUDGET_EXHAUSTED:'탐색 한도 도달',NO_FEASIBLE_DESIGN:'허용 조건 내 후보 없음',STALE_INPUT:'입력 변경됨 - 재검토 필요'};
const staleLabels={SOURCE_NOT_CURRENT:'해석 원천이 현재 상태와 맞지 않아 재검토가 필요합니다.',EVALUATOR_VERSION_CHANGED:'검토 계산기 버전이 변경되어 재검토가 필요합니다.',RULE_PACK_CHANGED:'적용 기준 묶음이 변경되어 재검토가 필요합니다.',RESTORED_BUILD_UNBOUND:'빌드 식별자가 없는 저장 결과입니다. 현재 버전에서 상세 검토를 다시 실행하세요.',INPUT_CHANGED:'입력이 변경되어 재검토가 필요합니다.'};
Object.assign(labels,staleLabels);
const staleMessage=result=>(result.staleReasons||[]).map(code=>staleLabels[code]||code).join(' ')||'검토 결과의 유효성을 다시 확인해야 합니다.';

Object.assign(labels,{
 MANAGED_MEMORY_BUDGET_EXCEEDED:'작업 메모리 한도에 도달했습니다. 진행 중인 출력이 끝난 뒤 다시 시도하거나 저장된 출력물을 해제하세요.',
 DRAWING_DOWNLOAD_RESOURCE_LIMIT:'다운로드 자원 해제를 기다리고 있습니다. 잠시 후 다시 시도하세요.',
 DRAWING_DOWNLOAD_BUSY:'현재 파일을 다운로드 중입니다. 완료되거나 취소된 뒤 다시 시도하세요.',
});
export function installPracticalDesignControls({target,bridge,panel,getSources,refreshSources}) {
 if(!bridge.evaluatePracticalDesign)return null;
 const doc=target.document,el=(tag,value)=>{const n=doc.createElement(tag);if(value)n.textContent=value;return n;},section=el('section');section.id='ssPracticalDesign';
 const status=el('p'),table=el('div'),candidateList=el('select');table.id='ssPracticalCheckResults';status.setAttribute('role','status');candidateList.setAttribute('aria-label','배근 후보 선택');
 const postApplyPanel=el('div');
 const remainingRepairPanel=el('div');let remainingRepairViewGeneration=0;
 let postApplyViewGeneration=0;
 const showPostApply=followUp=>{
  const viewGeneration=++postApplyViewGeneration;
  renderPostApplyBlockers({document:doc,container:postApplyPanel,followUp,onReadComparison:bridge.getPracticalDesignCheck?async()=>{
   const epoch=candidateViewEpoch,generation=evaluationGeneration,inputHash=bridge.getWorkflowInputIdentity().inputHash,selectedCandidate=candidateList.value,query=followUp.comparison.comparisonDetailQuery;
   const result=await readDetail(args=>bridge.getPracticalDesignCheck({evaluationId:query.evaluationId,checkId:query.checkId,...args}));
   if(result.generation!==detailReadGeneration||viewGeneration!==postApplyViewGeneration||epoch!==candidateViewEpoch||generation!==evaluationGeneration||inputHash!==bridge.getWorkflowInputIdentity().inputHash||selectedCandidate!==candidateList.value)return;
   if(result.hash!==followUp.comparison.detailHash)throw Object.assign(new Error('DETAIL_RECORD_HASH_MISMATCH'),{code:'DETAIL_RECORD_HASH_MISMATCH'});
   showPostApply({...followUp,comparison:result.value});
  }:undefined});
 };
 const showRemainingRepairs=result=>{
  const view=++remainingRepairViewGeneration;remainingRepairPanel.replaceChildren();
  if(result?.stale||!result?.remainingRepairs||!bridge.getPracticalDesignCheck)return;
  const selectedEvaluation=result.evaluationId,inputHash=bridge.getWorkflowInputIdentity().inputHash,epoch=candidateViewEpoch,review=evaluationGeneration,query=result.remainingRepairs.detailQuery;
  const current=()=>view===remainingRepairViewGeneration&&evaluationId===selectedEvaluation&&candidateViewEpoch===epoch&&evaluationGeneration===review&&bridge.getWorkflowInputIdentity().inputHash===inputHash;
  const b=el('button','남은 보완 대상 불러오기');b.type='button';remainingRepairPanel.appendChild(b);
  b.addEventListener('click',async()=>{if(b.disabled)return;b.disabled=true;try{
   if(!current())return;
   const read=await readDetail(args=>bridge.getPracticalDesignCheck({evaluationId:query.evaluationId,checkId:query.checkId,...args}));
   if(!current()||read.generation!==detailReadGeneration)return;
   if(read.hash!==query.checkId||read.value.evaluationId!==selectedEvaluation||read.value.inputHash!==inputHash)throw Error('DETAIL_RECORD_HASH_MISMATCH');
   renderRemainingRepairTargets({document:doc,container:remainingRepairPanel,data:read.value,onSelect:async row=>{
    if(!current())throw Error('STALE_CANDIDATE_SELECTION');
    const args=row.planQuery.arguments,keys=['memberId','foundationId','connectionId'].filter(k=>typeof args[k]==='string'&&args[k]);
    if(args.evaluationId!==selectedEvaluation||keys.length!==1)throw Error('CANDIDATE_TARGET_REQUIRED');
    stopCandidateView();targetKind.value={memberId:'member',foundationId:'foundation',connectionId:'connection'}[keys[0]];member.value=args[keys[0]];
    try{await startAutomaticCandidates();}catch(error){showError(error);throw error;}
   }});
  }catch(error){if(error.code!=='DETAIL_READ_CANCELLED'&&current())showError(error);}finally{b.disabled=false;}});
 };
 let evaluationGeneration=0,candidateViewEpoch=0,candidateRunning=false,candidateDetailPanel=null;
 function clearCandidateDetail(){if(candidateDetailPanel?.parentNode)candidateDetailPanel.parentNode.removeChild(candidateDetailPanel);candidateDetailPanel=null;}
 const downloadResources=createDrawingDownloadResources({target,budget:bridge.getResourceBudget?.()||target.SStructuresResourceBudget});
 let downloadController=null,detailReadController=null,detailReadGeneration=0;
 async function readDetail(read,options){
  detailReadController?.abort();const controller=new AbortController(),generation=++detailReadGeneration;detailReadController=controller;
  try{return {...await readJsonRecord(read,{...options,signal:controller.signal}),generation};}
  finally{if(detailReadController===controller)detailReadController=null;}
 }
 let evaluationId=null,jobId=null,sources=[],pollTimer=null,resultOffset=0,nextResultOffset=null,basisOffset=null;
 const reviewRequests=new Map(),resultOffsets=[0];
 function stopCandidateView(){
  remainingRepairViewGeneration++;remainingRepairPanel.replaceChildren();
  clearCandidateDetail();postApplyViewGeneration++;postApplyPanel.replaceChildren();
  const prior=jobId,shouldCancel=candidateRunning;candidateViewEpoch++;candidateRunning=false;jobId=null;
  if(pollTimer!==null){target.clearTimeout?.(pollTimer);pollTimer=null;}
  candidateList.replaceChildren();
  if(prior&&shouldCancel&&bridge.cancelDesignCandidates){try{Promise.resolve(bridge.cancelDesignCandidates({jobId:prior})).catch(showError);}catch(error){showError(error);}}
 }

 const request=()=>`detail-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
 const showError=e=>{status.textContent=labels[e.code||e.message]||`작업 중단: ${e.code||e.message}`;};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.addEventListener('click',async()=>{if(b.disabled)return;b.disabled=true;try{await fn();}catch(e){showError(e);}finally{b.disabled=false;}});section.appendChild(b);return b;};
 section.appendChild(el('h3','실제 상세 검토 · 배근 후보 · 도면'));section.appendChild(postApplyPanel);section.appendChild(remainingRepairPanel);
 if(bridge.getRuntimeResources)button('실행 자원 상태',async()=>{const r=await bridge.getRuntimeResources({includeAggregate:false}),w=r.workerLifecycle;status.textContent=w?.newAllocationsBlocked?`Worker ${w.ownerCount}개 종료 미확인 · ${(w.reservedBytes/1048576).toFixed(1)} MiB 예약 유지 · 종료 확인 후 자동 해제`:`종료 미확인 Worker 없음 · 관리 예약 ${(r.managed.totalBytes/1048576).toFixed(1)} MiB (실제 프로세스 메모리 측정 아님)`;});
 const dependentInput=el('textarea');dependentInput.setAttribute('aria-label','연결 접합부·기초 후보 조건 JSON');dependentInput.placeholder='[{"connectionId":"J1","detailCandidates":[{"tieSpacing":100}]}]';section.appendChild(el('label','함께 보완할 접합부·기초 조건 (선택)'));section.appendChild(dependentInput);
 const regionConstraintsInput=el('textarea');regionConstraintsInput.setAttribute('aria-label','구간별 후보 허용 조건 JSON');regionConstraintsInput.placeholder='[{"detailId":"R1","tieClosureCorners":["+y+z","-y-z"],"tieClosureSeparations":[0.02,0.03],"closureBarFits":["preserve","contact"],"crossTieCageFits":["preserve","separate"],"perimeterYCounts":[3,4],"perimeterZCounts":[3,4],"crossTieLayerSteps":[0.012,0.015],"spacings":[80,100],"tieFirstStarts":[0.02],"tieFirstEnds":[0.02],"layersPerFace":[1,2],"layerClearSpacings":[0.04]},{"detailId":"R2","diameters":[20,25]}]';
 section.appendChild(el('label','구간별 후보 허용 조건 (선택, 공통 조건보다 우선)'));section.appendChild(regionConstraintsInput);
 section.appendChild(el('p','부재 후보는 해당 부재의 모든 배근 구간을 함께 검토합니다. 지정한 조건은 모든 구간에 적용하고, 생략한 피복·간격은 구간별로 유지합니다. 잠긴 구간이 있으면 변경하지 않습니다.'));
 if(bridge.getDesignRuleCatalog)button('KDS 지원 범위·출처 확인',()=>{const catalog=bridge.getDesignRuleCatalog();table.replaceChildren();for(const profile of catalog.profiles)table.appendChild(el('p',`${profile.id}: ${profile.implementation}`));for(const source of catalog.documents)table.appendChild(el('p',`${source.code}:${source.edition} · 조항 ${source.clauses.length}개 · ${source.sha256}`));if(catalog.rebarProducts){const products=catalog.rebarProducts;table.appendChild(el('p',`${products.source.publisher} 철근 공칭 규격표 · 인증서 확인 별도`));for(const p of products.products)table.appendChild(el('p',`${p.designation}: 직경 ${p.diameterMm} mm · 면적 ${p.areaMm2} mm² · ${p.unitMassKgPerM} kg/m`));}for(const pending of catalog.requiredSources)table.appendChild(el('p',`${pending.name}: ${pending.status}`));status.textContent='원문·조항 목록 조회입니다. 전체 기준 적합성 승인이 아닙니다.';});
 section.appendChild(el('p','등록한 배근·접합·기초를 선택 조합으로 검토합니다. 계산가정을 입력해도 미확정 기준이나 누락 검토는 합격으로 바뀌지 않습니다.'));
 const assumptions=el('details');assumptions.appendChild(el('summary','명시적 단면 계산가정 입력 - KDS 적합 판정과 별도'));
 const fields={alpha:'압축블록 응력 계수',beta:'압축블록 깊이 계수',epscu:'콘크리트 극한 변형률',phiSection:'단면 강도 계수',phiShear:'전단 강도 계수',vcCoefficient:'콘크리트 전단 계수',maxShearCoefficient:'전단 상한 계수',minClearSpacing:'최소 순간격 (m)',minRatio:'최소 철근비',maxRatio:'최대 철근비',maxStirrupSpacing:'최대 스터럽 간격 (m)'},inputs={};
 for(const [key,label] of Object.entries(fields)){const l=el('label',label+' '),input=el('input');input.type='number';input.step='any';input.setAttribute('aria-label',label);l.appendChild(input);assumptions.appendChild(l);inputs[key]=input;}
 const law=()=>{const used=Object.values(inputs).some(x=>x.value.trim());if(!used)return undefined;const result={};for(const [k,x] of Object.entries(inputs)){if(!x.value.trim()||!Number.isFinite(Number(x.value)))throw new Error('모든 계산가정을 입력하세요.');result[k]=Number(x.value);}return result;};
 section.appendChild(assumptions);
 const filterFields={};let resultFilter;
 const display=result=>{
  resultFilter=result.filter;
  for(const [key,input] of Object.entries(filterFields))input.value=resultFilter?.[key]||'';
  showRemainingRepairs(result);
  showPostApply(result.stale?null:result.postApplication);
  resultOffset=result.offset||0;nextResultOffset=result.nextOffset;if(resultOffset===0)resultOffsets.splice(0,resultOffsets.length,0);else if(!resultOffsets.includes(resultOffset))resultOffsets.push(resultOffset);
  status.textContent=result.stale?staleMessage(result):`상세 검토 ${result.summary.checkCount}건 · ${formatPracticalCounts(result.summary)}`;
  if(result.filteredTotal!==undefined)status.textContent+=` · 필터 결과 ${result.filteredTotal}건 (전체 판정 유지)`;
  table.replaceChildren();table.style.overflowX='auto';const t=el('table');t.style.cssText='width:100%;min-width:1100px;font-size:12px;border-collapse:collapse';
  const header=el('tr');for(const label of ['대상','조합','검토','상태','검정비','사유','KDS 근거','계산 상세','입력'])header.appendChild(el('th',label));t.appendChild(header);
  for(const row of result.checks){const tr=el('tr');for(const value of [row.entityId,row.comboId||'-',row.checkId,row.status,row.ratio?.toFixed(3)||'-',row.reason==='DESIGN_STANDARD_SELECTION_REQUIRED'?`검토 기준 선택 필요: ${(row.requiredInputFields||[]).join(', ')}`:row.reason==='DESIGN_RULE_SCOPE_REVIEW_REQUIRED'?'선택 기준의 적용 범위·입력 확인 필요':labels[row.reason]||row.reason||'-',row.codeBasis?.applied?.length?row.codeBasis.applied.map(x=>`${x.code}:${x.edition} ${x.clause}`).join('; '):'적용 미확정 — '+(row.codeBasis?.reviewTargets||[]).map(x=>`${x.code}:${x.edition} ${x.clause}`).join('; ')]){const td=el('td',value);td.style.cssText='padding:5px;border-bottom:1px solid #ddd';tr.appendChild(td);}if(bridge.getPracticalDesignCheck){const cell=el('td'),b=el('button','계산값·근거 전수 보기');b.type='button';b.addEventListener('click',async()=>{try{
 const selectedEvaluationId=evaluationId,result=await readDetail(args=>bridge.getPracticalDesignCheck({evaluationId:selectedEvaluationId,checkId:row.id,...args}));
 if(result.generation!==detailReadGeneration||evaluationId!==selectedEvaluationId)return;
 const detail=el('pre',result.text.length<=30000?JSON.stringify(result.value,null,2):result.text);detail.style.cssText='white-space:pre-wrap;max-height:480px;overflow:auto';table.querySelector('[data-check-detail]')?.remove();detail.dataset.checkDetail='true';table.appendChild(detail);
}catch(e){if(e.code!=='DETAIL_READ_CANCELLED')showError(e);}});cell.appendChild(b);tr.appendChild(cell);}const inputTarget=row.category==='concrete'&&row.detailId?{type:'reinforcement-record',id:row.detailId}:row.requiredInputRecords?.find(record=>['reinforcement-record','connection-record','foundation-record','ground-record','splice-record','design-profile-record'].includes(record.type));
 if(bridge.designInputPanel?.openRecord&&inputTarget){const cell=el('td'),button=el('button','입력 보완');button.type='button';button.addEventListener('click',()=>{try{
  const current=bridge.getPracticalDesignEvaluation({evaluationId:result.evaluationId});
  if(evaluationId!==result.evaluationId||!current.ok||current.stale||current.inputHash!==bridge.getWorkflowInputIdentity().inputHash)throw Error('STALE_INPUT');
  bridge.designInputPanel.openRecord(inputTarget.id?{type:inputTarget.type,id:inputTarget.id}:{type:inputTarget.type,seed:{memberId:inputTarget.memberId,nodeId:inputTarget.nodeId}});panel.hidden=true;
 }catch(error){showError(error);}});cell.appendChild(button);tr.appendChild(cell);}else tr.appendChild(el('td'));
 t.appendChild(tr);}table.appendChild(t);
 };
 const evaluateSources=async selectedSources=>{
  const at=++evaluationGeneration,inputHash=bridge.getWorkflowInputIdentity().inputHash;const mechanicsLaw=law();stopCandidateView();evaluationId=null;
  const result=await bridge.evaluatePracticalDesign({inputHash,sources:selectedSources,...(mechanicsLaw?{mechanicsLaw}:{})});
  if(at!==evaluationGeneration||bridge.getWorkflowInputIdentity().inputHash!==inputHash)return;
  if(!result.ok||result.stale)throw Error(result.code||'STALE_INPUT');
  sources=selectedSources;evaluationId=result.evaluationId;display(result);return result;
 };
 installSpliceTransferControls({target,bridge,panel:section});
 const spliceControls=installSpliceSourceControls({target,bridge,panel:section,onEvaluate:evaluateSources,onCancelReview:()=>{evaluationGeneration++;evaluationId=null;bridge.cancelPracticalDesignEvaluation?.();}});
 const rcControls=installRcServiceControls({target,bridge,panel:section,onEvaluate:evaluateSources,onCancelReview:()=>{evaluationGeneration++;evaluationId=null;bridge.cancelPracticalDesignEvaluation?.();}});
 button('제공 상세 검토',()=>evaluateSources(getSources()));
 if(bridge.getPracticalDesignContext){
  const storedEvaluation=el('select');storedEvaluation.setAttribute('aria-label','저장된 상세 검토');storedEvaluation.style.maxWidth='100%';section.appendChild(storedEvaluation);
  button('저장된 상세 검토 목록 새로고침',()=>{
   const previous=storedEvaluation.value,rows=bridge.getPracticalDesignContext().evaluations||[];
   storedEvaluation.replaceChildren();const placeholder=el('option','검토 기록 선택');placeholder.value='';storedEvaluation.appendChild(placeholder);
   for(const row of rows){const option=el('option',`${row.evaluationId} · ${row.stale?staleMessage(row):'현재 결과'}`);option.value=row.evaluationId;storedEvaluation.appendChild(option);}
   storedEvaluation.value=rows.some(row=>row.evaluationId===previous)?previous:'';
  });
  button('선택한 상세 검토 불러오기',()=>{
   const id=storedEvaluation.value,row=(bridge.getPracticalDesignContext().evaluations||[]).find(x=>x.evaluationId===id);
   if(!row)throw Error('PRACTICAL_EVALUATION_REQUIRED');
   const inputHash=bridge.getWorkflowInputIdentity().inputHash;
   if(row.stale)throw Error(staleMessage(row));
   if(row.inputHash!==inputHash)throw Error('STALE_INPUT');
   const result=bridge.getPracticalDesignEvaluation({evaluationId:id});
   if(result.stale)throw Error(staleMessage(result));
   if(!result.ok||result.inputHash!==inputHash)throw Error(result.code||'STALE_INPUT');
   evaluationGeneration++;stopCandidateView();evaluationId=id;sources=structuredClone(row.sources||[]);display(result);
  });
 }
 if(bridge.cancelPracticalDesignEvaluation)button('상세 검토 취소',()=>{evaluationGeneration++;evaluationId=null;bridge.cancelPracticalDesignEvaluation();status.textContent='상세 검토 취소 요청됨';});
 for(const [key,label] of Object.entries({status:'검사 상태',entityId:'대상 ID',comboId:'조합 ID',checkId:'검사 종류',reason:'미검토·실패 사유 코드'})){
  const input=el(key==='status'?'select':'input');input.setAttribute('aria-label',`검사 필터 ${label}`);
  if(key==='status')for(const [value,text] of [['','모든 상태'],['OK','OK'],['NG','NG'],['NOT_CHECKED','미검토'],['N_A','비대상'],['FAILED','실패']]){const option=el('option',text);option.value=value;input.appendChild(option);}
  else{input.type='text';input.maxLength=200;}
  const wrapper=el('label',label+' ');wrapper.appendChild(input);section.appendChild(wrapper);filterFields[key]=input;
 }
 button('검사 필터 적용',()=>display(bridge.getPracticalDesignEvaluation({evaluationId,filter:Object.fromEntries(Object.entries(filterFields).filter(([,input])=>input.value.trim()).map(([key,input])=>[key,input.value.trim()]))})));
 button('검사 필터 해제',()=>{for(const input of Object.values(filterFields))input.value='';display(bridge.getPracticalDesignEvaluation({evaluationId}));});
 const readPage=offset=>display(bridge.getPracticalDesignEvaluation({evaluationId,offset,...(resultFilter?{filter:resultFilter}:{})}));
 button('상세 결과 새로고침',()=>readPage(0));
 button('이전 검사',()=>readPage(Math.max(0,...resultOffsets.filter(x=>x<resultOffset))));
 button('다음 검사',()=>{if(nextResultOffset!==null)readPage(nextResultOffset);});
 const targetKind=el('select');targetKind.setAttribute('aria-label','후보 대상 종류');for(const [value,label] of [['member','부재 배근'],['foundation','독립기초'],['connection','접합 구속']]){const option=el('option',label);option.value=value;targetKind.appendChild(option);}section.appendChild(targetKind);
 const footingSizes=el('input');footingSizes.setAttribute('aria-label','기초 후보 BxLx두께 (m)');const footingLabel=el('label','기초 후보 BxLx두께 (m, 쉼표 구분) ');footingLabel.appendChild(footingSizes);section.appendChild(footingLabel);
 const distributionLabel=el('label','기초 철근 분배 후보 '),distribution=el('select');for(const [value,label] of [['','현재 배치 유지'],['uniform','균등'],['kds-centered-band','KDS 중앙 유효폭']]){const option=el('option',label);option.value=value;distribution.appendChild(option);}distributionLabel.appendChild(distribution);section.appendChild(distributionLabel);
 const memberLabel=el('label','후보 대상 ID '),member=el('input');member.setAttribute('aria-label','후보 대상 ID');memberLabel.appendChild(member);section.appendChild(memberLabel);
 const spacingLabel=el('label','허용 스터럽 간격 (mm, 쉼표 구분) '),spacings=el('input');spacings.value='150, 100, 75';spacings.setAttribute('aria-label','허용 스터럽 간격');spacingLabel.appendChild(spacings);section.appendChild(spacingLabel);
 const countLabel=el('label','상·하단 각 층의 주근 개수 후보 (쉼표 구분, 선택) '),barCounts=el('input');barCounts.setAttribute('aria-label','각 면의 층당 주근 개수 후보');countLabel.appendChild(barCounts);section.appendChild(countLabel);
 const coverLabel=el('label','허용 피복 후보 (m, 쉼표 구분, 선택) '),covers=el('input');covers.setAttribute('aria-label','허용 피복 후보');coverLabel.appendChild(covers);section.appendChild(coverLabel);
 const sectionLabel=el('label','허용 단면 BxH (mm, 쉼표 구분, 선택) '),sectionSizes=el('input');sectionSizes.setAttribute('aria-label','허용 단면 후보');sectionLabel.appendChild(sectionSizes);section.appendChild(sectionLabel);
 const showCandidateFields=()=>{const kind=targetKind.value;footingLabel.hidden=kind!=='foundation';distributionLabel.hidden=kind!=='foundation';for(const label of [countLabel,coverLabel,sectionLabel])label.hidden=kind!=='member';spacingLabel.hidden=kind==='foundation';};targetKind.addEventListener('change',showCandidateFields);targetKind.addEventListener('change',stopCandidateView);member.addEventListener('input',stopCandidateView);showCandidateFields();
 function poll(expectedJob=jobId,epoch=candidateViewEpoch){if(!expectedJob||expectedJob!==jobId||epoch!==candidateViewEpoch)return;pollTimer=null;try{const job=bridge.getDesignCandidateJob({jobId});candidateRunning=job.status==='running';showPostApply(job.stale?null:job.application?.followUp);const candidates=[...job.candidates];let next=job.nextOffset;while(next!==null){const page=bridge.getDesignCandidateJob({jobId,offset:next});candidates.push(...page.candidates);next=page.nextOffset;}status.textContent=`${labels[job.error]||labels[job.status]||job.error||job.status} · 후보 ${job.candidateCount}개${stageText(job.stageTiming)}`;candidateList.replaceChildren();for(const c of candidates.filter(x=>x.summary)){const option=el('option',`${c.changes.detailEdit?Object.entries(c.changes.detailEdit).map(([k,v])=>`${k} ${v}`).join(' · '):`배근 ${c.changes.regionCount||1}구간 · ${c.changes.stirrupSpacing==null?'기존 간격 유지':`간격 ${c.changes.stirrupSpacing}mm`}`} ${c.changes.section?`${c.changes.section.B}x${c.changes.section.H}`:''} / ${formatPracticalCounts(c.summary)} · 최대 NG 검정비 ${c.engineeringSeverity?.affected.maximumNgRatio>0?c.engineeringSeverity.affected.maximumNgRatio.toFixed(3):'-'} · 검정비 미산정 ${c.engineeringSeverity?.affected.unquantifiedNgCount??0}건`);option.value=c.candidateId;candidateList.appendChild(option);}if(job.best)candidateList.value=job.best.candidateId;if(['running','applying'].includes(job.status))pollTimer=target.setTimeout(()=>poll(expectedJob,epoch),150);}catch(e){showError(e);}}
 button('프로젝트 적용 범위·하중 검토 상태',()=>{const context=bridge.getPracticalDesignContext();table.replaceChildren(el('pre',JSON.stringify({loadScopeHash:context.loadScopeHash,projectProfile:context.projectProfile},null,2)));});
 button('허용 조건으로 후보 찾기',()=>{const ss=spacings.value.split(',').map(x=>Number(x.trim())),candidateTarget=targetKind.value==='foundation'?{foundationId:member.value.trim(),detailCandidates:footingSizes.value.split(',').map(x=>{const [B,L,thickness]=x.trim().split(/[xX×]/).map(Number);return {B,L,thickness,...(distribution.value?{barDistribution:distribution.value}:{})};})}:targetKind.value==='connection'?{connectionId:member.value.trim(),detailCandidates:ss.map(tieSpacing=>({tieSpacing}))}:{memberId:member.value.trim(),...(dependentInput.value.trim()?{dependentCandidates:JSON.parse(dependentInput.value)}:{}),...(regionConstraintsInput.value.trim()?{regionConstraints:JSON.parse(regionConstraintsInput.value)}:{}),spacings:ss,...(covers.value.trim()?{covers:covers.value.split(',').map(Number)}:{}),...(barCounts.value.trim()?{barsPerFace:barCounts.value.split(',').map(Number)}:{}),...(sectionSizes.value.trim()?{sectionCandidates:sectionSizes.value.split(',').map(x=>{const [B,H]=x.trim().split(/[xX×]/).map(Number);return {B,H};})}:{})};const plan=bridge.planDesignCandidates({evaluationId,...candidateTarget,maxCandidates:8,maxMillis:10000,autoApply:false});jobId=bridge.startDesignCandidates({planId:plan.planId,requestId:request()}).jobId;candidateViewEpoch++;if(pollTimer)target.clearTimeout(pollTimer);poll();});
 const proposalStatus=el('p');proposalStatus.setAttribute('role','status');
 const startAutomaticCandidates=async()=>{
  if(!evaluationId)throw Error('PRACTICAL_EVALUATION_REQUIRED');
  const id=member.value.trim();if(!id)throw Error('CANDIDATE_TARGET_REQUIRED');
  const selectedEvaluation=evaluationId,selectedGeneration=evaluationGeneration,selectedKind=targetKind.value,selectedInputHash=bridge.getWorkflowInputIdentity().inputHash;
  const selectionCurrent=()=>evaluationId===selectedEvaluation&&evaluationGeneration===selectedGeneration&&targetKind.value===selectedKind&&member.value.trim()===id&&bridge.getWorkflowInputIdentity().inputHash===selectedInputHash;
  const targetInput=targetKind.value==='foundation'?{foundationId:id}:targetKind.value==='connection'?{connectionId:id}:{memberId:id};
  let plan;
  try{plan=await bridge.planDesignCandidates({evaluationId:selectedEvaluation,...targetInput,maxCandidates:8,maxMillis:10000,autoApply:false});}
  catch(error){if(selectionCurrent()&&error.proposalFailure){const failure=error.proposalFailure;proposalStatus.textContent=`자동 후보 생성 불가 · ${failure.code} · ${(failure.generation?.proposalFailures||[]).map(p=>`${p.component}: ${p.reason}`).join('; ')}`;}throw error;}
  if(!selectionCurrent())throw Error('STALE_CANDIDATE_SELECTION');
  if(!plan.ok||!plan.generation?.ok){proposalStatus.textContent=plan.generation?.reason||plan.code||'';throw Error('AUTOMATIC_PROPOSAL_UNAVAILABLE');}
  proposalStatus.textContent=`자동 후보 대상 ${id} · 근거 검사 ${plan.generation.basisCheckIds?.length??'미기록'}개 · 후보별 전체 재검토 후 적용 가능${plan.generation.dependentProposalUnavailableCount?` · 연결 상세 제안 제외 ${plan.generation.dependentProposalUnavailableCount}건 (${(plan.generation.dependentProposalUnavailable||[]).slice(0,3).map(x=>`${x.id}: ${x.reason}`).join('; ')})`:''}`;
  const started=await bridge.startDesignCandidates({planId:plan.planId,requestId:request()});
  if(!started.jobId)throw Error(started.code||'CANDIDATE_START_FAILED');
  if(!selectionCurrent()){await bridge.cancelDesignCandidates({jobId:started.jobId});throw Error('STALE_CANDIDATE_SELECTION');}
  jobId=started.jobId;candidateViewEpoch++;if(pollTimer)target.clearTimeout(pollTimer);poll();
 };
 button('계산 요구량으로 자동 후보',startAutomaticCandidates);
 section.appendChild(el('p','자동 후보는 현재 검토 결과와 저장된 배근·기초 정보를 사용합니다.'));
 section.appendChild(proposalStatus);
 if(bridge.resumeDesignCandidates)button('남은 후보 이어서 검토',async()=>{
  if(!jobId)throw Error('JOB_REQUIRED');
  const priorJob=jobId,selectedEvaluation=evaluationId,selectedGeneration=evaluationGeneration,selectedEpoch=candidateViewEpoch,selectedKind=targetKind.value,selectedMember=member.value.trim(),selectedHash=bridge.getWorkflowInputIdentity().inputHash;
  const started=await bridge.resumeDesignCandidates({jobId:priorJob,requestId:request(),maxCandidates:8,maxMillis:10000});
  if(!started.jobId)throw Error(started.code||'CANDIDATE_CONTINUATION_FAILED');
  if(jobId!==priorJob||evaluationId!==selectedEvaluation||evaluationGeneration!==selectedGeneration||candidateViewEpoch!==selectedEpoch||targetKind.value!==selectedKind||member.value.trim()!==selectedMember||bridge.getWorkflowInputIdentity().inputHash!==selectedHash){await bridge.cancelDesignCandidates({jobId:started.jobId});throw Error('STALE_CANDIDATE_SELECTION');}
  jobId=started.jobId;candidateViewEpoch++;if(pollTimer)target.clearTimeout(pollTimer);poll();
  proposalStatus.textContent=`이전 탐색 ${priorJob}의 후보는 보존됩니다. 현재 목록은 이어서 검토한 후보입니다.`;
 });
 button('후보 탐색 취소',()=>{const result=bridge.cancelDesignCandidates({jobId});if(!result.ok)throw Error(result.code);return result;});section.appendChild(candidateList);candidateList.addEventListener('change',clearCandidateDetail);
 button('후보 조건·수량 상세 보기',async()=>{
 const selectedJob=jobId,selectedCandidate=candidateList.value,selectedEpoch=candidateViewEpoch,selectedHash=bridge.getWorkflowInputIdentity().inputHash,result=await readDetail(args=>bridge.getDesignCandidateDetail({jobId:selectedJob,candidateId:selectedCandidate,...args}),{hashKey:'detailHash',totalKey:'total',encoding:'json-text'});
 if(result.generation!==detailReadGeneration||candidateViewEpoch!==selectedEpoch||bridge.getWorkflowInputIdentity().inputHash!==selectedHash||jobId!==selectedJob||candidateList.value!==selectedCandidate)return;
 clearCandidateDetail();candidateDetailPanel=el('div');table.replaceChildren(candidateDetailPanel);renderReinforcementChanges(doc,candidateDetailPanel,result.value.reinforcementChanges);renderSpliceChanges(doc,candidateDetailPanel,result.value.spliceChanges,result.value.changes);renderConnectedDetailChanges(doc,candidateDetailPanel,result.value.foundationChanges,'foundation-record');renderConnectedDetailChanges(doc,candidateDetailPanel,result.value.connectionChanges,'connection-record');
 const raw=el('details');raw.appendChild(el('summary','전체 후보 자료'));raw.appendChild(el('pre',result.text.length<=30000?JSON.stringify(result.value,null,2):result.text));candidateDetailPanel.appendChild(raw);
 });
 function showCandidateBasis(offset=0){
  const result=bridge.getDesignCandidateBasis({jobId,candidateId:candidateList.value,offset});basisOffset=result.nextOffset;
  table.replaceChildren();
  for(const row of result.rows){
   table.appendChild(el('h4',`${row.checkId}: ${row.status}`));
   for(const ref of (row.applied?.length?row.applied:row.reviewTargets||[])){
    table.appendChild(el('p',`${ref.code}:${ref.edition} ${ref.clause} · ${row.applied?.length?'조항 적용':'적용 미확정'}`));
    table.appendChild(el('p',`원문 SHA-256: ${ref.sha256||'미확보'}`));
   }
  }
  status.textContent=`${result.stale?'이전 입력의 후보 · ':''}KDS 근거 ${offset+1}–${Math.min(offset+result.rows.length,result.total)} / ${result.total}건`;
 }
 if(bridge.getDesignCandidateBasis){
  button('선택 후보 KDS 근거',()=>showCandidateBasis());
  button('다음 KDS 근거',()=>{if(basisOffset!==null)showCandidateBasis(basisOffset);});
  candidateList.addEventListener('change',()=>{basisOffset=null;});
 }
 const applicationNotice=el('p');applicationNotice.setAttribute('role','status');section.appendChild(applicationNotice);
 if(bridge.applyDesignCandidateAndReview)button('선택 후보 적용·재해석·검토',async()=>{
  const selectedEpoch=candidateViewEpoch,selectedGeneration=evaluationGeneration,selectedJob=jobId,selectedCandidate=candidateList.value;applicationNotice.textContent='';
  status.textContent='후보 적용 및 후속 해석·검토 중';
  const key=`${jobId}:${candidateList.value}`;
  if(!reviewRequests.has(key)){while(reviewRequests.size>=16)reviewRequests.delete(reviewRequests.keys().next().value);reviewRequests.set(key,request());}
  const result=await bridge.applyDesignCandidateAndReview({jobId,candidateId:candidateList.value,requestId:reviewRequests.get(key)});
  refreshSources();
  if(candidateViewEpoch!==selectedEpoch||evaluationGeneration!==selectedGeneration||jobId!==selectedJob||candidateList.value!==selectedCandidate){applicationNotice.textContent=`이전 선택의 후보 적용 결과: ${result.ok?'적용·후속 검토 완료':result.applied?'입력 적용 후 후속 검토 중단':'적용 중단'}. 현재 입력 기준으로 다시 검토하세요.`;return;}
  if(!result.ok){status.textContent=result.applied?'입력은 적용됐지만 후속 계산이 중단됐습니다. 같은 버튼으로 재시도하거나 입력 실행 취소를 선택하세요.':`적용 중단: ${result.code}`;return;}
  evaluationId=result.followUp.evaluationId;sources=result.followUp.sources;display(bridge.getPracticalDesignEvaluation({evaluationId}));
  showPostApply(result.followUp);
  const comparison=result.followUp.comparison;
  if(comparison){const c=comparison.counts;table.appendChild(el('p',`적용 전후: NG 해소 ${c.resolvedNg}건 · 잔여 NG ${c.remainingNg}건 · 새 NG ${c.newNg}건 · NG에서 미검토로 변경 ${c.ngToIncomplete}건 · 잔여 미검토 ${c.remainingIncomplete}건 · 새 미검토 ${c.newIncomplete}건 · 삭제된 검사 ${c.removed}건`));const detail=el('details');detail.appendChild(el('summary','변경 전후 검토 기록'));detail.appendChild(el('pre',JSON.stringify(comparison,null,2)));table.appendChild(detail);}
 });
 button('선택 후보 적용',()=>{const result=bridge.applyDesignCandidate({jobId,candidateId:candidateList.value,requestId:request()});if(!result.ok)throw new Error(result.code);status.textContent='후보 적용됨 - 해석 재사용 가능 여부 확인 후 다시 검토하세요.';refreshSources();});
 button('해석 재사용 후 재검토',async()=>{
  // RC sources depend on reinforcement and must retain their original identity.
  // The shared evaluator checks their currentness; only static sources support reuse.
  const inputHash=bridge.getWorkflowInputIdentity().inputHash;
  const selected=sources.map(source=>{
   if(source.rcSpliceId||source.rcIterationId)return {...source};
   const result=bridge.reuseDesignAnalysis({analysisRunId:source.analysisRunId,inputHash});
   if(!result.ok)throw Error(result.code);return {...source,analysisRunId:result.analysisRunId};
  });
  await evaluateSources(selected);refreshSources();
 });
 const pdfVolume=el('input');pdfVolume.type='number';pdfVolume.min='1';pdfVolume.max='10';pdfVolume.value='1';pdfVolume.setAttribute('aria-label','PDF 권 번호');section.appendChild(el('label','PDF 권 번호 (권당 최대 60쪽)'));section.appendChild(pdfVolume);
 const artifactControls=installDrawingArtifactControls({document:doc,container:section,bridge,isBusy:()=>!!downloadController});
 for(const format of ['pdf','pdf-bundle','svg','json','csv'])button(format==='pdf-bundle'?'상세 PDF 전권 ZIP 저장':`상세 ${format.toUpperCase()} 저장`,async()=>{
  if(downloadController)throw Error('DRAWING_DOWNLOAD_BUSY');
  const selectedEvaluationId=evaluationId,controller=new AbortController();downloadController=controller;
  try{
   const exported=await bridge.exportDesignDrawings({evaluationId:selectedEvaluationId,format,...(format==='pdf'?{volume:Number(pdfVolume.value)-1}:{})});
   if(!exported.ok)throw Object.assign(new Error(exported.code||'DRAWING_EXPORT_FAILED'),{code:exported.code});
   await artifactControls.refresh();
   if(evaluationId!==selectedEvaluationId)throw Error('STALE_DRAWING_SELECTION');
   const downloadLease=downloadResources.acquire(exported.byteLength);
   try{
   const bytes=await readDrawingArtifact(exported,args=>bridge.getDesignDrawingArtifact(args),{signal:controller.signal});
   if(evaluationId!==selectedEvaluationId||controller.signal.aborted)throw Error('STALE_DRAWING_SELECTION');
   const url=downloadLease.createUrl(bytes,exported.mime),a=el('a');a.href=url;a.download=`${selectedEvaluationId}${format==='pdf'?`-vol${exported.volume+1}`:''}.${format==='pdf-bundle'?'zip':format}`;doc.body.appendChild(a);a.click();doc.body.removeChild(a);status.textContent=format==='pdf-bundle'?`PDF ${exported.volumeCount}권 · ${exported.totalPages}쪽과 해시 목록을 ZIP으로 저장했습니다.`:format==='pdf'?`${exported.volume+1}/${exported.volumeCount}권 저장 (${exported.pageStart}~${exported.pageEnd}/${exported.totalPages}쪽). ${exported.nextVolume!==null?'다음 권 번호를 선택해 저장하세요.':'마지막 권입니다.'}`:'검토용 상세 파일을 생성했습니다.';
   }finally{downloadLease.release();}
  }finally{if(downloadController===controller)downloadController=null;}
 });
 button('도면 출력 취소',()=>{downloadController?.abort();return bridge.cancelDesignDrawingExport();});section.appendChild(status);section.appendChild(table);panel.appendChild(section);
 // Group existing nodes without rebuilding controls or losing in-progress state.
 if(doc.defaultView){
  const group=(title,first,end)=>{if(!first||first.parentNode!==section)return;const box=el('details');box.className='ss-ux-task';box.appendChild(el('summary',title));section.insertBefore(box,first);for(let node=first;node&&node!==end;){const next=node.nextSibling;box.appendChild(node);node=next;}return box;};
  if(rcControls?.section)group('RC 사용성·장기변형',rcControls.section,rcControls.section.nextSibling);
  if(spliceControls?.root)group('이음 해석 결과',spliceControls.root,spliceControls.root.nextSibling);
  const reportStart=pdfVolume.previousSibling;
  group('보완안 조건·탐색·적용',targetKind,reportStart);
  group('검토 계산서·도면·수량 출력',reportStart,status);
 }
 target.addEventListener?.('pagehide',()=>{downloadResources.clearUrls();artifactControls.invalidate();evaluationGeneration++;stopCandidateView();bridge.cancelPracticalDesignEvaluation?.();if(downloadController){downloadController.abort();bridge.cancelDesignDrawingExport?.();}detailReadController?.abort();if(pollTimer)target.clearTimeout(pollTimer);});
 return {section};
}
