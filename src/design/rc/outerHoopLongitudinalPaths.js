import {crossTieLongitudinalPaths} from './crossTieLongitudinalPaths.js';
// Reuse the bounded repeated-plane distance calculation used for cross-ties.
// This checks the rounded perimeter, not the still-unresolved closure hooks.
export function outerHoopLongitudinalPaths(detail,prepared){
 const hoop=prepared.outerHoop;
 if(hoop?.status!=='OK')return {status:hoop?.status==='NG'?'NG':'NOT_CHECKED',reason:hoop?.reason||'OUTER_HOOP_GEOMETRY_REQUIRED',checks:[],fabricationApproved:false};
 const result=crossTieLongitudinalPaths(detail,{...prepared,crossTies:{pieces:[{...hoop,mark:'S1',planeOffset:0}]}},{pointDistance});
 // The shared routine names its findings after cross-ties. What collided here
 // is the outer hoop, so the reason has to say so rather than misreport the bar
 // that was hit; only the label changes, never the geometry result.
 return {...result,...(result.status==='NG'?{reason:'OUTER_HOOP_LONGITUDINAL_COLLISION'}:{}),scope:'prepared longitudinal end and splice paths against repeated rounded outer-hoop perimeter; paired closure hooks separate'};
}

function pointDistance([y,z],hoop){
 const [cy,cz]=hoop.arcCenters[0],qy=Math.abs(y)-cy,qz=Math.abs(z)-cz;
 // Signed distance to a rounded rectangle, then absolute distance to its
 // centerline boundary. This is exact for both straight sides and arcs.
 return Math.abs(Math.hypot(Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qy,qz),0)-hoop.centerlineRadius);
}
