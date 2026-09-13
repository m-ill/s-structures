// Factual table transcription, manufacturer PDF spread 9 / printed page 14.
// Source was visually inspected; this is not a mill certificate or KS approval.
const inputError=code=>Object.assign(new Error(code),{code});
export const REBAR_CATALOG_ID='hyundai-ks-d3504-83e067dc';
export const REBAR_CATALOG_SOURCE=Object.freeze({id:REBAR_CATALOG_ID,publisher:'Hyundai Steel',title:'Reinforcing Bar',url:'https://www.hyundai-steel.com/common/fileDownload/50086',listingUrl:'https://www.hyundai-steel.com/en/product-tech/rebar',sha256:'83e067dce67245506271b1bef2615f078c4267648cec3b3b280967cf114be330',retrievedAt:'2026-09-11',printedPages:[14,26],pdfPages:[9,15],edition:'PDF SHA-256 83e067dce67245506271b1bef2615f078c4267648cec3b3b280967cf114be330',editionDateConfirmed:false,ksEditionConfirmed:false,qualification:'manufacturer-table-transcribed-independent-review-pending',certificateVerified:false});
const sizes=[['D10',9.53,71.33,.560],['D13',12.7,126.7,.995],['D16',15.9,198.6,1.56],['D19',19.1,286.5,2.25],['D22',22.2,387.1,3.04],['D25',25.4,506.7,3.98],['D29',28.6,642.4,5.04],['D32',31.8,794.2,6.23],['D35',34.9,956.6,7.51],['D38',38.1,1140,8.95],['D41',41.3,1340,10.5],['D43',43,1452,11.4],['D51',50.8,2027,15.9],['D57',57.3,2579,20.3]];
const products=sizes.map(([designation,diameterMm,areaMm2,unitMassKgPerM])=>Object.freeze({designation,diameterMm,areaMm2,unitMassKgPerM,standard:'KS D 3504',jisIncluded:!['D43','D57'].includes(designation)}));
const grades=Object.freeze({SD300:300,SD400:400,SD500:500,SD600:600,SD700:700,SD400W:400,SD500W:500,SD400S:400,SD500S:500,SD600S:600});
export function getRebarProductCatalog(){return structuredClone({source:REBAR_CATALOG_SOURCE,products,grades,units:{diameter:'mm',area:'mm2',unitMass:'kg/m',yieldStrength:'MPa'},designTransferAllowed:false});}
export function rebarCatalogProduct({diameter,designation}){
 const row=designation?products.find(p=>p.designation===designation):products.find(p=>Math.abs(p.diameterMm-diameter)<1e-8)||products.find(p=>Number(p.designation.slice(1))===diameter);
 if(!row||!Number.isFinite(diameter)||Math.abs(row.diameterMm-diameter)>1e-8&&Number(row.designation.slice(1))!==diameter)throw inputError('REBAR_CATALOG_SIZE_MISMATCH');return row;
}
export function expandRebarCatalogInput(input){
 if(!input.barCatalogId&&!input.stirrupCatalogId)return input;
 const out=structuredClone(input);
 for(const kind of ['bar','stirrup']){
  if(!out[`${kind}CatalogId`])continue;
  if(!['reinforcement-record','foundation-record','connection-record'].includes(out.type)||['foundation-record','connection-record'].includes(out.type)&&kind!=='bar'||out[`${kind}CatalogId`]!==REBAR_CATALOG_ID)throw inputError('REBAR_CATALOG_NOT_FOUND');
  if(!grades[out[`${kind}ProductGrade`]])throw inputError('REBAR_CATALOG_GRADE_REQUIRED');
  const values={AreaBasis:'specified-nominal',ProductReference:REBAR_CATALOG_SOURCE.url,ProductEdition:REBAR_CATALOG_SOURCE.edition};
  for(const [field,value] of Object.entries(values)){const key=`${kind}${field}`;if(out[key]!==undefined&&out[key]!==value)throw inputError('REBAR_CATALOG_SOURCE_CONFLICT');out[key]=value;}
  if(out.type==='connection-record'){
   if(out.connectionType!=='rc-joint')throw inputError('REBAR_CATALOG_CONNECTION_TYPE_REQUIRED');
   out.tieDiameter=rebarCatalogProduct({diameter:out.tieDiameter}).diameterMm;
  }else if(out.type==='foundation-record'){
   for(const face of ['bottom','top'])for(const axis of ['B','L']){const key=`${face}Diameter${axis}`;if(out[key]!==undefined)out[key]=rebarCatalogProduct({diameter:out[key]}).diameterMm;}
  }else if(kind==='bar'){
   if(!Array.isArray(out.bars)||!out.bars.length||out.bars.length>100)throw inputError('REBAR_CATALOG_BARS_REQUIRED');
   out.bars=out.bars.map(bar=>{const p=rebarCatalogProduct(bar);if(bar.nominalAreaMm2!==undefined&&Math.abs(bar.nominalAreaMm2-p.areaMm2)>1e-8)throw inputError('REBAR_CATALOG_AREA_MISMATCH');return {...bar,diameter:p.diameterMm,nominalAreaMm2:p.areaMm2,designation:p.designation};});
  }else{const p=rebarCatalogProduct({diameter:out.stirrupDiameter});if(out.stirrupNominalAreaMm2!==undefined&&Math.abs(out.stirrupNominalAreaMm2-p.areaMm2)>1e-8)throw inputError('REBAR_CATALOG_AREA_MISMATCH');out.stirrupDiameter=p.diameterMm;out.stirrupNominalAreaMm2=p.areaMm2;}
 }
 return out;
}
export function validateCatalogMaterial(input,kind,material){
 if(input[`${kind}CatalogId`]&&material?.strength?.steel?.Fy!==grades[input[`${kind}ProductGrade`]])throw inputError('REBAR_CATALOG_MATERIAL_YIELD_MISMATCH');
}
