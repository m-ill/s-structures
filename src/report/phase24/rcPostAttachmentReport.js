// Render the prepared verdict only; no analysis or demand calculation here.
export function formatRcPostAttachmentReview(r){
 const lines=['# 부착 후 변형 검토',`부착 재령: ${r.attachmentAgeDays}일 / 최종 재령: ${r.evaluationAgeDays}일`,`판정: ${r.status} / 지배축: ${r.governingAxis}`,`허용값 근거: ${r.limitReference}`,'단위: m','', '| 축 | 최대 절대 변형 | 부호 있는 값 | 위치 | 허용값 | 비율 | 판정 |','|---|---:|---:|---:|---:|---:|---|'];
 for(const c of r.checks)lines.push(`| ${c.axis} | ${c.demand} | ${c.signedValue} | ${c.position} | ${c.capacity} | ${c.ratio} | ${c.status} |`);
 lines.push('',`계산식: ${r.equation}`,'동일 지속하중의 두 재령 상태 차이. 재령별 응력이력 및 부착 후 추가 활하중은 포함하지 않음.','KDS 전체 적합성: 미확정. 허용값은 사용자 지정 기준.');
 for(const ref of r.codeReferences)lines.push(`- ${ref.code} (${ref.edition}) ${ref.clause} — 검토 대상 조항, 계산법 승인 근거 아님: ${ref.url} / ${ref.sha256}`);
 return lines.join('\n');
}
