export function candidateEngineeringSeverity(checks,entityIds){
 const entities=new Set(entityIds);
 const summarize=rows=>{
  let maximumNgRatio=0,sumNgExcess=0,unquantifiedNgCount=0;
  for(const c of rows){
   if(c.status!=='NG'||c.checkId?.endsWith('-code-compliance'))continue;
   let ratio=c.ratio;
   // A strength utilization below one does not describe a ductility failure.
   // Rank only a positive, recorded strain deficit; do not infer missing values.
   if(c.checkId==='rc-section-strength'&&c.reason==='MINIMUM_TENSION_STRAIN_NOT_SATISFIED'){
    if(!Number.isFinite(c.minStrain)||!Number.isFinite(c.tensionStrain)||c.tensionStrain<=0||c.minStrain<=c.tensionStrain){unquantifiedNgCount++;continue;}
    ratio=Math.max(Number.isFinite(ratio)?ratio:0,c.minStrain/c.tensionStrain);
   }
   if(!Number.isFinite(ratio)||ratio<=1){unquantifiedNgCount++;continue;}
   maximumNgRatio=Math.max(maximumNgRatio,ratio);sumNgExcess+=Math.max(0,ratio-1);
  }
  return {maximumNgRatio,sumNgExcess,unquantifiedNgCount};
 };
 return {version:'p25-candidate-severity-v3-strain-deficit',basis:'recorded-NG-utilization-or-required-to-actual-tension-strain; aggregate-code-compliance-excluded',affected:summarize(checks.filter(c=>entities.has(c.entityId))),project:summarize(checks)};
}

export function candidateScore(x){
 const a=x.affectedScope.summary,p=x.summary,severity=x.engineeringSeverity;
 const metrics=s=>[s.unquantifiedNgCount,s.maximumNgRatio,s.sumNgExcess];
 // A failed computation cannot demonstrate a reduction in design failures.
 return [p.counts.FAILED??0,a.counts.FAILED??0,x.affectedScope.complete?0:1,a.counts.NG+a.counts.FAILED,a.incompleteCheckCount,
  p.counts.NG+p.counts.FAILED,p.incompleteCheckCount??p.counts.NOT_CHECKED,
  p.closureDiagnosticCounts?.NG??0,p.closureDiagnosticCounts?.NOT_CHECKED??0,
  ...metrics(severity.affected),...metrics(severity.project),
  x.objective.quantityComplete===false?1:0,(x.objective.nominalGeometryAvailable??x.objective.quantityComplete!==false)?0:1,x.objective.value,x.objective.secondary??x.objective.secondaryFallback??0,x.objective.concreteVolume];
}
