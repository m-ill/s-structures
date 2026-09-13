import {stableHash} from '../../core/stableHash.js';
const columns=['evaluation_id','input_hash','detail_hash','prepared_geometry_hash','rule_pack_hash','detail_id','detail_version','member_id','kind','mark','count','diameter_m','area_m2','body_length_m','cut_length_m','piece_count','total_length_m','unit_mass_kg_per_m','total_mass_kg','mass_status','mass_reason','review_only','quantity_hash','quantity_json','analysis_sources_json','code_references_json'];
function cell(value){
 let s=value==null?'':String(value);
 // Keep original values in quantity_json; identifiers cannot become formulas.
 if(typeof value==='string'&&/^[\s]*[=+@-]/u.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
export function encodeQuantityCsv(drawing,{maxBytes=32*1024**2}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32*1024**2)throw Error('QUANTITY_CSV_SIZE_LIMIT');
 const encoder=new TextEncoder(),chunks=[];let size=0;
 const add=text=>{const bytes=encoder.encode(text);if(size+bytes.length>maxBytes)throw Error('QUANTITY_CSV_SIZE_LIMIT');chunks.push(bytes);size+=bytes.length;};
 if(!Array.isArray(drawing.quantities))throw Error('QUANTITY_CSV_SOURCE_REQUIRED');
 const refs=new Map();
 for(const check of drawing.checks||[])for(const [scope,rows] of [['applied',check.codeBasis?.applied||[]],['review-required',check.codeBasis?.reviewTargets||[]]])for(const ref of rows){const r={scope,...ref};refs.set(stableHash(r),r);}
 for(const q of drawing.quantities)for(const ref of q.codeReferences||[]){const r={scope:'quantity-geometry',...ref};refs.set(stableHash(r),r);}
 const sources=JSON.stringify(drawing.analysisSources||[]),references=JSON.stringify([...refs.values()]);
 add('\ufeff'+columns.join(',')+'\r\n');
 for(const q of drawing.quantities){
  const mass=q.massQuantity||q.geometricQuantity?.massQuantity;
  const values=[drawing.evaluationId,drawing.inputHash,drawing.detailHash,drawing.preparedGeometryHash,drawing.rulePackHash,q.detailId,q.version,q.memberId,q.kind,q.mark,q.count,q.diameter,q.area,q.bodyLength,q.cutLength,mass?.pieceCount??q.pieceCount,mass?.totalLength??q.geometricQuantity?.totalLength??q.totalCutLength,mass?.unitMassKgPerM??q.unitMassKgPerM,mass?.totalMassKg,mass?.status??'NOT_CHECKED',mass?.reason??(!mass?'PREPARED_MASS_QUANTITY_REQUIRED':null),true,stableHash(q),JSON.stringify(q),sources,references];
  add(values.map(cell).join(',')+'\r\n');
 }
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
