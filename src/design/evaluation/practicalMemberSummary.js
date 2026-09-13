import {checkIncomplete} from '../../metadata/checkCompleteness.js';

// Prepare presentation records from already evaluated checks. No assumed bars
// or legacy capacities enter this summary, including when all checks are missing.
export function groupRcMemberReviewChecks(checks){
 const groups=new Map();
 for(const check of checks){
  if(!check.checkId?.startsWith('rc-'))continue;
  if(!groups.has(check.entityId))groups.set(check.entityId,[]);
  groups.get(check.entityId).push(check);
 }
 // A material diagnostic belongs here only when the entity already has RC checks.
 for(const check of checks)if(check.checkId==='material-test-evidence'&&groups.has(check.entityId))groups.get(check.entityId).push(check);
 return groups;
}
export function preparePracticalRcMemberResults(checks){
 const groups=groupRcMemberReviewChecks(checks),result=Object.create(null);
 for(const [memberId,rows] of groups){
  const incompleteCount=rows.filter(checkIncomplete).length;
  const status=rows.some(c=>c.status==='FAILED')?'FAILED':rows.some(c=>c.status==='NG')?'NG':incompleteCount?'NOT_CHECKED':rows.every(c=>c.status==='N_A')?'N_A':'OK';
  const numeric=rows.filter(c=>Number.isFinite(c.ratio));
  const governing=numeric.reduce((best,c)=>!best||c.ratio>best.ratio?c:best,null);
  result[memberId]={memberId,type:'concrete',status,ok:status==='OK'||status==='N_A',incomplete:incompleteCount>0,incompleteCheckCount:incompleteCount,checkCount:rows.length,evaluatedCheckCount:rows.filter(c=>['OK','NG'].includes(c.status)&&c.checkId!=='rc-code-compliance').length,
   blockingCheckIds:[...new Set(rows.filter(c=>checkIncomplete(c)||c.status==='NG'||c.status==='FAILED').map(c=>c.checkId))],blockingReasons:[...new Set(rows.filter(c=>checkIncomplete(c)||c.status==='NG'||c.status==='FAILED').flatMap(c=>[c.reason,...(c.incompleteReasons||[])]).filter(Boolean))],
   utilization:governing?.ratio??null,governingCheck:governing?.checkId??rows.find(checkIncomplete)?.checkId??null,comboId:governing?.comboId??null,
   codeBasis:governing?.codeBasis??rows.find(checkIncomplete)?.codeBasis??null,basis:'provided-practical-checks',designTransferAllowed:false};
 }
 return result;
}

export function preparePracticalRcSummary(memberResults){
 const rows=Object.values(memberResults);
 const governing=rows.filter(r=>Number.isFinite(r.utilization)).reduce((best,r)=>!best||r.utilization>best.utilization?r:best,null);
 return {ok:rows.length>0&&rows.every(r=>r.ok&&!r.incomplete),
  checkedMembers:rows.filter(r=>r.evaluatedCheckCount>0).length,
  unreviewedMembers:rows.filter(r=>r.incomplete).length,
  warnCount:rows.filter(r=>r.status==='WARN').length,
  ngCount:rows.filter(r=>r.status==='NG').length,
  failedCount:rows.filter(r=>r.status==='FAILED').length,
  maxUtilization:governing?.utilization??null,
  governing:governing?{memberId:governing.memberId,checkId:governing.governingCheck,comboId:governing.comboId}:null,
  basis:'provided-practical-checks',designTransferAllowed:false};
}

// Freeze the evaluated input revision into report data; no bar recommendation
// or additional capacity calculation is performed during report rendering.
export function preparePracticalRcSchedules(model,memberResults){
 const latest=new Map();
 for(const detail of model.designDetails?.reinforcement||[]){
  if(!latest.has(detail.id)||latest.get(detail.id).version<detail.version)latest.set(detail.id,detail);
 }
 const result=Object.create(null);
 for(const row of Object.values(memberResults))result[row.memberId]={...row,requiredRebar:null,longitudinal:null,transverse:null,regions:[]};
 for(const detail of latest.values())if(result[detail.memberId])result[detail.memberId].regions.push(structuredClone(detail));
 return result;
}
