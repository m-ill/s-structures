import {wrapReportText} from './wrapReportText.js';
export function appendContinuousBarPages({snapshot,quantities,pages,page,text,line}){
 const records=quantities.filter(q=>q.sourceFragments?.length>1);if(!records.length)return;
 let p,y=0,index=0,current='';
 const open=()=>{p=page('관통 철근 통합 수량표',snapshot,{id:`continuous-bars-${++index}`,version:1});pages.push(p);y=168;text(p,35,y,'물리 철근별 수량입니다. 부재별 배근도는 아래 원본 구간을 참조하세요.',9);y+=22;if(current){text(p,35,y,`${current} (계속)`,9);y+=18;}};
 const row=(value,size=9)=>{for(const part of wrapReportText([value])){if(!p||y>745)open();text(p,35,y,part,size);y+=15;}};
 const mm=v=>Number.isFinite(v)?(v*1000).toFixed(3):'미확정';
 for(const q of records){
  current=q.physicalBarId;if(!p||y>660){current='';open();current=q.physicalBarId;}
  row(q.physicalBarId,11);
  row(`수량 ${q.count??'미확정'}개 / 전체 길이 ${mm(q.cutLength)} mm / 직경 ${mm(q.diameter)} mm`);
  row(`구간 ${q.sourceFragments.length}개 / 질량 ${q.massQuantity?.status==='OK'?q.massQuantity.totalMassKg.toFixed(3)+' kg':'미확정 (공칭 단위질량 필요)'}`);
  for(const f of q.sourceFragments)row(`원본: 부재 ${f.memberId} · ${f.detailId}@${f.version} / ${f.mark} · ${mm(f.cutLength)} mm`,8);
  row('제작 승인·이음 계획·운반 가능 길이 검토는 별도입니다.',8);
  line(p,35,y,560,y);y+=20;
 }
}
