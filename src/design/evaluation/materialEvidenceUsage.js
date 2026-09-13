import {resolveMaterialRecord} from '../../materials/registry.js';

// Resolve only active detail versions. Evidence remains reported, not authenticated.
function latest(rows=[]){
 const out=new Map();
 for(const row of rows)if(!out.has(row.id)||out.get(row.id).version<row.version)out.set(row.id,row);
 return out.values();
}
export function evaluateMaterialEvidenceUsage(model){
 const cache=new Map(),entities=new Map();
 const add=(entityId,ref,role,diameters=[],detail=null)=>{
  if(!ref)return;
  if(!cache.has(ref))cache.set(ref,resolveMaterialRecord(model,ref));
  const material=cache.get(ref);
  if(material?.testEvidence==null)return;
  const assessment=material.testEvidenceAssessment;
  const usedSizesMm=[...new Set(diameters.map(d=>d*1000))];
  const sizeValid=usedSizesMm.length>0&&usedSizesMm.every(d=>Number.isFinite(d)&&d>0);
  const sizeConsistency=!sizeValid?'NOT_CHECKED':usedSizesMm.every(d=>Math.abs(d-material.testEvidence.sizeMm)<=1e-6)?'CONSISTENT':'MISMATCH';
  const prefix=role==='stirrups'?'stirrup':'bar';
  const assignment=detail&&[`${prefix}Product`,`${prefix}Batch`,`${prefix}BatchReference`].every(k=>typeof detail[k]==='string'&&detail[k].trim())?{product:detail[`${prefix}Product`],batch:detail[`${prefix}Batch`],reference:detail[`${prefix}BatchReference`]}:null;
  const batchConsistency=!assignment?'NOT_CHECKED':assignment.batch===material.testEvidence.batch?'CONSISTENT':'MISMATCH';
  const productConsistency=!assignment||!material.specification?.product?'NOT_CHECKED':assignment.product===material.specification.product?'CONSISTENT':'MISMATCH';
  const certificateProductConsistency=!assignment||!material.testEvidence.product?'NOT_CHECKED':assignment.product===material.testEvidence.product?'CONSISTENT':'MISMATCH';
  const inputTargets=[],materialFields=[];
  if(!material.testEvidence.product||!material.testEvidence.grade)materialFields.push('testReportProduct','testReportGrade');
  for(const field of ['product','grade'])if(!material.specification?.[field])materialFields.push(field);
  if(materialFields.length)inputTargets.push({type:'material-record',id:material.id,version:material.version,requiredInputFields:materialFields});
  const detailType=role==='longitudinal-bars'||role==='stirrups'?'reinforcement-record':role==='joint-ties'?'connection-record':role==='footing-bars'?'foundation-record':null;
  if(detailType&&!assignment)inputTargets.push({type:detailType,id:detail.id,version:detail.version,requiredInputFields:[`${prefix}Product`,`${prefix}Batch`,`${prefix}BatchReference`]});
  const row={inputTargets,certificateProductConsistency,assignment,batchConsistency,productConsistency,productComparisonBasis:'declared-material-specification; certificate-product-authentication-separate',materialRef:ref,role,detailId:detail?.id??null,detailVersion:detail?.version??null,usedSizesMm,sizeConsistency,
   reference:material.testEvidence.reference,sha256:material.testEvidence.sha256,batch:material.testEvidence.batch,
   testedSizeMm:material.testEvidence.sizeMm,assessment:structuredClone(assessment),
   batchAssignmentVerified:false,productAssignmentVerified:false,certificateAuthenticated:false};
  if(!entities.has(entityId))entities.set(entityId,[]);
  entities.get(entityId).push(row);
 };
 for(const member of model.members||[])add(member.id,member.matId,'member-material');
 for(const r of latest(model.designDetails?.reinforcement)){
  add(r.memberId,r.barMaterialId,'longitudinal-bars',(r.bars||[]).map(b=>b.diameter),r);
  if(r.stirrups)add(r.memberId,r.stirrupMaterialId||r.barMaterialId,'stirrups',[r.stirrups.diameter],r);
 }
 for(const r of latest(model.designDetails?.connections))if(r.reinforcement)add(`joint:${r.nodeId}`,r.reinforcement.materialId,'joint-ties',[r.reinforcement.diameter],r);
 for(const r of latest(model.designDetails?.foundations))if(r.reinforcement){
  const sizes=['bottomB','bottomL','topB','topL'].filter(k=>r.reinforcement[k]).map(k=>r.reinforcement[k].diameter);
  add(`foundation:${r.nodeId}`,r.reinforcement.materialId,'footing-bars',sizes,r);
 }
 return [...entities].map(([entityId,rows])=>{
  const strengthMismatch=rows.some(r=>r.assessment?.designValueConsistency==='NG');
  const reasons=['MATERIAL_CERTIFICATE_AUTHENTICATION_REQUIRED','MATERIAL_PRODUCT_BATCH_ASSIGNMENT_AUTHENTICATION_REQUIRED'];
  if(rows.some(r=>r.assessment?.identityConsistency==='MISMATCH'||r.certificateProductConsistency==='MISMATCH'))reasons.push('MATERIAL_CERTIFICATE_IDENTITY_MISMATCH');
  if(rows.some(r=>r.assessment?.identityConsistency==='NOT_CHECKED'))reasons.push('MATERIAL_CERTIFICATE_IDENTITY_REQUIRED');
  if(rows.some(r=>!r.assignment))reasons.push('MATERIAL_PRODUCT_BATCH_ASSIGNMENT_REQUIRED');
  if(rows.some(r=>r.batchConsistency==='MISMATCH'))reasons.push('MATERIAL_TEST_BATCH_MISMATCH');
  if(rows.some(r=>r.productConsistency==='MISMATCH'))reasons.push('MATERIAL_DECLARED_PRODUCT_MISMATCH');
  if(rows.some(r=>r.sizeConsistency==='MISMATCH'))reasons.push('MATERIAL_TEST_SIZE_MISMATCH');
  if(rows.some(r=>r.sizeConsistency==='NOT_CHECKED'))reasons.push('MATERIAL_USED_SIZE_REQUIRED');
  if(rows.some(r=>r.assessment?.status==='INVALID'))reasons.push('MATERIAL_TEST_EVIDENCE_INVALID');
  const inputTargets=rows.flatMap(r=>r.inputTargets),requiredInputFields=[...new Set(inputTargets.flatMap(t=>t.requiredInputFields))];
  return {entityId,result:{...(inputTargets.length?{blockerKind:'input-required',inputTargets,requiredInputFields,automaticSelectionAllowed:false}:{}),status:strengthMismatch?'NG':'NOT_CHECKED',ratio:null,
   reason:strengthMismatch?'MATERIAL_TEST_STRENGTH_MISMATCH':reasons[0],incomplete:true,incompleteReasons:reasons,
   qualification:'reported-test-data-consistency-not-standard-acceptance',rows,designTransferAllowed:false,
   scope:'referenced member and latest reinforcement/joint/footing records; absent certificates remain governed by existing material qualification checks'}};
 });
}
