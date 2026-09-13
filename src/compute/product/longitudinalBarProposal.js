import {minimumReinforcementRepairSupported} from '../../design/rc/minimumReinforcementRepair.js';
import {getRebarProductCatalog,rebarCatalogProduct} from '../../materials/rebarProductCatalog.js';
import {inferRectangularLayers} from '../../design/rc/barLayout.js';
import {inferGeneratedPairedCage} from '../../design/rc/inferGeneratedPairedCage.js';
// Enumerate layouts for the existing nonlinear capacity evaluator. A demand /
// capacity ratio is not a proportional required-steel-area calculation.
export function longitudinalBarProposal(commands,checks,model){
 const fail=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 const rows=checks.filter(c=>commands.some(d=>d.memberId===c.entityId)&&['rc-section-strength','rc-reinforcement-ratio'].includes(c.checkId)&&c.status==='NG');
 if(!rows.length)return fail('RECORDED_SECTION_STRENGTH_NG_REQUIRED');
 const constraints=new Map(),productChoices=new Map();
 for(const row of rows){
  const minimum=row.checkId==='rc-reinforcement-ratio';
  if(minimum&&!row.reinforcementRepairRegions&&!minimumReinforcementRepairSupported(row))return fail('MINIMUM_REINFORCEMENT_REPAIR_EVIDENCE_REQUIRED');
  if(row.incomplete||row.strengthRepairRegionsTruncated||row.reinforcementRepairRegionsTruncated)return fail('LONGITUDINAL_COUNT_ONLY_REPAIR_UNAVAILABLE');
  const sources=(minimum?row.reinforcementRepairRegions:row.strengthRepairRegions)??[{...row,needsRepair:true,blocked:row.reason==='MINIMUM_TENSION_STRAIN_NOT_SATISFIED'||row.torsionReservedArea>0}];
  for(const source of sources){
  if(!source.needsRepair)continue;
  const c=commands.find(d=>d.id===source.detailId&&d.version===source.detailVersion);
  if(!c||c.strengthStandard!=='KDS-142020-2022'||minimum&&c.detailingStandard!=='KDS-142020-2022'||source.blocked)return fail('LONGITUDINAL_COUNT_ONLY_REPAIR_UNAVAILABLE');
  let layout;
  if(c.crossTieBarPairs?.length){layout=inferGeneratedPairedCage(c,model);if(!layout)return fail('EXISTING_CAGE_MAPPING_REQUIRED');}
  else try{layout=inferRectangularLayers(c.bars);}catch{return fail('RECTANGULAR_LAYER_LAYOUT_REQUIRED');}
  const first=c.bars[0];if(c.bars.some(b=>['diameter','designation','nominalAreaMm2'].some(k=>b[k]!==first[k])))return fail('HOMOGENEOUS_BAR_PRODUCT_REQUIRED');
  let diameters;
  if(c.barCatalogId){
   const catalog=getRebarProductCatalog();
   if(c.barCatalogId!==catalog.source.id||!catalog.grades[c.barProductGrade])return fail('LONGITUDINAL_CATALOG_SOURCE_REQUIRED');
   let product;try{product=rebarCatalogProduct(first);}catch{return fail('LONGITUDINAL_CATALOG_PRODUCT_REQUIRED');}
   if(Math.abs(first.nominalAreaMm2-product.areaMm2)>1e-8||!Number.isFinite(first.nominalAreaMm2))return fail('LONGITUDINAL_CATALOG_AREA_REQUIRED');
   const larger=catalog.products.filter(p=>p.diameterMm>product.diameterMm&&p.diameterMm<=34.9).slice(0,2);
   if(larger.length){diameters=[product.diameterMm,...larger.map(p=>p.diameterMm)];productChoices.set(c.id,{detailId:c.id,catalogId:catalog.source.id,grade:c.barProductGrade,products:[product,...larger],source:catalog.source,certificateVerified:false,selectionBasis:'existing declared catalog/grade; up to two larger ordinary-lap-supported sizes; every candidate reevaluated'});}
  }
  const counts=[...(diameters?[0]:[]),1,2,4].map(n=>layout.barsPerFace+n).filter(n=>n<=20&&2*n*layout.layersPerFace<=100);
  if(!counts.length)return fail('LONGITUDINAL_COUNT_LIMIT');
  const cage=layout.layersPerFace===1&&c.confinementStandard==='KDS-142050-2022'&&['ordinary-tied-column','ordinary-flexural-member'].includes(c.confinementSystem)&&c.tieClosure==='standard-135'&&['+y+z','+y-z','-y+z','-y-z'].includes(c.tieClosureCorner)&&Number.isFinite(c.tieClosureSeparation)&&c.tieClosureSeparation>=0&&[c.tieBendInsideRadius,c.tieHookTail,c.stirrupDiameter].every(x=>Number.isFinite(x)&&x>0);
  if(c.crossTieBarPairs?.length&&!cage)return fail('EXISTING_CAGE_MAPPING_REQUIRED');
  const perimeterCounts=counts.filter(n=>n<=12);
  if(cage&&!perimeterCounts.length)return fail('PERIMETER_COUNT_LIMIT');
  constraints.set(c.id,{...(cage?{detailId:c.id,perimeterYCounts:perimeterCounts,perimeterZCounts:[2],crossTieCageFits:['separate']}:{detailId:c.id,barsPerFace:counts}),...(diameters?{diameters}:{})});
  }
 }
 if(!constraints.size)return fail('RECORDED_SECTION_STRENGTH_NG_REQUIRED');
 return {ok:true,version:'p25-longitudinal-count-proposal-v8-deferred-geometry',productChoices:[...productChoices.values()],regionConstraints:[...constraints.values()],basisCheckIds:rows.map(r=>r.id),basis:'bounded increases for evaluated strength NG regions or all recorded minimum reinforcement NG regions of existing homogeneous longitudinal bars; fully specified single-layer cages regenerate paired cross ties; every layout requires nonlinear section and full candidate reevaluation',geometryValidation:'bounded candidate worker; no geometric feasibility claim at planning',requiredSteelAreaCalculated:false,requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
