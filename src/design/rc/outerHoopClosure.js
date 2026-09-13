import {bentBarPath3d} from './bentBarPath3d.js';
import {filletBarPath3d} from './filletBarPath3d.js';
import {segmentClosest} from './repeatedPathDistance.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
// One continuous spatial bending path: three body bends and two 135° hooks.
// Explicit end separation changes the body slopes and bend planes; it is not
// implemented by moving disconnected hooks off a planar rectangular drawing.
export function outerHoopClosure(detail,{B,H}){
 const base={fabricationApproved:false,cutLength:null,assemblyStatus:'NOT_CHECKED',assemblyReason:'HOOP_ASSEMBLY_AND_SUPPORT_REVIEW_REQUIRED',units:{length:'m'},codeReferences:getKcscRuleSources(['142050']).map(r=>({...r,clause:'4.1.1(2); 4.1.2(2)'}))};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 const db=detail.stirrups?.diameter,inside=detail.tieBendInsideRadius,tail=detail.tieHookTail,cover=detail.cover,separation=detail.tieClosureSeparation,corner=detail.tieClosureCorner;
 if(detail.tieClosure!=='standard-135'||!['+y+z','+y-z','-y+z','-y-z'].includes(corner)||!Number.isFinite(separation)||separation<0||separation>1)return nc('HOOP_CLOSURE_CORNER_AND_SEPARATION_REQUIRED');
 if(![B,H,db,inside,tail,cover].every(x=>Number.isFinite(x)&&x>0))return nc('HOOP_CLOSURE_DIMENSIONS_REQUIRED');
 const R=inside+db/2,Y=H/2-cover-db/2,Z=B/2-cover-db/2;
 if(Y<=R||Z<=R)return {...base,status:'NG',reason:'HOOP_CLOSURE_BEND_OUTSIDE_SECTION'};
 const vertices=[[separation/2,Y-R,Z],[0,-Y,Z],[0,-Y,-Z],[0,Y,-Z],[-separation/2,Y,Z-R]],body=filletBarPath3d(vertices,R);
 if(body.status!=='OK')return {...base,status:body.status,reason:body.reason,body};
 const first=body.primitives[0],last=body.primitives.at(-1),angle=3*Math.PI/4;
 const startNormal=[0,0,1],endNormal=[0,1,0],incoming=first.startTangent,outgoing=last.endTangent;
 const startCenter=first.start.map((x,i)=>x-R*startNormal[i]);
 const startU=startNormal.map((x,i)=>x*Math.cos(-angle)+incoming[i]*Math.sin(-angle));
 const startV=startNormal.map((x,i)=>-x*Math.sin(-angle)+incoming[i]*Math.cos(-angle));
 const startPoint=startCenter.map((x,i)=>x+R*startU[i]);
 const startSegments=[{kind:'line',start:startPoint.map((x,i)=>x-tail*startV[i]),end:startPoint},{kind:'arc',center:startCenter,radius:R,u:startU,v:startV,sweep:angle}];
 const endCenter=last.end.map((x,i)=>x-R*endNormal[i]),endPoint=endCenter.map((x,i)=>x+R*(endNormal[i]*Math.cos(angle)+outgoing[i]*Math.sin(angle))),endTangent=endNormal.map((x,i)=>-x*Math.sin(angle)+outgoing[i]*Math.cos(angle));
 const endSegments=[{kind:'arc',center:endCenter,radius:R,u:endNormal,v:outgoing,sweep:angle},{kind:'line',start:endPoint,end:endPoint.map((x,i)=>x+tail*endTangent[i])}];
 const sy=corner[0]==='+'?1:-1,sz=corner[2]==='+'?1:-1,reflect=p=>[p[0],sy*p[1],sz*p[2]];
 const transform=p=>p.kind==='line'?{kind:'line',start:reflect(p.start),end:reflect(p.end)}:{kind:'arc',center:reflect(p.center),u:reflect(p.u),v:reflect(p.v),radius:p.radius,sweep:p.sweep};
 const path=bentBarPath3d([...startSegments,...body.primitives,...endSegments].map(transform));
 if(path.status!=='OK')return {...base,status:path.status,reason:path.reason,path};
 const hooks=[bentBarPath3d(startSegments.map(transform)),bentBarPath3d(endSegments.map(transform))];
 let lower=Infinity,upper=Infinity,witness;
 for(let i=1;i<hooks[0].points.length;i++)for(let j=1;j<hooks[1].points.length;j++){
  const r=segmentClosest(hooks[0].points[i-1],hooks[0].points[i],hooks[1].points[j-1],hooks[1].points[j]),error=hooks[0].segmentErrors[i-1]+hooks[1].segmentErrors[j-1];
  lower=Math.min(lower,Math.max(0,r.distance-error));
  if(r.distance+error<upper){upper=r.distance+error;witness={startSegment:i-1,endSegment:j-1};}
 }
 const hookPair={status:lower>=db-1e-9?'OK':upper<db-1e-9?'NG':'NOT_CHECKED',centerlineLowerBound:lower,centerlineUpperBound:upper,requiredDistance:db,witness};
 const coverOK=path.bounds.min[1]>=-Y-1e-9&&path.bounds.max[1]<=Y+1e-9&&path.bounds.min[2]>=-Z-1e-9&&path.bounds.max[2]<=Z+1e-9;
 const status=!coverOK||hookPair.status==='NG'?'NG':hookPair.status;
 return {...base,status,reason:!coverOK?'HOOP_CLOSURE_COVER_FAILURE':hookPair.status==='NG'?'HOOP_CLOSURE_HOOK_COLLISION':hookPair.status==='NOT_CHECKED'?'HOOP_CLOSURE_CONTACT_UNCERTAIN':base.assemblyReason,corner,separation,diameter:db,insideRadius:inside,tail,hookAngles:[135,135],geometricCutLength:path.centerlineLength,path,hooks,hookPair,coverStatus:coverOK?'OK':'NG',bendSchedule:path.primitives.filter(p=>p.kind==='arc').map(p=>({angleDegrees:p.sweep*180/Math.PI,centerlineRadius:p.radius,center:p.center,u:p.u,v:p.v}))};
}
