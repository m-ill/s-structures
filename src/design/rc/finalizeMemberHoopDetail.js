// Current geometric/dimensional checks are separate from method qualification.
export function finalizeMemberHoopDetail(detail,prepared,result){
 const closure=prepared?.outerHoop?.closureGeometry;
 if(!closure)return result;
 const readiness=[];
 const add=(id,row,allowNA=false)=>{
  const status=['OK','NG'].includes(row?.status)||allowNA&&row?.status==='N_A'?row.status:'NOT_CHECKED';
  readiness.push({id,status,reason:status==='OK'||status==='N_A'?null:row?.reason||`MEMBER_HOOP_${id.toUpperCase().replaceAll('-','_')}_REQUIRED`});
  if(row?.incomplete||row?.locationCoverage?.complete===false)readiness.push({id:`${id}-coverage`,status:'NOT_CHECKED',reason:row.incompleteReasons?.[0]||'MEMBER_HOOP_SOURCE_COVERAGE_REQUIRED'});
 };
 add('dimensions-and-lateral-support',result);
 add('distribution',prepared.stirrupDistribution);
 add('closure-shape',closure);
 add('longitudinal-assembly',closure.longitudinalAssembly);
 add('self-and-repeat-assembly',closure.selfAssembly);
 add('closure-contact',closure.contactCoverage);
 add('corner-support',closure.supportCoverage);
 add('perimeter-membership',closure.perimeterMembership);
 add('perimeter-order',{status:closure.perimeterOrderStatus,reason:closure.perimeterOrderReason});
 add('hoop-cross-tie-assembly',closure.crossTieAssembly,!detail.crossTieBarPairs?.length);
 if(detail.crossTieBarPairs?.length){
  add('cross-tie-assembly',prepared.crossTies?.assembly);
  add('cross-tie-longitudinal-assembly',prepared.crossTies?.actualPathAssembly);
  add('cross-tie-contact',prepared.crossTies?.contactCoverage);
 }
 const failed=readiness.find(r=>r.status==='NG'),pending=readiness.filter(r=>r.status==='NOT_CHECKED');
 return {...result,status:failed?'NG':pending.length?'NOT_CHECKED':'OK',ratio:failed||pending.length?null:result.ratio,reason:failed?.reason||pending[0]?.reason||null,incomplete:pending.length>0,incompleteReasons:[...new Set(pending.map(r=>r.reason))],readiness,methodReviewRequired:true,fabricationApproved:false,scope:'declared ordinary member hoop dimensions, actual contact, lateral support and assembly; independent method and fabrication qualification remain separate'};
}
