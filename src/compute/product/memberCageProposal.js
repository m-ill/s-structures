import {inferRectangularLayers} from '../../design/rc/barLayout.js';
// Keep the declared section and products; clearance repair may add bars. Geometry is only a
// candidate: all actual capacity, anchorage and contact checks run afterward.
export function memberCageProposal(commands,checks,model){
 const fail=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 const clearance=r=>r.checks?.some(c=>c.kind==='supported-bar-clearance'&&c.status==='NG'&&Number.isFinite(c.provided)&&Number.isFinite(c.maximumExclusive)&&c.provided>=c.maximumExclusive);
 const collision=r=>r.reason==='SPATIAL_HOOP_LONGITUDINAL_COLLISION'&&r.outerHoop?.actualPathAssembly?.status==='NG';
 const rows=checks.filter(r=>r.checkId==='rc-confinement'&&r.status==='NG'&&(collision(r)||clearance(r))&&commands.some(c=>c.memberId===r.entityId));
 if(!rows.length)return fail('RECORDED_CAGE_COLLISION_REQUIRED');
 const regions=new Map();
 for(const row of rows){
  const c=commands.find(c=>c.id===row.detailId&&c.version===row.detailVersion);
  if(!c||c.locked||c.crossTieBarPairs?.length||c.confinementStandard!=='KDS-142050-2022'||c.tieClosure!=='standard-135')return fail('CAGE_REPAIR_SCOPE_REQUIRED');
  if(regions.has(c.id))continue;
  let layout;try{layout=inferRectangularLayers(c.bars);}catch{const support=row.outerHoop?.closureGeometry?.supportCoverage;if(c.bars.length===4&&support?.status==='OK'&&new Set(support.supportedBarIndices||[]).size===4)layout={barsPerFace:2,layersPerFace:1};else return fail('CAGE_REPAIR_LAYOUT_REQUIRED');}
  if(layout.layersPerFace!==1||layout.barsPerFace<2||layout.barsPerFace>12)return fail('CAGE_REPAIR_LAYOUT_REQUIRED');
  const zCounts=clearance(row)?(collision(row)?[2,3,4]:[3,4]):[2];
  regions.set(c.id,{detailId:c.id,perimeterYCounts:[layout.barsPerFace],perimeterZCounts:zCounts,crossTieCageFits:['separate'],closureBarFits:['contact']});
 }
 return {ok:true,version:'p25-member-cage-proposal-v3-deferred-geometry',regionConstraints:[...regions.values()],basisCheckIds:rows.map(r=>r.id),basis:'recorded hoop/longitudinal collision; regenerate a single-layer paired perimeter at unchanged bar count first for collisions, with additional Z-face bars/cross ties for recorded supported-bar clearance NG; every affected check must be reevaluated',geometryValidation:'bounded candidate worker; no geometric feasibility claim at planning',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
