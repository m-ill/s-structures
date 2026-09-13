// Display recorded bar checks; do not infer lengths, utilization or compliance.
export function appendSpliceCheckPages({snapshot,splice,pages,page,text,line}){
 for(const check of snapshot.checks){
  if(check.entityId!==splice.memberId||check.checkId!=='rc-splices')continue;
  const rows=(check.checks||[]).filter(r=>r.spliceId===splice.id);
  for(let start=0;start<rows.length;start+=24){
   const p=page(`겹침이음 길이 검토 ${Math.floor(start/24)+1}/${Math.ceil(rows.length/24)}`,snapshot,splice);
   const combo=Array.from(`조합: ${check.comboId||'미기록'}`);
   for(let i=0;i<Math.ceil(combo.length/68);i++)text(p,35,160+i*13,combo.slice(i*68,(i+1)*68).join(''),7);
   text(p,35,193,`대상 ${start+1}-${Math.min(start+24,rows.length)} / ${rows.length}건 · 길이 mm`,10);
   text(p,35,212,'저장된 요구·제공 길이와 검정비입니다. NG·미검토는 그대로 표시합니다.',9);
   const columns=[35,135,240,345,440];
   ['철근 번호','요구 길이','제공 길이','검정비','판정'].forEach((s,i)=>text(p,columns[i],236,s,10));line(p,35,243,560,243);
   for(const [i,r] of rows.slice(start,start+24).entries()){
    const length=v=>r.units?.length==='m'&&Number.isFinite(v)?(v*1000).toFixed(1):'미기록';
    const status={NOT_CHECKED:'미검토',FAILED:'계산 실패',WARN:'주의',N_A:'해당 없음'}[r.status]||r.status||'미기록';
    const values=[Number.isInteger(r.barIndex)?`SP-B${r.barIndex}`:'대상 미기록',length(r.requiredLength),length(r.providedLength),Number.isFinite(r.ratio)?r.ratio.toFixed(3):'미기록',status],y=263+i*20;
    values.forEach((s,k)=>text(p,columns[k],y,s,9));line(p,35,y+6,560,y+6);
   }
   text(p,35,754,'KDS 조항·대입 변수·미완료 사유: 뒤쪽 검사별 계산서의 같은 조합을 참조하세요.',9);
   if(!check.codeBasis&&!check.codeReferences?.length)text(p,35,772,'이 검사에 저장된 KDS 근거가 없습니다. 기준 적합성 확인이 필요합니다.',8);
   pages.push(p);
  }
 }
}
