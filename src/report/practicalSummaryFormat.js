// Display stored counts; incompleteness can overlap NG and is not another
// mutually exclusive verdict to add to the status totals.
export function formatPracticalCounts(summary,locale='ko-KR'){
 const ko=locale==='ko-KR',unknown=ko?'미집계':'not recorded';
 const count=x=>Number.isSafeInteger(x)&&x>=0?x:unknown,c=summary?.counts;
 return ko?`NG ${count(c?.NG)} · 미검토 ${count(c?.NOT_CHECKED)} · 실패 ${count(c?.FAILED)} · 미완료 검사 ${count(summary?.incompleteCheckCount)} (NG와 중복 가능)`:`NG ${count(c?.NG)} · Not checked ${count(c?.NOT_CHECKED)} · Failed ${count(c?.FAILED)} · Incomplete checks ${count(summary?.incompleteCheckCount)} (may overlap NG)`;
}
