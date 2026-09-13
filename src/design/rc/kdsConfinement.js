import {finalizeMemberHoopDetail} from './finalizeMemberHoopDetail.js';
import {rectangularTieRequirements} from './rectangularTieRequirements.js';
import {anchorBoltTies} from './anchorBoltTies.js';
import {stirrupDistribution} from './stirrupDistribution.js';
import {crossTieGeometry} from './crossTieGeometry.js';
import {crossTieSupports} from './crossTieSupports.js';
import {roundedHoopPerimeterLayout} from './roundedHoopPerimeterLayout.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';

export function kdsRectangularTies(x){
 if(Array.isArray(x.bars)&&x.bars.length>4&&x.crossTieBarPairs!==undefined)return crossTiedColumn(x);
 const {B,H,cover,bars,diameter,spacing,firstStart,firstEnd,anchorBolts,closure,tail,insideRadius,system}=x;
 const base={codeReferences:getKcscRuleSources(['142050']).map(r=>({...r,clause:'4.1.1(2); 4.1.2(2); 4.4.2(3)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(![B,H,cover,diameter,spacing,tail,insideRadius].every(v=>Number.isFinite(v)&&v>0)||![firstStart,firstEnd].every(v=>Number.isFinite(v)&&v>=0)||typeof anchorBolts!=='boolean')return nc('TIE_GEOMETRY_AND_END_OFFSETS_REQUIRED');
 if(system!=='ordinary-tied-column'||closure!=='standard-135')return nc('ORDINARY_STANDARD_135_TIE_SCOPE_REQUIRED');
 if(!Array.isArray(bars)||bars.length!==4||bars.some(b=>![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0))return nc('FOUR_CORNER_BARS_REQUIRED_ADDITIONAL_TIES_NOT_MODELLED');
 const ys=[...new Set(bars.map(b=>b.y))].sort((a,b)=>a-b),zs=[...new Set(bars.map(b=>b.z))].sort((a,b)=>a-b);
 const rectangular=ys.length===2&&zs.length===2&&new Set(bars.map(b=>`${b.y}:${b.z}`)).size===4;
 const spatial=x.spatialSupport,barIds=x.originalBarIndices||bars.map((_,i)=>i+1),order=spatial?.supportedBarIndices;
 const spatialComplete=spatial?.status==='OK'&&Array.isArray(order)&&order.length===4&&new Set(order).size===4&&barIds.length===4&&new Set(barIds).size===4&&order.every(i=>Number.isInteger(i)&&barIds.includes(i));
 const geometryReason=spatial!==undefined&&!spatialComplete?'SPATIAL_CORNER_SUPPORT_COVERAGE_REQUIRED':spatial===undefined&&!rectangular?'RECTANGULAR_CORNER_SUPPORT_GEOMETRY_REQUIRED':null;
 const minDb=Math.min(...bars.map(b=>b.diameter)),maxDb=Math.max(...bars.map(b=>b.diameter));
 if(maxDb>.032&&maxDb<.0349||diameter>.016&&diameter<.019||diameter>.0254)return nc('KDS_BAR_SIZE_CLASS_REQUIRED');
 const checks=rectangularTieRequirements(x).checks;
 const adjacent=[];
 if(spatialComplete){for(let i=0;i<4;i++)adjacent.push([barIds.indexOf(order[i]),barIds.indexOf(order[(i+1)%4])]);}
 else if(spatial===undefined&&rectangular){for(let i=0;i<4;i++)for(let j=0;j<i;j++)if(bars[i].y===bars[j].y||bars[i].z===bars[j].z)adjacent.push([j,i]);}
 for(const [i,j] of adjacent){const a=bars[i],b=bars[j],clear=Math.hypot(a.y-b.y,a.z-b.z)-(a.diameter+b.diameter)/2;checks.push({kind:'supported-bar-clearance',bars:[i,j],provided:clear,maximumExclusive:.15,ratio:clear/.15,status:clear>=.15-1e-12?'NG':'OK'});}
 const cy=H/2-cover-diameter-insideRadius,cz=B/2-cover-diameter-insideRadius;
 if(geometryReason)checks.push({kind:'corner-support-coverage',status:'NOT_CHECKED',reason:geometryReason,ratio:0});
 else for(const [index,bar] of bars.entries()){
  if(spatialComplete){checks.push({kind:'spatial-tie-corner-support',bar:index,originalBarIndex:barIds[index],status:'OK',ratio:0});continue;}
  const dy=Math.abs(bar.y)-cy,dz=Math.abs(bar.z)-cz,gap=insideRadius-bar.diameter/2-Math.hypot(dy,dz);
  checks.push({kind:'rounded-tie-corner-support',bar:index,radialGap:gap,ratio:0,status:dy>=0&&dz>=0&&Math.abs(gap)<=1e-6?'OK':'NG'});
 }
 let anchorResult;
 if(anchorBolts){
  anchorResult=anchorBoltTies({diameter,length:x.length,end:x.anchorBoltTieEnd,distribution:stirrupDistribution({end:1,tieFirstStart:firstStart,tieFirstEnd:firstEnd,stirrups:{spacing}},x.length)});
  if(anchorResult.status!=='NOT_CHECKED')checks.push(...anchorResult.checks);
 }
 const ratio=Math.max(...checks.map(c=>c.ratio)),ng=checks.some(c=>c.status==='NG')||ratio>1+1e-10;
 const incompleteReasons=[...(anchorResult?.status==='NOT_CHECKED'?[anchorResult.reason]:[]),...(geometryReason?[geometryReason]:[])],incomplete=incompleteReasons.length>0;
 return {...base,status:ng?'NG':incomplete?'NOT_CHECKED':'OK',ratio:incomplete&&!ng?null:ratio,incomplete,incompleteReasons,...(spatial!==undefined?{methodReviewRequired:true,supportBasis:'prepared-spatial-contact'}:{}),reason:incomplete&&!ng?incompleteReasons[0]:checks.some(c=>c.kind==='rounded-tie-corner-support'&&c.status==='NG')?'CORNER_BAR_LATERAL_SUPPORT_GEOMETRY_NOT_SATISFIED':ng?'RECTANGULAR_TIE_REQUIREMENT_NOT_SATISFIED':null,checks,...(anchorResult?{anchorBoltTies:anchorResult}:{}),units:{length:'m'},scope:`ordinary-four-corner-tied-column; ${spatial!==undefined?'prepared actual spatial corner contact':'nominal rounded-corner contact'}; construction tolerance, bolt anchorage/force transfer, seismic/offset/crosstie detailing separate`};
}

export function evaluateProvidedKdsConfinement(model,member,details,tuples,{preparedDetails}={}){
 if(!details.some(d=>d.confinementStandard==='KDS-142050-2022'))return {};
 const section=resolveSectionRecord(model,member.secId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!['RECT','SQUARE'].includes(section?.shape)||!nodes.every(Boolean))return {};
 const L=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z);let worst;
 const spacingRequirements=new Map();let spacingRequirementsTruncated=false;
 const flexural=details.some(d=>d.memberRole==='flexural-member');
 const samples=[...tuples];
 if(flexural){
  if(details.length>100||details.some(d=>!Number.isFinite(d.start)||!Number.isFinite(d.end)||d.start<0||d.end>1||d.start>=d.end))worst=mergeLocatedCheck(worst,{status:'NOT_CHECKED',ratio:null,reason:'CONFINEMENT_REGION_GEOMETRY_INVALID'});
  const bounds=[...new Set([0,1,...details.flatMap(d=>[d.start,d.end]).filter(x=>Number.isFinite(x)&&x>=0&&x<=1)])].sort((a,b)=>a-b);
  if(bounds.length>202)return {'rc-confinement':{status:'NOT_CHECKED',ratio:null,reason:'CONFINEMENT_REGION_LIMIT'}};
  for(let i=1;i<bounds.length;i++)samples.push({x:L*(bounds[i-1]+bounds[i])/2,side:'point',geometryOnly:true});
 }
 for(const t of samples){const found=reinforcementRegionsAt(details,t.x/L,t.side),d=found[0];
  const r=found.length===1&&(d.memberRole==='flexural-member'||d.start===0&&d.end===1)&&d.confinementStandard==='KDS-142050-2022'&&['compression-member','flexural-member'].includes(d.memberRole)&&d.reinforcementForm==='single-deformed'&&d.stirrupForm==='closed-rectangular-two-leg'?{...(d.memberRole==='flexural-member'?kdsFlexuralTies:kdsRectangularTies)({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,cover:d.cover,bars:d.bars,diameter:d.stirrups?.diameter,spacing:d.stirrups?.spacing,firstStart:d.tieFirstStart,firstEnd:d.tieFirstEnd,anchorBolts:d.topAnchorBolts,anchorBoltTieEnd:d.anchorBoltTieEnd,closure:d.tieClosure,tail:d.tieHookTail,insideRadius:d.tieBendInsideRadius,system:d.confinementSystem,preparedSpatialPerimeterLayout:preparedDetails?.reinforcement?.[`${d.id}@${d.version}`]?.spatialPerimeterLayout,preparedPerimeterLayout:preparedDetails?.reinforcement?.[`${d.id}@${d.version}`]?.perimeterLayout,spatialSupport:preparedDetails?.reinforcement?.[`${d.id}@${d.version}`]?.outerHoop?.closureGeometry?.supportCoverage,preparedCrossTies:preparedDetails?.reinforcement?.[`${d.id}@${d.version}`]?.crossTies,crossTieBarPairs:d.crossTieBarPairs,crossTieHookSides:d.crossTieHookSides,crossTiePlaneOffsets:d.crossTiePlaneOffsets,length:d.memberRole==='flexural-member'?L*(d.end-d.start):L}),detailId:d.id,detailVersion:d.version}:{status:'NOT_CHECKED',ratio:null,reason:flexural?'UNIQUE_ORDINARY_FLEXURAL_REGION_REQUIRED':'FULL_LENGTH_ORDINARY_TIED_COLUMN_REGION_REQUIRED'};
  const outerHoop=preparedDetails?.reinforcement?.[`${d?.id}@${d?.version}`]?.outerHoop;
  const closure=outerHoop?.closureGeometry;
  if(closure)Object.assign(r,finalizeMemberHoopDetail(d,preparedDetails.reinforcement[`${d.id}@${d.version}`],r));
  const collision=outerHoop?.actualPathAssembly?.status==='NG';
  const spacingCheck=r.checks?.find(c=>c.kind==='tie-spacing');
  if(r.detailId&&Number.isFinite(spacingCheck?.maximum)&&spacingCheck.maximum>0){
   const key=JSON.stringify([r.detailId,r.detailVersion]);
   if(spacingRequirements.has(key)||spacingRequirements.size<32){
    const previous=spacingRequirements.get(key),needsRepair=r.checks.some(c=>['tie-spacing','start-first-tie','end-first-tie'].includes(c.kind)&&c.ratio>1+1e-10);
    spacingRequirements.set(key,{detailId:r.detailId,detailVersion:r.detailVersion,maxSpacing:Math.min(previous?.maxSpacing??Infinity,spacingCheck.maximum*1000),needsRepair:!!previous?.needsRepair||needsRepair,units:{length:'mm'}});
   }else spacingRequirementsTruncated=true;
  }
  worst=mergeLocatedCheck(worst,{...r,...(outerHoop?{outerHoop}:{}),...(collision?{status:'NG',ratio:null,reason:outerHoop.actualPathAssembly.reason||'OUTER_HOOP_LONGITUDINAL_COLLISION'}:{}),...(t.geometryOnly?{x:t.x,geometryStation:{x:t.x,side:t.side,basis:'region-partition-midpoint; no interpolated force'}}:{concurrentDemand:t})});
 }
 return worst?{'rc-confinement':{...worst,tieSpacingRequirements:[...spacingRequirements.values()],tieSpacingRequirementsTruncated:spacingRequirementsTruncated}}:{};
}

function crossTiedColumn(x){
 const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason,codeReferences:getKcscRuleSources(['142050']).map(r=>({...r,clause:'4.1.1(2); 4.1.2(2); 4.4.2(3)'}))});
 const perimeter=x.preparedSpatialPerimeterLayout?.status==='OK'?x.preparedSpatialPerimeterLayout:x.preparedPerimeterLayout??roundedHoopPerimeterLayout({B:x.B,H:x.H,cover:x.cover,tieDiameter:x.diameter,insideRadius:x.insideRadius,spacing:x.spacing,bars:x.bars});
 if(!perimeter.positions||perimeter.failures?.length||perimeter.cornerCount!==4)return nc('CROSS_TIE_PERIMETER_LAYOUT_REQUIRED');
 if(!Array.isArray(perimeter.cornerBarIndices))return nc('FOUR_OUTER_HOOP_CORNER_CONTACTS_REQUIRED');
 const corners=perimeter.cornerBarIndices.map(i=>i-1);
 if(corners.length!==4)return nc('FOUR_OUTER_HOOP_CORNER_CONTACTS_REQUIRED');
 const base=kdsRectangularTies({...x,bars:corners.map(i=>x.bars[i]),originalBarIndices:corners.map(i=>i+1),crossTieBarPairs:undefined});if(!base.checks)return base;
 const minDb=Math.min(...x.bars.map(b=>b.diameter)),maxDb=Math.max(...x.bars.map(b=>b.diameter));
 if(maxDb>.032&&maxDb<.0349)return nc('KDS_BAR_SIZE_CLASS_REQUIRED');
 const supports=crossTieSupports({bars:x.bars,cornerIndices:corners,orderedIndices:perimeter.positions.map(p=>p.barIndex-1),pairs:x.crossTieBarPairs,perimeterPositions:x.bars.map((_,i)=>perimeter.positions.find(p=>p.barIndex===i+1).s),perimeterLength:perimeter.perimeter,diameter:x.diameter,insideRadius:x.insideRadius,tail:x.tail});
 const maxSpacing=Math.min(16*minDb,48*x.diameter,x.B,x.H),requiredDiameter=maxDb<=.032?.00953:.0127;
 const checks=base.checks.filter(c=>c.kind!=='supported-bar-clearance').map(c=>c.kind==='tie-spacing'?{...c,maximum:maxSpacing,ratio:x.spacing/maxSpacing}:c.kind==='tie-diameter'?{...c,required:requiredDiameter,ratio:requiredDiameter/x.diameter}:c);
 const geometry=x.preparedCrossTies??(x.crossTieHookSides!==undefined||x.crossTiePlaneOffsets!==undefined?crossTieGeometry({...x,stirrups:{diameter:x.diameter,spacing:x.spacing},tieFirstStart:x.firstStart,tieFirstEnd:x.firstEnd,start:0,end:1,tieClosure:x.closure,tieBendInsideRadius:x.insideRadius,tieHookTail:x.tail},{B:x.B,H:x.H,length:x.length}):null);
 const ratio=Math.max(...checks.map(c=>c.ratio??0)),ng=ratio>1+1e-10||checks.some(c=>c.status==='NG')||supports.status==='NG'||geometry?.status==='NG';
 const unavailable=geometry?.status==='NOT_CHECKED';
 const uncovered=unavailable||supports.status==='NOT_CHECKED'||geometry?.contactCoverage?.status==='NOT_CHECKED'||base.incomplete===true;
 const incompleteReasons=[...(base.incompleteReasons||[]),...(supports.status==='NOT_CHECKED'?[supports.reason]:[]),...(unavailable?[geometry.reason]:geometry?.contactCoverage?.status==='NOT_CHECKED'?['CROSS_TIE_ACTUAL_CONTACT_COVERAGE_REQUIRED']:[])];
 return {...base,incomplete:uncovered,incompleteReasons,status:ng?'NG':uncovered?'NOT_CHECKED':'OK',reason:ng?'CROSS_TIED_COLUMN_REQUIREMENTS_NOT_SATISFIED':uncovered?incompleteReasons[0]:null,ratio:uncovered&&!ng?null:ratio,checks,supports,supportOrdering:{metric:perimeter.metric||'rounded-hoop-centerline',orderedBarIndices:perimeter.positions.map(p=>p.barIndex),cornerBarIndices:perimeter.cornerBarIndices,fabricationQuantity:false},...(geometry?{geometry}:{}),methodReviewRequired:true,scope:'ordinary perimeter bars with declared paired 135-degree cross ties; cage collision/fabrication qualification separate'};
}

export function kdsFlexuralTies(input){
 const codeReferences=getKcscRuleSources(['142050']).map(r=>({...r,clause:'4.4.1(1),(2),(3); 4.4.2(3); 4.1.1(2); 4.1.2(2)'}));
 if(input.system!=='ordinary-flexural-member'||input.closure!=='standard-135'||input.anchorBolts!==false)return {status:'NOT_CHECKED',ratio:null,reason:'ORDINARY_CLOSED_FLEXURAL_TIE_SCOPE_REQUIRED',codeReferences,designTransferAllowed:false};
 // 4.4.1(1) explicitly refers to column tie size and spacing. Enclosing
 // all longitudinal bars also covers possible compression-face reversal.
 const result=kdsRectangularTies({...input,system:'ordinary-tied-column'});
 return {...result,codeReferences,scope:'ordinary flexural member with closed standard-135 ties enclosing all longitudinal bars; shear/torsion strength and seismic detailing separate',
  compressionReinforcementCoverage:'all-provided-longitudinal-bars',
  endSpacingBasis:'conservative half-spacing end coverage convention; not an additional beam-specific KDS limit',
  closureQualification:'nominal standard hook; prepared spatial closure/collision review remains separate',designTransferAllowed:false};
}
