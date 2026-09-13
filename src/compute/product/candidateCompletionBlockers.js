import {createCandidateInputActions} from './candidateInputActions.js';
import {checkIncomplete} from '../../metadata/checkCompleteness.js';
// Diagnostic classification does not weaken the candidate acceptance gate.
export function candidateCompletionBlockers(checks,entityIds){
 const inputActions=createCandidateInputActions();
 const scope=new Set(entityIds),rows=[],counts={input:0,designNg:0,failure:0,method:0,review:0};let total=0;
 for(const c of checks){
  if(c.status==='N_A'||c.checkId?.endsWith('code-compliance'))continue;
  if(!checkIncomplete(c)&&c.status==='OK')continue;
  total++;
  const kinds=[];
  if(c.status==='NG'){kinds.push('designNg');counts.designNg++;}
  if(c.status==='FAILED'){kinds.push('failure');counts.failure++;}
  const input=c.blockerKind==='input-required'||(c.requiredInputFields?.length>0)||(c.requiredInputRecords?.length>0);
  const method=c.methodReviewRequired===true||c.sourceQualification?.globalMethodQualified===false||c.qualification==='frame-method-qualification-pending';
  if(input){kinds.push('input');counts.input++;inputActions.add(c);}
  if(method){kinds.push('method');counts.method++;}
  if(c.status!=='FAILED'&&!input&&!method&&(checkIncomplete(c)||!kinds.length)){kinds.push('review');counts.review++;}
  if(rows.length<80)rows.push({entityId:c.entityId,comboId:c.comboId,checkId:c.checkId,status:c.status,ratio:Number.isFinite(c.ratio)?c.ratio:null,reason:c.reason??null,kinds,withinAffectedScope:scope.has(c.entityId),requiredInputFields:[...(c.requiredInputFields||[])],requiredInputRecords:structuredClone(c.requiredInputRecords||[]),inputTargets:structuredClone(c.inputTargets||[]),incompleteReasons:[...(c.incompleteReasons||[])],ruleSelection:c.ruleSelection??null,codeBasisStatus:c.codeBasis?.status??null});
 }
 return {version:'p25-candidate-completion-blockers-v5-target-fields',inputActions:inputActions.finish(),counts,total,rows,truncated:total>rows.length,automaticInputSelectionAllowed:false,scope:'recorded check blockers; combination/profile/scope-integrity gates remain in affectedScope and summary'};
}
