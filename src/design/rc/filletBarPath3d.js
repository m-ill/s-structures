import {bentBarPath3d} from './bentBarPath3d.js';
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
// Replace vertices of an open 3D bending polygon with tangent circular bends.
// radius is a centreline radius, not the inside bending radius.
export function filletBarPath3d(vertices,radius,options){
 const fail=(status,reason)=>({status,reason,centerlineLength:null,points:[],segmentErrors:[],fabricationApproved:false,units:{length:'m'}});
 if(!Array.isArray(vertices)||vertices.length<2||vertices.length>32||vertices.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))||!Number.isFinite(radius)||radius<=0)return fail('NOT_CHECKED','BAR_BEND_POLYGON_REQUIRED');
 const edges=[];
 for(let i=1;i<vertices.length;i++){
  const delta=sub(vertices[i],vertices[i-1]),length=Math.hypot(...delta);
  if(!Number.isFinite(length)||length<=1e-12)return fail('NOT_CHECKED','BAR_BEND_EDGE_REQUIRED');
  edges.push({length,u:delta.map(x=>x/length)});
 }
 const bends=Array(vertices.length).fill(null);
 for(let i=1;i<vertices.length-1;i++){
  const a=edges[i-1].u,b=edges[i].u,cos=Math.max(-1,Math.min(1,dot(a,b)));
  if(cos>=1-1e-14)continue;
  if(cos<=-1+1e-12)return fail('NOT_CHECKED','BAR_BEND_REVERSAL');
  const angle=Math.acos(cos),sin=Math.sin(angle),trim=radius*Math.tan(angle/2),normal=b.map((x,j)=>(x-cos*a[j])/sin),start=vertices[i].map((x,j)=>x-trim*a[j]),end=vertices[i].map((x,j)=>x+trim*b[j]),center=start.map((x,j)=>x+radius*normal[j]);
  bends[i]={vertex:i,angle,angleDegrees:angle*180/Math.PI,trim,start,end,segment:{kind:'arc',center,radius,u:normal.map(x=>-x),v:[...a],sweep:angle}};
 }
 for(let i=0;i<edges.length;i++)if((bends[i]?.trim||0)+(bends[i+1]?.trim||0)>edges[i].length+1e-12)return fail('NG','BAR_BEND_TRIMS_OVERLAP');
 const segments=[];
 for(let i=0;i<edges.length;i++){
  const start=bends[i]?.end||vertices[i],end=bends[i+1]?.start||vertices[i+1];
  if(Math.hypot(...sub(end,start))>1e-12)segments.push({kind:'line',start,end});
  if(bends[i+1])segments.push(bends[i+1].segment);
 }
 return {...bentBarPath3d(segments,options),bends:bends.filter(Boolean).map(({segment,...record})=>({...record,centerlineRadius:radius,arcLength:radius*record.angle}))};
}
