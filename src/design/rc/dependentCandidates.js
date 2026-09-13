import {rebarCatalogProduct,REBAR_CATALOG_ID} from '../../materials/rebarProductCatalog.js';
import {validJointBarPairs,validJointHookSides} from '../connection/jointBarPairs.js';
import {validJointPlaneOffsets} from '../connection/jointPlaneOffsets.js';
const allowed={
 'connection-record':['tieDiameter','tieSpacing','tieLegs','anchorageLength','jointFirstStart','jointFirstEnd','jointHookTail','jointBendInsideRadius','jointCrossTiePlaneOffsets','jointCrossTieBarPairs','jointCrossTieHookSides'],
 'foundation-record':['B','L','thickness','columnEmbedmentLength','columnDevelopmentAbove','bottomSpacingB','bottomSpacingL','topSpacingB','topSpacingL','bottomDiameterB','bottomDiameterL','topDiameterB','topDiameterL','barDistribution'],
};
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Shared admission for standalone and connected detail searches. Typed staging
// still supplies catalogue area/mass; this check does not mutate candidate inputs.
export function validateDetailCandidateProducts(command,edits){
 if(!command.barCatalogId)return;
 if(command.barCatalogId!==REBAR_CATALOG_ID)fail('REBAR_CATALOG_NOT_FOUND');
 const keys=command.type==='connection-record'?['tieDiameter']:command.type==='foundation-record'?['bottomDiameterB','bottomDiameterL','topDiameterB','topDiameterL']:[];
 for(const edit of edits)for(const key of keys)if(edit[key]!==undefined)rebarCatalogProduct({diameter:edit[key]});
}
export function validateDependentCandidates(model,memberId,rows,commands=[]){
 if(rows===undefined)return;
 const member=model.members.find(m=>m.id===memberId);
 if(!member||!Array.isArray(rows)||!rows.length||rows.length>8)fail('DEPENDENT_CANDIDATE_CONSTRAINT_INVALID');
 const seen=new Set();
 for(const row of rows){
  if(!row||Object.keys(row).some(k=>!['connectionId','foundationId','detailCandidates'].includes(k))||['connectionId','foundationId'].filter(k=>row[k]!==undefined).length!==1)fail('DEPENDENT_CANDIDATE_CONSTRAINT_INVALID');
  const type=row.connectionId!==undefined?'connection-record':'foundation-record',id=row.connectionId??row.foundationId,key=`${type}:${id}`;
  const command=commands.find(c=>c.type===type&&c.id===id);
  if(!command||seen.has(key))fail('DEPENDENT_DETAIL_REQUIRED');seen.add(key);
  if(command.locked)fail('DETAIL_LOCKED');
  if(type==='foundation-record'&&command.columnMemberId&&command.columnMemberId!==memberId)fail('DEPENDENT_DETAIL_UNRELATED');
  if(![member.n1,member.n2].includes(command.nodeId)||type==='connection-record'&&!command.memberIds?.includes(memberId))fail('DEPENDENT_DETAIL_UNRELATED');
  if(!Array.isArray(row.detailCandidates)||!row.detailCandidates.length||row.detailCandidates.length>8)fail('DEPENDENT_CANDIDATE_CONSTRAINT_INVALID');
  for(const edit of row.detailCandidates){
   if(!edit||Array.isArray(edit)||typeof edit!=='object'||!Object.keys(edit).length||Object.keys(edit).some(k=>!allowed[type].includes(k)))fail('DEPENDENT_CANDIDATE_CONSTRAINT_INVALID');
   for(const [key,value] of Object.entries(edit))if(key==='jointCrossTieHookSides'?!validJointHookSides(value):key==='jointCrossTieBarPairs'?!validJointBarPairs(value):key==='jointCrossTiePlaneOffsets'?!validJointPlaneOffsets(value):key==='barDistribution'?!['uniform','kds-centered-band'].includes(value):!Number.isFinite(value)||(['jointFirstStart','jointFirstEnd'].includes(key)?value<0:value<=0)||key==='tieLegs'&&!Number.isInteger(value))fail('DEPENDENT_CANDIDATE_CONSTRAINT_INVALID');
  }
  validateDetailCandidateProducts(command,row.detailCandidates);
 }
}
// At most eight axes; candidate/time budgets consume this iterator lazily.
export function* dependentCandidateVariants(rows=[],commands=[]){
 const current=[];
 function* visit(i){
  if(i===rows.length){yield structuredClone(current);return;}
  const row=rows[i],type=row.connectionId!==undefined?'connection-record':'foundation-record';
  const original=commands.find(c=>c.type===type&&c.id===(row.connectionId??row.foundationId));
  for(const edit of row.detailCandidates){current[i]={...original,...edit,version:original.version+1};yield* visit(i+1);}
 }
 yield* visit(0);
}
