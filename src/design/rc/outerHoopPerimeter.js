import {bentBarPath3d} from './bentBarPath3d.js';
// Rounded perimeter only. Paired closure hooks are separate fabrication geometry.
export function outerHoopPerimeter({B,H,cover,diameter,insideRadius}){
 const base={fabricationApproved:false,cutLength:null,closureStatus:"NOT_CHECKED",reason:"OUTER_HOOP_CLOSURE_REQUIRED",units:{length:"m"}};
 if(![B,H,cover,diameter,insideRadius].every(v=>Number.isFinite(v)&&v>0))return {...base,status:"NOT_CHECKED",reason:"OUTER_HOOP_GEOMETRY_REQUIRED"};
 const R=insideRadius+diameter/2,cy=H/2-cover-diameter-insideRadius,cz=B/2-cover-diameter-insideRadius,points=[],segmentErrors=[],steps=12;
 if(![R,cy,cz].every(v=>Number.isFinite(v)&&v>0))return {...base,status:"NG",reason:"OUTER_HOOP_BEND_OUTSIDE_SECTION"};
 for(const [q,center] of [[0,[cy,cz]],[1,[-cy,cz]],[2,[-cy,-cz]],[3,[cy,-cz]]])for(let i=0;i<=steps;i++){
  const angle=q*Math.PI/2+i*Math.PI/2/steps;
  if(points.length)segmentErrors.push(i===0?0:R*(1-Math.cos(Math.PI/2/steps/2)));
  points.push([center[0]+R*Math.cos(angle),center[1]+R*Math.sin(angle)]);
 }
 points.push(points[0]);segmentErrors.push(0);
 const centers=[[cy,cz],[-cy,cz],[-cy,-cz],[cy,-cz]],segments=[];
 for(let q=0;q<4;q++){
  const t=q*Math.PI/2,[y,z]=centers[q],u=[0,Math.cos(t),Math.sin(t)],v=[0,-Math.sin(t),Math.cos(t)],center=[0,y,z];
  segments.push({kind:'arc',center,radius:R,u,v,sweep:Math.PI/2});
  const end=center.map((x,i)=>x+R*v[i]),next=centers[(q+1)%4],angle=(q+1)*Math.PI/2;
  segments.push({kind:'line',start:end,end:[0,next[0]+R*Math.cos(angle),next[1]+R*Math.sin(angle)]});
 }
 const perimeterPath3d=bentBarPath3d(segments,{closed:true});
 if(perimeterPath3d.status!=='OK')return {...base,status:perimeterPath3d.status,reason:perimeterPath3d.reason,perimeterPath3d};
 return {...base,status:"OK",points,segmentErrors,diameter,insideRadius,centerlineRadius:R,centerlineLength:perimeterPath3d.centerlineLength,arcCenters:centers,perimeterPath3d};
}
