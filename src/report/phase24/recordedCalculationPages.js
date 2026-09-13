import {practicalInputFields} from '../../modeling/practicalInputContract.js';
import {selectReportSource} from './drawingSnapshot.js';
import {stableHash} from '../../core/stableHash.js';
import {wrapReportText} from './wrapReportText.js';
import {jsonTextWindow} from '../../core/jsonTextWindow.js';
import {jsonTokens} from '../../core/jsonTokens.js';
import {formatPracticalCounts} from '../practicalSummaryFormat.js';
// Render stored values only. Capacity, effective section and geometry must be
// prepared by their owning numerical modules before reaching this formatter.
export function appendRecordedCalculationPages({snapshot,pages,quantities,createPage,writeText,maxPages=60}) {
 const labels={memberId:'부재 ID',diameter:'직경 (m)',area:'단면적 (m²)',areaBasis:'단면적 근거',designation:'제품 호칭',productReference:'제품 자료',productEdition:'제품 판본',productVerification:'제품 확인 상태',count:'개수',bodyLength:'본체 길이 (m)',bodyVolume:'본체 체적 (m³)',cutLength:'형상 길이 (m)',reason:'사유',fabricationApproved:'제작 승인',capacity:'내력/허용값 (단위 항목 참조)',demand:'수요 (단위 항목 참조)',ratio:'검정비',shape:'철근 형상',spacing:'간격 (m)',face:'배근 면',effectiveDepth:'유효 깊이 (m)',steelArea:'철근 면적 (m²)',barCount:'철근 개수'};
 let current=null,y=0,title='';
 const shared=new Map(),identities=new WeakMap(),largeRecords=new Map(),references=new Map();let sharedBytes=0,identityCount=0;
 const row=(value,nextTitle)=>{
  for(const line of wrapReportText(typeof value==='string'?[value]:value)){
   if(!current||title!==nextTitle||y>760){title=nextTitle;current=createPage(title,snapshot,{id:'recorded-data',version:1});pages.push(current);y=163;if(pages.length>maxPages)throw new Error('DRAWING_PAGE_LIMIT');}
   writeText(current,35,y,line,8);y+=13;
  }
 };
 const codeReference=(ref,prefix,nextTitle)=>{
  const key=JSON.stringify([ref.code,ref.edition,ref.clause,ref.sha256]),prior=references.get(key);
  if(prior){row(`${prefix}: ${ref.code}:${ref.edition} ${ref.clause} [근거 ${prior.id}, ${prior.page}쪽]`,nextTitle);return;}
  const id=`K${references.size+1}`;
  row(`${prefix}: ${ref.code}:${ref.edition} ${ref.clause} [${ref.sha256}]${references.size<256?` (근거 ${id})`:''}`,nextTitle);
  if(references.size<256)references.set(key,{id,page:pages.length});
 };
 const hashes=new Map();
 const isHash=value=>typeof value==='string'&&/^[a-fA-F0-9]{64}$/.test(value);
 const values=(value,prefix,nextTitle)=>{
  // Preserve every distinct digest verbatim once; references use exact string
  // equality and point to its printed page. This never changes stored data.
  if(isHash(value)){
   const prior=hashes.get(value);
   if(prior){row(`${prefix}: 해시 ${prior.id} 참조 (${prior.page}쪽)`,nextTitle);return;}
   if(hashes.size<2048){
    const id=`H${hashes.size+1}`;
    row(`${prefix}: 해시 ${id}`,nextTitle);
    row(value,nextTitle);hashes.set(value,{id,page:pages.length});return;
   }
  }
  if(Array.isArray(value)&&value.length>0&&value.every(isHash)){
   row(`${prefix}: 해시 목록 ${value.length}건 (원래 순서)`,nextTitle);
   for(let i=0;i<value.length;i++)values(value[i],`${prefix}[${i+1}]`,nextTitle);
   return;
  }
  if(value===null||typeof value!=='object'){row([`${labels[prefix]||prefix}: `,String(value===undefined?'미입력':value===null?'미정':typeof value==='boolean'?(value?'예':'아니오'):value)],nextTitle);return;}
  if(prefix.split('.').at(-1)==='creepEffects'&&!Array.isArray(value)){
   const names={effectiveE:'유효탄성계수 (MPa)',elasticModulusAtLoading:'재하 시 탄성계수 (MPa)',creepCoefficient:'크리프 계수',loadingAgeDays:'재하 재령 (일)',evaluationAgeDays:'평가 재령 (일)',reference:'크리프 입력 근거',shrinkageIncluded:'지정 수축 포함',shrinkageInitialStrain:'수축 초기변형률 (무차원)',shrinkageReference:'수축 입력 근거',ageingStressHistoryIncluded:'재령별 응력 이력 포함',designTransferAllowed:'최종 설계 이관 허용',codeReferences:'KDS 관련 근거',technicalReference:'기술 참고자료',technicalReferenceVerification:'참고자료 확인 상태',method:'시간효과 방법',version:'시간효과 기록 버전',equation:'적용식',modulusUnit:'탄성계수 단위',basis:'적용 전제',coefficientAutomaticallyPredicted:'크리프 계수 자동 예측'};
   for(const [memberId,effect] of Object.entries(value)){
    row(`부재 ${memberId}: 해석에 적용된 시간효과`,nextTitle);
    for(const [key,item] of Object.entries(effect))values(item,names[key]||key,nextTitle);
   }
   return;
  }
  if(value.version==='p25-reinforcement-mass-v1'){
   row(`공칭 질량: ${value.status==='OK'?`${value.totalMassKg} kg`:'미확정'} / 단중 ${value.unitMassKgPerM??'미확정'} kg/m`,nextTitle);
   row(`대상 조각 ${value.pieceCount??'미확정'}개 / 중심선 길이 합 ${value.totalLength??'미확정'} m / 제작 승인 별도`,nextTitle);
   if(value.reason)row(`질량 미확정 사유: ${value.reason}`,nextTitle);
   if(value.scope)row(`질량 집계 범위: ${value.scope}`,nextTitle);
   row('가공 공차와 구매 손실은 포함하지 않음',nextTitle);return;
  }
  if(value.version==='p25-applied-flexural-stiffness-v1'){
   row('해석에 적용된 강성 기록 (수치 수렴과 설계 방법 적합성은 별도)',nextTitle);
   const names={version:'강성 기록 버전',sourceModelHash:'원래 모델 해시',appliedProfileHash:'실제 적용 강성 해시',basis:'적용 경로',profileCount:'강성 적용 부재 수',segmentCount:'강성 적용 구간 수',coupledAxialBendingIncluded:'축력·이축휨 연성 포함',originalShearTorsionAndMass:'원래 전단·비틀림 강성 및 질량 유지',globalMethodQualified:'전체 방법 자격 확인',rcPolicyVersion:'RC 강성 정책 버전',stiffnessMode:'강성 계산 모드',timeEffect:'시간 효과',timeHistoryCreepIncluded:'시간 이력 크리프 포함'};
   for(const [key,item] of Object.entries(value))row([`${names[key]||key}: `,item==null?'미기록':typeof item==='boolean'?(item?'예':'아니오'):String(item)],nextTitle);
   return;
  }
  if(value.geometryKind==='longitudinal-quantity-row-v1'){
   row(`${prefix}: ${value.mark} / ${value.status} / 조각 ${value.pieceCount??'미정'}개 / 단면적 ${value.area} m²`,nextTitle);
   row(`조각 기하 길이 합 ${value.geometricLength??'미정'} m / 체적 ${value.volume??'미정'} m³ / 제작 미승인`,nextTitle);
   if(value.includesLapOverlap)row('겹침 길이는 조각 합계에 포함됨: 추가 겹침 참고량 중복 합산 제외',nextTitle);
   if(value.reason)row(`사유: ${value.reason}`,nextTitle);
   if(value.massQuantity)values(value.massQuantity,'공칭 질량',nextTitle);
   return;
  }
  if(value.geometryKind==='transverse-quantity-row-v1'){
   row(`${prefix}: ${value.mark} / ${value.count}개 / 단면적 ${value.area} m² / 1개 기하 길이 ${value.geometricLength} m`,nextTitle);
   row(`총길이 ${value.totalLength} m / 체적 ${value.volume} m³ / 제작 미승인${value.planeOffset!==undefined?` / 평면 높이 ${value.planeOffset} m`:''}`,nextTitle);
   for(const [i,b] of (value.bends||[]).entries())row(`굽힘 ${i+1}: 중심선 반지름 ${b.centerlineRadius} m / 각도 ${b.angleDegrees}° / 길이 ${b.length} m`,nextTitle);
   for(const ref of value.codeReferences||[])codeReference(ref,'KDS',nextTitle);
   if(value.massQuantity)values(value.massQuantity,'공칭 질량',nextTitle);
   return;
  }
  if(value.geometryKind==='spatial-hoop-face-v1'&&value.reportSummary){
   const summary=value.reportSummary;row(`${prefix}: 공간 직선면 접촉 ${summary.status} (상세는 저장 결과 참조)`,nextTitle);
   if(summary.reason)row(`사유: ${summary.reason}`,nextTitle);
   for(const face of summary.faces){row(`직선면 ${face.face}: 접촉 주근 ${JSON.stringify(face.contactedBarIndices)}`,nextTitle);for(const c of face.candidates)row(`주근 ${c.bar}: 접촉 ${c.covered}/${c.total}, 최초 누락 번호 ${c.firstMissing??'없음'}, 위치 ${c.firstMissingPlane??'없음'} m`,nextTitle);}
   return;
  }
  if(value.geometryKind==='spatial-hoop-support-v1'&&value.reportSummary){
   const summary=value.reportSummary;
   row(`${prefix}: 공간 지지 ${summary.status} (접촉 상세는 저장 결과 참조)`,nextTitle);
   row(`지지 주근: ${JSON.stringify(summary.supportedBarIndices)} / 폐합 주근: ${JSON.stringify(summary.closureBarIndices)} / 제작 승인: ${summary.fabricationApproved}`,nextTitle);
   if(summary.reason)row(`사유: ${summary.reason}`,nextTitle);
   row(`몸체 접촉: ${summary.bodyContactStatus}`,nextTitle);
   for(const bend of summary.bodyCoverage){row(`몸체 굽힘 ${bend.bend}: ${bend.status}`,nextTitle);for(const c of bend.candidates)row(`주근 ${c.bar}: 접촉 ${c.covered}/${c.total}, 최초 누락 번호 ${c.firstMissing??'없음'}, 위치 ${c.firstMissingPlane??'없음'} m`,nextTitle);}
   return;
  }
  if(value.geometryKind==='bent-bar-path-3d-v1'&&value.reportSummary){row(`${prefix}: 3차원 경로 요약 (전체 형상은 저장 결과 참조)`,nextTitle);values(value.reportSummary,prefix,nextTitle);return;}
  if(value.kind==='rc-post-attachment-calculation-v1'){
   row('부착 후 장기 처짐 계산',nextTitle);
   row(`활하중 ${value.sources.live} / 지속하중 ${value.sources.sustained} / 균열강성 ${value.sources.cracking}`,nextTitle);
   row(`기간 ${value.durationMonths}개월 / 재하 순서 ${value.loadSequence} / 경계 ${value.boundary}`,nextTitle);
   row(`부재 길이 ${value.length} m / 손상 민감 ${value.damageSensitive} / 허용값 L/${value.limitDivisor}`,nextTitle);
   row(value.equation,nextTitle);
   for(const r of value.regions){
    row(`${r.detailId}@${r.detailVersion} / 구간 ${r.start} ~ ${r.end} / Ec ${r.Ec} MPa / Ie ${r.Ie} m^4`,nextTitle);
    row(`압축철근비 ${r.compressionRatio} / 장기계수 ${r.multiplier} / 부착 전 공제 ${r.preAttachmentMultiplier} / 잔여계수 ${r.remainingMultiplier} / 잔여 활하중 비율 ${r.remainingLiveFraction}`,nextTitle);
    row(`부착 전 공제 근거: ${r.preAttachmentReference??'공제 없음'}`,nextTitle);
   }
   row(`수요 ${value.result.demand} m / 허용값 ${value.result.capacity} m / 검정비 ${value.result.ratio} / 판정 ${value.result.status}`,nextTitle);
   row('전역 크리프 재분배 미포함 · 전체 설계전달 승인과 별도',nextTitle);
   for(const ref of value.codeReferences||[])codeReference(ref,'KDS 14 20 30',nextTitle);
   return;
  }
  if(value.code&&value.sha256&&value.clause){codeReference(value,prefix,nextTitle);return;}
  const identity=identities.get(value);if(identity){row(`${prefix}: 공통 자료 ${identity.id} 참조 (${identity.page}쪽)`,nextTitle);return;}
  // Exact serialized equality, not a numerical tolerance or a truncated hash.
  // Keep first occurrence in full; subsequent references identify its printed page.
  const window=jsonTextWindow(value,{limit:20001}),serialized=window.chunk;
  if(window.totalChars>20000){
   const key=`${window.totalChars}:${stableHash(value)}`,prior=largeRecords.get(key);
   if(prior&&sameJson(prior.value,value)){row(`${prefix}: 공통 자료 ${prior.id} 참조 (${prior.page}쪽)`,nextTitle);return;}
   if(identityCount<2048){const id=`R${++identityCount}`;row(`${prefix}: 공통 자료 ${id}`,nextTitle);const reference={id,page:pages.length};identities.set(value,reference);if(largeRecords.size<128&&!prior)largeRecords.set(key,{...reference,value});}
  }
  if(serialized.length>=160&&serialized.length<=20000){
   const prior=shared.get(serialized);
   if(prior){row(`${prefix}: 공통 자료 ${prior.id} 참조 (${prior.page}쪽)`,nextTitle);return;}
   if(sharedBytes+serialized.length*2<=1024*1024){
    const id=`D${shared.size+1}`;
    row(`${prefix}: 공통 자료 ${id}`,nextTitle);
    shared.set(serialized,{id,page:pages.length});sharedBytes+=serialized.length*2;
   }
  }
  if(Array.isArray(value)&&value.every(x=>x===null||['number','string','boolean'].includes(typeof x))){row((function*(){yield `${prefix}: `;yield* jsonTokens(value);})(),nextTitle);return;}
  if(!Array.isArray(value)&&Object.keys(value).length>1&&serialized.length<=512&&Object.values(value).every(x=>x===null||['number','boolean'].includes(typeof x))){row(`${prefix}: ${serialized}`,nextTitle);return;}
  for(const [key,item] of Object.entries(value))if(!['points','bendPoints','barPaths'].includes(key))values(item,`${prefix}${prefix?'.':''}${key}`,nextTitle);
 };
 if(snapshot.designComparison){
  const comparison=snapshot.designComparison,c=comparison.counts,title='후보 적용 전후 비교';
  row(`NG 해소 ${c.resolvedNg}건 / 잔여 NG ${c.remainingNg}건 / 새 NG ${c.newNg}건`,title);
  row(`NG에서 미검토로 변경 ${c.ngToIncomplete}건 / 잔여 미검토 ${c.remainingIncomplete}건 / 새 미검토 ${c.newIncomplete}건`,title);
  row(`삭제된 검사 ${c.removed}건. 검사 삭제나 미검토 전환은 NG 해소에 포함하지 않습니다.`,title);
  row(`변경 영향 범위 완료: ${comparison.affectedScope.complete?'예':'아니오'} / 프로젝트 완료: ${comparison.affectedScope.projectComplete?'예':'아니오'}`,title);
  if(comparison.proposalProvenance){
   const p=comparison.proposalProvenance;
   row(`자동 수정 생성기: ${p.generatorVersion} / 근거 검사 ${p.basisCheckCount}건 / 누락 ${p.missingBasisCheckCount}건`,title);
   row(`후보 근거: ${p.basis??'요약에 미포함 - 원본 평가의 후보 근거 상세 확인 필요'}`,title);
   for(const ref of p.codeReferences)row(`${ref.code} (${ref.edition}) / 조항 ${ref.clause}`,title);
   row(`후보 원본 해시: ${p.proposalHash} / 계산 근거 해시: ${p.basisChecksHash}`,title);
   if(p.truncated)row('근거 목록은 일부만 표시합니다. 원본 평가의 검사 상세와 해시를 함께 확인하십시오.',title);
  }
  if(comparison.connectedGeometryChanges){
   const changes=comparison.connectedGeometryChanges;
   row(`실제 적용 연결 치수: 상세 ${changes.recordCount}개 / 변경 항목 ${changes.fieldCount}개`,title);
   for(const change of changes.records||[]){
    if(current&&y>734)current=null; // Keep the detail heading with at least one value.
    const name=change.type==='foundation-record'?'기초':'접합부',fields=new Map(practicalInputFields(change.type).map(f=>[f.key,f]));
    row(`${name} ${change.id}: 버전 ${change.beforeVersion??'없음'} → ${change.afterVersion??'없음'}`,title);
    for(const f of change.fields||[])row(`${fields.get(f.key)?.label||f.key}: ${f.before??'미기록'} → ${f.after??'미기록'} ${f.unit}`,title);
   }
   if(changes.truncated)row('연결 치수 변경은 일부만 표시합니다. 전체 비교 상세를 해시로 조회하십시오.',title);
   row(`연결 치수 기록: ${changes.version} / 해시 ${stableHash(changes)}`,title);
   row('실제 적용 입력의 변경 기록입니다. 치수 변경 자체가 구조 적합성을 뜻하지 않습니다.',title);
  }
  if(comparison.repairOutcome){
   const outcome=comparison.repairOutcome;
   row(`변경 상세 ${outcome.changedDetailCount}개 / 유지한 배근 구간 ${outcome.preservedRegionCount}개`,title);
   row(`후속 검토 잔여 ${outcome.pendingCheckCount}건 / 변경 영향 범위 잔여 ${outcome.affectedPendingCheckCount}건`,title);
   for(const item of outcome.changedDetails)row(`변경: ${item.type} ${item.id}@${item.version}`,title);
   for(const item of outcome.pendingChecks){
    row(`${item.withinAffectedScope?'영향 범위':'범위 밖'} / ${item.entityId} / ${item.comboId} / ${item.checkId}: ${item.status}${item.incomplete?' · 미완료':''} / ${item.reason??'-'}`,title);
    if(item.requiredInputFields.length)row(`필요 입력: ${item.requiredInputFields.join(', ')}`,title);
    for(const ref of item.codeReferences)row(`기록된 KDS 근거: ${ref.code} (${ref.edition}) ${ref.clause} / 적용 상태 ${item.codeBasisStatus??'미기록'}`,title);
   }
   if(outcome.truncated)row('잔여 사유는 일부만 표시합니다. 후속 평가의 검사 상세에서 전체 기록을 확인하세요.',title);
  }
  values(Object.fromEntries(Object.entries(comparison).filter(([key])=>key!=='connectedGeometryChanges')),'비교 기록',title);
 }
 for(const source of snapshot.sets||[]){
  const title='해석 원본 및 수렴 근거',proof=source.analysisProof;
  row(`하중조합: ${source.source.comboId??'미기록'} / 원본: ${source.source.rcSpliceId??source.source.rcIterationId??source.source.analysisRunId??'미기록'}`,title);
  if(source.source.rcSpliceId){
   row(`이음 해석 버전: ${proof?.version??'미기록'}`,title);
   row(`내부 응력 수렴: ${proof?.stressIntegrationConvergenceVerified===true?'확인':'확인 필요'} / 프레임 수렴: ${proof?.frameRefinement?.convergenceVerified===true?'확인':'확인 필요'}`,title);
   row('수치 수렴은 전체 방법 검증이나 KDS 적합성 승인을 의미하지 않습니다.',title);
  }
  values(selectReportSource(source,{includeCreepEffects:true}),'원본','해석 원본 및 수렴 근거');
 }
 if(snapshot.summary?.counts)row(formatPracticalCounts(snapshot.summary),'실무 검토 집계');
 if(snapshot.summary?.combinationCoverage)values(snapshot.summary.combinationCoverage,'coverage','프로젝트 적용 범위 및 하중 확인');
 for(const q of quantities){
  row(`${q.detailId}@${q.version} / ${q.mark} / ${q.kind}`,'철근 전수 일람 및 수량');
  for(const [key,value] of Object.entries(q))if(!['detailId','version','mark','kind','points','codeReferences'].includes(key))values(value,key,'철근 전수 일람 및 수량');
 }
 for(const check of snapshot.checks){
  row(`${check.entityId} / ${check.comboId||'-'} / ${check.checkId} / ${check.status}`,'검사별 계산 및 미완료 사유');
  for(const [key,value] of Object.entries(check))if(!['codeBasis','entityId','comboId','checkId','status','barPaths'].includes(key))values(value,key,'검사별 계산 및 미완료 사유');
  const basis=check.codeBasis;
  if(basis){if(basis.rule)row(`규칙: ${basis.rule.id}@${basis.rule.version} / ${basis.rulePackHash}`,'검사별 계산 및 미완료 사유');row(`KDS: ${basis.status} / ${basis.calculationBasis||''}`,'검사별 계산 및 미완료 사유');for(const ref of basis.applied?.length?basis.applied:basis.reviewTargets||[])codeReference(ref,'KDS','검사별 계산 및 미완료 사유');}
 }
}

// Hashes only select candidates. Token equality confirms the complete stored
// JSON before substituting a reference, without allocating a large string.
function sameJson(a,b){
 const left=jsonTokens(a),right=jsonTokens(b);
 try{while(true){const x=left.next(),y=right.next();if(x.done||y.done)return x.done===y.done;if(x.value!==y.value)return false;}}
 finally{left.return?.();right.return?.();}
}
