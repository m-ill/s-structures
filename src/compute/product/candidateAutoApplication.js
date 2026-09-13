// Keep exploration completion separate from application/review completion.
// The application service owns mutation, retries and partial receipts.
export async function runCandidateAutoApplication({job,apply,publish,isCurrent}){
 if(!isCurrent())return;
 job.status='applying';job.application=null;job.error=null;
 job.applicationRequest={jobId:job.jobId,candidateId:job.best.candidateId,requestId:`auto-${job.jobId}`};
 publish();
 let result;
 try{result=await apply(job.applicationRequest);}
 catch(error){if(!isCurrent())return;job.status='application-failed';job.error=error.code||error.message;publish();return;}
 if(!isCurrent())return;
 job.application=result;
 const reviewed=result.ok&&result.followUp?.status==='completed';
 job.status=reviewed?(result.followUp.comparison?.affectedScope?.complete===true?'applied':'applied-needs-review'):'application-failed';
 if(job.status==='applied-needs-review')job.error='POST_APPLY_SCOPE_INCOMPLETE';
 if(job.status==='application-failed')job.error=result.code||'POST_APPLY_REVIEW_INCOMPLETE';
 publish();
}
