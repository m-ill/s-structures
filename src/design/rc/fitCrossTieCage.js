import {outerHoopClosure} from './outerHoopClosure.js';
import {crossTieGeometry} from './crossTieGeometry.js';
import {stirrupDistribution} from './stirrupDistribution.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
import {repeatedSpatialPairDistance} from './repeatedSpatialPairDistance.js';
// Pack transverse planes outside the entire spatial hoop's axial envelope.
// This is a sufficient clearance construction, not an exhaustive cage solver.
// No repeated station array or Cartesian product of hook orientations is built.
export function fitCrossTieCage(detail,section){
 const base={fabricationApproved:false,methodReviewRequired:true,scope:'bounded cross-tie plane separation and hook orientation proposals; actual bar ends and full cage require candidate review'};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 const pairs=detail?.crossTieBarPairs,db=detail?.stirrups?.diameter,length=section?.length;
 if(!Array.isArray(pairs)||!pairs.length||pairs.length>20||!Number.isFinite(db)||db<=0||!Number.isFinite(length)||length<=0)return nc('CROSS_TIE_FIT_INPUT_REQUIRED');
 if(!Array.isArray(detail.bars)||!detail.bars.length||detail.bars.length>100)return nc('CROSS_TIE_FIT_BARS_REQUIRED');
 const seen=new Set();
 for(const pair of pairs){
  if(typeof pair!=='string'||!/^\d+:\d+$/.test(pair))return nc('CROSS_TIE_FIT_PAIR_REQUIRED');
  const indices=pair.split(':').map(Number),key=[...indices].sort((a,b)=>a-b).join(':');
  if(indices.some(i=>!Number.isInteger(i)||i<1||i>detail.bars.length)||indices[0]===indices[1]||seen.has(key))return nc('CROSS_TIE_FIT_PAIR_REQUIRED');
  seen.add(key);
 }
 const distribution=stirrupDistribution(detail,length),repeat=repeatedTieDistance(distribution,0,0);
 if(repeat.status!=='OK')return nc('CROSS_TIE_FIT_DISTRIBUTION_REQUIRED');
 if(repeat.minimumRepeatDistance!==null&&repeat.minimumRepeatDistance<db)return nc('CROSS_TIE_FIT_REPEAT_TOO_CLOSE');
 const hoop=outerHoopClosure(detail,section);
 if(hoop.path?.status!=='OK')return nc('CROSS_TIE_FIT_SPATIAL_HOOP_REQUIRED');
 const lo=hoop.path.bounds.min[0],hi=hoop.path.bounds.max[0],planes=[],sides=[],diagnostics=[];
 const pitch=db+1e-6;let planeTrials=0,orientationTrials=0;
 for(let index=0;index<pairs.length;index++){
  let plane;
  for(let level=0;level<=2*pairs.length&&plane===undefined;level++)for(const sign of [1,-1]){
   planeTrials++;const value=sign>0?hi+pitch*(level+1):lo-pitch*(level+1);
   if(Math.abs(value)>1||distribution.first+value<db/2||distribution.last+value>length-db/2)continue;
   if(planes.some(p=>repeatedTieDistance(distribution,value,p).distance<db+1e-9))continue;
   const gap=repeatedSpatialPairDistance({a:[lo,0,0],b:[hi,0,0],c:[value,0,0],d:[value,0,0],distribution});
   if(gap.status!=='OK'||gap.distance<db+1e-9)continue;
   plane=value;break;
  }
  if(plane===undefined)return nc('CROSS_TIE_FIT_NO_SEPARATED_PLANE');
  const original=detail.crossTieHookSides?.[index],order=original==='right'?['right','left']:['left','right'];let best;
  for(const side of order){
   orientationTrials++;
   const geometry=crossTieGeometry({...detail,crossTieBarPairs:[pairs[index]],crossTieHookSides:[side],crossTiePlaneOffsets:[String(plane)]},section);
   if(geometry.pieces.length!==1)continue;
   const checks=[...geometry.pieces[0].checks,...geometry.assembly.checks],ng=checks.filter(c=>c.status==='NG').length,nc=checks.filter(c=>c.status==='NOT_CHECKED').length;
   if(!best||ng<best.ng||ng===best.ng&&nc<best.nc)best={side,ng,nc};
  }
  if(!best)return nc('CROSS_TIE_FIT_ORIENTATION_GEOMETRY_REQUIRED');
  planes.push(plane);sides.push(best.side);diagnostics.push({pair:pairs[index],...best});
 }
 return {...base,status:'OK',planeOffsets:planes.map(String),hookSides:sides,diagnostics,planeTrials,orientationTrials};
}
