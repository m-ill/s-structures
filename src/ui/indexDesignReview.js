export function installIndexDesignReview(target, bridge) {
  const doc=target.document,host=doc?.querySelector?.('[data-ss-ribbon-panel="elastic"]');
  if(!host||!doc.body) return null;
  const el=(tag,text)=>{const node=doc.createElement(tag);if(text) node.textContent=text;return node;};
  const button=(text,fn)=>{const node=el('button',text);node.type='button';node.addEventListener('click',fn);return node;};
  const clear=node=>{for(const child of Array.from(node.children)) node.removeChild(child);node.textContent='';};
  const panel=el('section');panel.id='ssDesignReview';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','탄성 설계 검토');
  panel.style.cssText='position:fixed;inset:6%;z-index:19010;background:white;color:#172338;border:1px solid #bdc9d6;border-radius:10px;box-shadow:0 12px 50px #0005;padding:24px;overflow:auto;font:14px system-ui';
  const style=el('style');style.textContent='#ssDesignReview button{padding:8px 12px;margin:5px;border:1px solid #b6c3d6;border-radius:6px;background:#edf3fa;color:#183d68}#ssDesignReview textarea{width:95%;padding:10px}#ssDesignReview pre{white-space:pre-wrap;background:#f3f6fa;padding:12px;max-height:220px;overflow:auto}#ssDesignReview label{display:block;margin:8px}';panel.appendChild(style);
  panel.appendChild(el('h2','탄성 설계 검토'));
  panel.appendChild(el('p','기존 케이스를 명시적으로 실행하고, 완료된 정적·P–Delta 조합을 골라 예비 설계 검토를 수행합니다. 조합마다 검토할 기록을 하나만 선택하세요. 최종 설계 승인과는 구분합니다.'));
  const caseInput=el('textarea');caseInput.setAttribute('aria-label','실행할 해석 케이스 ID');panel.appendChild(caseInput);
  const sourceList=el('div'),status=el('p'),detail=el('pre'),output=el('div');status.setAttribute('role','status');
  let sequence=0,reviewId=null,selection=[];
  const requestId=()=>`review-ui-${Date.now()}-${++sequence}`;
  function show(value) {status.textContent=value.ok?(value.stale?'오래된 결과 · 다시 실행하세요.':'작업 완료'): `차단: ${value.code}`;detail.textContent=JSON.stringify(value.summary||value.result?.summary||value.steps||value.details||{},null,2);}
  function refreshSources() {
    clear(sourceList);selection=[];
    const candidates=[], selectedCombinations=new Set();
    for(const item of bridge.getCurrentModel().analysisCases||[]) {
      if(item.kind!=='static') continue;
      const published=bridge.getAnalysisCaseResult(item.id);
      if(!published?.runRecordId) continue;
      const row=bridge.getWorkflowAnalysisResult(published.runRecordId);
      const comboId=row.legacyRecord?.provenance?.combination?.id;
      if(!comboId) continue;
      if(!row.ok||row.stale||row.executionStatus!=='completed') continue;
      candidates.push({source:{analysisRunId:row.analysisRunId,comboId},caseId:item.id,method:item.settings?.pDeltaMethod||'off'});
    }
    for(const {source,caseId,method} of candidates) {
      const label=el('label'),input=el('input');input.type='checkbox';input.checked=!selectedCombinations.has(source.comboId);selectedCombinations.add(source.comboId);label.appendChild(input);label.appendChild(el('span',` ${source.comboId} · ${caseId} (${method}) · ${source.analysisRunId}`));sourceList.appendChild(label);selection.push({input,source});
    }
    if(!selection.length) sourceList.appendChild(el('p','현재 입력에 맞는 완료 정적 조합이 없습니다. 설계 입력 변경에서 조합 ID가 지정된 정적 케이스를 만들고 실행하세요.'));
  }
  panel.appendChild(button('선택 케이스 실행',async()=>{
    const plan=bridge.planElasticWorkflow({caseIds:caseInput.value.split(/[,\s]+/).filter(Boolean),computeTarget:'cpu'});
    if(!plan.ok) {show(plan);return;}status.textContent='해석 실행 중…';
    show(await bridge.runElasticWorkflow({plan,requestId:requestId()}));refreshSources();
  }));
  panel.appendChild(button('완료 기록 새로고침',refreshSources));panel.appendChild(sourceList);
  panel.appendChild(button('설계 검토 실행',()=>{
    const plan=bridge.planDesignReview({sources:selection.filter(x=>x.input.checked).map(x=>x.source)});
    if(!plan.ok) {show(plan);return;}
    const result=bridge.startDesignReview({plan,requestId:requestId()});show(result);if(result.ok) {reviewId=result.designRunId;clear(output);}
  }));
  panel.appendChild(button('검토 결과 조회',()=>show(bridge.getDesignReview(reviewId))));
  panel.appendChild(button('보고서 생성',()=>{
    const report=bridge.createDesignReviewReport(reviewId);show(report);if(!report.ok)return;clear(output);
    const capability=bridge.getDesignReviewExportCapability(reviewId);
    output.appendChild(el('p',`Snapshot: ${report.reportSnapshotHash} · PDF 자동 저장: ${capability.automaticPdf?'사용 가능':'사용 불가 — HTML을 열어 브라우저에서 인쇄하세요.'}`));
    for(const [name,type,content] of [['HTML','text/html',report.reports['ko-KR'].html],['JSON','application/json',report.json],['CSV','text/csv',report.csv]]) {
      output.appendChild(button(`${name} 저장`,()=>{
        const current=bridge.getDesignReviewReport(reviewId);if(!current.ok||current.stale){show({ok:false,code:'STALE_INPUT'});return;}
        const url=target.URL.createObjectURL(new target.Blob([content],{type:`${type};charset=utf-8`}));
        const a=el('a');a.href=url;a.download=`${reviewId}.${name.toLowerCase()}`;doc.body.appendChild(a);a.click();doc.body.removeChild(a);target.setTimeout(()=>target.URL.revokeObjectURL(url),1000);
      }));
    }
    output.appendChild(button('PDF 자동 내보내기',async()=>show(await bridge.exportDesignReviewPdf(reviewId))));
  }));
  panel.appendChild(button('닫기',()=>{panel.hidden=true;}));panel.appendChild(status);panel.appendChild(detail);panel.appendChild(output);doc.body.appendChild(panel);
  const api={adoptReview(id){const result=bridge.getDesignReview(id);if(result.ok){reviewId=id;clear(output);show(result);}},open(){bridge.elasticSetupWorkflow?.close?.();bridge.designInputPanel?.close?.();caseInput.value=(bridge.getCurrentModel().analysisCases||[]).filter(x=>['static','modal','responseSpectrum','buckling','linearTha'].includes(x.kind)).map(x=>x.id).join(', ');refreshSources();panel.hidden=false;},close(){panel.hidden=true;},refreshSources};
  host.appendChild(button('탄성 설계 검토',api.open));return api;
}
