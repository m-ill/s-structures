import {reinforcementMassQuantity} from './reinforcementMassQuantity.js';
import {prepareThroughBarLinks,finishThroughBarSchedule} from './throughBarSchedule.js';
import {prepareJointHoopGeometry} from '../connection/jointHoopGeometry.js';
import {jointHoopQuantity} from '../connection/jointHoopQuantity.js';
import {selectDetailGeometryModel} from '../../core/detailGeometryModel.js';
import {longitudinalReinforcementQuantity} from './longitudinalReinforcementQuantity.js';
import {transverseReinforcementQuantity} from './transverseReinforcementQuantity.js';
import {spatialHoopPerimeterLayout} from './spatialHoopPerimeterLayout.js';
import {lineBarContactCoverage} from './lineBarContactCoverage.js';
import {roundedHoopPerimeterLayout} from './roundedHoopPerimeterLayout.js';
import {spatialHoopSupportCoverage} from './spatialHoopSupportCoverage.js';
import {closureHookContactCoverage} from './closureHookContactCoverage.js';
import {spatialHoopSelfAssembly} from './spatialHoopSelfAssembly.js';
import {spatialHoopCrossTieAssembly} from './spatialHoopCrossTieAssembly.js';
import {spatialHoopLongitudinalPaths} from './spatialHoopLongitudinalPaths.js';
import {outerHoopClosure} from './outerHoopClosure.js';
import {footingReinforcementQuantity} from '../foundation/footingReinforcementQuantity.js';
import {outerHoopLongitudinalPaths} from './outerHoopLongitudinalPaths.js';
import {outerHoopPerimeter} from './outerHoopPerimeter.js';
import {footingCriticalPerimeter} from '../foundation/footingCriticalPerimeter.js';
import {crossTieContactCoverage} from './crossTieContactCoverage.js';
import {crossTieLongitudinalPaths} from './crossTieLongitudinalPaths.js';
import {crossTieGeometry} from './crossTieGeometry.js';
import {spliceBarPath} from './spliceBarPath.js';
import {stirrupDistribution} from './stirrupDistribution.js';
import {spliceGeometry} from './spliceGeometry.js';
import {footingBarLayout} from '../foundation/footingBarLayout.js';
import {memberAxes} from '../../core/memberAxes.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';
import {stableHash} from '../../core/stableHash.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {buildBarFabrication} from './barGeometry.js';
export const PREPARED_DETAIL_VERSION='p25-prepared-detail-v43-canonical-through-bars';
export function detailGeometryInputHash(model){return stableHash(selectDetailGeometryModel(model));}
function latest(rows=[]){const map=new Map();for(const r of rows)if(!map.has(r.id)||map.get(r.id).version<r.version)map.set(r.id,r);return [...map.values()];}
export function prepareDetailGeometry(model){
 const reinforcement={},foundations={},splices={},connections={};
 const throughLinks=prepareThroughBarLinks(model);
 for(const d of latest(model.designDetails?.reinforcement)){
  const member=model.members.find(m=>m.id===d.memberId),s=resolveSectionRecord(model,member?.secId),nodes=[member?.n1,member?.n2].map(id=>model.nodes.find(n=>n.id===id));
  if(!nodes.every(Boolean)||!['RECT','SQUARE'].includes(s?.shape))continue;
  const length=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z)*(d.end-d.start),B=s.params.B/1000,H=(s.params.H||s.params.B)/1000;
  const distribution=d.stirrups?stirrupDistribution(d,length):null;
  const stirrupCount=distribution?.count??null,stirrupPositions=distribution?.positions??null,stirrupReason=distribution?.reason??null;
  reinforcement[`${d.id}@${d.version}`]={length,B,H,...(d.stirrups?{perimeterLayout:roundedHoopPerimeterLayout({B,H,cover:d.cover,tieDiameter:d.stirrups.diameter,insideRadius:d.tieBendInsideRadius,bars:d.bars})}:{}),...(d.stirrups?{outerHoop:outerHoopPerimeter({B,H,cover:d.cover,diameter:d.stirrups.diameter,insideRadius:d.tieBendInsideRadius})}:{}),bars:d.bars.map(b=>({bodyVolume:b.area*(length+(d.startExtension||0)+(d.endExtension||0)),...buildBarFabrication(d,b,{length,H,...throughLinks.ends.get(`${d.id}@${d.version}`)})})),stirrupCount,stirrupPositions,stirrupReason,stirrupDistribution:distribution,...(d.crossTieBarPairs?.length?{crossTies:crossTieGeometry(d,{B,H,length})}:{})};
 }
 for(const record of latest(model.designDetails?.splices)){
  const geometry=spliceGeometry(model,record);splices[`${record.id}@${record.version}`]=geometry;
  if(geometry.status==='OK')for(const bar of geometry.bars){const prepared=reinforcement[`${geometry.detailId}@${geometry.detailVersion}`]?.bars[bar.originalIndex];if(prepared)Object.assign(prepared,{cutLength:null,reason:'SPLICED_BAR_PIECE_CUT_SCHEDULE_REQUIRED'});}
 }
 for(const detail of latest(model.designDetails?.reinforcement)){
  const prepared=reinforcement[`${detail.id}@${detail.version}`];if(!prepared)continue;
  const selected=latest(model.designDetails?.splices).filter(s=>s.reinforcementId===`${detail.id}@${detail.version}`);
  for(const [index,bar] of detail.bars.entries()){
   const records=selected.filter(s=>s.barIndices?.some(i=>Number(i)===index+1));
   if(!records.some(s=>s.continuationSide))continue;
   const geometry=records.map(s=>({record:s,geometry:splices[`${s.id}@${s.version}`]}));
   if(geometry.some(x=>x.geometry?.status!=='OK')){Object.assign(prepared.bars[index],{cutLength:null,reason:'SPLICE_PIECE_VALID_GEOMETRY_REQUIRED'});continue;}
   const path=spliceBarPath({detail,bar,memberLength:geometry[0].geometry.memberLength,H:prepared.H,splices:geometry.map(x=>({...x.record,startX:x.geometry.startX,endX:x.geometry.endX}))});
   Object.assign(prepared.bars[index],{cutLength:null,splicePath:path,reason:path.reason,pieceCount:path.pieces?.length??null,totalCutLength:path.totalCutLength});
  }
 }
 for(const detail of latest(model.designDetails?.reinforcement)){
  const prepared=reinforcement[`${detail.id}@${detail.version}`];
  if(prepared?.outerHoop){
   prepared.outerHoop.actualPathAssembly=outerHoopLongitudinalPaths(detail,prepared);
   if(detail.tieClosureCorner!==undefined||detail.tieClosureSeparation!==undefined){
    prepared.outerHoop.closureGeometry=outerHoopClosure(detail,{B:prepared.B,H:prepared.H});
    prepared.outerHoop.nominalPerimeterAssembly=prepared.outerHoop.actualPathAssembly;
    prepared.outerHoop.actualPathAssembly=spatialHoopLongitudinalPaths(detail,prepared);
    prepared.outerHoop.closureGeometry.longitudinalAssembly=prepared.outerHoop.actualPathAssembly;
    prepared.outerHoop.closureGeometry.crossTieAssembly=spatialHoopCrossTieAssembly(detail,prepared);
    const closure=prepared.outerHoop.closureGeometry,pendingReason=closure.assemblyReason;
    closure.contactCoverage=closureHookContactCoverage(detail,prepared);
    closure.supportCoverage=spatialHoopSupportCoverage(detail,prepared);
    const lines=closure.path?.primitives?.filter(p=>p.kind==='line');
    closure.faceContactCoverage=lines?.length===6?lineBarContactCoverage(detail,prepared,{lines:lines.slice(1,-1),diameter:closure.diameter}):{status:'NOT_CHECKED',reason:'FOUR_SPATIAL_HOOP_FACES_REQUIRED',checks:[]};
    const faceCoverage=closure.faceContactCoverage;
    faceCoverage.geometryKind='spatial-hoop-face-v1';
    faceCoverage.reportSummary={status:faceCoverage.status,reason:faceCoverage.reason||null,faces:faceCoverage.checks.map(c=>({face:c.face,contactedBarIndices:c.contactedBarIndices,candidates:c.candidates.map(b=>({bar:b.bar,covered:b.coverage.coveredCount,total:b.coverage.totalCount,firstMissing:b.coverage.firstUncoveredIndex,firstMissingPlane:b.coverage.firstUncoveredPlane}))}))};
    const contacted=new Set([...(closure.supportCoverage.supportedBarIndices||[]),...faceCoverage.checks.flatMap(c=>c.contactedBarIndices)]),missing=detail.bars.map((_,i)=>i+1).filter(i=>!contacted.has(i));
    closure.perimeterMembership={status:missing.length?'NOT_CHECKED':'OK',reason:missing.length?'ACTUAL_HOOP_PERIMETER_CONTACT_REQUIRED':null,barCount:detail.bars.length,contactedBarIndices:[...contacted].sort((a,b)=>a-b),missingBarIndices:missing,scope:'actual corner or straight-face contact at all nominal stations; cyclic ordering is separate',fabricationApproved:false};
    prepared.spatialPerimeterLayout=spatialHoopPerimeterLayout(detail,prepared);
    closure.perimeterOrderStatus=prepared.spatialPerimeterLayout.status;closure.perimeterOrderReason=prepared.spatialPerimeterLayout.reason;
    closure.selfAssembly=spatialHoopSelfAssembly(closure,prepared.stirrupDistribution);
    const assemblies=[closure.longitudinalAssembly,closure.crossTieAssembly,closure.selfAssembly];
    closure.assemblyStatus=assemblies.some(r=>r.status==='NG')?'NG':assemblies.some(r=>r.status==='NOT_CHECKED')?'NOT_CHECKED':'OK';
    closure.assemblyReason=closure.assemblyStatus==='NG'?'SPATIAL_HOOP_ASSEMBLY_COLLISION':closure.assemblyStatus==='NOT_CHECKED'?'SPATIAL_HOOP_ASSEMBLY_INCOMPLETE':closure.supportCoverage.status!=='OK'?'SPATIAL_HOOP_SUPPORT_COVERAGE_REQUIRED':'HOOP_CLOSURE_DETAILING_REVIEW_REQUIRED';
    if(closure.reason===pendingReason)closure.reason=closure.assemblyReason;
    const diagnostics=[{status:closure.coverStatus||closure.status},closure.longitudinalAssembly.placement,...(closure.longitudinalAssembly.checks?.length?closure.longitudinalAssembly.checks:[closure.longitudinalAssembly]),...(closure.crossTieAssembly.checks?.length?closure.crossTieAssembly.checks:[closure.crossTieAssembly]),closure.selfAssembly.sameStation||closure.selfAssembly,...(!closure.selfAssembly.sameStation&&closure.hookPair?[closure.hookPair]:[]),closure.selfAssembly.repeatedStations,closure.contactCoverage,closure.supportCoverage,closure.perimeterMembership,{status:closure.perimeterOrderStatus}].filter(Boolean);
    closure.diagnosticCounts=Object.fromEntries(['OK','NG','NOT_CHECKED','N_A'].map(status=>[status,diagnostics.filter(r=>r.status===status).length]));
   }
  }
  if(!prepared?.crossTies?.pieces?.length)continue;
  prepared.crossTies.actualPathAssembly=crossTieLongitudinalPaths(detail,prepared);
  prepared.crossTies.contactCoverage=crossTieContactCoverage(detail,prepared);
  if(prepared.crossTies.actualPathAssembly.status==='NG'){prepared.crossTies.status='NG';prepared.crossTies.assemblyStatus='NG';}
 }
 for(const d of latest(model.designDetails?.reinforcement)){
  const p=reinforcement[`${d.id}@${d.version}`];if(!p)continue;
  if(d.stirrups)p.transverseQuantity=transverseReinforcementQuantity(d,p);
  const spliceBarIndices=latest(model.designDetails?.splices).filter(s=>s.reinforcementId===`${d.id}@${d.version}`).flatMap(s=>(s.barIndices||[]).map(Number));
  p.longitudinalQuantity=longitudinalReinforcementQuantity(d,p,{spliceBarIndices});
 }
 for(const f of latest(model.designDetails?.foundations)){
  const layers={};
  for(const face of ['bottom','top'])for(const axis of ['B','L']){
   const bar=f.reinforcement?.[`${face}${axis}`];if(!bar)continue;
   const layout=footingBarLayout(f,face,axis);
   const cutLength=layout.status==='OK'&&f.barShape==='straight'?layout.bodyLength:null;
   layers[`${face}${axis}`]={...layout,cutLength,massQuantity:reinforcementMassQuantity(bar.unitMassKgPerM,[{length:cutLength,count:layout.count}])};
  }
  if(f.columnTransferType==='cast-in-place-continuous-straight-bars'&&[f.columnEmbedmentLength,f.columnDevelopmentAbove].every(x=>Number.isFinite(x)&&x>0)){
   const member=model.members.find(m=>m.id===f.columnMemberId),nodes=[member?.n1,member?.n2].map(id=>model.nodes.find(n=>n.id===id));
   const selected=member?reinforcementRegionsAt(latest(model.designDetails?.reinforcement).filter(d=>d.memberId===member.id),member.n1===f.nodeId?0:1):[];
   if(nodes.every(Boolean)&&selected.length===1){const axes=memberAxes(nodes[0],nodes[1],member.localAxis),d=selected[0];layers.columnBars=d.bars.map((bar,i)=>({memberId:member.id,memberMark:`B${i+1}`,diameter:bar.diameter,area:bar.area,x:(f.columnOffsetX??0)+bar.y*axes.y[0]+bar.z*axes.z[0],y:(f.columnOffsetY??0)+bar.y*axes.y[1]+bar.z*axes.z[1],below:f.columnEmbedmentLength,above:f.columnDevelopmentAbove,massQuantity:{...reinforcementMassQuantity(bar.unitMassKgPerM,[{length:f.columnEmbedmentLength,count:1}]),scope:'below-interface-extension-only',includesCompleteBar:false},designation:bar.designation??null,productReference:d.barProductReference??null,additionalBodyVolume:bar.area*f.columnEmbedmentLength}));}
  }
  if(f.punchingPerimeterScope==='rectangular-solid-no-openings'){const rb=f.reinforcement,dB=f.thickness-f.cover-(rb?.bottomB?.diameter??NaN)/2,dL=f.thickness-f.cover-(rb?.bottomB?.diameter??NaN)-(rb?.bottomL?.diameter??NaN)/2;layers.punchingPerimeter=footingCriticalPerimeter(f,(dB+dL)/2);}
  layers.reinforcementQuantity=footingReinforcementQuantity(f,layers);
  foundations[`${f.id}@${f.version}`]=layers;
 }
 for(const joint of latest(model.designDetails?.connections)){const p=prepareJointHoopGeometry(model,joint);p.reinforcementQuantity=jointHoopQuantity(joint,p);connections[`${joint.id}@${joint.version}`]=p;}
 return {version:PREPARED_DETAIL_VERSION,inputHash:detailGeometryInputHash(model),reinforcement,foundations,splices,connections,throughBarSchedule:finishThroughBarSchedule(throughLinks,reinforcement)};
}
export function requirePreparedDetailGeometry(model,prepared){
 if(prepared.version!==PREPARED_DETAIL_VERSION||prepared.inputHash!==detailGeometryInputHash(model))throw Error('PREPARED_DETAIL_GEOMETRY_STALE');
 return prepared;
}
