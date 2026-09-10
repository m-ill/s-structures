export function workflowStatus(bridge,reviewId) {
  const review=reviewId?(bridge.getDesignReviewMetadata||bridge.getDesignReview)(reviewId):null;
  if(review?.ok)return review.stale?'검토 결과 오래됨':'검토 결과 최신';
  const model=bridge.getCurrentModel?.();let completed=0,current=0;
  for(const item of model?.analysisCases||[]){
    const published=bridge.getAnalysisCaseResult(item.id);if(!published?.runRecordId)continue;
    const row=bridge.getWorkflowAnalysisMetadata?.(published.runRecordId);
    if(row?.ok&&row.executionStatus==='completed'){completed++;if(!row.stale)current++;}
  }
  if(current)return `현재 입력 해석 ${current}건 · 설계 검토 필요`;
  if(completed)return '입력 변경됨: 해석 필요';
  return '해석 결과 없음';
}
