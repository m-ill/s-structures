import {spatialHoopPerimeterLayout} from '../rc/spatialHoopPerimeterLayout.js';
import {jointColumnContactPaths} from './jointColumnContactPaths.js';
import {closureHookContactCoverage} from '../rc/closureHookContactCoverage.js';
import {spatialHoopSupportCoverage} from '../rc/spatialHoopSupportCoverage.js';
import {lineBarContactCoverage} from '../rc/lineBarContactCoverage.js';
export function jointHoopSupport(model,prepared,congestion,{mappedPaths}={}){
 const base={fabricationApproved:false,methodReviewRequired:true,scope:'actual outer hoop closure/corner contact and straight-face membership of mapped column bars; seismic confinement credit separate'};
 const mapped=mappedPaths||jointColumnContactPaths(model,prepared,congestion);
 if(!mapped.ok)return {...base,status:'NOT_CHECKED',reason:mapped.reason};
 const {detail}=mapped,closure=mapped.prepared.outerHoop?.closureGeometry;
 const contact=closureHookContactCoverage(detail,mapped.prepared);
 const local={...mapped.prepared,outerHoop:{...mapped.prepared.outerHoop,closureGeometry:{...closure,contactCoverage:contact}}};
 const support=spatialHoopSupportCoverage(detail,local),lines=closure?.path?.primitives?.filter(p=>p.kind==='line');
 const face=lines?.length===6?lineBarContactCoverage(detail,local,{lines:lines.slice(1,-1),diameter:closure.diameter}):{status:'NOT_CHECKED',reason:'FOUR_SPATIAL_HOOP_FACES_REQUIRED',checks:[]};
 Object.assign(local.outerHoop.closureGeometry,{supportCoverage:support,faceContactCoverage:face});
 const perimeterLayout=spatialHoopPerimeterLayout(detail,local);
 const contacted=new Set([...(support.supportedBarIndices||[]),...face.checks.flatMap(c=>c.contactedBarIndices||[])]),missing=detail.bars.map((_,i)=>i+1).filter(i=>!contacted.has(i));
 const status=support.status==='OK'&&!missing.length?'OK':'NOT_CHECKED';
 return {...base,perimeterLayout,status,reason:status==='OK'?null:'JOINT_OUTER_HOOP_ACTUAL_SUPPORT_REQUIRED',columnDetailId:detail.id,columnDetailVersion:detail.version,cornerSupport:support.reportSummary||{status:support.status,reason:support.reason,supportedBarIndices:[]},closureCommonBarIndices:contact.commonBarIndices||[],faceMembership:{status:face.status,reason:face.reason,faces:face.checks.map(c=>({face:c.face,contactedBarIndices:c.contactedBarIndices||[]}))},perimeterBarIndices:[...contacted].sort((a,b)=>a-b),missingPerimeterBarIndices:missing,sourcePaths:mapped.sourcePaths,codeReferences:closure?.codeReferences||[]};
}
